// zion4life.faith page script: share links, today's prayer, video player. No dependencies.
(function () {
  'use strict';
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent);

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

  // ---- copy / share ----
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
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
      btn.textContent = '复制链接';
    }
    btn.addEventListener('click', function () {
      if (!isWeChat && navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      copy(url).then(
        function () { toast('链接已复制，粘贴发给朋友就可以了'); },
        function () { toast(url); }
      );
    });
  });

  // ---- today's prayer: pick the newest entry dated on or before the visitor's own date ----
  var dataEl = document.getElementById('pray-data');
  var todayEl = document.querySelector('[data-pray-today]');
  if (dataEl && todayEl) {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    var list = [];
    try { list = JSON.parse(dataEl.textContent); } catch (e) {}
    var pick = null;
    for (var i = 0; i < list.length; i++) { if (list[i].date <= today) { pick = list[i]; break; } }
    var shown = todayEl.getAttribute('data-date');
    if (pick && pick.date !== shown) {
      todayEl.querySelectorAll('[data-f]').forEach(function (el) {
        var f = el.getAttribute('data-f');
        if (f === 'html') el.innerHTML = pick.html;
        else if (pick[f] != null) el.textContent = pick[f];
      });
      var tag = todayEl.querySelector('.tag');
      if (tag && pick.sample === false) tag.hidden = true;
      todayEl.setAttribute('data-date', pick.date);
      shown = pick.date;
    }
    document.querySelectorAll('[data-arch]').forEach(function (li) {
      var date = li.getAttribute('data-arch');
      li.hidden = date > today || date === shown;
    });
  }

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
      if (s.type === 'youtube') {
        return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(s.id) + '?autoplay=1&rel=0&playsinline=1';
      }
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
        el.title = '视频播放';
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
