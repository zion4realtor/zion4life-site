// All stored state, in one SQLite-backed Durable Object (binding STORE, instance "main").
//   user        accounts: email (never shown to anyone), nickname, identity tags, calendar key,
//               the phone's time zone (for the times in emails)
//   session     sign-in sessions (hashed tokens from the yg_s cookie)
//   code        6-digit sign-in codes waiting to be typed in (hashed)
//   mgr         who manages which tag (标签管理员)
//   claim       "this tag is me" requests waiting for Zion
//   post        articles and videos written by tag managers
//   talk        留言 on tags, articles, videos and posts (public, or only for the tag's managers)
//   dz          搭子 groups: the covenant (kind, language, schedule, plan, venue) and settings
//   dz_member   who joined, with the drawn signature (立约)
//   dz_check    打卡 per member per session, with bookmarks and notes
//   dz_board    the group's message board
//   dz_decline  invitations turned down without an account
//   dz_sent     which session reminders went out, so each is sent once
//   rate        per-visitor daily counters (hashed, never the raw IP)
//   ask         questions from the 有问题想问 box
// The Durable Object takes { op, args } as JSON. Every op is a plain function of a `sql`
// handle so the tests run the same code against node:sqlite.

const SCHEMA = [
  // the first version's group tables held only test data
  'DROP TABLE IF EXISTS grp', 'DROP TABLE IF EXISTS member', 'DROP TABLE IF EXISTS device', 'DROP TABLE IF EXISTS checkin',
  'DROP TABLE IF EXISTS audio', 'DROP TABLE IF EXISTS reminded',
  `CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, ids TEXT NOT NULL DEFAULT '[]',
    ids_public INTEGER NOT NULL DEFAULT 0, lang TEXT NOT NULL DEFAULT 'zh', cal TEXT NOT NULL, created INTEGER NOT NULL, seen INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS session (token TEXT PRIMARY KEY, uid TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS session_uid ON session (uid)',
  'CREATE TABLE IF NOT EXISTS code (email TEXT PRIMARY KEY, hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL, sent INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS mgr (tag TEXT NOT NULL, uid TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (tag, uid))',
  `CREATE TABLE IF NOT EXISTS claim (id TEXT PRIMARY KEY, tag TEXT NOT NULL, uid TEXT NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL,
    created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS post (id TEXT PRIMARY KEY, uid TEXT NOT NULL, tags TEXT NOT NULL, kind TEXT NOT NULL, lang TEXT NOT NULL,
    title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL, video TEXT, status TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS talk (id TEXT PRIMARY KEY, target TEXT NOT NULL, uid TEXT NOT NULL, body TEXT NOT NULL, pub INTEGER NOT NULL,
    reply_to TEXT, status TEXT NOT NULL, created INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS talk_target ON talk (target, created)',
  `CREATE TABLE IF NOT EXISTS dz (id TEXT PRIMARY KEY, kind TEXT NOT NULL, lang TEXT NOT NULL, title TEXT NOT NULL, intro TEXT NOT NULL,
    tz TEXT NOT NULL, days TEXT NOT NULL, time TEXT NOT NULL, minutes INTEGER NOT NULL, start_date TEXT NOT NULL, plan TEXT NOT NULL,
    venue TEXT NOT NULL, visibility TEXT NOT NULL, join_mode TEXT NOT NULL, invite TEXT NOT NULL, max_members INTEGER NOT NULL,
    status TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS dz_member (gid TEXT NOT NULL, uid TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, sig TEXT,
    signed INTEGER, notify INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL, PRIMARY KEY (gid, uid))`,
  'CREATE INDEX IF NOT EXISTS dz_member_uid ON dz_member (uid)',
  `CREATE TABLE IF NOT EXISTS dz_check (gid TEXT NOT NULL, uid TEXT NOT NULL, n INTEGER NOT NULL, done INTEGER, late INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '', marks TEXT NOT NULL DEFAULT '[]', updated INTEGER NOT NULL, PRIMARY KEY (gid, uid, n))`,
  'CREATE TABLE IF NOT EXISTS dz_board (id TEXT PRIMARY KEY, gid TEXT NOT NULL, uid TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS dz_board_gid ON dz_board (gid, created)',
  'CREATE TABLE IF NOT EXISTS dz_decline (gid TEXT NOT NULL, name TEXT NOT NULL, created INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS dz_sent (gid TEXT NOT NULL, n INTEGER NOT NULL, sent INTEGER NOT NULL, PRIMARY KEY (gid, n))',
  'CREATE TABLE IF NOT EXISTS rate (day TEXT NOT NULL, who TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, who, kind))',
  `CREATE TABLE IF NOT EXISTS ask (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, name TEXT NOT NULL, reply TEXT NOT NULL,
    lang TEXT NOT NULL, page TEXT NOT NULL, mailed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
];

// Columns added after the tables first went live.
const ADDED = [['user', 'tz', "TEXT NOT NULL DEFAULT ''"]];

export function migrate(sql) {
  for (const q of SCHEMA) sql.exec(q);
  for (const [table, col, type] of ADDED) {
    if (!sql.exec(`PRAGMA table_info(${table})`).toArray().some((r) => r.name === col)) sql.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  }
}

const rows = (sql, q, ...b) => sql.exec(q, ...b).toArray();
const first = (sql, q, ...b) => rows(sql, q, ...b)[0] || null;
const parse = (s, d) => {
  try { return JSON.parse(s); } catch { return d; }
};

// Account row → what the server code uses (email included; never send it to a page as is).
const userOf = (r) => r && { id: r.id, email: r.email, name: r.name, ids: parse(r.ids, []), idsPublic: !!r.ids_public, lang: r.lang, cal: r.cal, tz: r.tz || '', created: r.created };
// What other people may see of an account.
export const publicUser = (u) => u && { id: u.id, name: u.name, ids: u.idsPublic ? u.ids : [] };

export function groupOf(r) {
  if (!r) return null;
  return {
    id: r.id, kind: r.kind, lang: r.lang, title: r.title, intro: r.intro, tz: r.tz, days: parse(r.days, []), time: r.time,
    minutes: r.minutes, startDate: r.start_date, plan: parse(r.plan, {}), venue: parse(r.venue, {}), visibility: r.visibility,
    join: r.join_mode, invite: r.invite, max: r.max_members, status: r.status, owner: r.owner, created: r.created,
  };
}
function membersOf(sql, gid, withSig = false) {
  return rows(sql, `SELECT m.uid, m.role, m.status, m.signed, m.notify, m.created${withSig ? ', m.sig' : ''}, u.name, u.ids, u.ids_public
    FROM dz_member m JOIN user u ON u.id = m.uid WHERE m.gid = ? AND m.status = 'active' ORDER BY m.role = 'owner' DESC, m.created`, gid)
    .map((r) => ({ uid: r.uid, role: r.role, name: r.name, ids: r.ids_public ? parse(r.ids, []) : [], signed: r.signed, notify: !!r.notify, joined: r.created, ...(withSig ? { sig: r.sig } : {}) }));
}

export const OPS = {
  // ---------- sign-in ----------
  // Store a new code unless one was sent in the last 45 seconds.
  codePut(sql, { email, hash, expires, now = Date.now(), cool = 45000 }) {
    const old = first(sql, 'SELECT sent FROM code WHERE email = ?', email);
    if (old && now - old.sent < cool) return { ok: false, wait: Math.ceil((cool - (now - old.sent)) / 1000) };
    sql.exec('INSERT OR REPLACE INTO code (email, hash, expires, tries, sent) VALUES (?, ?, ?, 0, ?)', email, hash, expires, now);
    return { ok: true };
  },
  codeCheck(sql, { email, hash, now = Date.now() }) {
    const c = first(sql, 'SELECT * FROM code WHERE email = ?', email);
    if (!c || c.expires < now) return { ok: false, reason: 'expired' };
    if (c.tries >= 5) return { ok: false, reason: 'tries' };
    if (c.hash !== hash) {
      sql.exec('UPDATE code SET tries = tries + 1 WHERE email = ?', email);
      return { ok: false, reason: c.tries + 1 >= 5 ? 'tries' : 'wrong' };
    }
    sql.exec('DELETE FROM code WHERE email = ?', email);
    return { ok: true };
  },
  userByEmail(sql, { email }) {
    return userOf(first(sql, 'SELECT * FROM user WHERE email = ?', email));
  },
  userById(sql, { id }) {
    return userOf(first(sql, 'SELECT * FROM user WHERE id = ?', id));
  },
  userByCal(sql, { cal }) {
    return userOf(first(sql, 'SELECT * FROM user WHERE cal = ?', cal));
  },
  userCreate(sql, { id, email, name, ids, idsPublic, lang, cal, tz = '', now = Date.now() }) {
    sql.exec('INSERT INTO user (id, email, name, ids, ids_public, lang, cal, tz, created, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, email, name, JSON.stringify(ids || []), idsPublic ? 1 : 0, lang, cal, tz, now, now);
    return userOf(first(sql, 'SELECT * FROM user WHERE id = ?', id));
  },
  userUpdate(sql, { id, name, ids, idsPublic, lang, tz }) {
    if (tz != null) sql.exec('UPDATE user SET tz = ? WHERE id = ?', tz, id);
    if (name != null) sql.exec('UPDATE user SET name = ? WHERE id = ?', name, id);
    if (ids != null) sql.exec('UPDATE user SET ids = ? WHERE id = ?', JSON.stringify(ids), id);
    if (idsPublic != null) sql.exec('UPDATE user SET ids_public = ? WHERE id = ?', idsPublic ? 1 : 0, id);
    if (lang != null) sql.exec('UPDATE user SET lang = ? WHERE id = ?', lang, id);
    return userOf(first(sql, 'SELECT * FROM user WHERE id = ?', id));
  },
  users(sql, { limit = 300 }) {
    return rows(sql, 'SELECT * FROM user ORDER BY created DESC LIMIT ?', limit).map(userOf);
  },
  userCount(sql) {
    return { n: first(sql, 'SELECT COUNT(*) AS n FROM user').n };
  },
  sessionPut(sql, { token, uid, expires, now = Date.now() }) {
    sql.exec('INSERT INTO session (token, uid, created, expires) VALUES (?, ?, ?, ?)', token, uid, now, expires);
    return { ok: true };
  },
  sessionUser(sql, { token, now = Date.now() }) {
    const s = first(sql, 'SELECT * FROM session WHERE token = ?', token);
    if (!s || s.expires < now) return null;
    const u = first(sql, 'SELECT * FROM user WHERE id = ?', s.uid);
    if (u && now - u.seen > 3600000) sql.exec('UPDATE user SET seen = ? WHERE id = ?', now, u.id);
    return userOf(u);
  },
  sessionDel(sql, { token }) {
    sql.exec('DELETE FROM session WHERE token = ?', token);
    return { ok: true };
  },

  // ---------- tag managers, claims, posts ----------
  mgrTags(sql, { uid }) {
    return rows(sql, 'SELECT tag FROM mgr WHERE uid = ?', uid).map((r) => r.tag);
  },
  mgrList(sql, { tag } = {}) {
    const q = `SELECT m.tag, m.uid, m.created, u.name, u.email FROM mgr m JOIN user u ON u.id = m.uid ${tag ? 'WHERE m.tag = ?' : ''} ORDER BY m.tag, m.created`;
    return tag ? rows(sql, q, tag) : rows(sql, q);
  },
  mgrAdd(sql, { tag, uid, now = Date.now() }) {
    sql.exec('INSERT OR IGNORE INTO mgr (tag, uid, created) VALUES (?, ?, ?)', tag, uid, now);
    return { ok: true };
  },
  mgrDel(sql, { tag, uid }) {
    sql.exec('DELETE FROM mgr WHERE tag = ? AND uid = ?', tag, uid);
    return { ok: true };
  },
  claimAdd(sql, { id, tag, uid, note, now = Date.now() }) {
    if (first(sql, "SELECT 1 AS x FROM claim WHERE tag = ? AND uid = ? AND status = 'pending'", tag, uid)) return { ok: false, reason: 'pending' };
    if (first(sql, 'SELECT 1 AS x FROM mgr WHERE tag = ? AND uid = ?', tag, uid)) return { ok: false, reason: 'already' };
    sql.exec("INSERT INTO claim (id, tag, uid, note, status, created) VALUES (?, ?, ?, ?, 'pending', ?)", id, tag, uid, note, now);
    return { ok: true };
  },
  claimMine(sql, { uid }) {
    return rows(sql, 'SELECT tag, status FROM claim WHERE uid = ? ORDER BY created DESC', uid);
  },
  claims(sql, { status = 'pending' } = {}) {
    return rows(sql, 'SELECT c.*, u.name, u.email, u.ids FROM claim c JOIN user u ON u.id = c.uid WHERE c.status = ? ORDER BY c.created', status)
      .map((r) => ({ ...r, ids: parse(r.ids, []) }));
  },
  claimSet(sql, { id, status, now = Date.now() }) {
    const c = first(sql, 'SELECT * FROM claim WHERE id = ?', id);
    if (!c || c.status !== 'pending') return { ok: false };
    sql.exec('UPDATE claim SET status = ? WHERE id = ?', status, id);
    if (status === 'approved') sql.exec('INSERT OR IGNORE INTO mgr (tag, uid, created) VALUES (?, ?, ?)', c.tag, c.uid, now);
    return { ok: true, claim: c };
  },
  postPut(sql, { id, uid, tags, kind, lang, title, summary, body, video, now = Date.now() }) {
    const old = first(sql, 'SELECT created, uid FROM post WHERE id = ?', id);
    sql.exec(`INSERT OR REPLACE INTO post (id, uid, tags, kind, lang, title, summary, body, video, status, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)`, id, old ? old.uid : uid, JSON.stringify(tags), kind, lang, title, summary, body,
    video ? JSON.stringify(video) : null, old ? old.created : now, now);
    return { ok: true };
  },
  postGet(sql, { id }) {
    const r = first(sql, 'SELECT p.*, u.name AS author FROM post p JOIN user u ON u.id = p.uid WHERE p.id = ?', id);
    return r && { ...r, tags: parse(r.tags, []), video: r.video ? parse(r.video, null) : null };
  },
  postsByTag(sql, { tag, limit = 60 }) {
    return rows(sql, `SELECT p.id, p.uid, p.tags, p.kind, p.lang, p.title, p.summary, p.video, p.created, u.name AS author
      FROM post p JOIN user u ON u.id = p.uid, json_each(p.tags) t WHERE t.value = ? AND p.status = 'live' ORDER BY p.created DESC LIMIT ?`, tag, limit)
      .map((r) => ({ ...r, tags: parse(r.tags, []), video: r.video ? parse(r.video, null) : null }));
  },
  postsAll(sql, { limit = 200 } = {}) {
    return rows(sql, 'SELECT p.id, p.tags, p.kind, p.lang, p.title, p.status, p.created, u.name AS author FROM post p JOIN user u ON u.id = p.uid ORDER BY p.created DESC LIMIT ?', limit)
      .map((r) => ({ ...r, tags: parse(r.tags, []) }));
  },
  postStatus(sql, { id, status }) {
    sql.exec('UPDATE post SET status = ? WHERE id = ?', status, id);
    return { ok: true };
  },

  // ---------- 留言 ----------
  talkAdd(sql, { id, target, uid, body, pub, replyTo, now = Date.now() }) {
    sql.exec("INSERT INTO talk (id, target, uid, body, pub, reply_to, status, created) VALUES (?, ?, ?, ?, ?, ?, 'live', ?)",
      id, target, uid, body, pub ? 1 : 0, replyTo || null, now);
    return { ok: true };
  },
  talkList(sql, { target, limit = 300 }) {
    return rows(sql, `SELECT t.id, t.uid, t.body, t.pub, t.reply_to, t.created, u.name FROM talk t JOIN user u ON u.id = t.uid
      WHERE t.target = ? AND t.status = 'live' ORDER BY t.created LIMIT ?`, target, limit);
  },
  talkGet(sql, { id }) {
    return first(sql, 'SELECT * FROM talk WHERE id = ?', id);
  },
  talkStatus(sql, { id, status }) {
    sql.exec('UPDATE talk SET status = ? WHERE id = ? OR reply_to = ?', status, id, id);
    return { ok: true };
  },
  talkRecent(sql, { limit = 100 } = {}) {
    return rows(sql, `SELECT t.id, t.target, t.body, t.pub, t.reply_to, t.created, u.name FROM talk t JOIN user u ON u.id = t.uid
      WHERE t.status = 'live' ORDER BY t.created DESC LIMIT ?`, limit);
  },

  // ---------- 搭子 ----------
  dzCreate(sql, { g, sig, now = Date.now() }) {
    sql.exec(`INSERT INTO dz (id, kind, lang, title, intro, tz, days, time, minutes, start_date, plan, venue, visibility, join_mode, invite,
      max_members, status, owner, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    g.id, g.kind, g.lang, g.title, g.intro, g.tz, JSON.stringify(g.days), g.time, g.minutes, g.startDate, JSON.stringify(g.plan),
    JSON.stringify(g.venue), g.visibility, g.join, g.invite, g.max, g.owner, now);
    sql.exec("INSERT INTO dz_member (gid, uid, role, status, sig, signed, created) VALUES (?, ?, 'owner', 'active', ?, ?, ?)", g.id, g.owner, sig, now, now);
    return { ok: true };
  },
  dzGet(sql, { id, withSig = false }) {
    const g = groupOf(first(sql, 'SELECT * FROM dz WHERE id = ?', id));
    if (!g) return null;
    return { ...g, members: membersOf(sql, id, withSig), declined: first(sql, 'SELECT COUNT(*) AS n FROM dz_decline WHERE gid = ?', id).n };
  },
  // Public, active groups for the plaza, newest first.
  dzPlaza(sql, { kind, limit = 120 } = {}) {
    const q = `SELECT * FROM dz WHERE visibility = 'public' AND status = 'active' ${kind ? 'AND kind = ?' : ''} ORDER BY created DESC LIMIT ?`;
    return (kind ? rows(sql, q, kind, limit) : rows(sql, q, limit)).map((r) => ({ ...groupOf(r), members: membersOf(sql, r.id) }));
  },
  // Groups a person belongs to (any status of the group except removed by Zion).
  dzMine(sql, { uid }) {
    return rows(sql, `SELECT d.*, m.role AS my_role FROM dz d JOIN dz_member m ON m.gid = d.id
      WHERE m.uid = ? AND m.status = 'active' AND d.status != 'removed' ORDER BY d.created DESC`, uid)
      .map((r) => ({ ...groupOf(r), myRole: r.my_role, members: membersOf(sql, r.id) }));
  },
  dzAll(sql, { limit = 500 } = {}) {
    return rows(sql, 'SELECT * FROM dz ORDER BY created DESC LIMIT ?', limit).map((r) => ({ ...groupOf(r), members: membersOf(sql, r.id) }));
  },
  dzActive(sql) {
    return rows(sql, "SELECT * FROM dz WHERE status = 'active'").map(groupOf);
  },
  dzUpdate(sql, { id, title, intro, venue, plan, max, visibility, join, status }) {
    const set = (col, v) => sql.exec(`UPDATE dz SET ${col} = ? WHERE id = ?`, v, id);
    if (title != null) set('title', title);
    if (intro != null) set('intro', intro);
    if (venue != null) set('venue', JSON.stringify(venue));
    if (plan != null) set('plan', JSON.stringify(plan));
    if (max != null) set('max_members', max);
    if (visibility != null) set('visibility', visibility);
    if (join != null) set('join_mode', join);
    if (status != null) set('status', status);
    return { ok: true };
  },
  dzMember(sql, { gid, uid }) {
    return first(sql, 'SELECT gid, uid, role, status, signed, notify, created FROM dz_member WHERE gid = ? AND uid = ?', gid, uid);
  },
  // Join with a signature. Refuses a full group; someone who left or declined may come back.
  dzJoin(sql, { gid, uid, sig, now = Date.now() }) {
    const g = first(sql, 'SELECT max_members FROM dz WHERE id = ?', gid);
    const old = first(sql, 'SELECT status FROM dz_member WHERE gid = ? AND uid = ?', gid, uid);
    if (old?.status === 'active') return { ok: false, reason: 'exists' };
    if (old?.status === 'removed') return { ok: false, reason: 'removed' };
    const n = first(sql, "SELECT COUNT(*) AS n FROM dz_member WHERE gid = ? AND status = 'active'", gid).n;
    if (n >= g.max_members) return { ok: false, reason: 'full' };
    sql.exec(`INSERT INTO dz_member (gid, uid, role, status, sig, signed, created) VALUES (?, ?, 'member', 'active', ?, ?, ?)
      ON CONFLICT (gid, uid) DO UPDATE SET status = 'active', sig = excluded.sig, signed = excluded.signed, created = excluded.created`, gid, uid, sig, now, now);
    return { ok: true };
  },
  dzDecline(sql, { gid, uid, name, now = Date.now() }) {
    if (uid) {
      const old = first(sql, 'SELECT status FROM dz_member WHERE gid = ? AND uid = ?', gid, uid);
      if (old?.status === 'active') return { ok: false, reason: 'member' };
      sql.exec(`INSERT INTO dz_member (gid, uid, role, status, created) VALUES (?, ?, 'member', 'declined', ?)
        ON CONFLICT (gid, uid) DO UPDATE SET status = 'declined'`, gid, uid, now);
    } else {
      sql.exec('INSERT INTO dz_decline (gid, name, created) VALUES (?, ?, ?)', gid, name || '', now);
    }
    return { ok: true };
  },
  dzDeclined(sql, { gid }) {
    const named = rows(sql, `SELECT u.name, m.created FROM dz_member m JOIN user u ON u.id = m.uid WHERE m.gid = ? AND m.status = 'declined'`, gid);
    const anon = rows(sql, 'SELECT name, created FROM dz_decline WHERE gid = ?', gid);
    return [...named, ...anon].sort((a, b) => a.created - b.created);
  },
  dzSetMember(sql, { gid, uid, status }) {
    sql.exec("UPDATE dz_member SET status = ? WHERE gid = ? AND uid = ? AND role != 'owner'", status, gid, uid);
    return { ok: true };
  },
  dzNotify(sql, { gid, uid, on }) {
    sql.exec('UPDATE dz_member SET notify = ? WHERE gid = ? AND uid = ?', on ? 1 : 0, gid, uid);
    return { ok: true };
  },
  // 打卡 and its bookmarks / notes. Only the fields given change.
  dzCheckPut(sql, { gid, uid, n, done, late, note, marks, now = Date.now() }) {
    sql.exec("INSERT OR IGNORE INTO dz_check (gid, uid, n, done, late, note, marks, updated) VALUES (?, ?, ?, NULL, 0, '', '[]', ?)", gid, uid, n, now);
    if (done !== undefined) sql.exec('UPDATE dz_check SET done = ?, late = ? WHERE gid = ? AND uid = ? AND n = ?', done, late ? 1 : 0, gid, uid, n);
    if (note !== undefined) sql.exec('UPDATE dz_check SET note = ? WHERE gid = ? AND uid = ? AND n = ?', note, gid, uid, n);
    if (marks !== undefined) sql.exec('UPDATE dz_check SET marks = ? WHERE gid = ? AND uid = ? AND n = ?', JSON.stringify(marks), gid, uid, n);
    sql.exec('UPDATE dz_check SET updated = ? WHERE gid = ? AND uid = ? AND n = ?', now, gid, uid, n);
    return { ok: true };
  },
  dzChecks(sql, { gid, from = 1, to = 100000 }) {
    return rows(sql, 'SELECT uid, n, done, late, note, marks, updated FROM dz_check WHERE gid = ? AND n BETWEEN ? AND ? ORDER BY n', gid, from, to)
      .map((r) => ({ ...r, marks: parse(r.marks, []) }));
  },
  dzMyChecks(sql, { gid, uid }) {
    return rows(sql, 'SELECT n, done, late, note, marks FROM dz_check WHERE gid = ? AND uid = ? ORDER BY n', gid, uid).map((r) => ({ ...r, marks: parse(r.marks, []) }));
  },
  dzBoardAdd(sql, { id, gid, uid, body, now = Date.now() }) {
    sql.exec('INSERT INTO dz_board (id, gid, uid, body, created) VALUES (?, ?, ?, ?, ?)', id, gid, uid, body, now);
    return { ok: true };
  },
  dzBoard(sql, { gid, limit = 200 }) {
    return rows(sql, 'SELECT b.id, b.uid, b.body, b.created, u.name FROM dz_board b JOIN user u ON u.id = b.uid WHERE b.gid = ? ORDER BY b.created DESC LIMIT ?', gid, limit);
  },
  dzBoardDel(sql, { id, gid }) {
    sql.exec('DELETE FROM dz_board WHERE id = ? AND gid = ?', id, gid);
    return { ok: true };
  },
  // Members to email for a group: active, reminders on, with their account language.
  dzMailList(sql, { gid }) {
    return rows(sql, `SELECT u.id, u.email, u.name, u.lang, u.tz FROM dz_member m JOIN user u ON u.id = m.uid
      WHERE m.gid = ? AND m.status = 'active' AND m.notify = 1`, gid);
  },
  dzSentClaim(sql, { gid, n, now = Date.now() }) {
    if (first(sql, 'SELECT 1 AS x FROM dz_sent WHERE gid = ? AND n = ?', gid, n)) return { ok: false };
    sql.exec('INSERT INTO dz_sent (gid, n, sent) VALUES (?, ?, ?)', gid, n, now);
    return { ok: true };
  },

  // ---------- counters, questions ----------
  bump(sql, { day, who, kind, perDay }) {
    const mine = first(sql, 'SELECT count FROM rate WHERE day = ? AND who = ? AND kind = ?', day, who, kind)?.count || 0;
    if (mine >= perDay) return { ok: false };
    sql.exec('INSERT INTO rate (day, who, kind, count) VALUES (?, ?, ?, 1) ON CONFLICT (day, who, kind) DO UPDATE SET count = count + 1', day, who, kind);
    return { ok: true };
  },
  askAdd(sql, { message, name, reply, lang, page, now = Date.now() }) {
    sql.exec('INSERT INTO ask (message, name, reply, lang, page, created) VALUES (?, ?, ?, ?, ?, ?)', message, name, reply, lang, page, now);
    return { ok: true, id: first(sql, 'SELECT last_insert_rowid() AS id').id };
  },
  askMailed(sql, { id }) {
    sql.exec('UPDATE ask SET mailed = 1 WHERE id = ?', id);
    return { ok: true };
  },
  asks(sql, { limit = 200 } = {}) {
    return rows(sql, 'SELECT * FROM ask ORDER BY id DESC LIMIT ?', limit);
  },
  prune(sql, { day, now = Date.now() }) {
    sql.exec('DELETE FROM rate WHERE day < ?', day);
    sql.exec('DELETE FROM code WHERE expires < ?', now - 86400000);
    sql.exec('DELETE FROM session WHERE expires < ?', now);
    return { ok: true };
  },
};

export class Store {
  constructor(state) {
    this.sql = state.storage.sql;
    migrate(this.sql);
  }

  async fetch(request) {
    const { op, args } = await request.json();
    if (!Object.hasOwn(OPS, op)) return Response.json({ error: `unknown op ${op}` }, { status: 400 });
    return Response.json(OPS[op](this.sql, args || {}) ?? null);
  }
}

// Worker-side client: store(env)('dzGet', { id }).
export function store(env) {
  const stub = env.STORE.get(env.STORE.idFromName('main'));
  return async (op, args) => {
    const r = await stub.fetch('https://store/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }) });
    if (!r.ok) throw new Error(`store ${op} failed: ${r.status}`);
    return r.json();
  };
}
