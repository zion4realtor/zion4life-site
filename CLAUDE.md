# CLAUDE.md

Zion Chen's outreach site 有光 (English name Light), zion4life.faith. Read README.md first.

- Static site: `node build.mjs` → `dist/`. No dependencies; keep it that way.
- Two languages: Chinese at the root, English under `/en/` with the same path. Every
  page and every piece of content exists in both. Zion sends content in one language;
  Claude translates it into the other.
- Bible verses, in either language, are quoted from the Recovery Version (恢复本) as
  published (English: text.recoveryversion.bible; look each verse up, never quote from
  memory). The Recovery Version and Life-Study texts are copyrighted by Living Stream
  Ministry: link to them, never host whole chapters.
- Content (articles, messages, testimonies, 呼吸 items, video links) comes from Zion;
  never write doctrinal content of our own. Placeholders carry `sample: true`.
- Low-key words in titles, menus, URLs and link previews: 粮仓 (content), 呼吸 (prayer),
  吃饭 (Bible reading), 搭子 (groups: 饭搭子, 呼吸搭子, 投喂搭子). See README.md.
- Audience is largely in mainland China: nothing may load from Google, YouTube
  thumbnails or public CDNs on page load; videos load on tap; phone first.
- Design: water tiles on a sky palette, LXGW WenKai for display text, bottom tab bar
  (粮仓 / 呼吸 / 搭子 / 我的; Zion approved this bar, keep it), logo in `static/logo.svg`
  (a beam of light on Mount Zion). The home grid must fill whole rows.
- Groups: `src/worker.js` routes `/api/*` to `src/api.js`; state is in the SQLite-backed
  Durable Object (`src/store.js`). Never return contacts (email / phone) to any page;
  check-in notes and member names are for members only. Schedules are in the
  initiator's time zone and shown in each viewer's own (`src/schedule.js`).
- Site contact: hello@zion4life.faith (forwards to Zion). The question box stores every
  message (see `/admin/`) and emails it when mail is set up.
- Before pushing: `node build.mjs && node --test`. Pushing to `main` deploys.
