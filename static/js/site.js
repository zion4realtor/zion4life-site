// 有光 (zion4life.faith) page script: tile ripples, tag filters, today's 呼吸, sharing, the question box, videos. No dependencies.
(function () {
  'use strict';
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  var zh = document.documentElement.lang !== 'en';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- toast ----
  var toastEl = document.querySelector('.toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  // ---- tiles: a ripple from where you tapped, then open the page ----
  document.querySelectorAll('[data-ripple]').forEach(function (tile) {
    tile.addEventListener('click', function (e) {
      if (reduce || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      var r = tile.getBoundingClientRect();
      var x = (e.clientX || r.left + r.width / 2) - r.left;
      var y = (e.clientY || r.top + r.height / 2) - r.top;
      [0, 130, 280].forEach(function (delay, k) {
        setTimeout(function () {
          var ring = document.createElement('span');
          ring.className = 'ring' + (k ? ' soft' : '');
          ring.style.left = x + 'px';
          ring.style.top = y + 'px';
          tile.appendChild(ring);
          setTimeout(function () { ring.remove(); }, 1000);
        }, delay);
      });
      setTimeout(function () { location.href = tile.href; }, 540);
    });
  });

  // ---- tag page filters ----
  var filters = document.querySelector('[data-filters]');
  if (filters) {
    filters.querySelectorAll('[data-filter]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter');
        filters.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        document.querySelectorAll('.cards > .card[data-kind]').forEach(function (c) {
          c.hidden = f !== 'all' && c.getAttribute('data-kind') !== f;
        });
      });
    });
  }

  // ---- copy / share ----
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }
  document.querySelectorAll('[data-share]').forEach(function (box) {
    var btn = box.querySelector('[data-share-btn]');
    var url = box.getAttribute('data-url');
    var title = box.getAttribute('data-title');
    if (isWeChat) {
      box.querySelector('.share-wx').hidden = false;
      btn.textContent = btn.getAttribute('data-copy-label');
    }
    btn.addEventListener('click', function () {
      if (!isWeChat && navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      copy(url).then(function () { toast(box.getAttribute('data-copied')); }, function () { toast(url); });
    });
  });

  // ---- 有问题想问？ ----
  document.querySelectorAll('[data-ask]').forEach(function (form) {
    var err = form.querySelector('[data-error]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var msg = form.message.value.trim();
      if (!msg) {
        err.textContent = zh ? '先写下你想问的。' : 'Write your question first.';
        err.hidden = false;
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, name: form.name.value, reply: form.reply.value, website: form.website.value, lang: form.getAttribute('data-lang'), page: location.pathname }),
      }).then(function (r) { return r.json(); }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { err.textContent = r.error; err.hidden = false; return; }
        form.reset();
        var done = document.createElement('p');
        done.className = 'ask-done';
        done.textContent = form.getAttribute('data-done');
        btn.insertAdjacentElement('afterend', done);
        setTimeout(function () { done.remove(); }, 6000);
      }).catch(function () {
        btn.disabled = false;
        err.textContent = zh ? '网络有点问题，请稍后再试。' : 'Network problem. Please try again in a moment.';
        err.hidden = false;
      });
    });
  });

  // ---- video player: loads the video only when tapped, so the page stays light ----
  document.querySelectorAll('[data-player]').forEach(function (player) {
    var start = player.querySelector('.player-start');
    var srcEl = player.querySelector('script[type="application/json"]');
    var sources = [];
    try { sources = JSON.parse(srcEl.textContent); } catch (e) {}
    if (!sources.length) return;
    var current = 0;
    var lineBtns = document.querySelectorAll('[data-line]');
    function embed(s) {
      if (s.type === 'youtube') return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(s.id) + '?autoplay=1&rel=0&playsinline=1';
      if (s.type === 'bunny') return s.url + (s.url.indexOf('?') < 0 ? '?' : '&') + 'autoplay=true&preload=true';
      return s.url;
    }
    function play(i) {
      current = i;
      var s = sources[i];
      var old = player.querySelector('iframe, video');
      if (old) player.removeChild(old);
      var el;
      if (s.type === 'file') {
        el = document.createElement('video');
        el.src = s.url;
        el.controls = true;
        el.autoplay = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('preload', 'metadata');
      } else {
        el = document.createElement('iframe');
        el.src = embed(s);
        el.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        el.setAttribute('allowfullscreen', '');
        el.title = zh ? '视频播放' : 'Video';
      }
      start.hidden = true;
      player.appendChild(el);
      lineBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-line')) === i)); });
    }
    start.addEventListener('click', function () { play(current); });
    lineBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.getAttribute('data-line'));
        if (start.hidden) play(i);
        else {
          current = i;
          lineBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        }
      });
    });
  });
})();
