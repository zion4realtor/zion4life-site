// 有光 (zion4life.faith) 搭子: /dazi/, /dazi/new/, /g/<id>, /me/ (my groups), /admin/.
// Talks to /api/* (src/api.js). No dependencies. Everything user-written goes through esc().
(function () {
  'use strict';
  var KINDS = { read: '饭搭子', pray: '呼吸搭子', feed: '投喂搭子' };
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var page = document.querySelector('[data-page]');
  if (!page) return;
  var kindOfPage = page.getAttribute('data-page');
  var isWeChat = /MicroMessenger/i.test(navigator.userAgent);

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var memTokens = {};
  function loadTokens() {
    try { return JSON.parse(localStorage.getItem('z4l.tokens') || '{}') || {}; } catch (e) { return memTokens; }
  }
  function saveToken(gid, token) {
    var t = loadTokens();
    t[gid] = token;
    memTokens = t;
    try { localStorage.setItem('z4l.tokens', JSON.stringify(t)); } catch (e) {}
  }
  function dropToken(gid) {
    var t = loadTokens();
    delete t[gid];
    memTokens = t;
    try { localStorage.setItem('z4l.tokens', JSON.stringify(t)); } catch (e) {}
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body) headers['Content-Type'] = 'application/json';
    if (opts.token) headers['X-Member'] = opts.token;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: '网络有点问题，请稍后再试' }; }); })
      .catch(function () { return { ok: false, error: '网络有点问题，请稍后再试' }; });
  }
  var toastEl = $('.toast');
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2800);
  }
  function copy(text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? done : text);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(done); }, fallback);
    } else fallback();
  }
  // Times are shown in the viewer's own time zone.
  var fmtDay = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });
  var fmtTime = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  function dayKey(ms) { var d = new Date(ms); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function when(ms) {
    var now = Date.now();
    var label = fmtDay.format(new Date(ms)).replace('星期', '周');
    if (dayKey(ms) === dayKey(now)) label = '今天';
    else if (dayKey(ms) === dayKey(now + 86400000)) label = '明天';
    else if (dayKey(ms) === dayKey(now - 86400000)) label = '昨天';
    return label + ' ' + fmtTime.format(new Date(ms));
  }
  var viewerTz = '';
  try { viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  function tag(kind) { return '<span class="gtag gtag-' + esc(kind) + '">' + esc(KINDS[kind] || '') + '</span>'; }
  function readingHtml(s, kind) {
    if (!s || !s.reading) return '';
    var label = kind === 'read' ? '读' : '内容';
    var text = esc(s.reading);
    return '<p class="reading"><span>' + label + '</span>' + (s.link ? '<a href="' + esc(s.link) + '" target="_blank" rel="noopener">' + text + '</a>' : text) + '</p>';
  }

  // ---------- plaza ----------
  function card(g, mine) {
    var next = g.current ? '正在进行' : g.next ? '下次 ' + when(g.next.start) : g.finished ? '已读完' : '';
    var foot = [g.memberCount + ' 人已立约'];
    if (next) foot.push(next);
    if (mine) foot.push(g.myStatus === 'pending' ? '等发起人同意' : g.myRole === 'owner' ? '我发起的' : '我已加入');
    else if (g.status === 'closed') foot.push('已结束');
    else if (g.max && g.memberCount >= g.max) foot.push('人已满');
    else foot.push(g.joinMode === 'open' ? '可以直接加入' : '需发起人同意');
    return '<a class="gcard" href="/g/' + esc(g.id) + '">' + tag(g.kind) +
      '<h3>' + esc(g.title) + '</h3>' +
      '<p class="gmeta">' + esc(g.scheduleText) + '</p>' +
      (g.planText ? '<p class="gplan">' + esc(g.planText) + '</p>' : '') +
      '<p class="gfoot">' + foot.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</p></a>';
  }
  function initSquare() {
    var list = $('[data-plaza]');
    var tabs = $$('[data-kind]');
    var params = new URLSearchParams(location.search);
    var kind = KINDS[params.get('kind')] ? params.get('kind') : '';
    function load() {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-kind') === kind)); });
      list.innerHTML = '<p class="muted">正在载入……</p>';
      api('/api/plaza' + (kind ? '?kind=' + kind : '')).then(function (r) {
        if (!r.ok) { list.innerHTML = '<p class="form-error">' + esc(r.error) + '</p>'; return; }
        if (!r.groups.length) {
          list.innerHTML = '<div class="empty"><p>' + (kind ? '还没有' + KINDS[kind] + '。' : '广场上还没有搭子。') + '第一个由你发起吧。</p><a class="btn btn-life" href="/dazi/new/' + (kind ? '?kind=' + kind : '') + '">发起一个搭子</a></div>';
          return;
        }
        list.innerHTML = r.groups.map(function (g) { return card(g, false); }).join('');
      });
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        kind = t.getAttribute('data-kind');
        history.replaceState(null, '', kind ? '?kind=' + kind : location.pathname);
        load();
      });
    });
    load();
    var tokens = loadTokens();
    var all = Object.keys(tokens).map(function (k) { return tokens[k]; });
    if (all.length) {
      api('/api/mine', { method: 'POST', body: { tokens: all } }).then(function (r) {
        if (!r.ok || !r.groups.length) return;
        $('#mine').hidden = false;
        $('[data-mine]').innerHTML = r.groups.map(function (g) { return card(g, true); }).join('');
      });
    }
  }

  // ---------- my groups (on /me/) ----------
  function initMine() {
    var tokens = loadTokens();
    var all = Object.keys(tokens).map(function (k) { return tokens[k]; });
    if (!all.length) return;
    api('/api/mine', { method: 'POST', body: { tokens: all } }).then(function (r) {
      if (!r.ok || !r.groups.length) return;
      $('#mine').hidden = false;
      $('[data-mine]').innerHTML = r.groups.map(function (g) { return card(g, true); }).join('');
    });
  }

  // ---------- new group form ----------
  function initNew() {
    var form = $('[data-new]');
    var err = $('[data-error]');
    var today = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    form.startDate.value = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    $$('input[name="days"]', form).forEach(function (c) { if (Number(c.value) === today.getDay()) c.checked = true; });
    // time zone: the phone's own, added to the list when it is not there
    var tzSel = form.tz;
    if (viewerTz) {
      if (!$$('option', tzSel).some(function (o) { return o.value === viewerTz; })) {
        var o = document.createElement('option');
        o.value = viewerTz;
        o.textContent = viewerTz;
        tzSel.insertBefore(o, tzSel.firstChild);
      }
      tzSel.value = viewerTz;
    }
    var params = new URLSearchParams(location.search);
    if (KINDS[params.get('kind')]) $$('input[name="kind"]', form).forEach(function (r) { r.checked = r.value === params.get('kind'); });

    function fillChapters() {
      var opt = form.book.options[form.book.selectedIndex];
      var n = Number(opt.getAttribute('data-ch'));
      var cur = Number(form.chapter.value) || 1;
      var html = '';
      for (var i = 1; i <= n; i++) html += '<option value="' + i + '">第 ' + i + ' 章</option>';
      form.chapter.innerHTML = html;
      form.chapter.value = String(Math.min(cur, n));
    }
    function kind() { var r = $('input[name="kind"]:checked', form); return r ? r.value : 'read'; }
    function sync() {
      var k = kind();
      $$('fieldset[data-for]', form).forEach(function (f) { f.hidden = f.getAttribute('data-for').split(' ').indexOf(k) < 0; });
      $('[data-for-public]', form).hidden = $('input[name="visibility"]:checked', form).value !== 'public';
      var verb = { read: '读经', pray: '祷告', feed: '追求' }[k];
      $('[data-covenant-text]', form).textContent = '我愿意按上面的约定，坚定持续地和组员一起' + verb + '。';
      form.title.placeholder = { read: '例如：一起读约翰福音', pray: '例如：周三晚上为家人祷告', feed: '例如：新朋友一起追求' }[k];
      // the covenant in words
      var days = $$('input[name="days"]:checked', form).map(function (c) { return Number(c.value); });
      var dayText = days.length === 7 ? '每天' : days.length ? '每周' + days.sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return WEEK[d]; }).join('、') : '（还没选哪几天）';
      var tzText = tzSel.options[tzSel.selectedIndex] ? tzSel.options[tzSel.selectedIndex].textContent : '';
      var mins = form.minutes.options[form.minutes.selectedIndex].textContent;
      var what;
      if (k === 'read') {
        var book = form.book.options[form.book.selectedIndex].textContent;
        what = '从' + book + '第' + form.chapter.value + '章开始，每次读' + form.per.value + '章' + (form.cont.checked ? '，读完接着读下一卷' : '');
      } else {
        what = form.material.value.trim() || '每次的内容可以随时更新';
      }
      $('[data-summary]', form).textContent = dayText + ' ' + (form.time.value || '--:--') + '（' + tzText + '），每次' + mins.replace(/\s/g, '') + '，' + form.startDate.value + ' 开始。' + what + '。';
    }
    fillChapters();
    form.book.addEventListener('change', function () { form.chapter.value = '1'; fillChapters(); sync(); });
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    sync();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var k = kind();
      var body = {
        kind: k,
        title: form.title.value,
        intro: form.intro.value,
        days: $$('input[name="days"]:checked', form).map(function (c) { return Number(c.value); }),
        time: form.time.value,
        minutes: Number(form.minutes.value),
        startDate: form.startDate.value,
        tz: tzSel.value,
        plan: k === 'read'
          ? { book: Number(form.book.value), chapter: Number(form.chapter.value), per: Number(form.per.value), cont: form.cont.checked }
          : { material: form.material.value, link: form.link.value },
        visibility: $('input[name="visibility"]:checked', form).value,
        joinMode: $('input[name="joinMode"]:checked', form).value,
        max: form.max.value ? Number(form.max.value) : null,
        name: form.name.value,
        contact: form.contact.value,
        covenant: form.covenant.checked,
        website: form.website.value,
      };
      var btn = $('button[type="submit"]', form);
      btn.disabled = true;
      btn.textContent = '正在建立……';
      api('/api/groups', { method: 'POST', body: body }).then(function (r) {
        if (!r.ok) {
          err.textContent = r.error;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = '发起搭子';
          err.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        saveToken(r.id, r.token);
        location.href = '/g/' + r.id + '?new=1';
      });
    });
  }

  // ---------- group page ----------
  function initGroup() {
    var root = $('[data-group]');
    var m = location.pathname.match(/^\/g\/([a-z0-9]{8})/);
    if (!m) { root.innerHTML = '<p class="form-error">链接不完整。</p>'; return; }
    var gid = m[1];
    var params = new URLSearchParams(location.search);
    var invite = params.get('i') || '';
    var isNew = params.get('new') === '1';
    var key = params.get('k');
    var state = null;
    var rec = null; // voice recorder state

    function token() { return loadTokens()[gid] || ''; }
    function clean() {
      var q = new URLSearchParams(location.search);
      q.delete('k');
      q.delete('new');
      var s = q.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
    }
    function load() {
      return api('/api/groups/' + gid + (invite ? '?i=' + encodeURIComponent(invite) : ''), { token: token() }).then(function (r) {
        state = r;
        render();
      });
    }
    if (key) {
      api('/api/groups/' + gid + '/claim', { method: 'POST', body: { k: key } }).then(function (r) {
        if (r.ok) saveToken(gid, r.token);
        else toast(r.error);
        clean();
        load();
      });
    } else {
      if (isNew) clean();
      load();
    }

    function render() {
      var r = state;
      if (!r.ok) { root.innerHTML = '<h1 class="page-title">找不到这个搭子</h1><p class="page-lead">' + esc(r.error) + '</p><p><a class="btn btn-life" href="/dazi/">去搭子广场</a></p>'; return; }
      var g = r.group;
      document.title = g.title + '｜Zion4Life';
      if (r.needInvite) {
        root.innerHTML = tag(g.kind) + '<h1 class="g-title">' + esc(g.title) + '</h1>' +
          '<p class="page-lead">这个搭子不公开，需要用' + (g.ownerName ? esc(g.ownerName) + '发给你的' : '') + '邀请链接打开。</p>' +
          '<p><a class="btn btn-line" href="/dazi/">去搭子广场看看</a></p>';
        return;
      }
      var me = r.me;
      var active = me && me.status === 'active';
      var isOwner = active && me.role === 'owner';
      var h = '';
      if (isNew && isOwner) {
        h += '<div class="notice"><strong>搭子建好了。</strong>把邀请链接发给朋友，他们点开、留下称呼和联系方式，就加入了。<button class="btn btn-dawn" type="button" data-copy-invite>复制邀请链接</button></div>';
      }
      h += tag(g.kind) + '<h1 class="g-title">' + esc(g.title) + '</h1>';
      h += '<p class="g-by">' + (g.ownerName ? esc(g.ownerName) + ' 发起' : '') + (g.status === 'closed' ? '<span class="pill">已结束</span>' : '') + '</p>';
      if (g.intro) h += '<p class="g-intro">' + esc(g.intro) + '</p>';

      // the covenant
      h += '<section class="covenant-card"><h2>搭子的约</h2><dl class="terms">';
      h += '<dt>时间</dt><dd>' + esc(g.scheduleText) + (viewerTz && viewerTz !== g.tz && g.next ? '<small>按你手机的时间，下次是' + esc(when(g.next.start)) + '</small>' : '') + '</dd>';
      h += '<dt>' + (g.kind === 'read' ? '计划' : '内容') + '</dt><dd>' + esc(g.planText || '发起人会随时更新') + (g.kind !== 'read' && g.plan.link ? '<small><a href="' + esc(g.plan.link) + '" target="_blank" rel="noopener">打开材料</a></small>' : '') + '</dd>';
      h += '<dt>人数</dt><dd>' + g.memberCount + ' 人已立约' + (g.max ? '，最多 ' + g.max + ' 人' : '') + '</dd>';
      if (g.done) h += '<dt>进度</dt><dd>已经进行 ' + g.done + (g.total ? ' / ' + g.total : '') + ' 次</dd>';
      h += '</dl></section>';

      // now / next
      if (g.current) {
        h += '<section class="now now-live"><p class="now-h">正在进行 · 第 ' + g.current.n + ' 次</p>' + readingHtml(g.current, g.kind) + '<p class="now-t">' + esc(when(g.current.start)) + ' 开始</p></section>';
      } else if (g.next && g.status !== 'closed') {
        h += '<section class="now"><p class="now-h">下次 · 第 ' + g.next.n + ' 次</p><p class="now-when">' + esc(when(g.next.start)) + '</p>' + readingHtml(g.next, g.kind) + '</section>';
      } else if (g.finished) {
        h += '<section class="now"><p class="now-h">这个计划已经读完了，感谢主。</p></section>';
      }

      // join / pending / member tools
      if (!me) h += joinForm(g, r);
      else if (me.status === 'pending') h += '<section class="notice">你已经申请加入，正在等发起人同意。同意后会通知你' + (me.contactType === 'email' ? '（发到你的邮箱）' : '') + '。</section>';
      if (active) h += checkinForm(g, r) + tools(g, r);

      // records
      h += records(g, r, active);
      if (active) h += membersBlock(g, r, isOwner);
      if (isOwner) h += ownerBlock(g);
      if (active && !isOwner) h += '<p class="leave"><button type="button" class="link-btn" data-leave>退出这个搭子</button></p>';
      root.innerHTML = h;
      isNew = false;
      bind(g, r);
    }

    function joinForm(g, r) {
      if (g.status !== 'active') return '<section class="notice">这个搭子已经结束了。</section>';
      if (g.max && g.memberCount >= g.max) return '<section class="notice">搭子人数已经满了。</section>';
      var direct = r.inviteOk || g.joinMode === 'open';
      var verb = { read: '读经', pray: '祷告', feed: '追求' }[g.kind];
      return '<section class="join"><h2 class="sub-h">' + (direct ? '立约加入' : '申请加入') + '</h2>' +
        '<form class="form" data-join novalidate>' +
        '<label class="field"><span>你的称呼</span><input name="name" maxlength="20" required placeholder="例如：小李、王姊妹" autocomplete="nickname"></label>' +
        '<label class="field"><span>邮箱或手机号</span><input name="contact" maxlength="120" required placeholder="用来发提醒" autocomplete="email" inputmode="email"></label>' +
        '<p class="hint">只用来发提醒，任何人都看不到，包括发起人。</p>' +
        (direct ? '' : '<label class="field"><span>给发起人留句话<em>可以不写</em></span><input name="note" maxlength="200" placeholder="例如：我是朋友介绍来的"></label>') +
        '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<label class="check covenant-check"><input type="checkbox" name="covenant"><span>我愿意按约定的时间，坚定持续地和大家一起' + verb + '。</span></label>' +
        '<p class="form-error" data-error role="alert" hidden></p>' +
        '<button class="btn btn-life btn-block" type="submit">' + (direct ? '立约加入' : '申请加入') + '</button></form></section>';
    }

    function checkinForm(g, r) {
      if (!r.checkinMax) return '<section class="checkin"><h2 class="sub-h">打卡</h2><p class="muted">第一次聚会开始前两个小时，就可以在这里打卡。</p></section>';
      var mine = {};
      (r.records || []).forEach(function (s) { s.checkins.forEach(function (c) { if (c.mid === r.me.id) mine[s.n] = c; }); });
      var opts = r.checkinSessions.map(function (s) {
        return '<option value="' + s.n + '">第 ' + s.n + ' 次，' + esc(when(s.start)) + (mine[s.n] ? '（已打卡）' : '') + '</option>';
      }).join('');
      var doneNow = mine[r.checkinMax];
      return '<section class="checkin"><h2 class="sub-h">打卡</h2>' +
        '<form class="form" data-checkin>' +
        '<label class="field"><span>哪一次</span><select name="n">' + opts + '</select></label>' +
        '<div class="checkin-reading" data-ck-reading></div>' +
        '<label class="field"><span>心得或问题<em>可以不写</em></span><textarea name="text" rows="4" maxlength="2000" placeholder="写几句今天的感受，或者想问的问题">' + esc(doneNow ? doneNow.text : '') + '</textarea></label>' +
        '<div class="voice" data-voice><button type="button" class="btn btn-line" data-rec>录一段语音</button><span class="voice-t" data-rec-t hidden></span><audio data-rec-play controls hidden></audio><button type="button" class="link-btn" data-rec-del hidden>删掉重录</button></div>' +
        '<p class="form-error" data-error role="alert" hidden></p>' +
        '<button class="btn btn-life btn-block" type="submit">' + (doneNow ? '更新打卡' : '读完了，打卡') + '</button></form></section>';
    }

    function tools(g, r) {
      return '<section class="tools"><h2 class="sub-h">搭子工具</h2><div class="tool-list">' +
        '<a class="tool" href="/api/groups/' + gid + '/calendar" data-cal><strong>加到手机日历</strong><span>每次开始前 10 分钟，手机会提醒你</span></a>' +
        '<button type="button" class="tool" data-copy-invite><strong>邀请朋友</strong><span>复制邀请链接，发给想一起的人</span></button>' +
        '<button type="button" class="tool" data-copy-me><strong>我的专属链接</strong><span>换了手机，用它打开就能接着打卡（不要转发）</span></button>' +
        (r.me.contactType === 'email' ? '<button type="button" class="tool" data-notify><strong>邮件提醒：' + (r.me.notify ? '开' : '关') + '</strong><span>' + (r.me.notify ? '每次开始前会发邮件，点这里关闭' : '点这里重新打开') + '</span></button>' : '') +
        '</div>' + (isWeChat ? '<p class="hint">在微信里不能直接加日历：请点右上角“···”，选“在浏览器打开”，再点“加到手机日历”。</p>' : '') + '</section>';
    }

    function records(g, r, active) {
      if (active) {
        if (!r.records.length) return '<section class="records"><h2 class="sub-h">打卡记录</h2><p class="muted">还没有人打卡。</p></section>';
        return '<section class="records"><h2 class="sub-h">打卡记录</h2>' + r.records.map(function (s) {
          return '<article class="rec"><header><strong>第 ' + s.n + ' 次</strong><span>' + esc(when(s.start)) + '</span><span>' + s.checkins.length + ' 人打卡</span></header>' +
            (s.reading ? '<p class="rec-reading">' + esc(s.reading) + '</p>' : '') +
            s.checkins.map(function (c) {
              return '<div class="rec-item"><p class="rec-who">' + esc(c.name) + '<time>' + esc(fmtTime.format(new Date(c.created))) + '</time></p>' +
                (c.text ? '<p class="rec-text">' + esc(c.text).replace(/\n/g, '<br>') + '</p>' : '<p class="rec-text muted">读完了</p>') +
                (c.audio ? '<audio controls preload="none" src="/api/audio/' + esc(c.audio) + '?t=' + encodeURIComponent(token()) + '"></audio>' : '') + '</div>';
            }).join('') + '</article>';
        }).join('') + '</section>';
      }
      if (!r.counts || !r.counts.length) return '';
      return '<section class="records"><h2 class="sub-h">坚持的记录</h2><ul class="count-list">' + r.counts.slice(0, 8).map(function (c) {
        return '<li><span>第 ' + c.n + ' 次</span><span>' + c.count + ' 人打卡</span></li>';
      }).join('') + '</ul><p class="hint">打卡的内容只有组员能看到。</p></section>';
    }

    function membersBlock(g, r, isOwner) {
      var act = r.members.filter(function (x) { return x.status === 'active'; });
      var pend = r.members.filter(function (x) { return x.status === 'pending'; });
      var h = '<section class="members"><h2 class="sub-h">组员</h2><ul class="mlist">' + act.map(function (x) {
        return '<li><span>' + esc(x.name) + (x.role === 'owner' ? '<em>发起人</em>' : '') + (x.id === r.me.id ? '<em>我</em>' : '') + '</span>' +
          (isOwner && x.role !== 'owner' ? '<button type="button" class="link-btn" data-remove="' + esc(x.id) + '" data-name="' + esc(x.name) + '">移出</button>' : '') + '</li>';
      }).join('') + '</ul>';
      if (isOwner && pend.length) {
        h += '<h3 class="sub-h3">申请加入</h3><ul class="mlist">' + pend.map(function (x) {
          return '<li class="pend"><span>' + esc(x.name) + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</span><span class="pend-act"><button type="button" class="btn btn-life btn-sm" data-approve="' + esc(x.id) + '">同意</button><button type="button" class="link-btn" data-decline="' + esc(x.id) + '">不同意</button></span></li>';
        }).join('') + '</ul>';
      }
      return h + '</section>';
    }

    function ownerBlock(g) {
      var h = '<section class="owner"><h2 class="sub-h">发起人管理</h2>';
      if (g.kind !== 'read') {
        h += '<form class="form" data-material><label class="field"><span>每次的内容</span><textarea name="material" rows="3" maxlength="300">' + esc(g.plan.material || '') + '</textarea></label>' +
          '<label class="field"><span>材料链接<em>可以不填</em></span><input name="link" type="url" maxlength="300" value="' + esc(g.plan.link || '') + '" placeholder="https://"></label>' +
          '<button class="btn btn-line" type="submit">更新内容</button></form>';
      }
      h += g.status === 'closed'
        ? '<p><button type="button" class="btn btn-line" data-reopen>重新开始这个搭子</button></p>'
        : '<p><button type="button" class="link-btn danger" data-close>结束这个搭子</button></p>';
      return h + '</section>';
    }

    function manage(body, done) {
      api('/api/groups/' + gid + '/manage', { method: 'POST', token: token(), body: body }).then(function (r) {
        if (!r.ok) { toast(r.error); return; }
        if (done) toast(done);
        load();
      });
    }

    function bind(g, r) {
      $$('[data-copy-invite]', root).forEach(function (b) {
        b.addEventListener('click', function () { if (r.invite) copy(r.invite, '邀请链接已复制，发给朋友就可以了'); });
      });
      var me = $('[data-copy-me]', root);
      if (me) me.addEventListener('click', function () { copy(r.me.link, '专属链接已复制，自己保存好，不要转发'); });
      var cal = $('[data-cal]', root);
      if (cal && isWeChat) cal.addEventListener('click', function (e) { e.preventDefault(); toast('请先点右上角“···”，在浏览器里打开'); });
      var nt = $('[data-notify]', root);
      if (nt) nt.addEventListener('click', function () {
        api('/api/groups/' + gid + '/notify', { method: 'POST', token: token(), body: { on: !r.me.notify } }).then(function (x) {
          if (x.ok) { toast(r.me.notify ? '已关闭邮件提醒' : '已打开邮件提醒'); load(); } else toast(x.error);
        });
      });
      var lv = $('[data-leave]', root);
      if (lv) lv.addEventListener('click', function () {
        if (!confirm('确定要退出这个搭子吗？')) return;
        api('/api/groups/' + gid + '/leave', { method: 'POST', token: token(), body: {} }).then(function (x) {
          if (x.ok) { dropToken(gid); toast('已经退出'); load(); } else toast(x.error);
        });
      });
      $$('[data-approve]', root).forEach(function (b) { b.addEventListener('click', function () { manage({ action: 'approve', mid: b.getAttribute('data-approve') }, '已同意'); }); });
      $$('[data-decline]', root).forEach(function (b) { b.addEventListener('click', function () { manage({ action: 'decline', mid: b.getAttribute('data-decline') }, '已拒绝'); }); });
      $$('[data-remove]', root).forEach(function (b) {
        b.addEventListener('click', function () { if (confirm('把 ' + b.getAttribute('data-name') + ' 移出搭子？')) manage({ action: 'remove', mid: b.getAttribute('data-remove') }, '已移出'); });
      });
      var cl = $('[data-close]', root);
      if (cl) cl.addEventListener('click', function () { if (confirm('结束后不会再发提醒，也不能再加入。确定结束吗？')) manage({ action: 'close' }, '搭子已结束'); });
      var ro = $('[data-reopen]', root);
      if (ro) ro.addEventListener('click', function () { manage({ action: 'reopen' }, '搭子重新开始了'); });
      var mat = $('[data-material]', root);
      if (mat) mat.addEventListener('submit', function (e) {
        e.preventDefault();
        manage({ action: 'material', material: mat.material.value, link: mat.link.value }, '内容已更新');
      });

      // join
      var jf = $('[data-join]', root);
      if (jf) jf.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('[data-error]', jf);
        err.hidden = true;
        var btn = $('button[type="submit"]', jf);
        var label = btn.textContent;
        btn.disabled = true;
        btn.textContent = '请稍候……';
        api('/api/groups/' + gid + '/join', {
          method: 'POST',
          body: { name: jf.name.value, contact: jf.contact.value, note: jf.note ? jf.note.value : '', covenant: jf.covenant.checked, invite: invite, website: jf.website.value },
        }).then(function (x) {
          if (!x.ok) { err.textContent = x.error; err.hidden = false; btn.disabled = false; btn.textContent = label; return; }
          saveToken(gid, x.token);
          toast(x.status === 'active' ? '已经加入，欢迎你' : '申请已发出');
          load().then(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
        });
      });

      // check-in
      var cf = $('[data-checkin]', root);
      if (cf) {
        var readingEl = $('[data-ck-reading]', cf);
        var mineByN = {};
        (r.records || []).forEach(function (s) { s.checkins.forEach(function (c) { if (c.mid === r.me.id) mineByN[s.n] = c; }); });
        var showReading = function () {
          var n = Number(cf.n.value);
          var s = r.checkinSessions.filter(function (x) { return x.n === n; })[0];
          readingEl.innerHTML = s && s.reading ? readingHtml(s, g.kind) : '';
          readingEl.hidden = !(s && s.reading);
          var mine = mineByN[n];
          cf.text.value = mine ? mine.text : '';
          $('button[type="submit"]', cf).textContent = mine ? '更新打卡' : '读完了，打卡';
        };
        cf.n.addEventListener('change', showReading);
        showReading();
        bindVoice(cf);
        cf.addEventListener('submit', function (e) {
          e.preventDefault();
          var err = $('[data-error]', cf);
          err.hidden = true;
          var btn = $('button[type="submit"]', cf);
          btn.disabled = true;
          var body = { n: Number(cf.n.value), text: cf.text.value };
          var send = function () {
            api('/api/groups/' + gid + '/checkin', { method: 'POST', token: token(), body: body }).then(function (x) {
              btn.disabled = false;
              if (!x.ok) { err.textContent = x.error; err.hidden = false; return; }
              rec = null;
              toast('打卡成功，愿主祝福你');
              load();
            });
          };
          if (rec && rec.blob) {
            var fr = new FileReader();
            fr.onload = function () {
              body.audio = { mime: rec.blob.type || 'audio/webm', data: String(fr.result).split(',')[1] };
              send();
            };
            fr.readAsDataURL(rec.blob);
          } else send();
        });
      }
    }

    // Voice notes: up to two minutes, recorded on the phone.
    function bindVoice(form) {
      var box = $('[data-voice]', form);
      var btn = $('[data-rec]', box);
      var tEl = $('[data-rec-t]', box);
      var play = $('[data-rec-play]', box);
      var del = $('[data-rec-del]', box);
      if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        btn.disabled = true;
        btn.textContent = '这个浏览器不能录音';
        return;
      }
      var mr, chunks, timer, started, stream;
      function stop() {
        if (mr && mr.state !== 'inactive') mr.stop();
      }
      btn.addEventListener('click', function () {
        if (mr && mr.state === 'recording') { stop(); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
          stream = s;
          var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
          var type = '';
          for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) { type = types[i]; break; }
          mr = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
          chunks = [];
          mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          mr.onstop = function () {
            clearInterval(timer);
            stream.getTracks().forEach(function (t) { t.stop(); });
            var blob = new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] });
            if (blob.size > 1000000) { toast('录音太长了，请控制在两分钟以内'); btn.textContent = '录一段语音'; return; }
            rec = { blob: blob };
            play.src = URL.createObjectURL(blob);
            play.hidden = false;
            del.hidden = false;
            tEl.hidden = true;
            btn.hidden = true;
          };
          mr.start(1000);
          started = Date.now();
          btn.textContent = '停止录音';
          btn.classList.add('recording');
          tEl.hidden = false;
          tEl.textContent = '0:00';
          timer = setInterval(function () {
            var sec = Math.floor((Date.now() - started) / 1000);
            tEl.textContent = Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
            if (sec >= 120) stop();
          }, 500);
        }, function () { toast('没有拿到麦克风权限'); });
      });
      del.addEventListener('click', function () {
        rec = null;
        play.hidden = true;
        play.removeAttribute('src');
        del.hidden = true;
        btn.hidden = false;
        btn.classList.remove('recording');
        btn.textContent = '录一段语音';
      });
    }
  }

  // ---------- admin ----------
  function initAdmin() {
    var form = $('[data-admin-key]');
    var list = $('[data-admin-list]');
    var key = '';
    try { key = localStorage.getItem('z4l.admin') || ''; } catch (e) {}
    function loadAsks() {
      fetch('/api/admin/asks', { headers: { 'X-Admin': key } }).then(function (r) { return r.json(); }).then(function (r) {
        if (!r.ok) return;
        $('[data-admin-asks]').hidden = false;
        $('[data-ask-list]').innerHTML = r.asks.length ? r.asks.map(function (a) {
          return '<div class="gcard"><p class="gmeta">' + esc(new Date(a.created).toLocaleString('zh-CN')) + (a.name ? '，' + esc(a.name) : '') + (a.reply ? '，回信邮箱：' + esc(a.reply) : '') + (a.lang === 'en' ? '，英文页面' : '') + '</p>' +
            '<p style="margin:6px 0 0;white-space:pre-wrap">' + esc(a.message) + '</p></div>';
        }).join('') : '<p class="muted">还没有人发来问题。</p>';
      });
    }
    function load() {
      $('[data-admin-groups]').hidden = false;
      loadAsks();
      fetch('/api/admin/groups', { headers: { 'X-Admin': key } }).then(function (r) { return r.json(); }).then(function (r) {
        if (!r.ok) { list.innerHTML = '<p class="form-error">' + esc(r.error) + '</p>'; return; }
        form.hidden = true;
        $('[data-admin-groups]').hidden = false;
        list.innerHTML = r.groups.length ? r.groups.map(function (g) {
          return '<div class="gcard admin-row">' + tag(g.kind) + '<h3><a href="/g/' + esc(g.id) + '">' + esc(g.title) + '</a></h3>' +
            '<p class="gmeta">' + esc(g.ownerName) + ' 发起，' + g.memberCount + ' 人，' + (g.visibility === 'public' ? '广场公开' : '仅邀请') + '，状态：' + esc({ active: '正常', hidden: '已撤下', closed: '已结束' }[g.status]) + '</p>' +
            '<p class="btn-row">' + (g.status === 'hidden'
              ? '<button class="btn btn-line btn-sm" data-st="active" data-id="' + esc(g.id) + '">恢复</button>'
              : '<button class="btn btn-line btn-sm" data-st="hidden" data-id="' + esc(g.id) + '">撤下</button>') + '</p></div>';
        }).join('') : '<p class="muted">还没有搭子。</p>';
        $$('[data-st]', list).forEach(function (b) {
          b.addEventListener('click', function () {
            fetch('/api/admin/groups/' + b.getAttribute('data-id'), { method: 'POST', headers: { 'X-Admin': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: b.getAttribute('data-st') }) })
              .then(function () { load(); });
          });
        });
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      key = form.key.value;
      try { localStorage.setItem('z4l.admin', key); } catch (x) {}
      load();
    });
    if (key) load();
  }

  if (kindOfPage === 'square') initSquare();
  else if (kindOfPage === 'me') initMine();
  else if (kindOfPage === 'new') initNew();
  else if (kindOfPage === 'group') initGroup();
  else if (kindOfPage === 'admin') initAdmin();
})();
