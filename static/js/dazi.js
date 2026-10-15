// 搭子: the plaza, starting a group, the group page, one session's reading with bookmarks,
// notes and 打卡, the initiator's table, the message board and the covenant signature pad.
// Uses window.YG from app.js.
(() => {
  'use strict';
  const Y = window.YG;
  if (!Y) return;
  const { EN, t, pre, $, $$, esc, el, toast, api, copy, requireLogin, ago, COLORS, fmtClock, fmtDate } = Y;
  const page = $('[data-page]');
  if (!page) return;
  const cfgEl = $('#dazi-config');
  const CFG = cfgEl ? JSON.parse(cfgEl.textContent) : { kinds: {}, venues: {} };
  // the kinds of 搭子 come from src/kinds.js through the page's config
  const tintOf = (k) => (CFG.kinds[k] ? `var(--t-${CFG.kinds[k].tint})` : 'var(--t-aqua)');
  const fmtWeek = new Intl.DateTimeFormat(EN ? 'en-US' : 'zh-CN', { weekday: 'short' });
  const dayKey = (ms) => new Date(ms).toDateString();
  // "今天 20:00", "明天 20:00", "周二 10月14日 20:00" in the viewer's own time zone
  function when(ms) {
    const d = new Date(ms);
    let day;
    if (dayKey(ms) === dayKey(Date.now())) day = t('今天', 'Today');
    else if (dayKey(ms) === dayKey(Date.now() + 86400000)) day = t('明天', 'Tomorrow');
    else day = `${fmtWeek.format(d)} ${fmtDate.format(d)}`;
    return `${day} ${fmtClock.format(d)}`;
  }
  let viewerTz = '';
  try { viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }

  // ---------- times, always in this phone's own time zone ----------
  const WK = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['日', '一', '二', '三', '四', '五', '六'];
  const monFirst = (a, b) => ((a + 6) % 7) - ((b + 6) % 7);
  function daysWords(days) {
    const d = [...new Set(days)].sort(monFirst);
    if (!d.length) return t('（还没选哪几天）', '(no days picked yet)');
    if (d.length === 7) return t('每天', 'Every day');
    if (d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x))) return t('每周一到周五', 'Weekdays');
    if (d.length === 6 && [1, 2, 3, 4, 5, 6].every((x) => d.includes(x))) return t('每周一到周六', 'Mon to Sat');
    return EN ? `Every ${d.map((x) => WK[x]).join(', ')}` : `每周${d.map((x) => WK[x]).join('、')}`;
  }
  function minutesWords(min) {
    if (EN) return min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} hr ${min % 60} min` : `${min / 60} hr`;
    return min < 60 ? `${min}分钟` : min % 60 ? `${Math.floor(min / 60)}小时${min % 60}分钟` : `${min / 60}小时`;
  }
  // "每周三、五 09:00，每次30分钟" from one week of session starts (g.week)
  function schedText(g) {
    const seen = new Set();
    const list = (g.week || []).map((ms) => { const d = new Date(ms); return { wd: d.getDay(), clock: fmtClock.format(d) }; })
      .filter((x) => !seen.has(x.wd) && seen.add(x.wd)).sort((a, b) => monFirst(a.wd, b.wd));
    if (!list.length) return minutesWords(g.minutes);
    const when = new Set(list.map((x) => x.clock)).size === 1
      ? `${daysWords(list.map((x) => x.wd))}${EN ? ' at ' : ' '}${list[0].clock}`
      : EN ? `Every ${list.map((x) => `${WK[x.wd]} ${x.clock}`).join(', ')}` : `每周${list.map((x) => `${WK[x.wd]} ${x.clock}`).join('、')}`;
    return EN ? `${when}, ${minutesWords(g.minutes)} each` : `${when}，每次${minutesWords(g.minutes)}`;
  }
  // the plan in words, from a kind's summary template (same rules as fillSummary in src/kinds.js)
  function fillSummary(tpl, show, on) {
    const one = (x) => x.replace(/\{(\w+)(?:#([^#{}]*)#([^{}]*))?\}/g, (_, k, a, b) => {
      const v = show(k);
      return a !== undefined && EN ? `${v} ${Number(v) === 1 ? a : b}` : v;
    });
    return tpl.replace(/\{(\w+)\?((?:[^{}]|\{[^{}]*\})*)\}|\{\w+(?:#[^#{}]*#[^{}]*)?\}/g, (m, k, inner) => (k !== undefined ? (on(k) ? one(inner) : '') : one(m)));
  }

  // ---------- a table with seats (plaza, group page) ----------
  function table(kind, seats, max, big) {
    const n = Math.max(2, Math.min(max || 6, 8));
    const R = big ? 86 : 50;
    const size = big ? 252 : 152;
    const c = size / 2;
    let h = `<span class="table${big ? ' big' : ''}" style="--tint:${tintOf(kind)};width:${size}px;height:${size}px">`;
    h += `<span class="table-top">${CFG.kinds[kind] ? CFG.kinds[kind].icon : ''}</span>`;
    for (let i = 0; i < n; i++) {
      const a = (-90 + (360 / n) * i) * Math.PI / 180;
      const x = c + R * Math.cos(a), y = c + R * Math.sin(a);
      const s = seats[i];
      h += s
        ? `<span class="seat${s.me ? ' me' : ''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--seat:${COLORS[s.c]}">${esc(s.i)}</span>`
        : `<span class="seat free" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"></span>`;
    }
    if (seats.length > n) h += `<span class="seat more" style="left:${c}px;top:${c + R + 4}px">+${seats.length - n}</span>`;
    return `${h}</span>`;
  }
  const seatsOf = (members) => members.map((m) => ({ i: [...m.name][0] || '·', c: m.c, me: m.me }));

  // ---------- the plaza: presentation over the existing read-only group APIs ----------
  function spot(g) {
    return `<a class="spot${g.next?.live ? ' is-live' : ''}${g.mine ? ' is-mine' : ''}" href="${pre}/g/${g.id}" data-plaza-group="${g.id}" aria-haspopup="dialog" aria-label="${esc(g.title)}" style="--tint:${tintOf(g.kind)}">
${table(g.kind, g.seats, g.max, false)}<span class="spot-title">${esc(g.title)}</span></a>`;
  }
  function plaza() {
    const box = $('[data-plaza]');
    const count = $('[data-count]');
    const vacant = $('[data-plaza-vacant]');
    const popup = $('[data-table-popup]');
    const popupBody = $('[data-popup-body]');
    const memberCache = new Map();
    const memberRequests = new Map();
    let groups = [], pageIndex = 1, loadVersion = 0, selected = null, lastFocus = null;
    let kind = new URLSearchParams(location.search).get('kind') || '';
    if (!CFG.kinds[kind]) kind = '';
    const pageSize = () => window.matchMedia('(min-width: 620px)').matches ? 9 : 6;
    // Names already public on /g/<id>. Do not modify the card API or any membership data.
    const readMembers = (g) => {
      if (memberCache.has(g.id)) return Promise.resolve(memberCache.get(g.id));
      if (!memberRequests.has(g.id)) {
        const request = api(`/api/dazi/${g.id}`).then((r) => {
          if (r.ok && r.group?.members) {
            memberCache.set(g.id, r.group.members);
            return r.group.members;
          }
          return null;
        }).catch(() => null).finally(() => memberRequests.delete(g.id));
        memberRequests.set(g.id, request);
      }
      return memberRequests.get(g.id);
    };
    const labelChairs = (node, g, members) => {
      if (!node.isConnected) return;
      $$('.seat:not(.free):not(.more)', node).forEach((seat, i) => {
        const name = members?.[i]?.name || g.seats[i]?.i || '·';
        const label = document.createElement('span');
        label.className = 'member-name';
        label.textContent = name;
        seat.replaceChildren(label);
        seat.title = name;
        seat.setAttribute('aria-label', t(`${name} 已入座`, `${name}, seated`));
      });
      $$('.seat.free', node).forEach((seat) => seat.setAttribute('aria-label', t('空椅，虚位以待', 'An open chair awaits a companion')));
    };
    const popupContent = (g, members) => {
      const nx = g.next;
      const meta = nx ? `${nx.live ? `<b>${t('正在进行', 'On now')}</b> · ` : ''}${esc(when(nx.start))}` : g.finished ? t('已读完', 'Finished') : t('时间见搭子的约', 'See the covenant for the schedule');
      const memberText = members?.length ? `<p class="popup-members">${esc(members.map((m) => m.name).join(' · '))}</p>` : '';
      popupBody.innerHTML = `<span class="popup-kind">${esc(CFG.kinds[g.kind]?.name || '')}</span>
<h2 id="plaza-popup-title">${esc(g.title)}</h2>
<div class="popup-meta">${meta}<br>${esc(g.minutes)} ${t('分钟', 'min')} · ${g.lang === 'en' ? 'English' : '中文'}${nx?.reading ? `<br>${esc(nx.reading)}` : ''}</div>
<p>${esc(g.planText || '')}</p>
<p class="popup-occupancy">${g.seats.length} / ${g.max} ${t('人', 'members')} · ${g.seats.length >= g.max ? t('已满员', 'Full') : t(`余 ${g.max - g.seats.length} 席`, `${g.max - g.seats.length} open seats`)}${g.join === 'invite' ? ` · ${t('邀请制', 'Invitation only')}` : ''}</p>${memberText}
<a class="popup-link" href="${pre}/g/${g.id}">${t('查看搭子的约 · 前往小组', 'View the covenant · Open group')}</a>
<p class="popup-note">${t('在小组页查看最新安排、读物及加入方式。已加入的组员可使用原有日历、资料和进度功能。', 'Open the group for the latest arrangements, readings, and joining details. Members can use the existing calendar, files, and progress features there.')}</p>`;
    };
    const openTable = (g, trigger) => {
      selected = g.id;
      lastFocus = trigger;
      popupContent(g, memberCache.get(g.id));
      popup.showModal();
      readMembers(g).then((members) => {
        if (members && popup.open && selected === g.id) popupContent(g, members);
      });
    };
    $('[data-popup-close]').addEventListener('click', () => popup.close());
    popup.addEventListener('click', (event) => {
      if (event.target !== popup) return;
      const r = popup.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) popup.close();
    });
    popup.addEventListener('close', () => { selected = null; if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); });
    const render = () => {
      const filtered = groups.filter((g) => !vacant.checked || g.seats.length < g.max);
      const limit = pageSize(), pages = Math.max(1, Math.ceil(filtered.length / limit));
      pageIndex = Math.min(pageIndex, pages);
      const visible = filtered.slice((pageIndex - 1) * limit, pageIndex * limit);
      count.textContent = groups.length ? t(`此刻，广场上有 ${groups.length} 组搭子`, `${groups.length} buddy ${groups.length === 1 ? 'group' : 'groups'} on the plaza right now`) : t('广场上还空着，第一桌由你来摆', 'The plaza is empty. Set out the first table');
      if (vacant.checked) count.textContent += t(` · 找到 ${filtered.length} 组`, ` · ${filtered.length} found`);
      const empty = groups.length ? t('这个分类暂时没有符合条件的搭子，试试其他分类或取消空位筛选。', 'No groups match this filter. Try another category or turn off Open seats.') : `<a href="${pre}/dazi/new/${kind ? `?kind=${encodeURIComponent(kind)}` : ''}">${t('摆一张新桌，邀请伙伴同行', 'Set a new table and invite your companions')}</a>`;
      box.innerHTML = `<div class="plaza-grid">${visible.length ? visible.map(spot).join('') : `<p class="plaza-empty">${empty}</p>`}</div>
<p class="plaza-legend">${t('椅子上的名字是组员 · 空椅虚位以待', 'Names mark companions · Open chairs await you')}</p>
<nav class="plaza-pager" aria-label="${t('广场分页', 'Plaza pages')}"><button type="button" data-plaza-prev${pageIndex === 1 ? ' disabled' : ''}>${t('上一页', 'Previous')}</button><span>${pageIndex} / ${pages}</span><button type="button" data-plaza-next${pageIndex === pages ? ' disabled' : ''}>${t('下一页', 'Next')}</button></nav>`;
      const stepPage = (step) => {
        pageIndex += step;
        render();
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $(step > 0 ? '[data-plaza-prev]' : '[data-plaza-next]', box)?.focus({ preventScroll: true });
      };
      $('[data-plaza-prev]', box).addEventListener('click', () => stepPage(-1));
      $('[data-plaza-next]', box).addEventListener('click', () => stepPage(1));
      visible.forEach((g) => {
        const node = $(`[data-plaza-group="${g.id}"]`, box);
        labelChairs(node, g, memberCache.get(g.id));
        node.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          openTable(g, node);
        });
        readMembers(g).then((members) => { if (members) labelChairs(node, g, members); });
      });
    };
    const load = async () => {
      const version = ++loadVersion;
      $$('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-kind') === kind)));
      const r = await api(`/api/dazi/plaza${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
      if (version !== loadVersion) return;
      if (!r.ok) { box.innerHTML = `<p class="form-error">${esc(r.error)}</p>`; return; }
      groups = r.groups;
      pageIndex = 1;
      render();
    };
    $$('[data-kind]').forEach((b) => b.addEventListener('click', () => {
      kind = b.getAttribute('data-kind');
      history.replaceState(null, '', kind ? `?kind=${encodeURIComponent(kind)}` : location.pathname);
      load();
    }));
    vacant.addEventListener('change', () => { pageIndex = 1; render(); });
    window.matchMedia('(min-width: 620px)').addEventListener('change', () => { pageIndex = 1; render(); });
    load();
    // Keep the existing signed-in user's strip and its destinations.
    const mine = async () => {
      const r = await api('/api/dazi/mine');
      if (!r.ok || !r.groups.length) return;
      $('[data-mine]').hidden = false;
      $('[data-mine-row]').innerHTML = r.groups.map((g) => `<a class="mine-chip" href="${pre}/g/${g.id}" style="--tint:${tintOf(g.kind)}"><b>${esc(g.title)}</b><span>${g.next ? (g.next.live ? t('正在进行', 'On now') : esc(when(g.next.start))) : ''}</span></a>`).join('');
    };
    mine();
    document.addEventListener('yg:login', mine);
  }

  // ---------- signature pad ----------
  function sigPad(box) {
    const canvas = $('canvas', box);
    const ctx = canvas.getContext('2d');
    let dpr = 1, drawn = false, last = null;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = getComputedStyle(box).getPropertyValue('--ink-sig').trim() || '#1b2a38';
      ctx.lineWidth = 2.6;
      drawn = false;
    };
    fit();
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); last = pos(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); drawn = true; box.classList.add('signed'); });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
      ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    const clear = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; box.classList.remove('signed'); };
    const btn = $('[data-sig-clear]', box);
    if (btn) btn.addEventListener('click', clear);
    window.addEventListener('resize', () => { if (!drawn) fit(); });
    return {
      empty: () => !drawn,
      // a small dark-ink PNG, whatever the theme
      png: () => {
        const out = document.createElement('canvas');
        const w = 480, h = Math.round(480 * canvas.height / canvas.width);
        out.width = w; out.height = h;
        const o = out.getContext('2d');
        o.drawImage(canvas, 0, 0, w, h);
        o.globalCompositeOperation = 'source-in';
        o.fillStyle = '#1b2a38';
        o.fillRect(0, 0, w, h);
        return out.toDataURL('image/png');
      },
    };
  }

  // ---------- start a group ----------
  function newGroup() {
    const form = $('[data-new]');
    const err = $('[data-error]');
    const pad = sigPad($('[data-sigpad]', form));
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const dayBoxes = $$('input[name="days"]', form);
    form.startDate.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    dayBoxes.forEach((c) => { if (Number(c.value) === now.getDay()) c.checked = true; });
    form.tz.value = viewerTz; // the initiator's own phone decides the time zone
    const q = new URLSearchParams(location.search);
    if (CFG.kinds[q.get('kind')]) $$('input[name="kind"]', form).forEach((r) => { r.checked = r.value === q.get('kind'); });
    const kind = () => ($('input[name="kind"]:checked', form) || {}).value || 'bible';
    const box = (k) => $(`fieldset[data-for="${k}"]`, form);

    // some kinds have their own usual time (晨兴: mornings, Monday to Saturday) until the person picks one
    const base = { time: form.time.value, days: dayBoxes.filter((c) => c.checked).map((c) => Number(c.value)) };
    let touchedTime = false, touchedDays = false;
    form.time.addEventListener('input', () => { touchedTime = true; });
    dayBoxes.forEach((c) => c.addEventListener('change', () => { touchedDays = true; }));
    function applyDefaults() {
      const d = (CFG.kinds[kind()] || {}).defaults || base;
      if (!touchedTime) form.time.value = d.time;
      if (!touchedDays) dayBoxes.forEach((c) => { c.checked = d.days.includes(Number(c.value)); });
    }
    $$('input[name="kind"]', form).forEach((r) => r.addEventListener('change', applyDefaults));
    applyDefaults();

    let books = [];
    fetch('/data/bible.json').then((r) => r.json()).then((b) => { books = b; $$('[data-chapters]', form).forEach(fillChapters); sync(); });
    // a chapter list follows the book picked in the same part of the form
    function fillChapters(sel) {
      const bookSel = $('[data-plan="book"]', sel.closest('fieldset'));
      const b = books.find((x) => x.n === Number(bookSel && bookSel.value));
      if (!b) return;
      const cur = Number(sel.value) || 1;
      sel.innerHTML = Array.from({ length: b.ch }, (_, i) => `<option value="${i + 1}">${EN ? `Chapter ${i + 1}` : `第 ${i + 1} 章`}</option>`).join('');
      sel.value = String(Math.min(cur, b.ch));
    }
    $$('[data-plan="book"]', form).forEach((b) => b.addEventListener('change', () => {
      const ch = $('[data-chapters]', b.closest('fieldset'));
      if (ch) { ch.value = '1'; fillChapters(ch); }
    }));
    const bookName = (n) => { const b = books.find((x) => x.n === Number(n)); return b ? b[EN ? 'en' : 'zh'] : ''; };
    // the plan as the server wants it: numbers as numbers, ticks as true/false
    function planOf(k) {
      const plan = {};
      const fs = box(k);
      if (!fs) return plan;
      $$('[data-plan]', fs).forEach((x) => {
        const v = x.value.trim();
        plan[x.getAttribute('data-plan')] = x.type === 'checkbox' ? x.checked : (x.type === 'number' || x.tagName === 'SELECT') && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
      });
      return plan;
    }
    function planWords(k) {
      const kd = CFG.kinds[k];
      if (!kd) return '';
      const plan = planOf(k);
      const fields = Object.fromEntries(kd.fields.map((f) => [f.name, f]));
      const show = (n) => {
        const f = fields[n];
        const v = plan[n];
        if (!f) return '';
        if (f.type === 'book') return bookName(v);
        if (f.options) { const o = f.options.find((x) => String(x[0]) === String(v)); return o ? o[1] : String(v); }
        return v == null ? '' : String(v);
      };
      const out = fillSummary(kd.summary, show, (n) => !!plan[n]);
      return EN ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    }
    function terms() {
      const k = kind();
      const days = dayBoxes.filter((c) => c.checked).map((c) => Number(c.value));
      const mins = form.minutes.options[form.minutes.selectedIndex].textContent;
      const venue = $('input[name="venue"]:checked', form).value;
      const verb = CFG.kinds[k] ? CFG.kinds[k].verb : '';
      return `<dl class="terms">
<dt>${t('时间', 'When')}</dt><dd>${esc(daysWords(days))} ${esc(form.time.value || '--:--')}${EN ? ', ' : '，'}${esc(mins)}<small>${t('从', 'from ')}${esc(form.startDate.value)}${t(' 开始', '')}</small></dd>
<dt>${t('读什么', 'What')}</dt><dd>${esc(planWords(k))}${form.lang.value === 'en' ? ' · English' : ' · 中文'}</dd>
<dt>${t('在哪里', 'Where')}</dt><dd>${esc(CFG.venues[venue].name)}</dd>
</dl><p class="cov-line">${EN ? `I will keep this time and ${esc(verb)} with my buddies faithfully, week after week.` : `我愿意按约定的时间，坚定持续地和搭子们一起${esc(verb)}。`}</p>`;
    }
    function sync() {
      const k = kind();
      $$('fieldset[data-for]', form).forEach((f) => { f.hidden = f.getAttribute('data-for') !== k; });
      $('[data-for-public]', form).hidden = $('input[name="visibility"]:checked', form).value !== 'public';
      $('[data-summary]', form).innerHTML = terms();
    }
    form.addEventListener('input', sync);
    form.addEventListener('change', sync);
    sync();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const show = (m) => { err.textContent = m; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      if (!form.title.value.trim()) { show(t('给搭子起个名字吧', 'Give the group a name')); return; }
      if (pad.empty()) { show(t('请在约上签个名', 'Please sign the covenant')); return; }
      try { await requireLogin(t('发起搭子前，先登录一下（不用密码）。', 'Sign in first to start a group (no password).')); } catch (x) { return; }
      const k = kind();
      const body = {
        kind: k, lang: form.lang.value, title: form.title.value, intro: form.intro.value,
        days: dayBoxes.filter((c) => c.checked).map((c) => Number(c.value)), time: form.time.value, minutes: Number(form.minutes.value),
        startDate: form.startDate.value, tz: form.tz.value || viewerTz, plan: planOf(k),
        venue: { type: $('input[name="venue"]:checked', form).value, info: form.venueInfo.value },
        visibility: $('input[name="visibility"]:checked', form).value, join: $('input[name="join"]:checked', form).value, max: Number(form.max.value),
        sig: pad.png(), website: form.website.value,
      };
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      const r = await api('/api/dazi', { body });
      btn.disabled = false;
      if (!r.ok) { show(r.error); return; }
      if (window.ygTrack) window.ygTrack('create_group', { kind: k });
      location.href = `${pre}/g/${r.id}?new=1`;
    });
  }

  // ---------- plan fields drawn from a kind (src/kinds.js), for the initiator's progress form ----------
  let booksP = null;
  const booksList = () => (booksP = booksP || fetch('/data/bible.json').then((r) => r.json()).catch(() => []));
  function planFieldsHtml(k, plan) {
    const kd = CFG.kinds[k];
    if (!kd) return '';
    const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
    const one = (f) => {
      const v = plan[f.name] != null ? plan[f.name] : f.value;
      const label = `<span>${esc(f.label)}${f.optional ? `<em>${t('可以不写', 'optional')}</em>` : ''}</span>`;
      let input = '';
      if (f.type === 'check') return `<label class="check"><input type="checkbox" data-plan="${f.name}"${v ? ' checked' : ''}><span>${esc(f.label)}</span></label>`;
      if (f.type === 'book') input = `<select data-plan="book" data-book-value="${esc(v)}"></select>`;
      else if (f.type === 'chapter') input = `<select data-plan="${f.name}" data-chapters data-value="${esc(v)}"></select>`;
      else if (f.type === 'select') input = `<select data-plan="${f.name}">${f.options.map((o) => opt(o[0], o[1], String(o[0]) === String(v))).join('')}</select>`;
      else if (f.type === 'tag') input = `<select data-plan="${f.name}">${(CFG.tags || []).map((x) => opt(x[0], x[1], x[0] === v)).join('')}</select>`;
      else if (f.type === 'lesson' || f.type === 'num') input = `<input data-plan="${f.name}" type="number" inputmode="numeric" min="${f.min || 1}" max="${f.type === 'lesson' ? CFG.feedCount || 1 : f.max || 999}" value="${esc(v)}">`;
      else if (f.type === 'url') input = `<input data-plan="${f.name}" type="url" inputmode="url" maxlength="300" placeholder="https://" value="${esc(v || '')}">`;
      else input = `<input data-plan="${f.name}" maxlength="${f.max || 60}" placeholder="${esc(f.placeholder || '')}" value="${esc(v || '')}">`;
      return `<label class="field">${label}${input}</label>${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ''}`;
    };
    let h = '';
    for (let i = 0; i < kd.fields.length; i++) {
      const f = kd.fields[i];
      if (f.pair && kd.fields[i + 1] && kd.fields[i + 1].pair && !f.hint) { h += `<div class="row2">${one(f)}${one(kd.fields[i + 1])}</div>`; i++; } else h += one(f);
    }
    return h || `<p class="hint">${esc(kd.note || '')}</p>`;
  }
  // fill book and chapter lists, keep chapters in step with the book
  async function wirePlanFields(box) {
    const books = await booksList();
    $$('[data-plan="book"]', box).forEach((sel) => {
      const want = Number(sel.getAttribute('data-book-value')) || 43;
      sel.innerHTML = books.map((b) => `<option value="${b.n}"${b.n === want ? ' selected' : ''}>${esc(b[EN ? 'en' : 'zh'])}</option>`).join('');
    });
    const fillCh = (sel, keep) => {
      const bookSel = $('[data-plan="book"]', box);
      const b = books.find((x) => x.n === Number(bookSel && bookSel.value));
      if (!b) return;
      const cur = keep ? Number(sel.getAttribute('data-value')) || 1 : 1;
      sel.innerHTML = Array.from({ length: b.ch }, (_, i) => `<option value="${i + 1}">${EN ? `Chapter ${i + 1}` : `第 ${i + 1} 章`}</option>`).join('');
      sel.value = String(Math.min(cur, b.ch));
    };
    $$('[data-chapters]', box).forEach((sel) => fillCh(sel, true));
    $$('[data-plan="book"]', box).forEach((b) => b.addEventListener('change', () => $$('[data-chapters]', box).forEach((sel) => fillCh(sel, false))));
  }
  const readPlan = (box) => {
    const plan = {};
    $$('[data-plan]', box).forEach((x) => {
      const v = x.value.trim();
      plan[x.getAttribute('data-plan')] = x.type === 'checkbox' ? x.checked : (x.type === 'number' || x.tagName === 'SELECT') && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
    });
    return plan;
  };
  const sizeText = (n) => (n < 1000000 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1000000).toFixed(1)} MB`);

  // ---------- the group page ----------
  function covenantSheet(g, invite) {
    return new Promise((resolve, reject) => {
      const k = CFG.kinds[g.kind] || {};
      const box = el(`<div class="sheet-wrap" role="dialog" aria-modal="true"><div class="sheet cov-sheet">
<button type="button" class="sheet-x" aria-label="${t('关闭', 'Close')}">×</button>
<h2>${t('立约', 'Make the covenant')}</h2>
<div class="covenant"><dl class="terms"><dt>${t('搭子', 'Group')}</dt><dd>${esc(g.title)}</dd><dt>${t('时间', 'When')}</dt><dd>${esc(schedText(g))}<small>${t('按你手机上的时间', 'In your phone’s own time')}</small></dd><dt>${t('读什么', 'What')}</dt><dd>${esc(g.planText)}</dd><dt>${t('在哪里', 'Where')}</dt><dd>${esc(CFG.venues[g.venue.type] ? CFG.venues[g.venue.type].name : '')}</dd></dl>
<p class="cov-line">${EN ? `I will keep this time and ${esc(k.verb || '')} with my buddies faithfully, week after week.` : `我愿意按约定的时间，坚定持续地和搭子们一起${esc(k.verb || '')}。`}</p>
<p class="cov-sign-label">${t('在下面签个名', 'Sign below')}</p><div class="sigpad" data-sigpad><canvas></canvas><button type="button" class="link-btn" data-sig-clear>${t('重写', 'Clear')}</button></div></div>
<p class="form-error" data-error hidden></p>
<button type="button" class="btn btn-water btn-block" data-go>${t('签名立约', 'Sign and join')}</button></div></div>`);
      document.body.appendChild(box);
      document.documentElement.classList.add('sheet-on');
      const pad = sigPad($('[data-sigpad]', box));
      const close = () => { box.remove(); document.documentElement.classList.remove('sheet-on'); };
      $('.sheet-x', box).addEventListener('click', () => { close(); reject(new Error('closed')); });
      $('[data-go]', box).addEventListener('click', async () => {
        const er = $('[data-error]', box);
        if (pad.empty()) { er.textContent = t('请先签个名', 'Please sign first'); er.hidden = false; return; }
        const btn = $('[data-go]', box);
        btn.disabled = true;
        const r = await api(`/api/dazi/${g.id}/join`, { body: { sig: pad.png(), invite } });
        btn.disabled = false;
        if (!r.ok) { er.textContent = r.error; er.hidden = false; return; }
        if (window.ygTrack) window.ygTrack('join_group', { group_id: g.id, kind: g.kind });
        close();
        resolve();
      });
    });
  }

  function groupPage(gid) {
    const root = $('[data-group]');
    const q = new URLSearchParams(location.search);
    const invite = q.get('i') || '';
    let isNew = q.get('new') === '1';
    if (isNew) history.replaceState(null, '', location.pathname + (invite ? `?i=${invite}` : ''));
    let tab = ['progress', 'files', 'board', 'people', 'cal', 'set', 'stats'].includes(q.get('tab')) ? q.get('tab') : 'progress';
    let data = null;

    const load = async () => {
      data = await api(`/api/dazi/${gid}${invite ? `?i=${encodeURIComponent(invite)}` : ''}`);
      render();
    };
    function render() {
      const r = data;
      if (!r.ok) { root.innerHTML = `<div class="empty"><p>${esc(r.error)}</p><p><a class="btn btn-water" href="${pre}/dazi/">${t('去搭子广场', 'Go to the plaza')}</a></p></div>`; return; }
      if (r.needInvite) {
        root.innerHTML = `<div class="g-hero" style="--tint:${tintOf(r.group.kind)}"><h1 class="g-title">${esc(r.group.title)}</h1><p class="muted">${t(`这个搭子不公开，需要用${r.group.owner ? ` ${esc(r.group.owner)} ` : ''}发给你的邀请链接打开。`, `This group is not public. Open it with the invite link${r.group.owner ? ` from ${esc(r.group.owner)}` : ''}.`)}</p></div>`;
        return;
      }
      const g = r.group;
      document.title = `${g.title}｜${EN ? 'Light' : '有光'}`;
      const k = CFG.kinds[g.kind] || {};
      const member = !!(r.me && r.me.role);
      const owner = r.me && r.me.role === 'owner';
      const nx = g.current || g.next;
      let h = '';
      if (isNew && owner) {
        h += `<div class="notice"><b>${t('搭子建好了。', 'Your group is ready.')}</b> ${t('把邀请链接发给朋友，他们打开、签名，就立约加入了。', 'Send the invite link to friends. They open it, sign, and they are in.')}<p class="btn-row"><button class="btn btn-dawn btn-sm" type="button" data-copy-invite>${t('复制邀请链接', 'Copy invite link')}</button></p></div>`;
        isNew = false;
      }
      h += `<div class="g-hero" style="--tint:${tintOf(g.kind)}">${table(g.kind, seatsOf(g.members), g.max, true)}
<p class="g-kind"><span class="ki">${k.icon || ''}</span>${esc(k.name || '')}<span class="pill">${g.lang === 'en' ? 'English' : '中文'}</span>${g.join === 'invite' ? `<span class="pill">🔒 ${t('邀请制', 'Invite only')}</span>` : ''}${g.status === 'closed' ? `<span class="pill">${t('已结束', 'Ended')}</span>` : ''}</p>
<h1 class="g-title">${esc(g.title)}</h1>
<p class="g-by">${esc(g.owner)} ${t('发起', 'started this')} · ${g.members.length}/${g.max} ${t('人', 'people')}</p>
${g.intro ? `<p class="g-intro">${esc(g.intro)}</p>` : ''}</div>`;
      // the covenant
      const venue = CFG.venues[g.venue.type] || {};
      h += `<section class="covenant"><h2>${t('搭子的约', 'The covenant')}</h2><dl class="terms">
<dt>${t('时间', 'When')}</dt><dd>${esc(schedText(g))}<small>${t('按你手机上的时间', 'In your phone’s own time')}${g.first > Date.now() ? t(`，${esc(when(g.first))} 第一次`, `; first time ${esc(when(g.first))}`) : ''}</small></dd>
<dt>${t('读什么', 'What')}</dt><dd>${esc(g.planText)}${(g.later || []).map((l) => `<small>${t(`第 ${l.from} 次起：`, `From time ${l.from}: `)}${esc(l.text)}</small>`).join('')}</dd>
<dt>${t('在哪里', 'Where')}</dt><dd><span class="venue">${venue.icon || ''}${esc(venue.name || '')}</span>${member && g.venue.info ? `<small class="venue-info">${esc(g.venue.info)}</small>` : ''}</dd>
${g.done ? `<dt>${t('进度', 'Progress')}</dt><dd>${t(`已经 ${g.done}${g.total ? ` / ${g.total}` : ''} 次`, `${g.done}${g.total ? ` of ${g.total}` : ''} so far`)}</dd>` : ''}
</dl></section>`;
      // now / next
      if (nx && g.status === 'active') {
        h += `<a class="now-card${g.current ? ' live' : ''}" href="${member ? `${pre}/g/${g.id}/${nx.n}` : '#join'}"><span class="now-h">${g.current ? t(`正在进行 · 第 ${nx.n} 次`, `On now · time ${nx.n}`) : t(`下次 · 第 ${nx.n} 次`, `Next · time ${nx.n}`)}</span>
<span class="now-when">${esc(when(nx.start))}</span><span class="now-read">${esc(nx.reading.text)}</span>${member ? `<span class="now-go">${t('打开材料', 'Open the reading')} →</span>` : ''}</a>`;
      } else if (g.finished) {
        h += `<div class="notice">${t('这个计划已经读完了，感谢主。', 'This plan is finished. Thank the Lord.')}</div>`;
      }
      // joining
      if (!member) {
        h += '<section id="join" class="join-box">';
        if (r.canJoin && r.inviteOk) {
          h += `<p class="join-lead">${t(`${esc(g.owner)} 邀请你一起${esc(k.verb || '')}`, `${esc(g.owner)} invites you to ${esc(k.verb || '')} together`)}</p><p class="btn-row"><button class="btn btn-water" type="button" data-join>${t('接受邀请，立约', 'Accept and sign')}</button><button class="btn btn-line" type="button" data-decline>${t('婉拒', 'Decline')}</button></p>`;
        } else if (r.canJoin) {
          h += `<p class="btn-row"><button class="btn btn-water btn-block" type="button" data-join>${t('立约加入', 'Sign and join')}</button></p><p class="hint">${t('加入要先登录（不用密码），然后在约上签个名。', 'Sign in (no password) and sign the covenant to join.')}</p>`;
        } else if (g.status !== 'active') {
          h += `<p class="muted">${t('这个搭子已经结束了。', 'This group has ended.')}</p>`;
        } else if (g.members.length >= g.max) {
          h += `<p class="muted">${t('人已经满了。', 'The group is full.')}</p>`;
        } else {
          h += `<p class="muted">${t('这个搭子只接受邀请。想加入的话，可以请发起人发邀请链接给你。', 'This group is by invitation only. Ask the initiator for an invite link.')}</p>`;
        }
        if (r.me && r.me.status === 'declined') h += `<p class="hint">${t('你之前婉拒过这个邀请，现在也可以接受。', 'You declined before; you can still accept now.')}</p>`;
        h += '</section>';
        h += `<section class="more"><h2 class="sec-h">${t('搭子们', 'The buddies')}</h2>${membersHtml(g, false)}</section>`;
      } else {
        const tabs = [['progress', t('进度', 'Progress')], ['files', `${t('资料', 'Files')}${r.files && r.files.length ? ` ${r.files.length}` : ''}`], ['board', t('留言板', 'Board')], ['people', t('搭子们', 'Buddies')], ['cal', t('日历', 'Calendar')], ['set', t('设置', 'Settings')]];
        if (owner) tabs.splice(1, 0, ['stats', t('统计', 'Stats')]);
        h += `<div class="seg-tabs" role="tablist">${tabs.map(([key, label]) => `<button type="button" role="tab" data-tab="${key}" aria-selected="${tab === key}">${esc(label)}</button>`).join('')}</div><div data-tab-body></div>`;
      }
      root.innerHTML = h;
      bind(g);
      if (member) showTab(g);
    }
    function membersHtml(g, member) {
      return `<ul class="people">${g.members.map((m) => `<li><span class="seat static" style="--seat:${COLORS[m.c]}">${esc([...m.name][0] || '·')}</span><span class="pname"><b>${esc(m.name)}</b>${m.role === 'owner' ? `<em>${t('发起人', 'Initiator')}</em>` : ''}${m.me ? `<em>${t('我', 'Me')}</em>` : ''}${m.ids && m.ids.length ? `<small>${m.ids.map((x) => esc(Y.idName(x))).join(' · ')}</small>` : ''}</span>${member && m.sig ? `<img class="sig" src="${m.sig}" alt="${t('签名', 'Signature')}">` : ''}${member && data.me.role === 'owner' && m.role !== 'owner' ? `<button type="button" class="link-btn danger" data-remove="${esc(m.key)}" data-name="${esc(m.name)}">${t('移出', 'Remove')}</button>` : ''}</li>`).join('')}</ul>`;
    }
    function bind(g) {
      $$('[data-copy-invite]', root).forEach((b) => b.addEventListener('click', () => copy(data.invite, t('邀请链接已复制，发给朋友就可以了', 'Invite link copied. Send it to a friend.'))));
      const j = $('[data-join]', root);
      if (j) {
        j.addEventListener('click', async () => {
          try { await requireLogin(t('立约前先登录一下（不用密码）。', 'Sign in first (no password).')); } catch (x) { return; }
          try { await covenantSheet(g, invite); } catch (x) { return; }
          toast(t('立约好了，欢迎你！', 'You are in. Welcome!'));
          load();
        });
      }
      const d = $('[data-decline]', root);
      if (d) {
        d.addEventListener('click', async () => {
          if (!confirm(t('确定婉拒这个邀请吗？', 'Decline this invitation?'))) return;
          const r = await api(`/api/dazi/${g.id}/decline`, { body: { invite } });
          if (r.ok) { toast(t('已经告诉发起人了', 'The initiator has been told')); root.querySelector('#join').innerHTML = `<p class="muted">${t('你婉拒了这个邀请。改变主意的话，再打开这个链接就能接受。', 'You declined. Change your mind? Open this link again to accept.')}</p>`; } else toast(r.error);
        });
      }
      $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => {
        tab = b.getAttribute('data-tab');
        $$('[data-tab]', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        showTab(g);
      }));
    }
    async function showTab(g) {
      const body = $('[data-tab-body]', root);
      const r = data;
      if (tab === 'progress') {
        const done = new Map(r.myChecks.map((c) => [c.n, c]));
        const statusOf = (n) => { const c = done.get(n); return c && c.done ? (c.late ? 'late' : 'on') : null; };
        const items = r.recent || [];
        body.innerHTML = items.length ? `<ul class="prog">${items.map((x) => {
          const st = statusOf(x.n);
          return `<li><a href="${pre}/g/${g.id}/${x.n}"><span class="pn">${t(`第 ${x.n} 次`, `Time ${x.n}`)}<small>${esc(x.text)}</small></span><span class="ps ${st || 'miss'}">${st === 'on' ? `✓ ${t('打卡了', 'Done')}` : st === 'late' ? `✓ ${t('补卡', 'Made up')}` : t('还没打卡', 'Not yet')}</span></a></li>`;
        }).join('')}</ul><p class="hint">${t('当时没来得及的，点进去读完也可以补卡。', 'Missed one? Open it, read, and check in to make it up.')}</p>` : `<p class="muted">${t('第一次开始前两个小时，就可以在这里打开材料。', 'The reading opens here two hours before the first time.')}</p>`;
      } else if (tab === 'files') {
        const owner = !!r.progress;
        const files = r.files || [];
        const icon = (f) => (f.type === 'application/pdf' ? 'PDF' : '🖼');
        body.innerHTML = `${owner ? `<form class="file-up" data-up><label class="btn btn-water btn-sm"><input type="file" accept="application/pdf,image/*" multiple hidden data-file>${t('放资料（PDF 或图片）', 'Add a PDF or picture')}</label><span class="hint">${t('每个文件最多 20MB。组里的人都能打开、下载。', 'Up to 20 MB each. Everyone in the group can open and download them.')}</span><p class="hint" data-up-msg></p></form>` : ''}
${files.length ? `<ul class="files">${files.map((f) => `<li>${/^image\/(jpeg|png|webp|gif)$/.test(f.type) ? `<a class="file-thumb" href="/api/dazi/${g.id}/files/${f.id}" target="_blank" rel="noopener"><img src="/api/dazi/${g.id}/files/${f.id}" alt="" loading="lazy"></a>` : `<span class="file-ic">${icon(f)}</span>`}<span class="file-name"><a href="/api/dazi/${g.id}/files/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a><small>${esc(sizeText(f.size))} · ${esc(ago(f.created))}</small></span><a class="link-btn" href="/api/dazi/${g.id}/files/${f.id}?dl=1">${t('下载', 'Download')}</a>${owner ? `<button type="button" class="link-btn danger" data-del-file="${f.id}" data-name="${esc(f.name)}">${t('删除', 'Remove')}</button>` : ''}</li>`).join('')}</ul>` : `<p class="muted">${owner ? t('还没有资料。比如晨兴圣言的 PDF、讲义的照片，放在这里，组里每个人都收得到。', 'No files yet. Put the Morning Revival PDF or photos of handouts here and everyone in the group gets them.') : t('发起人还没有放资料。', 'The initiator has not added any files yet.')}</p>`}`;
        const up = $('[data-file]', body);
        if (up) {
          up.addEventListener('change', async () => {
            const msgEl = $('[data-up-msg]', body);
            for (const file of up.files) {
              if (file.size > 20000000) { toast(t(`${file.name} 太大了，最多 20MB`, `${file.name} is too big (20 MB at most)`)); continue; }
              msgEl.textContent = t(`正在上传 ${file.name}……`, `Uploading ${file.name}…`);
              const res = await fetch(`/api/dazi/${g.id}/files?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Lang': EN ? 'en' : 'zh' }, body: file }).then((x) => x.json()).catch(() => ({ ok: false, error: t('上传没有成功，再试一次', 'The upload failed. Try again.') }));
              if (!res.ok) toast(res.error);
            }
            msgEl.textContent = '';
            load();
          });
        }
        $$('[data-del-file]', body).forEach((b) => b.addEventListener('click', async () => {
          if (!confirm(t(`删除「${b.getAttribute('data-name')}」？`, `Remove "${b.getAttribute('data-name')}"?`))) return;
          const x = await api(`/api/dazi/${g.id}/files/${b.getAttribute('data-del-file')}/delete`, { body: {} });
          if (x.ok) load(); else toast(x.error);
        }));
      } else if (tab === 'stats') {
        body.innerHTML = `<p class="muted">${t('正在载入……', 'Loading…')}</p>`;
        const s = await api(`/api/dazi/${g.id}/stats`);
        if (!s.ok) { body.innerHTML = `<p class="form-error">${esc(s.error)}</p>`; return; }
        if (!s.sessions.length) { body.innerHTML = `<p class="muted">${t('还没开始，开始以后这里会有每个人的打卡情况。', 'Not started yet. Everyone’s check-ins will show here.')}</p>`; return; }
        body.innerHTML = `<div class="stats-wrap"><table class="stats"><thead><tr><th>${t('搭子', 'Buddy')}</th>${s.sessions.map((x) => `<th title="${esc(x.date)}">${x.n}</th>`).join('')}<th>${t('完成', 'Done')}</th></tr></thead>
<tbody>${s.rows.map((row) => `<tr><th><span class="seat static sm" style="--seat:${COLORS[row.c]}">${esc([...row.name][0] || '·')}</span>${esc(row.name)}</th>${row.cells.map((c) => `<td class="${c || 'miss'}">${c === 'on' ? '✓' : c === 'late' ? t('补', 'M') : '·'}</td>`).join('')}<td class="pct">${row.of ? Math.round((row.done / row.of) * 100) : 0}%</td></tr>`).join('')}</tbody></table></div>
<p class="hint">${t('✓ 按时打卡　补 后来补上　· 还没打卡', '✓ on time   M made up later   · not yet')}</p>
${r.declined && r.declined.length ? `<p class="hint">${t('婉拒了邀请：', 'Declined: ')}${r.declined.map((x) => esc(x.name || t('（没留名字）', '(no name)'))).join('、')}</p>` : ''}`;
      } else if (tab === 'board') {
        const draw = async () => {
          const b = await api(`/api/dazi/${g.id}/board`);
          if (!b.ok) { body.innerHTML = `<p class="form-error">${esc(b.error)}</p>`; return; }
          body.innerHTML = `<form class="talk-form" data-board><textarea name="body" rows="3" maxlength="1000" placeholder="${t('跟搭子们说点什么', 'Say something to your buddies')}"></textarea><div class="talk-row"><span></span><button class="btn btn-water btn-sm" type="submit">${t('发送', 'Send')}</button></div></form>
<div class="talk-list">${b.posts.length ? b.posts.map((p) => `<div class="msg"><p class="msg-h"><span class="seat static sm" style="--seat:${COLORS[p.c]}">${esc([...p.name][0] || '·')}</span><b>${esc(p.name)}</b><time>${esc(ago(p.created))}</time></p><p class="msg-b">${esc(p.body).replace(/\n/g, '<br>')}</p>${p.mine || b.canDelete ? `<p class="msg-a"><button type="button" class="link-btn danger" data-del="${p.id}">${t('删除', 'Remove')}</button></p>` : ''}</div>`).join('') : `<p class="muted">${t('还没有人说话。', 'Nothing here yet.')}</p>`}</div>`;
          const f = $('[data-board]', body);
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            const x = await api(`/api/dazi/${g.id}/board`, { body: { body: f.body.value } });
            if (x.ok) draw(); else toast(x.error);
          });
          $$('[data-del]', body).forEach((btn) => btn.addEventListener('click', async () => {
            if (!confirm(t('删除这条？', 'Remove this?'))) return;
            const x = await api(`/api/dazi/${g.id}/board/${btn.getAttribute('data-del')}/delete`, { body: {} });
            if (x.ok) draw(); else toast(x.error);
          }));
        };
        draw();
      } else if (tab === 'people') {
        body.innerHTML = `${membersHtml(g, true)}<p class="btn-row"><button type="button" class="btn btn-line btn-sm" data-copy-invite>${t('复制邀请链接', 'Copy invite link')}</button></p>`;
        $$('[data-copy-invite]', body).forEach((b) => b.addEventListener('click', () => copy(r.invite, t('邀请链接已复制，发给朋友就可以了', 'Invite link copied. Send it to a friend.'))));
        $$('[data-remove]', body).forEach((b) => b.addEventListener('click', async () => {
          if (!confirm(t(`把 ${b.getAttribute('data-name')} 移出搭子？`, `Remove ${b.getAttribute('data-name')} from the group?`))) return;
          const x = await api(`/api/dazi/${g.id}/manage`, { body: { action: 'remove', key: b.getAttribute('data-remove') } });
          if (x.ok) load(); else toast(x.error);
        }));
      } else if (tab === 'cal') {
        const cal = `${location.host}/api/cal/${r.me.cal}.ics${EN ? '?lang=en' : ''}`;
        const file = `/api/dazi/${g.id}/ics${EN ? '?lang=en' : ''}`;
        body.innerHTML = `<p>${t('把每次的时间加进手机日历：到时间手机会提醒你，点开提醒里的链接，就是这次要读的材料。', 'Put every time into your phone calendar: it reminds you, and the link in the reminder opens that time’s reading.')}</p>
<h3 class="sub-h3">${t('订阅（推荐，以后自动更新）', 'Subscribe (updates by itself)')}</h3>
<div class="cal-row"><a class="btn btn-line btn-sm" href="webcal://${esc(cal)}">${t('iPhone / Mac', 'iPhone / Mac')}</a><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${cal}`)}">${t('Google 日历', 'Google Calendar')}</a><a class="btn btn-line btn-sm" target="_blank" rel="noopener" href="https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(`https://${cal}`)}&name=${encodeURIComponent(t('有光搭子', 'Light buddies'))}">Outlook</a></div>
<h3 class="sub-h3">${t('下载日历文件（华为、小米等手机）', 'Download a calendar file (other phones)')}</h3>
<p class="cal-row"><a class="btn btn-line btn-sm" href="${file}" download="youguang-${g.id}.ics">${t('下载这个搭子的日历', 'Download this group’s calendar')}</a></p>
<p class="hint">${t('立约的时候，邮箱里也收到了一封日历邀请，点“加入日历”也可以。', 'You also got a calendar invitation by email when you joined; adding it from there works too.')}${/MicroMessenger/i.test(navigator.userAgent) ? t(' 在微信里打不开的话，点右上角“···”，选“在浏览器打开”。', ' In WeChat, tap “···” and open in the browser first.') : ''}</p>`;
      } else if (tab === 'set') {
        const owner = r.me.role === 'owner';
        body.innerHTML = `<label class="check"><input type="checkbox" data-notify${r.me.notify ? ' checked' : ''}><span>${t('每次开始时给我发邮件提醒', 'Email me when each time starts')}</span></label>
${r.progress ? (() => {
  const pg = r.progress;
  const opt2 = pg.afterFrom && pg.afterFrom > pg.from;
  return `<form class="form owner-form prog-form" data-progress novalidate><h3 class="sub-h3">${t('调整进度', 'Change the reading plan')}</h3>
<p class="hint">${t('比如这次只读了一半，下次接着读同一章；或者这一卷读完了，接着读哪一卷。改了以后，提醒和每次的材料都会跟着变，组里的人也会收到消息。', 'For example, you only got through half a chapter, so next time reads it again; or this book is done and you choose the next. Reminders and each time’s reading follow the change, and everyone gets a message.')}</p>
${pg.legs.length > 1 ? `<ul class="legs">${pg.legs.map((l) => `<li><b>${t(`第 ${l.from} 次起`, `From time ${l.from}`)}</b>${esc(l.text)}</li>`).join('')}</ul>` : ''}
<div class="radios"><label class="check"><input type="radio" name="when" value="${pg.from}" checked><span>${t(`从第 ${pg.from} 次（下一次）起，改成读：`, `From time ${pg.from} (the next one), read:`)}</span></label>
${opt2 ? `<label class="check"><input type="radio" name="when" value="${pg.afterFrom}" data-after><span>${t(`现在的读完以后（第 ${pg.afterFrom} 次起），接着读：`, `When the current plan is done (from time ${pg.afterFrom}), go on with:`)}</span></label>` : ''}</div>
<div data-plan-box>${planFieldsHtml(g.kind, pg.plan)}</div>
<p class="form-error" data-error hidden></p><button class="btn btn-water" type="submit">${t('保存进度', 'Save the plan')}</button></form>`;
})() : ''}
${owner ? `<form class="form owner-form" data-edit novalidate><h3 class="sub-h3">${t('发起人可以改', 'Initiator settings')}</h3>
<label class="field"><span>${t('名字', 'Name')}</span><input name="title" maxlength="40" value="${esc(g.title)}"></label>
<label class="field"><span>${t('介绍', 'A few words')}</span><textarea name="intro" rows="2" maxlength="300">${esc(g.intro)}</textarea></label>
<div class="field"><span>${t('在哪里见面', 'Where you meet')}</span><div class="venue-pick">${Object.entries(CFG.venues).map(([key, v]) => `<label class="venue-opt"><input type="radio" name="venue" value="${key}"${g.venue.type === key ? ' checked' : ''}><span>${v.icon}${esc(v.name)}</span></label>`).join('')}</div></div>
<label class="field"><span>${t('号码、会议链接或微信号', 'Number, link or WeChat ID')}</span><input name="venueInfo" maxlength="300" value="${esc(g.venue.info || '')}"></label>
<div class="radios"><label class="check"><input type="radio" name="visibility" value="public"${g.visibility === 'public' ? ' checked' : ''}><span>${t('公开，放在广场上', 'Public, on the plaza')}</span></label><label class="check"><input type="radio" name="visibility" value="hidden"${g.visibility === 'hidden' ? ' checked' : ''}><span>${t('隐藏，只用邀请链接', 'Hidden, invite link only')}</span></label></div>
<div class="radios sub"><label class="check"><input type="radio" name="join" value="open"${g.join === 'open' ? ' checked' : ''}><span>${t('会员可以直接加入', 'Members can join directly')}</span></label><label class="check"><input type="radio" name="join" value="invite"${g.join === 'invite' ? ' checked' : ''}><span>${t('只能用邀请链接', 'Invite link only')}</span></label></div>
<label class="field"><span>${t('最多几个人', 'Up to')}</span><select name="max">${[2, 3, 4, 5, 6, 8, 10, 12].map((n) => `<option value="${n}"${n === g.max ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
<p class="form-error" data-error hidden></p><button class="btn btn-water" type="submit">${t('保存', 'Save')}</button></form>
<p class="danger-row">${g.status === 'active' ? `<button type="button" class="link-btn danger" data-close>${t('结束这个搭子', 'End this group')}</button>` : `<button type="button" class="link-btn" data-reopen>${t('重新开始', 'Start again')}</button>`}</p>`
    : `<p class="danger-row"><button type="button" class="link-btn danger" data-leave>${t('退出这个搭子', 'Leave this group')}</button></p>`}`;
        $('[data-notify]', body).addEventListener('change', async (e) => {
          const x = await api(`/api/dazi/${g.id}/notify`, { body: { on: e.target.checked } });
          toast(x.ok ? (e.target.checked ? t('提醒打开了', 'Reminders on') : t('提醒关掉了', 'Reminders off')) : x.error);
        });
        const pf = $('[data-progress]', body);
        if (pf) {
          const box = $('[data-plan-box]', pf);
          wirePlanFields(box);
          // the "after" choice starts from a guess at what comes next (the next book …)
          $$('input[name="when"]', pf).forEach((x) => x.addEventListener('change', () => {
            box.innerHTML = planFieldsHtml(g.kind, x.hasAttribute('data-after') ? r.progress.afterPlan : r.progress.plan);
            wirePlanFields(box);
          }));
          pf.addEventListener('submit', async (e) => {
            e.preventDefault();
            const er = $('[data-error]', pf);
            er.hidden = true;
            const from = Number($('input[name="when"]:checked', pf).value);
            const x = await api(`/api/dazi/${g.id}/manage`, { body: { action: 'progress', from, plan: readPlan(box) } });
            if (x.ok) { toast(t('进度改好了', 'The plan is updated')); load(); } else { er.textContent = x.error; er.hidden = false; }
          });
        }
        const f = $('[data-edit]', body);
        if (f) {
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            const x = await api(`/api/dazi/${g.id}/manage`, { body: { action: 'update', title: f.title.value, intro: f.intro.value, venue: { type: $('input[name="venue"]:checked', f).value, info: f.venueInfo.value }, visibility: $('input[name="visibility"]:checked', f).value, join: $('input[name="join"]:checked', f).value, max: Number(f.max.value) } });
            if (x.ok) { toast(t('保存好了', 'Saved')); load(); } else { const er = $('[data-error]', f); er.textContent = x.error; er.hidden = false; }
          });
        }
        const act = async (sel, body2, confirmText) => {
          const b = $(sel, body);
          if (!b) return;
          b.addEventListener('click', async () => {
            if (confirmText && !confirm(confirmText)) return;
            const x = await api(body2.path, { body: body2.body });
            if (x.ok) load(); else toast(x.error);
          });
        };
        act('[data-close]', { path: `/api/dazi/${g.id}/manage`, body: { action: 'close' } }, t('结束以后不再发提醒，也不能再加入。确定吗？', 'No more reminders and nobody can join. End the group?'));
        act('[data-reopen]', { path: `/api/dazi/${g.id}/manage`, body: { action: 'reopen' } });
        act('[data-leave]', { path: `/api/dazi/${g.id}/leave`, body: {} }, t('确定退出这个搭子吗？', 'Leave this group?'));
      }
    }
    load();
    document.addEventListener('yg:login', load);
  }

  // ---------- one session: the reading, bookmarks, notes and 打卡 ----------
  function sessionPage(gid, n) {
    const root = $('[data-group]');
    let s = null;
    const load = async () => {
      s = await api(`/api/dazi/${gid}/s/${n}`);
      if (s.status === 401) {
        root.innerHTML = `<div class="empty"><p>${t('登录以后才能打开这次的材料。', 'Sign in to open this time’s reading.')}</p><p><button class="btn btn-water" type="button" data-login>${t('登录', 'Sign in')}</button></p></div>`;
        $('[data-login]', root).addEventListener('click', () => requireLogin().then(load, () => {}));
        return;
      }
      if (!s.ok) { root.innerHTML = `<div class="empty"><p>${esc(s.error)}</p><p><a class="btn btn-water" href="${pre}/g/${gid}">${t('回到搭子', 'Back to the group')}</a></p></div>`; return; }
      render();
    };
    function render() {
      const g = s.group;
      const ss = s.session;
      const r = ss.reading;
      const k = CFG.kinds[g.kind] || {};
      const venue = CFG.venues[g.venue.type] || {};
      const mine = s.mine || { done: null, note: '', marks: [] };
      document.title = `${r.full || r.text}｜${g.title}`;
      root.innerHTML = `<a class="back" href="${pre}/g/${g.id}">← ${esc(g.title)}</a>
<div class="sess-head" style="--tint:${tintOf(g.kind)}"><p class="sess-kind"><span class="ki">${k.icon || ''}</span>${esc(k.name || '')} · ${t(`第 ${ss.n} 次`, `Time ${ss.n}`)}${g.total ? ` / ${g.total}` : ''}</p>
<h1 class="sess-title">${esc(r.full || r.text)}</h1>
<p class="sess-when">${esc(when(ss.start))}</p>
<p class="sess-venue"><span class="venue">${venue.icon || ''}${esc(venue.name || '')}</span>${g.venue.info ? ` · ${esc(g.venue.info)}` : ''}</p></div>
<section class="reading-card" data-reading><p class="muted">${t('正在载入……', 'Loading…')}</p></section>
${s.files ? `<p class="files-line"><a class="btn btn-line btn-sm" href="${pre}/g/${g.id}?tab=files">📎 ${t(`组里的资料（${s.files}）`, `Group files (${s.files})`)}</a></p>` : ''}
<section class="my-note"><h2 class="sub-h3">${t('心得', 'My notes')}</h2>
<textarea data-note rows="4" maxlength="3000" placeholder="${t('读的时候有什么感觉、有什么问题，写在这里。搭子们看得到。', 'What touched you, what you wonder about. Your buddies can read it.')}">${esc(mine.note || '')}</textarea>
<p class="hint" data-saved></p></section>
<div class="checkin-bar">${!s.open ? `<p class="muted">${t('还没到时间，开始前两个小时可以打卡。', 'Not yet. Check-in opens two hours before it starts.')}</p>` : mine.done ? `<p class="done-line">✓ ${mine.late ? t('补卡了', 'Made up') : t('打卡了', 'Checked in')} · ${esc(ago(mine.done))}</p><button type="button" class="link-btn" data-undo>${t('撤销', 'Undo')}</button>` : `<button type="button" class="btn btn-water btn-block" data-done>${t(`${k.verb || '读'}完了，打卡`, 'Done, check in')}</button>`}</div>
<section class="more"><h2 class="sub-h3">${t('搭子们这一次', 'Buddies this time')}</h2><ul class="people">${s.others.map((o) => `<li><span class="seat static" style="--seat:${COLORS[o.c]}">${esc([...o.name][0] || '·')}</span><span class="pname"><b>${esc(o.name)}</b>${o.me ? `<em>${t('我', 'Me')}</em>` : ''}<small class="${o.done ? (o.late ? 'late' : 'on') : 'miss'}">${o.done ? (o.late ? t('补卡了', 'made up') : t('打卡了', 'checked in')) : t('还没打卡', 'not yet')}</small>${o.note && !o.me ? `<span class="their-note">${esc(o.note).replace(/\n/g, '<br>')}</span>` : ''}</span></li>`).join('')}</ul></section>
<p class="sess-nav">${s.hasPrev ? `<a href="${pre}/g/${g.id}/${ss.n - 1}">← ${t('上一次', 'Previous')}</a>` : '<span></span>'}${s.hasNext ? `<a href="${pre}/g/${g.id}/${ss.n + 1}">${t('下一次', 'Next')} →</a>` : ''}</p>`;
      reading(g, ss, mine.marks || []);
      const note = $('[data-note]', root);
      let timer;
      const save = async () => {
        const x = await api(`/api/dazi/${g.id}/s/${ss.n}`, { body: { note: note.value } });
        $('[data-saved]', root).textContent = x.ok ? t('已保存', 'Saved') : x.error;
      };
      note.addEventListener('input', () => { clearTimeout(timer); $('[data-saved]', root).textContent = ''; timer = setTimeout(save, 900); });
      note.addEventListener('blur', () => { clearTimeout(timer); save(); });
      const done = $('[data-done]', root);
      if (done) {
        done.addEventListener('click', async () => {
          clearTimeout(timer);
          const x = await api(`/api/dazi/${g.id}/s/${ss.n}`, { body: { done: true, note: note.value } });
          if (!x.ok) { toast(x.error); return; }
          toast(x.late ? t('补卡成功', 'Made up') : t('打卡成功，愿主祝福你', 'Checked in. Bless you.'));
          load();
        });
      }
      const undo = $('[data-undo]', root);
      if (undo) undo.addEventListener('click', async () => { const x = await api(`/api/dazi/${g.id}/s/${ss.n}`, { body: { done: false } }); if (x.ok) load(); else toast(x.error); });
    }
    // the reading itself: links for what is read elsewhere, the site's own text for 呼吸 and lessons
    async function reading(g, ss, marks) {
      const box = $('[data-reading]', root);
      const r = ss.reading;
      const L = g.lang === 'en' ? 'en' : 'zh';
      const saveMarks = (m) => api(`/api/dazi/${g.id}/s/${ss.n}`, { body: { marks: m } });
      // kinds read elsewhere (the Bible, Life-study, Morning Revival …): links, and a bookmark box
      if (!r.huxi && !r.lesson) {
        const links = (r.links || []).map((c) => (c.url ? `<a class="btn btn-water read-link" href="${esc(c.url)}" target="_blank" rel="noopener">${t('打开', 'Open')} ${esc(c.label)}</a>` : `<span class="read-nolink">${esc(c.label)}</span>`)).join('');
        const missing = !(r.links || []).length || r.links.some((c) => !c.url);
        box.innerHTML = `<p class="read-what">${r.kind === 'bible' ? t('这次读（恢复本）', 'This time (Recovery Version)') : t('这次读', 'This time')}</p>
<div class="read-links">${links || `<span class="read-nolink">${esc(r.text)}</span>`}</div>
${missing ? `<p class="hint">${t('这一次没有网上的链接，翻开你手边的书读这一段就好。', 'There is no online link for this one; read it in your own copy.')}</p>` : ''}
<label class="field bm"><span>🔖 ${t('书签：读到哪里了', 'Bookmark: where you stopped')}</span><input data-bm maxlength="40" value="${esc(marks[0] || '')}" placeholder="${r.kind === 'bible' ? t('例如：第 16 节', 'e.g. verse 16') : t('例如：第 3 段', 'e.g. section 3')}"></label>`;
        const bm = $('[data-bm]', box);
        bm.addEventListener('change', () => saveMarks(bm.value.trim() ? [bm.value.trim()] : []));
        return;
      }
      let doc = null;
      try {
        if (r.huxi) {
          const idx = await fetch('/data/huxi.json').then((x) => x.json());
          const day = idx.find((x) => x.date <= r.huxi) || idx[idx.length - 1];
          if (day) doc = await fetch(`/data/huxi/${day.date}.json`).then((x) => x.json());
        } else {
          doc = await fetch(`/data/feed/${r.lesson}.json`).then((x) => (x.ok ? x.json() : null));
        }
      } catch (e) { doc = null; }
      if (!doc) { box.innerHTML = `<p class="muted">${t('这次的材料还没上架。', 'This time’s reading is not on the site yet.')}</p>`; return; }
      const c = doc[L];
      box.innerHTML = `<h2 class="read-title">${esc(c.title)}</h2>${doc.sample ? `<p class="note-box small-tag">${t('示例内容', 'Sample content')}</p>` : ''}<div class="prose marks" lang="${L === 'en' ? 'en' : 'zh-CN'}">${c.html}</div><p class="hint">🔖 ${t('点一下段落就是书签，再点一下取消。', 'Tap a paragraph to bookmark it; tap again to remove.')}</p>`;
      const blocks = $$('.prose > p, .prose li, .prose blockquote', box);
      const set = new Set(marks);
      blocks.forEach((b, i) => {
        const key = `b${i}`;
        if (set.has(key)) b.classList.add('marked');
        b.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          if (set.has(key)) set.delete(key); else set.add(key);
          b.classList.toggle('marked');
          saveMarks([...set]);
        });
      });
    }
    load();
    document.addEventListener('yg:login', load);
  }

  const kindOf = page.getAttribute('data-page');
  if (kindOf === 'plaza') plaza();
  else if (kindOf === 'new') newGroup();
  else if (kindOf === 'group') {
    const m = location.pathname.match(/\/g\/([a-z0-9]{8})(?:\/(\d+))?/);
    if (!m) $('[data-group]').innerHTML = `<p class="form-error">${t('链接不完整', 'The link is incomplete')}</p>`;
    else if (m[2]) sessionPage(m[1], Number(m[2]));
    else groupPage(m[1]);
  }
})();
