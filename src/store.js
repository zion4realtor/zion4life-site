// All stored state, in one SQLite-backed Durable Object (binding STORE, instance "main").
//   grp       groups (读经 / 祷告 / 喂养): the covenant (schedule, plan) and settings
//   member    who joined: display name, contact (only for reminders, never shown), mail key
//   device    sign-in tokens (hashed); a member can be signed in on several phones
//   checkin   打卡: one per member per session, with notes and an optional voice note
//   audio     voice notes (base64; short clips only)
//   reminded  which session reminders went out, so each is sent once
//   rate      per-visitor daily counters (hashed, never the raw IP)
//   ask       questions sent from the 有问题想问 box (also emailed to Zion when mail is set up)
// The Durable Object takes { op, args } as JSON. Every op is a plain function of a
// `sql` handle so tests can run the same code against node:sqlite.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS grp (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, intro TEXT NOT NULL,
    visibility TEXT NOT NULL, join_mode TEXT NOT NULL, invite TEXT NOT NULL, tz TEXT NOT NULL, days TEXT NOT NULL,
    time TEXT NOT NULL, minutes INTEGER NOT NULL, start_date TEXT NOT NULL, plan TEXT NOT NULL, max_members INTEGER,
    status TEXT NOT NULL, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS member (id TEXT PRIMARY KEY, gid TEXT NOT NULL, name TEXT NOT NULL, contact TEXT NOT NULL,
    contact_type TEXT NOT NULL, mail_key TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    notify INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS member_gid ON member (gid)',
  'CREATE TABLE IF NOT EXISTS device (token TEXT PRIMARY KEY, mid TEXT NOT NULL, created INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS checkin (gid TEXT NOT NULL, mid TEXT NOT NULL, n INTEGER NOT NULL, text TEXT NOT NULL,
    audio TEXT, created INTEGER NOT NULL, PRIMARY KEY (mid, n))`,
  'CREATE INDEX IF NOT EXISTS checkin_gid ON checkin (gid, n)',
  'CREATE TABLE IF NOT EXISTS audio (id TEXT PRIMARY KEY, gid TEXT NOT NULL, mid TEXT NOT NULL, mime TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS reminded (gid TEXT NOT NULL, n INTEGER NOT NULL, sent INTEGER NOT NULL, PRIMARY KEY (gid, n))',
  'CREATE TABLE IF NOT EXISTS rate (day TEXT NOT NULL, who TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (day, who, kind))',
  `CREATE TABLE IF NOT EXISTS ask (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, name TEXT NOT NULL, reply TEXT NOT NULL,
    lang TEXT NOT NULL, page TEXT NOT NULL, mailed INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
];

export function migrate(sql) {
  for (const q of SCHEMA) sql.exec(q);
}

const rows = (sql, q, ...b) => sql.exec(q, ...b).toArray();
const first = (sql, q, ...b) => rows(sql, q, ...b)[0] || null;

// Group row → the shape the rest of the code uses.
export function groupFromRow(r) {
  if (!r) return null;
  return {
    id: r.id, kind: r.kind, title: r.title, intro: r.intro, visibility: r.visibility, joinMode: r.join_mode,
    invite: r.invite, tz: r.tz, days: JSON.parse(r.days), time: r.time, minutes: r.minutes, startDate: r.start_date,
    plan: JSON.parse(r.plan), max: r.max_members, status: r.status, created: r.created,
  };
}
const publicMember = (m) => ({ id: m.id, name: m.name, role: m.role, status: m.status, created: m.created });
const activeCount = (sql, gid) => first(sql, "SELECT COUNT(*) AS n FROM member WHERE gid = ? AND status = 'active'", gid).n;

export const OPS = {
  createGroup(sql, { g, owner, now = Date.now() }) {
    sql.exec(
      `INSERT INTO grp (id, kind, title, intro, visibility, join_mode, invite, tz, days, time, minutes, start_date, plan, max_members, status, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      g.id, g.kind, g.title, g.intro, g.visibility, g.joinMode, g.invite, g.tz, JSON.stringify(g.days), g.time, g.minutes,
      g.startDate, JSON.stringify(g.plan), g.max ?? null, now,
    );
    sql.exec(
      "INSERT INTO member (id, gid, name, contact, contact_type, mail_key, role, status, created) VALUES (?, ?, ?, ?, ?, ?, 'owner', 'active', ?)",
      owner.id, g.id, owner.name, owner.contact, owner.contactType, owner.mailKey, now,
    );
    sql.exec('INSERT INTO device (token, mid, created) VALUES (?, ?, ?)', owner.token, owner.id, now);
    return { ok: true };
  },
  group(sql, { id }) {
    const g = groupFromRow(first(sql, 'SELECT * FROM grp WHERE id = ?', id));
    if (!g) return null;
    const owner = first(sql, "SELECT name FROM member WHERE gid = ? AND role = 'owner'", id);
    return { ...g, ownerName: owner?.name || '', memberCount: activeCount(sql, id) };
  },
  // Groups listed on the plaza (public and active), newest first.
  plaza(sql, { kind, limit = 100 }) {
    const q = `SELECT g.*, (SELECT name FROM member WHERE gid = g.id AND role = 'owner') AS owner_name,
      (SELECT COUNT(*) FROM member WHERE gid = g.id AND status = 'active') AS member_count
      FROM grp g WHERE g.visibility = 'public' AND g.status = 'active' ${kind ? 'AND g.kind = ?' : ''} ORDER BY g.created DESC LIMIT ?`;
    const list = kind ? rows(sql, q, kind, limit) : rows(sql, q, limit);
    return list.map((r) => ({ ...groupFromRow(r), ownerName: r.owner_name || '', memberCount: r.member_count }));
  },
  // Groups the given member tokens belong to ("我的小组").
  mine(sql, { tokens }) {
    const out = [];
    for (const t of tokens.slice(0, 30)) {
      const m = first(sql, "SELECT m.gid, m.role, m.status FROM device d JOIN member m ON m.id = d.mid WHERE d.token = ? AND m.status IN ('active', 'pending')", t);
      if (!m) continue;
      const g = OPS.group(sql, { id: m.gid });
      if (g && g.status !== 'hidden') out.push({ ...g, myRole: m.role, myStatus: m.status });
    }
    return out;
  },
  allGroups(sql) {
    return rows(sql, `SELECT g.*, (SELECT name FROM member WHERE gid = g.id AND role = 'owner') AS owner_name,
      (SELECT COUNT(*) FROM member WHERE gid = g.id AND status = 'active') AS member_count FROM grp g ORDER BY g.created DESC LIMIT 500`)
      .map((r) => ({ ...groupFromRow(r), ownerName: r.owner_name || '', memberCount: r.member_count }));
  },
  setGroupStatus(sql, { id, status }) {
    sql.exec('UPDATE grp SET status = ? WHERE id = ?', status, id);
    return { ok: true };
  },
  setMaterial(sql, { id, material, link }) {
    const g = groupFromRow(first(sql, 'SELECT * FROM grp WHERE id = ?', id));
    if (!g || g.kind === 'read') return { ok: false };
    sql.exec('UPDATE grp SET plan = ? WHERE id = ?', JSON.stringify({ ...g.plan, material, link }), id);
    return { ok: true };
  },
  // The member a device token belongs to, with contact and mail key for server use only.
  memberByToken(sql, { token }) {
    return first(sql, 'SELECT m.* FROM device d JOIN member m ON m.id = d.mid WHERE d.token = ?', token);
  },
  // The member an email link (member id + mail key) belongs to.
  memberByKey(sql, { mid, key }) {
    const m = first(sql, 'SELECT * FROM member WHERE id = ?', mid);
    return m && m.mail_key === key ? m : null;
  },
  addDevice(sql, { token, mid, now = Date.now() }) {
    sql.exec('INSERT INTO device (token, mid, created) VALUES (?, ?, ?)', token, mid, now);
    const n = first(sql, 'SELECT COUNT(*) AS n FROM device WHERE mid = ?', mid).n;
    if (n > 10) sql.exec('DELETE FROM device WHERE token IN (SELECT token FROM device WHERE mid = ? ORDER BY created LIMIT ?)', mid, n - 10);
    return { ok: true };
  },
  memberByContact(sql, { gid, contact }) {
    return first(sql, "SELECT * FROM member WHERE gid = ? AND contact = ? AND status IN ('active', 'pending')", gid, contact);
  },
  owner(sql, { gid }) {
    return first(sql, "SELECT * FROM member WHERE gid = ? AND role = 'owner'", gid);
  },
  members(sql, { gid, withPending = false }) {
    const st = withPending ? "('active', 'pending')" : "('active')";
    return rows(sql, `SELECT * FROM member WHERE gid = ? AND status IN ${st} ORDER BY role = 'owner' DESC, created`, gid)
      .map((m) => ({ ...publicMember(m), note: m.status === 'pending' ? m.note : undefined }));
  },
  // Join or apply. status is 'active' or 'pending'. Refuses a contact already in the group, and a full group.
  join(sql, { gid, m, status, now = Date.now() }) {
    const same = first(sql, "SELECT status FROM member WHERE gid = ? AND contact = ? AND status IN ('active', 'pending')", gid, m.contact);
    if (same) return { ok: false, reason: 'exists' };
    const g = first(sql, 'SELECT max_members FROM grp WHERE id = ?', gid);
    if (status === 'active' && g.max_members && activeCount(sql, gid) >= g.max_members) return { ok: false, reason: 'full' };
    sql.exec(
      "INSERT INTO member (id, gid, name, contact, contact_type, mail_key, role, status, note, created) VALUES (?, ?, ?, ?, ?, ?, 'member', ?, ?, ?)",
      m.id, gid, m.name, m.contact, m.contactType, m.mailKey, status, m.note || '', now,
    );
    sql.exec('INSERT INTO device (token, mid, created) VALUES (?, ?, ?)', m.token, m.id, now);
    return { ok: true, status };
  },
  setMember(sql, { gid, mid, status }) {
    const m = first(sql, 'SELECT * FROM member WHERE id = ? AND gid = ?', mid, gid);
    if (!m || m.role === 'owner') return { ok: false };
    if (status === 'active' && m.status !== 'active') {
      const g = first(sql, 'SELECT max_members FROM grp WHERE id = ?', gid);
      if (g.max_members && activeCount(sql, gid) >= g.max_members) return { ok: false, reason: 'full' };
    }
    sql.exec('UPDATE member SET status = ? WHERE id = ?', status, mid);
    return { ok: true, member: m };
  },
  setNotify(sql, { mid, notify }) {
    sql.exec('UPDATE member SET notify = ? WHERE id = ?', notify ? 1 : 0, mid);
    return { ok: true };
  },
  checkin(sql, { gid, mid, n, text, audio, now = Date.now() }) {
    const old = first(sql, 'SELECT audio FROM checkin WHERE mid = ? AND n = ?', mid, n);
    if (old?.audio && audio && old.audio !== audio) sql.exec('DELETE FROM audio WHERE id = ?', old.audio);
    sql.exec(
      `INSERT INTO checkin (gid, mid, n, text, audio, created) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (mid, n) DO UPDATE SET text = excluded.text, audio = COALESCE(excluded.audio, checkin.audio), created = excluded.created`,
      gid, mid, n, text, audio || null, now,
    );
    return { ok: true };
  },
  // Check-ins with member names, newest session first.
  checkins(sql, { gid, fromN = 1 }) {
    return rows(sql, `SELECT c.n, c.mid, c.text, c.audio, c.created, m.name FROM checkin c JOIN member m ON m.id = c.mid
      WHERE c.gid = ? AND c.n >= ? ORDER BY c.n DESC, c.created`, gid, fromN);
  },
  checkinCounts(sql, { gid }) {
    return rows(sql, 'SELECT n, COUNT(*) AS count FROM checkin WHERE gid = ? GROUP BY n ORDER BY n DESC LIMIT 60', gid);
  },
  audioPut(sql, { id, gid, mid, mime, data, now = Date.now() }) {
    sql.exec('INSERT INTO audio (id, gid, mid, mime, data, created) VALUES (?, ?, ?, ?, ?, ?)', id, gid, mid, mime, data, now);
    return { ok: true };
  },
  audioGet(sql, { id }) {
    return first(sql, 'SELECT * FROM audio WHERE id = ?', id);
  },
  // Active groups with at least one member who gets email reminders.
  remindable(sql) {
    return rows(sql, `SELECT * FROM grp WHERE status = 'active' AND id IN
      (SELECT gid FROM member WHERE status = 'active' AND notify = 1 AND contact_type = 'email')`).map(groupFromRow);
  },
  emailMembers(sql, { gid }) {
    return rows(sql, "SELECT * FROM member WHERE gid = ? AND status = 'active' AND notify = 1 AND contact_type = 'email'", gid);
  },
  // Claim a session reminder; true only the first time.
  claimReminder(sql, { gid, n, now = Date.now() }) {
    if (first(sql, 'SELECT 1 AS x FROM reminded WHERE gid = ? AND n = ?', gid, n)) return { ok: false };
    sql.exec('INSERT INTO reminded (gid, n, sent) VALUES (?, ?, ?)', gid, n, now);
    return { ok: true };
  },
  // Count an action per visitor per day; refuses past perDay.
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
  asks(sql, { limit = 200 }) {
    return rows(sql, 'SELECT * FROM ask ORDER BY id DESC LIMIT ?', limit);
  },
  prune(sql, { day }) {
    sql.exec('DELETE FROM rate WHERE day < ?', day);
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

// Worker-side client: store(env)('group', { id }).
export function store(env) {
  const stub = env.STORE.get(env.STORE.idFromName('main'));
  return async (op, args) => {
    const r = await stub.fetch('https://store/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }) });
    if (!r.ok) throw new Error(`store ${op} failed: ${r.status}`);
    return r.json();
  };
}
