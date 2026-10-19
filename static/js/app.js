// 有光 accounts and conversation: sign-in sheet (email + 6-digit code), 我的, 留言,
// tag managers (认领, posts, the editor) and Zion's admin page. Exposes window.YG for dazi.js.
(() => {
  'use strict';
  const EN = document.documentElement.lang === 'en';
  const t = (zh, en) => (EN ? en : zh);
  const pre = EN ? '/en' : '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const IDS = {
    seeker: ['慕道朋友', 'Seeker'], newfriend: ['新朋友', 'New friend'], student: ['学生', 'Student'], working: ['上班族', 'Working'],
    parent: ['家长', 'Parent'], brother: ['弟兄', 'Brother'], sister: ['姊妹', 'Sister'], serving: ['服事者', 'Serving'], teacher: ['教师', 'Teacher'],
  };
  const idName = (k) => (IDS[k] ? IDS[k][EN ? 1 : 0] : k);
  const COLORS = ['var(--t-aqua)', 'var(--t-mint)', 'var(--t-sky)', 'var(--t-lilac)', 'var(--t-peach)', 'var(--t-sun)'];

  // ---------- small helpers ----------
  const toastEl = $('.toast');
  let toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2800);
  }
  async function api(path, opts = {}) {
    const headers = { 'X-Lang': EN ? 'en' : 'zh' };
    if (opts.body) headers['Content-Type'] = 'application/json';
    try {
      const r = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, credentials: 'same-origin', body: opts.body ? JSON.stringify(opts.body) : undefined });
      const data = await r.json().catch(() => ({ ok: false, error: t('网络有点问题，请稍后再试', 'Network problem. Please try again.') }));
      data.status = r.status;
      return data;
    } catch (e) {
      return { ok: false, error: t('网络有点问题，请稍后再试', 'Network problem. Please try again.') };
    }
  }
  function copy(text, done) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove();
      toast(ok ? done : text);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(done), fallback);
    else fallback();
  }
  const fmtDate = new Intl.DateTimeFormat(EN ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' });
  const fmtClock = new Intl.DateTimeFormat(EN ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // this phone's time zone: the site shows every time in it, and emails use it too
  const phoneLang = /^zh(?:-|$)/i.test(navigator.language || '') ? 'zh' : 'en';
  let phoneTz = '';
  try { phoneTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
  const dayKey = (ms) => new Date(ms).toDateString();
  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return t('刚刚', 'just now');
    if (s < 3600) return t(`${Math.floor(s / 60)} 分钟前`, `${Math.floor(s / 60)} min ago`);
    if (dayKey(ms) === dayKey(Date.now())) return fmtClock.format(new Date(ms));
    return fmtDate.format(new Date(ms));
  }
  function el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  // ---------- who is signed in ----------
  let mePromise = null;
  function me(fresh) {
    if (!mePromise || fresh) {
      mePromise = api('/api/me');
      // keep the account's time zone in step with the phone (people travel)
      mePromise.then((m) => { if (m.user && ((phoneTz && m.user.tz !== phoneTz) || (m.user.emailLangAuto && m.user.lang !== phoneLang))) api('/api/me', { body: { tz: phoneTz, deviceLang: phoneLang } }); });
    }
    return mePromise;
  }

  // ---------- the sign-in sheet ----------
  let sheetOpen = null;
  function requireLogin(reason) {
    return me().then((m) => (m.user ? m : openSheet(reason)));
  }
  function openSheet(reason) {
    if (sheetOpen) return sheetOpen;
    sheetOpen = new Promise((resolve, reject) => {
      const box = el(`<div class="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="sheet-h">
<div class="sheet">
<button type="button" class="sheet-x" aria-label="${t('关闭', 'Close')}">×</button>
<h2 id="sheet-h">${t('登录 / 注册', 'Sign in / Sign up')}</h2>
<p class="sheet-why">${esc(reason || t('不用密码：输入邮箱，我们发一个 6 位验证码给你。', 'No password: enter your email and we send you a 6-digit code.'))}</p>
<form data-step="email" novalidate>
<label class="field"><span>${t('邮箱', 'Email')}</span><input name="email" type="email" inputmode="email" autocomplete="email" required placeholder="you@example.com"></label>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="form-error" data-error hidden></p>
<button class="btn btn-water btn-block" type="submit">${t('获取验证码', 'Send me a code')}</button>
<p class="hint">${t('邮箱只用来登录和发提醒，任何人都看不到。', 'Your email is only for signing in and reminders. Nobody else sees it.')}</p>
</form>
<form data-step="code" novalidate hidden>
<p class="sent-to" data-sent></p>
<label class="field"><span>${t('验证码', 'Code')}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" class="code-in" required></label>
<div data-new hidden>
<label class="field"><span>${t('起一个昵称', 'Pick a nickname')}</span><input name="name" maxlength="20" autocomplete="nickname" placeholder="${t('例如：小李、陈弟兄', 'e.g. Sam')}"></label>
<div class="field"><span>${t('你是谁？可以多选，也可以不选', 'Who are you? Pick any, or none')}</span><div class="id-chips">${Object.keys(IDS).map((k) => `<button type="button" class="chip-btn" data-id="${k}" aria-pressed="false">${esc(idName(k))}</button>`).join('')}</div></div>
<label class="check"><input type="checkbox" name="idsPublic"><span>${t('让搭子们看到我的身份标签', 'Let my buddies see these tags')}</span></label>
</div>
<p class="form-error" data-error hidden></p>
<button class="btn btn-water btn-block" type="submit">${t('完成', 'Done')}</button>
<div class="code-help"><p>${t('没收到验证码？', 'No code yet?')}</p><button type="button" class="btn btn-line btn-block" data-resend>${t('重新发送验证码', 'Resend code')}</button><p class="hint">${t('请检查垃圾邮件或广告邮件，并核对邮箱地址。验证码 15 分钟内有效；重新发送后，请使用最新一封邮件中的验证码。', 'Check spam or promotions and make sure your email address is correct. Codes expire after 15 minutes. After resending, use the code in the newest email.')}</p><button type="button" class="link-btn" data-back>${t('邮箱填错了？换个邮箱', 'Wrong address? Change email')}</button></div>
</form>
</div></div>`);
      document.body.appendChild(box);
      document.documentElement.classList.add('sheet-on');
      const fEmail = $('[data-step="email"]', box);
      const fCode = $('[data-step="code"]', box);
      const err = (f, msg) => { const e = $('[data-error]', f); e.textContent = msg || ''; e.hidden = !msg; };
      let email = '';
      let isNew = false;
      const resend = $('[data-resend]', fCode);
      let cooldownUntil = 0, cooldownTimer;
      function updateResend() {
        const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
        resend.disabled = seconds > 0;
        resend.textContent = seconds ? t(`${seconds} 秒后可重新发送`, `Resend in ${seconds}s`) : t('重新发送验证码', 'Resend code');
        if (!seconds) clearInterval(cooldownTimer);
      }
      function startCooldown(seconds) {
        clearInterval(cooldownTimer);
        cooldownUntil = Date.now() + Math.max(0, Number(seconds) || 0) * 1000;
        updateResend();
        if (cooldownUntil > Date.now()) cooldownTimer = setInterval(updateResend, 1000);
      }

      const close = (ok) => {
        clearInterval(cooldownTimer);
        box.remove();
        document.documentElement.classList.remove('sheet-on');
        sheetOpen = null;
        if (!ok) reject(new Error('closed'));
      };
      $('.sheet-x', box).addEventListener('click', () => close(false));
      box.addEventListener('click', (e) => { if (e.target === box) close(false); });
      setTimeout(() => fEmail.email.focus(), 60);
      async function send() {
        const r = await api('/api/auth/start', { body: { email, website: fEmail.website.value } });
        if (r.retryAfter != null) startCooldown(r.retryAfter);
        if (!r.ok) return r;
        if (r.retryAfter == null) startCooldown(45);
        isNew = r.isNew;
        $('[data-sent]', fCode).textContent = t(`验证码已经发到 ${email}，看一下邮箱（也看看垃圾邮件）。`, `We sent a code to ${email}. Check your inbox (and spam).`);
        $('[data-new]', fCode).hidden = !isNew;
        if (r.devCode) fCode.code.value = r.devCode;
        return r;
      }
      fEmail.addEventListener('submit', async (e) => {
        e.preventDefault();
        err(fEmail);
        email = fEmail.email.value.trim().toLowerCase();
        const btn = $('button[type=submit]', fEmail);
        btn.disabled = true;
        const r = await send();
        btn.disabled = false;
        if (!r.ok) { err(fEmail, r.error); return; }
        fEmail.hidden = true;
        fCode.hidden = false;
        setTimeout(() => fCode.code.focus(), 60);
      });
      $$('[data-id]', fCode).forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));
      $('[data-back]', fCode).addEventListener('click', () => { fCode.hidden = true; fEmail.hidden = false; err(fCode); });
      resend.addEventListener('click', async () => {
        if (resend.disabled) return;
        resend.disabled = true;
        resend.textContent = t('正在发送……', 'Sending…');
        err(fCode);
        const r = await send();
        if (r.ok) { fCode.code.value = ''; toast(t('已重新发送，请使用最新一封邮件中的验证码', 'Sent again. Use the code in the newest email.')); }
        else { err(fCode, r.error); updateResend(); }
      });
      fCode.addEventListener('submit', async (e) => {
        e.preventDefault();
        err(fCode);
        const btn = $('button[type=submit]', fCode);
        btn.disabled = true;
        const r = await api('/api/auth/verify', {
          body: {
            email, code: fCode.code.value, name: fCode.name.value,
            ids: $$('[data-id][aria-pressed="true"]', fCode).map((b) => b.getAttribute('data-id')), idsPublic: fCode.idsPublic.checked, tz: phoneTz, deviceLang: phoneLang,
          },
        });
        btn.disabled = false;
        if (!r.ok) { err(fCode, r.error); return; }
        mePromise = Promise.resolve(r);
        close(true);
        toast(isNew ? t('欢迎你！', 'Welcome!') : t('登录好了', 'Signed in'));
        if (window.ygTrack) window.ygTrack(isNew ? 'sign_up' : 'login');
        resolve(r);
        document.dispatchEvent(new CustomEvent('yg:login', { detail: r }));
      });
    });
    return sheetOpen;
  }

  window.YG = { EN, t, pre, $, $$, esc, el, toast, api, copy, me, requireLogin, ago, idName, IDS, COLORS, fmtClock, fmtDate };

  // ---------- 有问题想问: signed-in people don't need to leave a name or email ----------
  me().then((m) => {
    if (!m.user) return;
    $$('[data-ask] .row').forEach((row) => { row.hidden = true; });
    $$('[data-ask] > p').forEach((p) => { p.textContent = t('写下来，我们会认真看，回信会发到你登录用的邮箱。', 'Write it here. We will read it carefully and reply to the email you signed in with.'); });
  });

  // ---------- 留言 ----------
  function talk(section) {
    const target = section.getAttribute('data-talk');
    const prayer = target.startsWith('huxi:');
    section.innerHTML = `<h2 class="sec-h">${prayer ? t('留下你的祷告', 'Leave your prayer') : t('留言', 'Messages')}</h2>
<p class="hint">${t('留言和回复仅限已注册并登录的用户。', 'Sign in or create an account to leave a message or reply.')}</p>
<form class="talk-form" novalidate>
<textarea name="body" maxlength="2000" rows="3" placeholder="${prayer ? t('把你的祷告写在这里……', 'Write your prayer here…') : t('想说什么，写在这里', 'Write here')}"></textarea>
<div class="talk-row">${prayer ? '<span></span>' : `<label class="check small"><input type="checkbox" name="priv"><span>${t('私聊版主', 'Message moderators privately')}</span></label>`}
<button class="btn btn-water btn-sm" type="submit">${t('发送', 'Send')}</button></div>
<p class="form-error" data-error hidden></p></form>
<div class="talk-list" data-list><p class="muted">${t('正在载入……', 'Loading…')}</p></div>`;
    const form = $('.talk-form', section);
    const list = $('[data-list]', section);
    const err = $('[data-error]', form);
    const gateCommentInput = (textarea) => {
      let prompting = false;
      textarea.addEventListener('focus', async () => {
        if (prompting) return;
        prompting = true;
        try {
          const m = await me();
          if (!m.user) {
            textarea.blur();
            await requireLogin(prayer ? t('登录或注册后，就可以留下你的祷告。', 'Sign in or sign up to leave your prayer.') : t('登录或注册后，就可以留言或回复。', 'Sign in or sign up to leave a message or reply.'));
            textarea.focus();
          }
        } catch (_) { /* the sign-in sheet was closed */ }
        prompting = false;
      });
    };
    gateCommentInput($('textarea', form));
    async function load() {
      const r = await api(`/api/talk?target=${encodeURIComponent(target)}`);
      if (!r.ok) { list.innerHTML = ''; return; }
      if (!r.comments.length) { list.innerHTML = `<p class="muted talk-empty">${t('还没有人留言。', 'No messages yet.')}</p>`; return; }
      const badge = (b) => (b === 'self' ? `<span class="badge">${t('本人', 'In person')}</span>` : b === 'manager' ? `<span class="badge">${t('管理员', 'Manager')}</span>` : '');
      const one = (c, root) => `<div class="msg${root ? '' : ' reply'}"><p class="msg-h"><b>${esc(c.name)}</b>${badge(c.badge)}${!c.pub && root ? `<span class="priv">${t('私聊版主', 'Private to moderators')}</span>` : ''}<time>${esc(ago(c.created))}</time></p>
<p class="msg-b">${esc(c.body).replace(/\n/g, '<br>')}</p>
<p class="msg-a">${root && c.canReply ? `<button type="button" class="link-btn" data-reply="${c.id}">${t('回复', 'Reply')}</button>` : ''}${c.mine || r.moderator ? `<button type="button" class="link-btn danger" data-hide="${c.id}">${prayer ? t('隐藏', 'Hide') : t('删除', 'Remove')}</button>` : ''}</p></div>`;
      list.innerHTML = r.comments.map((c) => `<div class="thread">${one(c, true)}${c.replies.map((x) => one(x, false)).join('')}</div>`).join('');
      $$('[data-hide]', list).forEach((b) => b.addEventListener('click', async () => {
        if (!confirm(prayer ? t('隐藏这条祷告留言？', 'Hide this prayer comment?') : t('删除这条留言？', 'Remove this message?'))) return;
        const x = await api(`/api/talk/${b.getAttribute('data-hide')}/hide`, { body: {} });
        if (x.ok) load(); else toast(x.error);
      }));
      $$('[data-reply]', list).forEach((b) => b.addEventListener('click', () => {
        const id = b.getAttribute('data-reply');
        const thread = b.closest('.thread');
        if ($('.reply-form', thread)) return;
        const f = el(`<form class="talk-form reply-form"><textarea name="body" rows="2" maxlength="2000" placeholder="${t('回复…', 'Reply…')}"></textarea><div class="talk-row"><span></span><button class="btn btn-water btn-sm" type="submit">${t('回复', 'Reply')}</button></div></form>`);
        thread.appendChild(f);
        gateCommentInput($('textarea', f));
        f.body.focus();
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          try { await requireLogin(t('登录或注册后，就可以回复。', 'Sign in or sign up to reply.')); } catch (_) { return; }
          const x = await api('/api/talk', { body: { target, body: f.body.value, replyTo: id } });
          if (x.ok) load(); else toast(x.error);
        });
      }));
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (!form.body.value.trim()) { err.textContent = t('先写点什么吧。', 'Write something first.'); err.hidden = false; return; }
      try { await requireLogin(t('登录以后就能留言。', 'Sign in to leave a message.')); } catch (x) { return; }
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      const priv = $('input[name="priv"]', form);
      const r = await api('/api/talk', { body: { target, body: form.body.value, pub: !priv || !priv.checked } });
      btn.disabled = false;
      if (!r.ok) { err.textContent = r.error; err.hidden = false; return; }
      form.reset();
      toast(t('留言发出去了', 'Message sent'));
      load();
    });
    document.addEventListener('yg:login', load);
    load();
  }
  $$('[data-talk]').forEach(talk);

  // Keep the two home shortcuts fixed. Reorder topic tiles using each tag's newest
  // published file, including posts updated by tag managers after the static build.
  var homeGrid = $('[data-home-grid]');
  var fitTodayTitles = function () {
    $$('[data-fit-title]').forEach(function (title) {
      var card = title.closest('.today-tile');
      if (!card) return;
      var top = $('.today-top', card);
      var bottom = $('.today-bottom', card);
      if (!top || !bottom || !card.clientHeight) return;
      title.style.fontSize = '';
      title.style.display = 'block';
      title.style.flex = 'none';
      title.style.webkitLineClamp = 'unset';
      var style = getComputedStyle(card);
      var gap = parseFloat(style.rowGap || style.gap) || 0;
      var available = card.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0)
        - top.offsetHeight - bottom.offsetHeight - gap * 2;
      var size = parseFloat(getComputedStyle(title).fontSize) || 16;
      while (size > 11 && title.scrollHeight > available) {
        size = Math.max(11, size - 0.5);
        title.style.fontSize = size + 'px';
      }
      title.style.display = '-webkit-box';
      title.style.flex = '0 1 auto';
      title.style.webkitLineClamp = '2';
      title.style.fontSize = size + 'px';
    });
  };
  if ($$('[data-fit-title]').length) {
    requestAnimationFrame(fitTodayTitles);
    window.addEventListener('resize', fitTodayTitles);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTodayTitles);
  }
  if (homeGrid) {
    api('/api/posts?latest-by-tag=1').then(function (r) {
      if (!r.ok || !r.latest) return;
      var freshVideo=document.querySelector('[data-home-fresh="videos"]');
      if(freshVideo) freshVideo.dataset.updated=String(Math.max(Number(freshVideo.dataset.updated)||0,Number(r.latest.lgh)||0));
      window.ygSortHomeFresh && window.ygSortHomeFresh();
      var tiles = $$('[data-home-tag]', homeGrid).map(function (tile, index) {
        var published = Number(tile.getAttribute('data-home-updated')) || 0;
        var managed = Number(r.latest[tile.getAttribute('data-home-tag')]) || 0;
        return { tile: tile, index: index, updated: Math.max(published, managed), extra: r.overview && r.overview[tile.getAttribute('data-home-tag')] };
      });
      tiles.forEach(function (x, index) {
        var tag = x.tile.getAttribute('data-home-tag');
        var count = $('[data-home-count]', x.tile);
        if (count) count.textContent = (Number(x.tile.getAttribute('data-home-static-count')) || 0) + (x.extra ? Number(x.extra.count) || 0 : 0);
      });
      $$('[data-home-path]', homeGrid).forEach(function (path) {
        var entries = tiles.filter(function (x) { return path.contains(x.tile); });
        entries.sort(function (a, b) { return b.updated - a.updated || a.index - b.index; });
        var list = $('.path-tags', path);
        if (list) entries.forEach(function (x) { list.appendChild(x.tile); });
        var freshest = entries.slice().sort(function (a, b) { return b.updated - a.updated; })[0];
        var summary = $('[data-path-summary]', path);
        if (summary && freshest && freshest.extra && freshest.extra.title && freshest.updated > (Number(path.getAttribute('data-path-updated')) || 0)) {
          var title = freshest.extra.lang && freshest.extra.lang !== (EN ? 'en' : 'zh') ? `${freshest.extra.lang === 'en' ? 'EN' : '中文'} · ${freshest.extra.title}` : freshest.extra.title;
          summary.textContent = title;
          summary.title = title;
          var latestLink = $('[data-path-link]', path);
          if (latestLink) latestLink.href = `${pre}/t/${freshest.tile.getAttribute('data-home-tag')}/`;
          path.setAttribute('data-path-updated', String(freshest.updated));
        }
      });
    });

    // Add a live snapshot of public, active buddy groups to the pinned shortcut.
    api('/api/dazi/plaza').then(function (r) {
      if (!r.ok) return;
      var groups = Array.isArray(r.groups) ? r.groups : [];
      var communitySection = document.querySelector('[data-home-fresh="community"]');
      if (communitySection) {
        var groupUpdated = Math.max(Number(r.latestPublished)||0,...groups.map(function(g) { var n=g.updated||g.created||0; return typeof n==='number'?n:(Date.parse(n)||0); }));
        communitySection.dataset.updated = String(Math.max(Number(communitySection.dataset.updated)||0,groupUpdated));
        window.ygSortHomeFresh && window.ygSortHomeFresh();
      }
      var daziCard = $('[data-dazi-count]') && $('[data-dazi-count]').closest('.dazi-tile');
      var count = daziCard && $('[data-dazi-count]', daziCard);
      var countline = daziCard && $('[data-dazi-countline]', daziCard);
      var stat = daziCard && $('[data-dazi-stat]', daziCard);
      var kicker = daziCard && $('[data-dazi-kicker]', daziCard);
      var summary = daziCard && $('[data-dazi-summary]', daziCard);
      var total = Number.isFinite(Number(r.count)) ? Number(r.count) : groups.length;
      if (count) {
        count.textContent = total;
      }
      if (countline) countline.hidden = false;
      if (stat) stat.hidden = false;
      if (summary) {
        var newest = groups.slice(0, 2).map(function (g) { return g.title; }).filter(Boolean);
        if (kicker) kicker.textContent = t('最新建组', 'Newest groups');
        summary.textContent = newest.length ? newest.join(' · ')
          : t('还没有公开搭子，来发起第一组', 'No public groups yet. Start the first one.');
        summary.title = newest.join(' · ');
      }
    });
  }

  // ---------- tag pages: 认领, 写一篇, and posts by the tag's managers ----------
  const postCard = (p) => `<a class="card" href="${pre}/x/${p.id}/" data-kind="${p.kind === 'video' ? 'videos' : 'reads'}"><span class="card-body" style="display:block">
<span class="kind">${p.kind === 'video' ? t('视频', 'Video') : t('文章', 'Read')}</span>${p.lang !== (EN ? 'en' : 'zh') ? `<span class="tag-s">${p.lang === 'en' ? 'EN' : '中文'}</span>` : ''}
<h3>${esc(p.title)}</h3>${p.summary ? `<p>${esc(p.summary)}</p>` : ''}<span class="meta"><span>${esc(p.author)}</span><span>${esc(ago(p.created))}</span></span></span></a>`;
  $$('[data-tag-posts]').forEach(async (box) => {
    const tag = box.getAttribute('data-tag-posts');
    const r = await api(`/api/posts?tag=${encodeURIComponent(tag)}`);
    if (!r.ok || !r.posts.length) return;
    box.innerHTML = r.posts.map(postCard).join('');
    box.hidden = false;
    const empty = $('[data-empty]');
    if (empty) empty.hidden = true;
  });
  // ---------- subscriptions (a tag, or 呼吸) and the unread count on 我的 ----------
  let subsPromise = null;
  const subs = (fresh) => {
    if (!subsPromise || fresh) subsPromise = me().then((m) => (m.user ? api('/api/subs') : { topics: [] })).then((r) => r.topics || []);
    return subsPromise;
  };
  function subButton(btn, topic) {
    const on = btn.getAttribute('data-on') || t('已订阅', 'Subscribed');
    const off = btn.getAttribute('data-off') || t('订阅', 'Subscribe');
    const paint = (x) => { btn.textContent = x ? `✓ ${on}` : off; btn.setAttribute('aria-pressed', String(x)); };
    subs().then((list) => paint(list.includes(topic)));
    btn.addEventListener('click', async () => {
      try { await requireLogin(t('订阅要先登录（不用密码）。', 'Sign in first to subscribe (no password).')); } catch (x) { return; }
      const now = (await subs()).includes(topic);
      const r = await api('/api/subs', { body: { topic, on: !now } });
      if (!r.ok) { toast(r.error); return; }
      subsPromise = Promise.resolve(r.topics);
      paint(r.topics.includes(topic));
      toast(r.topics.includes(topic) ? t('订阅好了，有更新会发到“我的”里。', 'Subscribed. Updates arrive in “Me”.') : t('取消订阅了', 'Unsubscribed'));
    });
    document.addEventListener('yg:login', () => subs(true).then((list) => paint(list.includes(topic))));
  }
  $$('[data-sub]').forEach((b) => subButton(b, b.getAttribute('data-sub')));
  const badge = (n) => {
    const tab = $('.tabbar a[href$="/me/"]');
    if (!tab) return;
    let b = $('.badge', tab);
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('i'); b.className = 'badge'; tab.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  };
  me().then((m) => badge(m.unread || 0)).catch(() => {});
  document.addEventListener('yg:login', (e) => badge(e.detail?.unread || 0));

  $$('[data-tag-tools]').forEach(async (box) => {
    const tag = box.getAttribute('data-tag-tools');
    const person = box.hasAttribute('data-person');
    const render = async () => {
      const m = await me();
      const manages = m.user && (m.admin || (m.manages || []).includes(tag));
      const claim = m.user && (m.claims || []).find((c) => c.tag === tag && c.status === 'pending');
      let h = '';
      if (manages) h = `<a class="btn btn-water btn-sm" href="${pre}/write/?tag=${encodeURIComponent(tag)}">✎ ${t('写一篇', 'Write')}</a><span class="muted">${m.admin && !(m.manages || []).includes(tag) ? t('你是网站管理员', 'You run this site') : t('你管理这个标签', 'You manage this tag')}</span>`;
      else if (claim) h = `<span class="muted">${t('认领申请已经提交，正在等网站确认。', 'Your claim is waiting for the site to confirm.')}</span>`;
      else if (person) h = `<button type="button" class="link-btn" data-claim>${t('这是我本人？认领这个标签', 'Is this you? Claim this tag')}</button>`;
      box.innerHTML = `${h}<button type="button" class="btn btn-line btn-sm sub-btn" data-sub-tag></button>`;
      subButton($('[data-sub-tag]', box), `tag:${tag}`);
      const b = $('[data-claim]', box);
      if (b) {
        b.addEventListener('click', async () => {
          try { await requireLogin(t('先登录，再认领。', 'Sign in first, then claim.')); } catch (x) { return; }
          const note = prompt(t('给网站留一句话，方便核实是你本人（例如你的微信号或我们的共同朋友）：', 'Leave a note so the site can confirm it is you (e.g. how we know each other):'), '');
          if (note === null) return;
          const r = await api('/api/claims', { body: { tag, note } });
          if (r.ok) { toast(t('提交好了，网站确认后就能管理这个标签。', 'Sent. Once confirmed, you can manage this tag.')); await me(true); render(); } else toast(r.error);
        });
      }
    };
    render();
    document.addEventListener('yg:login', () => render());
  });

  // ---------- post pages: edit / remove for the author ----------
  $$('[data-post-tools]').forEach(async (box) => {
    const id = box.getAttribute('data-post-tools');
    const r = await api(`/api/posts/${id}`);
    if (!r.ok || !r.canEdit) return;
    box.innerHTML = `<p class="btn-row"><a class="btn btn-line btn-sm" href="${pre}/write/?id=${id}">${t('修改', 'Edit')}</a><button type="button" class="btn btn-line btn-sm" data-del>${t('删除', 'Remove')}</button></p>`;
    $('[data-del]', box).addEventListener('click', async () => {
      if (!confirm(t('删除这一篇？', 'Remove this piece?'))) return;
      const x = await api(`/api/posts/${id}/delete`, { body: {} });
      if (x.ok) location.href = `${pre}/t/${r.post.tags[0]}/`; else toast(x.error);
    });
  });

  // ---------- 我的 ----------
  const meBox = $('[data-me]');
  if (meBox) {
    const render = async () => {
      const m = await me();
      if (!m.user) {
        meBox.innerHTML = `<div class="info"><h2>${t('还没有登录', 'Not signed in')}</h2>
<p>${t('登录以后，你加入的搭子、打过的卡、留过的言都会跟着你，换手机也在。不用密码，邮箱收验证码就行。', 'Sign in and your buddy groups, check-ins and messages follow you, even on a new phone. No password: just a code by email.')}</p>
${m.mail === false ? `<p class="muted">${t('（注册和登录还在准备中，过几天开放。）', '(Sign-in opens in a few days.)')}</p>` : ''}
<p><button type="button" class="btn btn-water" data-login>${t('登录 / 注册', 'Sign in / Sign up')}</button></p></div>`;
        $('[data-login]', meBox).addEventListener('click', () => requireLogin().then(render, () => {}));
        return;
      }
      const u = m.user;
      const [mine, inbox, tagList] = await Promise.all([api('/api/dazi/mine'), api('/api/inbox'), fetch('/data/tags.json').then((r) => r.json()).catch(() => [])]);
      badge(0);
      const topicName = (topic) => (topic === 'huxi' ? t('每天的呼吸', 'Daily Breathe') : ((tagList.find((x) => `tag:${x.id}` === topic) || {})[EN ? 'en' : 'zh'] || topic.slice(4)));
      const L = EN ? 'en' : 'zh';
      const msgs = inbox.ok ? inbox.list : [];
      const msgHtml = (x) => `<li class="msg-item${x.unread ? ' unread' : ''}">${x.url ? `<a href="${esc(x.url.startsWith('/') ? `${pre}${x.url}` : x.url)}"${x.url.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}>` : '<div>'}<b>${esc(x.title[L])}</b>${x.body[L] ? `<span>${esc(x.body[L]).replace(/\n/g, '<br>')}</span>` : ''}<time>${esc(ago(x.created))}</time>${x.url ? '</a>' : '</div>'}</li>`;
      const topics = await subs(true);
      const cal = `${location.host}/api/cal/${u.cal}.ics${EN ? '?lang=en' : ''}`;
      meBox.innerHTML = `<div class="profile">
<span class="avatar">${esc([...u.name][0] || '·')}</span>
<div><h2>${esc(u.name)}</h2><p class="muted">${esc(u.email)}</p></div>
<button type="button" class="link-btn" data-edit>${t('修改', 'Edit')}</button></div>
<div class="id-line">${u.ids.length ? u.ids.map((k) => `<span class="chiplink">${esc(idName(k))}</span>`).join('') : `<span class="muted">${t('还没有身份标签', 'No identity tags yet')}</span>`}<span class="muted small">${u.idsPublic ? t('搭子们看得到', 'visible to buddies') : t('只有你自己看得到', 'only you see these')}</span></div>
<section class="more inbox"><h2 class="sec-h">${t('消息', 'Messages')}${msgs.some((x) => x.unread) ? ` <small class="new">${t('新', 'new')}</small>` : ''}</h2>
${msgs.length ? `<ul class="msg-list">${msgs.slice(0, 6).map(msgHtml).join('')}</ul>${msgs.length > 6 ? `<details class="msg-more"><summary>${t(`还有 ${msgs.length - 6} 条`, `${msgs.length - 6} more`)}</summary><ul class="msg-list">${msgs.slice(6).map(msgHtml).join('')}</ul></details>` : ''}` : `<p class="muted">${t('还没有消息。订阅喜欢的标签或每天的呼吸，有更新会出现在这里；搭子调整进度、上传资料，也会告诉你。', 'No messages yet. Subscribe to tags you like or to the daily Breathe and updates show up here; your buddy groups post here too.')}</p>`}
<div class="sub-line"><span class="muted">${t('我的订阅：', 'Subscribed: ')}</span>${topics.length ? topics.map((x) => `<span class="chiplink">${esc(topicName(x))}</span>`).join('') : `<span class="muted">${t('还没有。在呼吸页和标签页可以订阅。', 'Nothing yet. Subscribe on the Breathe page and on tag pages.')}</span>`}${topics.includes('huxi') ? '' : `<a class="link-btn" href="${pre}/huxi/">${t('订阅每天的呼吸', 'Subscribe to Breathe')} →</a>`}</div>
</section>
<section class="more"><h2 class="sec-h">${t('我的搭子', 'My buddy groups')}</h2>
${mine.groups && mine.groups.length ? `<div class="mine-list">${mine.groups.map((g) => `<a class="mine-item" href="${pre}/g/${g.id}"><b>${esc(g.title)}</b><span>${g.next ? `${g.next.live ? t('正在进行', 'On now') : t('下次', 'Next')} ${esc(fmtDate.format(new Date(g.next.start)))} ${esc(fmtClock.format(new Date(g.next.start)))}` : g.finished ? t('已读完', 'Finished') : ''}</span></a>`).join('')}</div>` : `<p class="muted">${t('还没有加入搭子。', 'No buddy groups yet.')} <a href="${pre}/dazi/">${t('去广场看看', 'Visit the plaza')}</a></p>`}
</section>
<section class="more"><h2 class="sec-h">${t('加到手机日历', 'Add to your phone calendar')}</h2>
<p class="muted">${t('订阅一次，你所有搭子的时间都会出现在日历里，到时间会提醒你，点开就是那次要读的材料。以后加入新的搭子会自动更新。', 'Subscribe once and every buddy group’s times show up in your calendar, with a reminder and a link to that time’s reading. New groups are added automatically.')}</p>
<div class="cal-row"><a class="btn btn-line btn-sm" href="webcal://${esc(cal)}">${t('iPhone / Mac 日历', 'iPhone / Mac')}</a>
<a class="btn btn-line btn-sm" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${cal}`)}" target="_blank" rel="noopener">${t('Google 日历', 'Google Calendar')}</a>
<a class="btn btn-line btn-sm" href="https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(`https://${cal}`)}&name=${encodeURIComponent(t('有光搭子', 'Light buddies'))}" target="_blank" rel="noopener">Outlook</a>
<button type="button" class="btn btn-line btn-sm" data-copy-cal>${t('复制订阅链接', 'Copy link')}</button></div>
<p class="hint">${t('这个链接是你专属的，不要发给别人。', 'This link is yours alone. Do not share it.')}</p></section>
${m.manages && m.manages.length ? `<section class="more"><h2 class="sec-h">${t('我管理的标签', 'Tags I manage')}</h2><div class="cal-row">${m.manages.map((tag) => `<a class="btn btn-line btn-sm" href="${pre}/t/${tag}/">${esc(tag)}</a>`).join('')}</div></section>` : ''}
${m.admin ? `<p><a class="btn btn-line" href="/admin/">${t('网站管理', 'Site admin')}</a></p>` : ''}
<p class="logout"><button type="button" class="link-btn" data-logout>${t('退出登录', 'Sign out')}</button></p>`;
      $('[data-copy-cal]', meBox).addEventListener('click', () => copy(`https://${cal}`, t('订阅链接已复制', 'Link copied')));
      $('[data-logout]', meBox).addEventListener('click', async () => {
        await api('/api/auth/logout', { body: {} });
        await me(true);
        render();
      });
      $('[data-edit]', meBox).addEventListener('click', () => editProfile(u, render));
      // tag names for the managed tags
      fetch('/data/tags.json').then((r) => r.json()).then((tags) => {
        $$('.cal-row a[href*="/t/"]', meBox).forEach((a) => {
          const id = a.getAttribute('href').split('/t/')[1].replace('/', '');
          const tg = tags.find((x) => x.id === id);
          if (tg) a.textContent = tg[EN ? 'en' : 'zh'];
        });
      }).catch(() => {});
    };
    render();
  }
  function editProfile(u, done) {
    const box = el(`<div class="sheet-wrap" role="dialog" aria-modal="true"><form class="sheet" novalidate>
<button type="button" class="sheet-x" aria-label="${t('关闭', 'Close')}">×</button>
<h2>${t('修改我的资料', 'Edit my profile')}</h2>
<label class="field"><span>${t('昵称', 'Nickname')}</span><input name="name" maxlength="20" value="${esc(u.name)}"></label>
<div class="field"><span>${t('身份标签', 'Identity tags')}</span><div class="id-chips">${Object.keys(IDS).map((k) => `<button type="button" class="chip-btn" data-id="${k}" aria-pressed="${u.ids.includes(k)}">${esc(idName(k))}</button>`).join('')}</div></div>
<label class="check"><input type="checkbox" name="idsPublic"${u.idsPublic ? ' checked' : ''}><span>${t('让搭子们看到我的身份标签', 'Let my buddies see these tags')}</span></label>
<div class="field"><span>${t('提醒邮件用哪种语言', 'Language for emails')}</span><div class="seg" style="flex-wrap:wrap"><label><input type="radio" name="lang" value="auto"${u.emailLangAuto ? ' checked' : ''}><span>${t('跟随手机语言', 'Follow device language')}</span></label><label><input type="radio" name="lang" value="zh"${!u.emailLangAuto && u.lang !== 'en' ? ' checked' : ''}><span>中文</span></label><label><input type="radio" name="lang" value="en"${!u.emailLangAuto && u.lang === 'en' ? ' checked' : ''}><span>English</span></label></div></div>
<p class="form-error" data-error hidden></p>
<button class="btn btn-water btn-block" type="submit">${t('保存', 'Save')}</button></form></div>`);
    document.body.appendChild(box);
    const f = $('form', box);
    $$('[data-id]', f).forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));
    $('.sheet-x', box).addEventListener('click', () => box.remove());
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await api('/api/me', { body: { name: f.name.value, ids: $$('[data-id][aria-pressed="true"]', f).map((b) => b.getAttribute('data-id')), idsPublic: f.idsPublic.checked, lang: f.lang.value === 'auto' ? undefined : f.lang.value, emailLangAuto: f.lang.value === 'auto', deviceLang: phoneLang } });
      if (!r.ok) { const er = $('[data-error]', f); er.textContent = r.error; er.hidden = false; return; }
      mePromise = Promise.resolve(r);
      box.remove();
      done();
    });
  }

  // ---------- the editor for tag managers ----------
  const writeBox = $('[data-write]');
  if (writeBox) {
    (async () => {
      let m;
      try { m = await requireLogin(t('登录以后才能写。', 'Sign in to write.')); } catch (x) { writeBox.innerHTML = `<p class="muted">${t('需要先登录。', 'Please sign in first.')}</p>`; return; }
      const q = new URLSearchParams(location.search);
      const tags = await fetch('/data/tags.json').then((r) => r.json());
      let post = null;
      if (q.get('id')) {
        const r = await api(`/api/posts/${q.get('id')}`);
        if (!r.ok || !r.canEdit) { writeBox.innerHTML = `<p class="form-error">${esc(r.error || t('不能修改这一篇', 'You cannot edit this'))}</p>`; return; }
        post = r.post;
      }
      const managed = m.admin ? tags.map((x) => x.id) : m.manages || [];
      if (!managed.length) { writeBox.innerHTML = `<div class="info"><h2>${t('还不能写', 'Not yet')}</h2><p>${t('只有标签管理员可以在这里发文章和视频。', 'Only tag managers can post here.')}</p></div>`; return; }
      const chosen = post ? post.tags : [q.get('tag') || managed[0]];
      const allowed = tags.filter((x) => m.admin || managed.includes(x.id) || !x.person);
      writeBox.innerHTML = `<h1 class="page-title">${post ? t('修改', 'Edit') : t('写一篇', 'Write')}</h1>
<form class="form" novalidate>
<div class="seg"><label><input type="radio" name="kind" value="article"${!post || post.kind === 'article' ? ' checked' : ''}><span>${t('文章', 'Article')}</span></label><label><input type="radio" name="kind" value="video"${post && post.kind === 'video' ? ' checked' : ''}><span>${t('视频', 'Video')}</span></label></div>
<label class="field"><span>${t('标题', 'Title')}</span><input name="title" maxlength="80" value="${esc(post ? post.title : '')}"></label>
<label class="field"><span>${t('一两句介绍', 'A line or two')}<em>${t('显示在卡片上', 'shown on the card')}</em></span><input name="summary" maxlength="200" value="${esc(post ? post.summary : '')}"></label>
<label class="field" data-video><span>${t('视频链接', 'Video link')}<em>${t('YouTube、B站、Vimeo、Bunny 或 .mp4', 'YouTube, Bilibili, Vimeo, Bunny or .mp4')}</em></span><input name="video" type="url" inputmode="url" value="${esc(post && post.video ? (post.video.id ? `https://youtu.be/${post.video.id}` : post.video.url) : '')}"></label>
<label class="field"><span>${t('正文', 'Text')}</span><textarea name="body" rows="14" maxlength="60000" placeholder="${t('空一行就是新的一段。## 开头是小标题，> 开头是经文，最后一行写 —— 出处。', 'A blank line starts a new paragraph. ## for a heading, > for a verse with a last line — reference.')}">${esc(post ? post.body : '')}</textarea></label>
<div class="field"><span>${t('标签', 'Tags')}</span><div class="id-chips">${allowed.map((x) => `<button type="button" class="chip-btn" data-tag="${x.id}" aria-pressed="${chosen.includes(x.id)}">${esc(x[EN ? 'en' : 'zh'])}</button>`).join('')}</div></div>
<div class="field"><span>${t('这一篇是', 'Written in')}</span><div class="seg"><label><input type="radio" name="lang" value="zh"${(post ? post.lang : EN ? 'en' : 'zh') === 'zh' ? ' checked' : ''}><span>中文</span></label><label><input type="radio" name="lang" value="en"${(post ? post.lang : EN ? 'en' : 'zh') === 'en' ? ' checked' : ''}><span>English</span></label></div></div>
<p class="form-error" data-error hidden></p>
<button class="btn btn-water btn-block" type="submit">${post ? t('保存', 'Save') : t('发布', 'Publish')}</button></form>`;
      const f = $('form', writeBox);
      const syncKind = () => { $('[data-video]', f).hidden = f.kind.value !== 'video'; };
      f.addEventListener('change', syncKind);
      syncKind();
      $$('[data-tag]', f).forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const er = $('[data-error]', f);
        er.hidden = true;
        const btn = $('button[type=submit]', f);
        btn.disabled = true;
        const r = await api('/api/posts', { body: { id: post ? post.id : undefined, kind: f.kind.value, title: f.title.value, summary: f.summary.value, video: f.video.value, body: f.body.value, lang: f.lang.value, tags: $$('[data-tag][aria-pressed="true"]', f).map((b) => b.getAttribute('data-tag')) } });
        btn.disabled = false;
        if (!r.ok) { er.textContent = r.error; er.hidden = false; return; }
        location.href = `${pre}/x/${r.id}/`;
      });
    })();
  }

  // ---------- Zion's admin page ----------
  const adminBox = $('[data-admin]');
  if (adminBox) {
    const load = async () => {
      const r = await api('/api/admin/overview');
      if (r.status === 401) {
        adminBox.innerHTML = `<p>请先用管理员邮箱登录。</p><p><button class="btn btn-water" type="button" data-login>登录</button></p>`;
        $('[data-login]', adminBox).addEventListener('click', () => requireLogin().then(load, () => {}));
        return;
      }
      if (!r.ok) { adminBox.innerHTML = `<p class="form-error">${esc(r.error)}</p>`; return; }
      const tagName = Object.fromEntries(r.tags.map((x) => [x.id, x.zh]));
      const d = (ms) => new Date(ms).toLocaleString('zh-CN', { hour12: false });
      const day = (ms) => (ms ? new Date(ms).toLocaleDateString('zh-CN') : '—');
      let region = (c) => c || '';
      try { const dn = new Intl.DisplayNames(['zh-CN'], { type: 'region' }); region = (c) => (c ? dn.of(c) || c : ''); } catch (e) { /* old browser: show the code */ }
      const WEEK = '日一二三四五六';
      const when = (g) => `${g.days.length === 7 ? '每天' : `每周${g.days.map((i) => WEEK[i]).join('、')}`} ${g.time}，${g.minutes} 分钟`;
      const topicName = (x) => (x === 'huxi' ? '呼吸' : tagName[x.slice(4)] || x.slice(4));
      const statusName = { active: '进行中', closed: '已结束', removed: '已撤下' };
      const DAY = 86400000;
      const now = Date.now();
      const U = r.users;
      const live = r.groups.filter((g) => g.status !== 'removed');
      const stats = [
        ['注册的人', r.userCount],
        ['最近 7 天新注册', U.filter((u) => now - u.created < 7 * DAY).length],
        ['最近 7 天来过', U.filter((u) => now - u.seen < 7 * DAY).length],
        ['订阅了呼吸', U.filter((u) => u.subs.includes('huxi')).length],
        ['搭子：进行中 / 全部', `${r.groups.filter((g) => g.status === 'active').length} / ${r.groups.length}`],
        ['搭子里的人（人次）', live.reduce((n, g) => n + g.members, 0)],
        ['加入了搭子的人', U.filter((u) => u.groups.length).length],
        ['来自几个国家和地区', new Set(U.map((u) => u.country).filter(Boolean)).size],
      ];
      const tally = (list) => { const m = {}; list.forEach((k) => { m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
      const byCountry = tally(U.map((u) => u.country || ''));
      const byId = tally(U.flatMap((u) => u.ids));
      adminBox.innerHTML = `
<nav class="adm-nav"><a href="#adm-sum">概况</a><a href="#adm-people">注册的人</a><a href="#adm-groups">搭子</a><a href="#adm-send">发消息</a><a href="#adm-claims">认领</a><a href="#adm-mgr">标签管理员</a><a href="#adm-asks">问题</a><a href="#adm-talk">留言</a><a href="#adm-posts">文章</a></nav>
<section class="adm" id="adm-sum"><h2 class="sec-h">概况</h2>
<div class="adm-stats">${stats.map(([k, v]) => `<div class="adm-stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>
<p class="adm-chips"><span class="muted">国家和地区：</span>${byCountry.map(([c, n]) => `<span>${esc(region(c) || '还不知道')} ${n}</span>`).join('') || '<span>—</span>'}</p>
<p class="adm-chips"><span class="muted">身份标签：</span>${byId.map(([k, n]) => `<span>${esc(idName(k))} ${n}</span>`).join('') || '<span>还没有人选</span>'}</p></section>
<section class="adm" id="adm-people"><h2 class="sec-h">注册的人 <small>${r.userCount}</small></h2>
<form class="adm-tools" data-people-tools role="search">
<input type="search" name="q" placeholder="搜昵称或邮箱">
<select name="country"><option value="">所有国家和地区</option>${byCountry.map(([c, n]) => `<option value="${esc(c || '-')}">${esc(region(c) || '还不知道')}（${n}）</option>`).join('')}</select>
<select name="id"><option value="">所有身份</option>${byId.map(([k, n]) => `<option value="${esc(k)}">${esc(idName(k))}（${n}）</option>`).join('')}</select>
<select name="sort"><option value="created">按注册时间</option><option value="seen">按最近来过</option><option value="groups">按搭子多少</option><option value="checks">按打卡多少</option></select>
<button class="btn btn-line btn-sm" type="button" data-csv>导出表格</button></form>
<p class="muted small" data-people-count></p>
<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>昵称</th><th>邮箱</th><th>国家/地区</th><th>身份标签</th><th>搭子</th><th>订阅</th><th>打卡</th><th>语言 · 时区</th><th>注册</th><th>最近来过</th></tr></thead><tbody data-people></tbody></table></div>
<p class="hint">国家/地区按这个人最近一次打开网站时所在的地方记录（每小时更新一次）；之前注册、还没回来过的人暂时空着。邮箱只有管理员在这里看得到。</p></section>
<section class="adm" id="adm-groups"><h2 class="sec-h">搭子 <small>${r.groups.length}</small></h2>
${r.groups.length ? `<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>搭子</th><th>状态</th><th>人数</th><th>时间</th><th>成员</th><th>建立</th><th></th></tr></thead><tbody>${r.groups.map((g) => `<tr>
<td><a href="/g/${g.id}"><b>${esc(g.title)}</b></a><br><small>${esc(g.kindLabel)} · ${g.lang === 'en' ? 'English' : '中文'} · ${g.visibility === 'public' ? '在广场上' : '只凭邀请链接'}</small></td>
<td class="nowrap">${statusName[g.status] || esc(g.status)}</td>
<td class="nowrap">${g.members}${g.max ? ` / ${g.max}` : ''}</td>
<td>${esc(when(g))}<br><small>${esc(g.tz)} · ${esc(g.startDate)} 开始</small></td>
<td>${g.people.map((x) => `<span class="adm-tag">${esc(x.name)}${x.role === 'owner' ? '（发起）' : ''}</span>`).join('')}</td>
<td class="nowrap">${esc(day(g.created))}</td>
<td class="nowrap">${g.status === 'removed' ? `<button class="link-btn" data-dz="${g.id}" data-st="active">恢复</button>` : `<button class="link-btn danger" data-dz="${g.id}" data-st="removed">撤下</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">还没有。</p>'}</section>
<section class="adm" id="adm-send"><h2 class="sec-h">发消息给所有人 <small>${r.userCount} 位注册的人</small></h2>
<form class="form adm-send" data-send novalidate>
<label class="field"><span>标题</span><input name="title" maxlength="80" placeholder="例如：这个主日下午的特别聚会"></label>
<label class="field"><span>内容</span><textarea name="body" rows="4" maxlength="3000"></textarea></label>
<label class="field"><span>链接<em>可以不填</em></span><input name="url" maxlength="300" placeholder="/huxi/ 或 https://…"></label>
<details><summary>英文（可以不填，英文用户就看中文）</summary>
<label class="field"><span>Title</span><input name="titleEn" maxlength="120"></label>
<label class="field"><span>Message</span><textarea name="bodyEn" rows="4" maxlength="4000"></textarea></label></details>
<p class="form-error" data-error hidden></p><button class="btn btn-water" type="submit">发送</button>
<p class="hint">每个人在“我的 → 消息”里会看到，我的菜单上会有红点。</p></form>
${r.sent.length ? `<div class="adm-sent">${r.sent.slice(0, 8).map((x) => `<div class="adm-row"><p><b>${esc(x.title)}</b> <span class="muted">${esc(d(x.created))}</span></p><p class="muted">${esc(x.body.slice(0, 140))}</p></div>`).join('')}</div>` : ''}</section>
<section class="adm" id="adm-claims"><h2 class="sec-h">认领申请 <small>${r.claims.length}</small></h2>${r.claims.length ? r.claims.map((c) => `<div class="adm-row"><p><b>${esc(c.name)}</b>（${esc(c.email)}）想认领「${esc(tagName[c.tag] || c.tag)}」${c.ids.length ? `，身份：${c.ids.map((k) => esc(idName(k))).join('、')}` : ''}</p>${c.note ? `<p class="muted">留言：${esc(c.note)}</p>` : ''}<p class="btn-row"><button class="btn btn-water btn-sm" data-claim="${c.id}" data-st="approved">同意</button><button class="btn btn-line btn-sm" data-claim="${c.id}" data-st="declined">不同意</button></p></div>`).join('') : '<p class="muted">没有待处理的申请。</p>'}</section>
<section class="adm" id="adm-mgr"><h2 class="sec-h">标签管理员</h2>
<form class="adm-form" data-add-mgr><select name="tag">${r.tags.map((x) => `<option value="${x.id}">${esc(x.zh)}</option>`).join('')}</select><input name="email" type="email" placeholder="对方注册用的邮箱"><button class="btn btn-water btn-sm" type="submit">任命</button></form>
${r.managers.length ? r.managers.map((x) => `<div class="adm-row inline"><span>「${esc(tagName[x.tag] || x.tag)}」${esc(x.name)}（${esc(x.email)}）</span><button class="link-btn danger" data-del-mgr="${x.tag}|${x.uid}">取消</button></div>`).join('') : '<p class="muted">还没有任命管理员。</p>'}</section>
<section class="adm" id="adm-asks"><h2 class="sec-h">大家发来的问题 <small>${r.asks.length}</small></h2>${r.asks.length ? r.asks.slice(0, 50).map((a) => `<div class="adm-row"><p>${esc(a.message).replace(/\n/g, '<br>')}</p><p class="muted">${esc(a.name || '没留称呼')} · ${a.reply ? `<a href="mailto:${esc(a.reply)}">${esc(a.reply)}</a>` : '没留邮箱'} · ${esc(d(a.created))} · ${a.mailed ? '已发到邮箱' : '没发邮件'}</p></div>`).join('') : '<p class="muted">还没有。</p>'}</section>
<section class="adm" id="adm-talk"><h2 class="sec-h">最近的留言</h2>${r.talk.map((c) => `<div class="adm-row inline"><span><b>${esc(c.name)}</b>${c.pub ? '' : '（只给管理员）'}：${esc(c.body.slice(0, 120))} <span class="muted">${esc(c.target)}</span></span><button class="link-btn danger" data-talk-hide="${c.id}">${c.target.startsWith('huxi:') ? '隐藏' : '删除'}</button></div>`).join('') || '<p class="muted">还没有。</p>'}</section>
<section class="adm" id="adm-posts"><h2 class="sec-h">管理员发的文章和视频</h2>${r.posts.map((p) => `<div class="adm-row inline"><span><a href="/x/${p.id}/">${esc(p.title)}</a> · ${esc(p.author)} · ${p.status === 'live' ? '在线' : '已撤下'}</span>${p.status === 'live' ? `<button class="link-btn danger" data-post="${p.id}" data-st="removed">撤下</button>` : `<button class="link-btn" data-post="${p.id}" data-st="live">恢复</button>`}</div>`).join('') || '<p class="muted">还没有。</p>'}</section>`;
      const post = async (path, body) => {
        const x = await api(path, { body });
        if (!x.ok) toast(x.error); else load();
      };
      // 注册的人: search, filter, sort, and export what is shown as a table file (opens in Excel)
      const tools = $('[data-people-tools]', adminBox);
      const shown = () => {
        const q = tools.q.value.trim().toLowerCase();
        const c = tools.country.value;
        const id = tools.id.value;
        const key = tools.sort.value;
        return U.filter((u) => (!q || u.name.toLowerCase().includes(q) || u.email.includes(q))
          && (!c || (u.country || '-') === c) && (!id || u.ids.includes(id)))
          .sort((a, b) => (key === 'groups' ? b.groups.length - a.groups.length : key === 'checks' ? b.checks - a.checks : b[key] - a[key]));
      };
      const drawPeople = () => {
        const list = shown();
        $('[data-people-count]', adminBox).textContent = `显示 ${list.length} / ${U.length} 位`;
        $('[data-people]', adminBox).innerHTML = list.map((u) => `<tr>
<td><b>${esc(u.name)}</b>${u.manages.length ? `<br><small>管理：${u.manages.map((x) => esc(tagName[x] || x)).join('、')}</small>` : ''}</td>
<td><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></td>
<td class="nowrap">${esc(region(u.country) || '—')}</td>
<td>${u.ids.map((k) => `<span class="adm-tag">${esc(idName(k))}</span>`).join('') || '<small>没选</small>'}${u.ids.length && !u.idsPublic ? '<br><small>只自己看得到</small>' : ''}</td>
<td>${u.groups.map((g) => `<a class="adm-tag" href="/g/${g.id}">${esc(g.title)}${g.role === 'owner' ? '（发起）' : ''}</a>`).join('') || '<small>—</small>'}</td>
<td>${u.subs.map((x) => `<span class="adm-tag">${esc(topicName(x))}</span>`).join('') || '<small>—</small>'}</td>
<td class="nowrap">${u.checks}</td>
<td class="nowrap">${u.lang === 'en' ? 'English' : '中文'}<br><small>${esc(u.tz || '—')}</small></td>
<td class="nowrap">${esc(day(u.created))}</td>
<td class="nowrap">${esc(ago(u.seen))}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">没有符合的人。</td></tr>';
      };
      ['input', 'change'].forEach((ev) => tools.addEventListener(ev, drawPeople));
      tools.addEventListener('submit', (e) => e.preventDefault());
      drawPeople();
      $('[data-csv]', adminBox).addEventListener('click', () => {
        const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
        const head = ['昵称', '邮箱', '国家/地区', '国家代码', '身份标签', '身份标签公开', '搭子', '订阅', '管理的标签', '打卡次数', '语言', '时区', '注册时间', '最近来过', '登录的设备'];
        const rowsOut = shown().map((u) => [u.name, u.email, region(u.country), u.country, u.ids.map(idName).join('、'), u.idsPublic ? '是' : '否',
          u.groups.map((g) => `${g.title}${g.role === 'owner' ? '（发起）' : ''}`).join('、'), u.subs.map(topicName).join('、'), u.manages.map((x) => tagName[x] || x).join('、'),
          u.checks, u.lang === 'en' ? 'English' : '中文', u.tz, d(u.created), d(u.seen), u.devices]);
        const csv = '﻿' + [head, ...rowsOut].map((row) => row.map(cell).join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `有光-注册的人-${new Date().toLocaleDateString('en-CA')}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
      $$('[data-claim]', adminBox).forEach((b) => b.addEventListener('click', () => post(`/api/admin/claims/${b.getAttribute('data-claim')}`, { status: b.getAttribute('data-st') })));
      const sendF = $('[data-send]', adminBox);
      sendF.addEventListener('submit', async (e) => {
        e.preventDefault();
        const er = $('[data-error]', sendF);
        er.hidden = true;
        if (!confirm(`发给所有 ${r.userCount} 位注册的人？`)) return;
        const x = await api('/api/admin/broadcast', { body: { title: sendF.title.value, body: sendF.body.value, url: sendF.url.value, titleEn: sendF.titleEn.value, bodyEn: sendF.bodyEn.value } });
        if (x.ok) { toast('发出去了'); load(); } else { er.textContent = x.error; er.hidden = false; }
      });
      $$('[data-del-mgr]', adminBox).forEach((b) => b.addEventListener('click', () => {
        const [tag, uid] = b.getAttribute('data-del-mgr').split('|');
        if (confirm('取消这位管理员？')) post('/api/admin/managers/delete', { tag, uid });
      }));
      $$('[data-dz]', adminBox).forEach((b) => b.addEventListener('click', () => post(`/api/admin/dazi/${b.getAttribute('data-dz')}`, { status: b.getAttribute('data-st') })));
      $$('[data-talk-hide]', adminBox).forEach((b) => b.addEventListener('click', () => post(`/api/admin/talk/${b.getAttribute('data-talk-hide')}/hide`, {})));
      $$('[data-post]', adminBox).forEach((b) => b.addEventListener('click', () => post(`/api/admin/posts/${b.getAttribute('data-post')}`, { status: b.getAttribute('data-st') })));
      const f = $('[data-add-mgr]', adminBox);
      f.addEventListener('submit', (e) => { e.preventDefault(); post('/api/admin/managers', { tag: f.tag.value, email: f.email.value }); });
    };
    load();
  }

  // Every tap is applause. Batch quick taps without blocking the button.
  const likeButtons = $$('[data-video-like]');
  const films = $$('[data-feature-video]');
  function likeCount(count) {
    if(count <= 10000) return String(count);
    const step = Math.floor(count/5000);
    return EN ? (step*5)+'K+' : (step/2)+'万+';
  }
  const applause = new Map();
  function paintLike(button,count) {
    const text = $('[data-like-count]',button);
    text.textContent = likeCount(count);
    text.title = String(count);
    button.setAttribute('aria-label',t('点赞，可连续点击。当前 ','Like, tap again to add more. Current count: ')+count);
  }
  likeButtons.forEach(function(button) {
    const state = { confirmed:258,queued:0,batch:null,sending:false,timer:null,hasTapped:false };
    applause.set(button,state);
    const likedKey = 'yg-video-liked:' + button.dataset.videoLike;
    try { button.classList.toggle('is-liked', localStorage.getItem(likedKey) === '1'); } catch {}

    const render = () => paintLike(button,state.confirmed+state.queued+(state.batch?.amount || 0));
    const flush = async function() {
      if(state.sending || (!state.batch && !state.queued)) return;
      if(!state.batch) { const amount=Math.min(state.queued,1000);state.queued-=amount;state.batch={amount,id:crypto.randomUUID()}; }
      state.sending=true;
      const r=await api('/api/video-likes/'+encodeURIComponent(button.dataset.videoLike),{body:state.batch});
      state.sending=false;
      const message=$('.like-error',button.parentElement);
      if(r.ok) {
        state.confirmed=Math.max(state.confirmed,r.count);state.batch=null;message.textContent='';render();
        window.ygTrack && window.ygTrack('video_like',{liked:'yes'});
        if(state.queued) state.timer=setTimeout(flush,80);
      } else {
        message.textContent=t('网络未连上，点赞待发送；再点可重试。','Likes are waiting to send. Tap again to retry.');
      }
    };
    button.addEventListener('click',function(event) {
      const heart=document.createElement('span');
      heart.className='like-float';heart.textContent='♥';heart.setAttribute('aria-hidden','true');
      const rect=button.getBoundingClientRect();
      heart.style.left=(event.clientX ? Math.max(12,Math.min(rect.width-12,event.clientX-rect.left)) : rect.width/2)+'px';
      heart.style.setProperty('--heart-drift',(Math.random()*48-24)+'px');
      heart.style.setProperty('--heart-turn',(Math.random()*30-15)+'deg');
      const old=button.querySelectorAll('.like-float');if(old.length>=12)old[0].remove();
      button.appendChild(heart);setTimeout(()=>heart.remove(),1100);
      button.classList.add('is-liked');
      try { localStorage.setItem(likedKey, '1'); } catch {}
      state.hasTapped=true;state.queued++;render();
      button.classList.remove('is-cheering');requestAnimationFrame(()=>button.classList.add('is-cheering'));
      setTimeout(()=>button.classList.remove('is-cheering'),300);
      if(!state.sending) { clearTimeout(state.timer);state.timer=setTimeout(flush,160); }
    });
  });
  if (films.length) {
    const grid = films[0].parentElement;
    import(grid.dataset.rotationSrc).then(({ rotateVideos }) => {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('yg-home-video-rotation-v1') || '{}') || {}; } catch {}
      const result = rotateVideos(films.map(el => ({slug:el.dataset.featureVideo,published:el.dataset.published})), saved);
      const rank = new Map(result.slugs.map((slug,i) => [slug,i]));
      films.sort((a,b) => (rank.get(a.dataset.featureVideo) ?? 999) - (rank.get(b.dataset.featureVideo) ?? 999)).forEach(el => {
        el.hidden = !rank.has(el.dataset.featureVideo); grid.appendChild(el);
      });
      try { localStorage.setItem('yg-home-video-rotation-v1', JSON.stringify(result.state)); } catch {}
    }).catch(() => {});
  }
  if(likeButtons.length || films.length) {
    api('/api/video-likes').then(function(r) {
      if(!r.ok) return;
      likeButtons.forEach(function(button) {
        const key=button.dataset.videoLike;
        const update=function(s) { const st=applause.get(button);if(s && !st.hasTapped) { st.confirmed=Math.max(st.confirmed,s.count);paintLike(button,st.confirmed+st.queued+(st.batch?.amount||0)); } };
        if(key.startsWith('x:')) api('/api/video-likes/'+encodeURIComponent(key)).then(s=>{if(s.ok)update(s)});else update(r.stats[key]);
      });
      $$('[data-feature-likes]').forEach(el=>{const s=r.stats[el.dataset.featureLikes];if(s)el.textContent='♡ '+likeCount(s.count)});

    });
  }
})();
