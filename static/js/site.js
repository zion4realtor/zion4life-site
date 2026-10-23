// 有光 (zion4life.faith) page script: tile ripples, tag filters, today's 呼吸, sharing, the question box, videos. No dependencies.
(function () {
  'use strict';
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
  var zh = document.documentElement.lang !== 'en';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- visit counts: use Google's async tag for page views (so GA can derive city from the
  // request IP), and our Worker for custom events and as a fallback when Google is unreachable.
  // The same pseudonymous client ID joins both streams. ----
  var track = (function () {
    var mem = {};
    function get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
    var now = Date.now();
    var cid = get('yg_cid');
    if (!/^\d+\.\d+$/.test(cid || '')) { cid = Math.floor(Math.random() * 2147483647) + '.' + Math.floor(now / 1000); set('yg_cid', cid); }
    var last = (get('yg_sid') || '').split('.'); // "<visit id>.<last activity, ms>"; a visit ends after 30 quiet minutes
    var fresh = !(last.length === 2 && now - Number(last[1]) < 30 * 60000);
    var sid = fresh ? String(Math.floor(now / 1000)) : last[0];
    var off = /^\/(en\/)?admin\//.test(location.pathname);
    var mode = 'pending';
    var queue = [];
    var tagId = 'G-VP8BKCZ3TE';
    function safePageLocation(value) {
      try {
        var u = new URL(value);
        if (u.origin !== location.origin) return location.origin + location.pathname;
        var q = new URLSearchParams();
        u.searchParams.forEach(function (v, k) { if (/^utm_(source|medium|campaign|term|content|id)$/.test(k)) q.set(k, v.slice(0, 60)); });
        return u.origin + u.pathname + (q.toString() ? '?' + q.toString() : '');
      } catch (e) { return location.origin + location.pathname; }
    }
    function safeReferrer(value) {
      try {
        var u = new URL(value);
        return u.origin === location.origin ? u.origin + u.pathname : u.origin + '/';
      } catch (e) { return ''; }
    }
    function sendWorker(body) {
      try {
        if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([JSON.stringify(body)], { type: 'text/plain' }))) return;
      } catch (e) {}
      try { fetch('/api/hit', { method: 'POST', body: JSON.stringify(body), keepalive: true }).catch(function () {}); } catch (e) {}
    }
    function pageView(body) {
      window.gtag('event', 'page_view', {
        page_location: safePageLocation(body.loc),
        page_title: body.title,
        page_referrer: safeReferrer(body.ref),
        language: body.lang,
        session_id: Number(body.sid),
        engagement_time_msec: 1
      });
    }
    function deliver(body) {
      if (mode === 'pending') { queue.push(body); return; }
      if (mode === 'google') {
        var pageViews = body.e.filter(function (ev) { return ev.n === 'page_view'; });
        pageViews.forEach(function () { pageView(body); });
        var custom = body.e.filter(function (ev) { return ev.n !== 'page_view'; });
        // Keep the Worker’s first-visit source event, but never send a second page_view.
        if (custom.length || body.ns) sendWorker(Object.assign({}, body, { e: custom, campaign_only: !custom.length && !!body.ns }));
        return;
      }
      sendWorker(body);
    }
    function send(events) {
      var body = { cid: cid, sid: sid, ns: fresh ? 1 : 0, loc: location.href, ref: document.referrer, title: document.title, lang: navigator.language || '', scr: screen.width + 'x' + screen.height, e: events };
      if (off) return;
      fresh = false;
      set('yg_sid', sid + '.' + Date.now());
      deliver(body);
    }
    send([{ n: 'page_view' }]);
    window.addEventListener('pageshow', function (e) { if (e.persisted) send([{ n: 'page_view' }]); });
    var shown = document.visibilityState === 'visible' ? Date.now() : 0;
    var spent = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { shown = Date.now(); return; }
      if (shown) spent += Date.now() - shown;
      shown = 0;
      if (spent >= 1000) { send([{ n: 'time_on_page', ms: spent }]); spent = 0; }
    });
    if (!off) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', tagId, {
        send_page_view: false,
        client_id: cid,
        page_location: safePageLocation(location.href),
        page_referrer: safeReferrer(document.referrer)
      });
      function fallback() {
        if (mode !== 'pending') return;
        mode = 'worker';
        clearTimeout(timeout);
        queue.splice(0).forEach(sendWorker);
      }
      var timeout = setTimeout(fallback, 3500);
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(tagId);
      script.onload = function () {
        if (mode !== 'pending') return;
        mode = 'google';
        clearTimeout(timeout);
        queue.splice(0).forEach(deliver);
      };
      script.onerror = fallback;
      document.head.appendChild(script);
    }
    return function (name, params) { send([{ n: name, p: params || {} }]); };
  })();
  window.ygTrack = track;

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
      track('share', { method: isWeChat ? 'wechat_copy' : navigator.share ? 'system' : 'copy' });
      if (!isWeChat && navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      copy(url).then(function () { toast(box.getAttribute('data-copied')); }, function () { toast(url); });
    });
  });

  document.querySelectorAll('[data-video-share]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-share-url');
      var title = btn.getAttribute('data-share-title') || document.title;
      track('share', { method: isWeChat ? 'video_icon_wechat_copy' : navigator.share ? 'video_icon_system' : 'video_icon_copy' });
      if (!isWeChat && navigator.share) {
        navigator.share({ title: title, text: btn.closest('[data-reel]')?.dataset.shareDescription || document.querySelector('meta[name="description"]')?.content || title, url: url }).catch(function (err) {
          if (!err || err.name !== 'AbortError') copy(url).then(function () {
            toast(zh ? '链接已复制，可发送给朋友。' : 'Link copied. Send it to a friend.');
          }, function () { toast(url); });
        });
        return;
      }
      copy(url).then(function () {
        toast(zh ? '当前视频链接已复制，可粘贴到微信聊天发送。' : 'Current video link copied. Paste it into a chat to share.');
      }, function () {
        toast(zh ? '请点右上角“···”分享给朋友。' : 'Open the browser menu to share this page.');
      });
    });
  });

  // ---- 放到手机桌面: the steps for the phone in hand, and a one-tap button where the browser
  // offers one (Chrome on Android). Hidden once the page is already opened from the home screen. ----
  var a2hs = document.querySelector('[data-a2hs]');
  if (a2hs) {
    var ua = navigator.userAgent;
    var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var android = /Android/i.test(ua);
    var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    var go = a2hs.querySelector('[data-a2hs-go]');
    if (standalone) a2hs.hidden = true;
    if (isWeChat) a2hs.querySelector('[data-a2hs-wx]').hidden = false;
    a2hs.querySelectorAll('[data-os]').forEach(function (el) {
      var os = el.getAttribute('data-os');
      if ((ios && os !== 'ios') || (android && os !== 'android')) el.hidden = true;
    });
    var offer = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      offer = e;
      go.hidden = false;
    });
    a2hs.querySelector('[data-a2hs-btn]').addEventListener('click', function () {
      if (!offer) return;
      offer.prompt();
      offer.userChoice.then(function () { offer = null; go.hidden = true; }, function () {});
    });
    window.addEventListener('appinstalled', function () {
      go.hidden = true;
      toast(zh ? '放好了，去手机桌面看看。' : 'Done. Look on your home screen.');
    });
  }

  // ---- 有问题想问？会员登录后才可以展开和提交 ----
  document.querySelectorAll('[data-ask]').forEach(function (form) {
    var err = form.querySelector('[data-error]');
    var fold = form.closest('.ask-fold');
    if (fold) {
      fold.querySelector('summary').addEventListener('click', function (e) {
        e.preventDefault();
        var yg = window.YG;
        if (!yg) return;
        yg.requireLogin(zh ? '请先登录或注册会员，再向我们提问或反馈。' : 'Please sign in or create an account before asking a question or sending feedback.')
          .then(function (m) {
            if (!m.user) return;
            fold.open = !fold.open;
            if (fold.open) setTimeout(function () { form.message.focus(); }, 0);
          }).catch(function () {});
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var yg = window.YG;
      if (!yg) return;
      yg.requireLogin(zh ? '请先登录或注册会员，再提交问题或建议。' : 'Please sign in or create an account before sending a question or suggestion.')
        .then(function (m) { if (m.user) send(); }).catch(function () {});
      function send() {
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
          credentials: 'same-origin',
          body: JSON.stringify({ message: msg, name: form.name.value, reply: form.reply.value, website: form.website.value, lang: form.getAttribute('data-lang'), page: location.pathname }),
        }).then(function (r) { return r.json(); }).then(function (r) {
          btn.disabled = false;
          if (!r.ok) { err.textContent = r.error; err.hidden = false; return; }
          track('generate_lead');
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
      }
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
        if (s.poster) el.poster = s.poster;
        el.src = s.url;
        el.controls = true;
        el.autoplay = true;
        el.setAttribute('playsinline', '');
        el.setAttribute('webkit-playsinline', '');
        el.setAttribute('preload', 'metadata');
        (s.subtitles || []).forEach(function (sub) {
          var caption = document.createElement('track');
          caption.kind = 'subtitles';
          caption.src = sub.url;
          caption.srclang = sub.lang;
          caption.label = sub.label || sub.lang;
          var captionOwner = player.closest('.short-watch');
          var defaultLanguage = captionOwner ? captionOwner.getAttribute('data-caption-choice') || (zh ? 'zh' : 'en') : (zh ? 'zh' : 'en');
          caption.default = sub.lang.split('-')[0] === defaultLanguage;
          el.appendChild(caption);
        });
      } else {
        el = document.createElement('iframe');
        el.src = embed(s);
        el.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        el.setAttribute('allowfullscreen', '');
        el.title = zh ? '视频播放' : 'Video';
      }
      start.hidden = true;
      player.appendChild(el);
      if (s.type === 'file') {
        el.addEventListener('error', function () {
          el.remove();
          start.hidden = false;
          var note = player.closest('.short-watch');
          note = note && note.querySelector('.short-note');
          if (note) { note.textContent = zh ? '暂时没播出来，请点封面重试。' : 'Unable to play. Tap the cover to try again.'; note.hidden = false; }
        });
        var playing = el.play();
        if (playing && playing.catch) playing.catch(function () { /* Native controls remain available if autoplay is blocked. */ });
      }
      if (s.type === 'file' && player.hasAttribute('data-short')) {
        var watch = player.closest('.short-watch');
        var captionLanguage = watch.getAttribute('data-caption-choice') || (zh ? 'zh' : 'en');
        function selectCaptions() {
          Array.from(el.textTracks).forEach(function (t) { t.mode = t.language.split('-')[0] === captionLanguage ? 'showing' : 'disabled'; });
        }
        watch.querySelectorAll('[data-caption]').forEach(function (button) {
          button.onclick = function () {
            captionLanguage = button.getAttribute('data-caption');
            watch.setAttribute('data-caption-choice', captionLanguage);
            watch.querySelectorAll('[data-caption]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === button)); });
            selectCaptions();
          };
        });
        el.addEventListener('loadedmetadata', function () {
          selectCaptions();
          try { var saved = Number(localStorage.getItem('yg-video-' + player.dataset.short)); if (saved > 0 && saved < el.duration - 3) el.currentTime = saved; } catch (e) {}
        }, {once:true});
        el.addEventListener('timeupdate', function () { try { localStorage.setItem('yg-video-' + player.dataset.short, String(el.currentTime)); } catch (e) {} });

      }
      track('play_video', { line: s.label || s.type });
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
  // Subtitle buttons also work before playback starts.
  document.querySelectorAll('.short-watch').forEach(function (watch) {
    watch.querySelectorAll('[data-caption]').forEach(function (button) {
      button.addEventListener('click', function () {
        var lang = button.getAttribute('data-caption');
        watch.setAttribute('data-caption-choice', lang);
        watch.querySelectorAll('[data-caption]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === button)); });
        var video = watch.querySelector('video');
        if (video) Array.from(video.textTracks).forEach(function (track) { track.mode = track.language.split('-')[0] === lang ? 'showing' : 'disabled'; });
      });
    });
  });
  window.ygSortHomeFresh = function () {
    var container=document.querySelector('[data-home-fresh-sections]');
    if (!container) return;
    var community=container.querySelector('[data-home-fresh="community"]');
    var videos=container.querySelector('[data-home-fresh="videos"]');
    if(community) container.prepend(community);
    if(videos && community) community.after(videos);
  };
  window.ygSortHomeFresh();
})();

// The end panel appears only after native playback ends. Existing playback, captions,
// source selection and progress saving remain owned by the player above.
(function () {
  document.querySelectorAll('[data-video-scroll]').forEach(function (button) {
    button.addEventListener('click', function () {
      var rail = button.closest('.recommend').querySelector('.recommend-rail');
      rail.scrollBy({ left: Number(button.dataset.videoScroll) * (rail.querySelector('a').offsetWidth + 16), behavior: 'smooth' });
    });
  });
  document.querySelectorAll('[data-player]').forEach(function (player) {
    var panel = player.querySelector('[data-video-end]');
    if (!panel) return;
    function attach() {
      var video = player.querySelector('video');
      if (!video || video.dataset.endChoices) return;
      video.dataset.endChoices = '1';
      panel.hidden = true;
      player.classList.remove('end-mode');
      video.addEventListener('ended', function () {
        player.classList.add('end-mode');
        panel.hidden = false;
        panel.querySelector('a').focus({ preventScroll: true });
      });
      video.addEventListener('play', function () { panel.hidden = true; player.classList.remove('end-mode'); });
    }
    new MutationObserver(attach).observe(player, { childList: true });
    attach();
    panel.querySelector('[data-video-replay]').addEventListener('click', function () {
      panel.hidden = true;
      player.classList.remove('end-mode');
      var video = player.querySelector('video');
      if (video) { video.currentTime = 0; video.play().catch(function () {}); video.focus(); }
    });
  });
})();
