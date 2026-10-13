// 呼吸 "读给我听": plays the day's recording, piece after piece (recorded by the Worker, see
// src/audio.js), with one progress bar, speed, and the paragraph being read lit up. Before
// the recording is ready it reads with the phone's own voice when the phone has one.
(function () {
  'use strict';
  var bar = document.querySelector('[data-audio]');
  if (!bar) return;
  var art = bar.closest('[data-date]');
  var EN = document.documentElement.lang === 'en';
  var lang = EN ? 'en' : 'zh';
  var t = function (zh, en) { return EN ? en : zh; };
  var playBtn = bar.querySelector('[data-play]');
  var fill = bar.querySelector('[data-fill]');
  var track = bar.querySelector('[data-bar]');
  var timeEl = bar.querySelector('[data-time]');
  var speedBtn = bar.querySelector('[data-speed]');
  var msg = bar.querySelector('[data-msg]');
  var RATES = [1, 1.25, 1.5, 0.8];
  var rate = 1;
  try { rate = Number(localStorage.getItem('yg-rate')) || 1; } catch (e) { /* private mode */ }
  if (RATES.indexOf(rate) < 0) rate = 1;
  speedBtn.textContent = rate + '×';

  var day = null;      // { date, chunks, weights, total }
  var mode = null;     // 'rec' | 'voice'
  var parts = null;    // recording URLs
  var idx = 0;         // piece being played
  var playing = false;
  var audio = null, next = null;
  var durs = [];       // known durations of the pieces (seconds)
  var perChar = EN ? 1 / 14 : 1 / 4.2; // seconds per character, until real durations are known

  var date = function () { return art.getAttribute('data-date'); };
  function fmt(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function load() {
    if (day && day.date === date()) return Promise.resolve(day);
    return fetch('/data/huxi/' + date() + '.speech.json').then(function (r) { return r.json(); }).then(function (j) {
      var s = j[lang];
      var weights = s.chunks.map(function (c) { return c.t.length; });
      day = { date: date(), chunks: s.chunks, weights: weights, total: weights.reduce(function (a, b) { return a + b; }, 0) };
      mode = null; parts = null; idx = 0; durs = [];
      return day;
    });
  }
  // seconds for piece i: its real length once known, else from its text
  var dur = function (i) { return durs[i] || day.weights[i] * perChar; };
  function totalSecs() { var n = 0; for (var i = 0; i < day.chunks.length; i++) n += dur(i); return n; }
  function show(frac) {
    var total = totalSecs();
    var done = 0;
    for (var i = 0; i < idx; i++) done += dur(i);
    done += (frac || 0) * dur(idx);
    var pct = total ? Math.min(100, (done / total) * 100) : 0;
    fill.style.width = pct + '%';
    track.setAttribute('aria-valuenow', String(Math.round(pct)));
    timeEl.textContent = fmt(done) + ' / ' + fmt(total);
  }
  function light() {
    art.querySelectorAll('.hx-now').forEach(function (el) { el.classList.remove('hx-now'); });
    if (!playing || !day) return;
    (day.chunks[idx].s || []).forEach(function (k) {
      var el = art.querySelector('[data-s="' + k + '"]');
      if (el) el.classList.add('hx-now');
    });
  }
  function state(on) {
    playing = on;
    bar.classList.toggle('on', on);
    playBtn.setAttribute('aria-label', on ? bar.getAttribute('data-l-pause') : bar.getAttribute('data-l-play'));
    light();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
  }
  function say(text) {
    msg.textContent = text;
    msg.hidden = !text;
  }

  // ---- the recording ----
  function setPart(i, startFrac) {
    idx = i;
    audio.src = parts[i];
    audio.playbackRate = rate;
    if (startFrac) {
      audio.addEventListener('loadedmetadata', function once() {
        audio.removeEventListener('loadedmetadata', once);
        if (audio.duration) audio.currentTime = startFrac * audio.duration;
      });
    }
    if (parts[i + 1]) { next = next || new Audio(); next.preload = 'auto'; next.src = parts[i + 1]; }
  }
  function makeAudio() {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('loadedmetadata', function () { if (audio.duration && isFinite(audio.duration)) durs[idx] = audio.duration; });
    audio.addEventListener('timeupdate', function () { if (audio.duration) show(audio.currentTime / audio.duration); });
    audio.addEventListener('ended', function () {
      if (idx + 1 < parts.length) { setPart(idx + 1); light(); audio.play(); }
      else { state(false); idx = 0; show(0); }
    });
    audio.addEventListener('error', function () { if (playing) { state(false); say(t('录音没有放出来，稍后再试一次。', 'The recording did not play. Try again in a moment.')); } });
  }

  // ---- the phone's own voice (before the recording is ready) ----
  var voiceGen = 0;
  function speakFrom(i) {
    var gen = ++voiceGen;
    idx = i;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(day.chunks[i].t);
    u.lang = EN ? 'en-US' : 'zh-CN';
    u.rate = rate;
    u.onend = function () {
      if (gen !== voiceGen || !playing) return;
      if (idx + 1 < day.chunks.length) { speakFrom(idx + 1); light(); show(0); }
      else { state(false); idx = 0; show(0); }
    };
    speechSynthesis.speak(u);
    show(0);
  }

  function start(fromIdx, frac) {
    say('');
    return load().then(function () {
      if (mode) return;
      return fetch('/api/audio/huxi/' + day.date + '/' + lang + '.json').then(function (r) { return r.json(); }).catch(function () { return null; }).then(function (r) {
        if (r && r.ready && r.parts.length === day.chunks.length) { mode = 'rec'; parts = r.parts; }
        else if ('speechSynthesis' in window) {
          mode = 'voice';
          say(t('录音还在准备中，先用手机自带的声音读给你听。', 'The recording is still being made; your phone’s own voice reads it for now.'));
        } else {
          say(t('录音还在准备中，过一会儿再来听。', 'The recording is still being made. Please come back a little later.'));
        }
      });
    }).then(function () {
      if (!mode) return;
      if (fromIdx != null) idx = fromIdx;
      state(true);
      if (mode === 'rec') {
        if (!audio) makeAudio();
        if (fromIdx != null || !audio.src) setPart(idx, frac);
        audio.play().catch(function () { state(false); });
      } else {
        speakFrom(idx);
      }
      if ('mediaSession' in navigator && window.MediaMetadata) {
        var title = art.querySelector('[data-f="title"]');
        navigator.mediaSession.metadata = new MediaMetadata({ title: title ? title.textContent : '', artist: t('有光 · 呼吸', 'Light · Breathe') });
        navigator.mediaSession.setActionHandler('play', function () { toggle(); });
        navigator.mediaSession.setActionHandler('pause', function () { toggle(); });
      }
    });
  }
  function toggle() {
    if (day && day.date !== date()) { stop(); day = null; }
    if (!playing) { start(); return; }
    if (mode === 'rec') audio.pause(); else { voiceGen++; speechSynthesis.cancel(); }
    state(false);
  }
  function stop() {
    if (audio) audio.pause();
    if (mode === 'voice') { voiceGen++; speechSynthesis.cancel(); }
    state(false);
  }
  playBtn.addEventListener('click', toggle);

  // tap or drag on the bar to jump
  function seekTo(clientX) {
    load().then(function () {
      var r = track.getBoundingClientRect();
      var f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      var want = f * totalSecs(), acc = 0, i = 0;
      while (i < day.chunks.length - 1 && acc + dur(i) < want) { acc += dur(i); i++; }
      var frac = dur(i) ? (want - acc) / dur(i) : 0;
      if (playing) { if (mode === 'rec') { setPart(i, frac); light(); audio.play(); } else { speakFrom(i); light(); } }
      else { idx = i; start(i, mode === 'rec' ? frac : 0); }
    });
  }
  track.addEventListener('click', function (e) { seekTo(e.clientX); });
  track.addEventListener('keydown', function (e) {
    if (!day || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    var i = Math.min(day.chunks.length - 1, Math.max(0, idx + (e.key === 'ArrowRight' ? 1 : -1)));
    if (playing) { if (mode === 'rec') { setPart(i); light(); audio.play(); } else { speakFrom(i); light(); } } else { idx = i; show(0); }
  });

  speedBtn.addEventListener('click', function () {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    speedBtn.textContent = rate + '×';
    try { localStorage.setItem('yg-rate', String(rate)); } catch (e) { /* private mode */ }
    if (audio) audio.playbackRate = rate;
    if (playing && mode === 'voice') speakFrom(idx);
  });

  // the estimate shows from the start; the day can change when the page swaps in today's 呼吸
  load().then(function () { show(0); timeEl.textContent = t('约 ', 'about ') + Math.max(1, Math.round(totalSecs() / 60)) + t(' 分钟', ' min'); }).catch(function () {});
})();
