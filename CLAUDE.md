# CLAUDE.md

Zion Chen's outreach site 有光 (English name Light), zion4life.faith. Read README.md first.

- Static site: `node build.mjs` → `dist/`. No dependencies; keep it that way.
- Two languages: Chinese at the root, English under `/en/` with the same path. Every
  page and every piece of content exists in both. Zion sends content in one language;
  Claude translates it into the other.
- Bible verses, in either language, are quoted from the Recovery Version (恢复本) as
  published (English: text.recoveryversion.bible or bibleread.online; look each verse up, never quote from
  memory). The Recovery Version and Life-Study texts are copyrighted by Living Stream
  Ministry: link to them, never host whole chapters.
- Content (articles, messages, testimonies, 呼吸 items, video links) comes from Zion;
  never write doctrinal content of our own. Placeholders carry `sample: true`.
- Low-key words in titles, menus, URLs and link previews: 粮仓 (content), 呼吸 (prayer),
  吃饭 (Bible reading), 搭子 (groups: 饭搭子, 呼吸搭子, 投喂搭子, 细嚼搭子, 晨兴搭子, 粮仓搭子). See README.md.
  Exception (Zion's choice): 呼吸 pages' titles and link previews say the day's date and
  活力排祷告负担, then the headline and lede.
- Kinds of 搭子 live in `src/kinds.js`, one entry each; keep adding kinds there.
- Audience is largely in mainland China: nothing may load from Google, YouTube
  thumbnails or public CDNs on page load; videos load on tap; phone first.
- Design: water tiles on a sky palette, LXGW WenKai for display text, bottom tab bar
  (粮仓 / 呼吸 / 搭子 / 我的; Zion approved this bar, keep it), logo in `static/logo.svg`
  (a beam of light on Mount Zion). The home grid must fill whole rows.
- 呼吸 days follow the format in README.md; 读给我听 recordings are made by the cron with
  Workers AI (`src/audio.js`), never by hand. No time zones for 呼吸: the newest day shows to
  everyone and goes to subscribers as soon as it is pushed.
- Code that runs: `src/worker.js` routes `/api/*` to `src/api.js` (auth.js, content.js,
  dazi.js, inbox.js for 我的 → 消息 and subscriptions, audio.js) and renders `/g/<id>` and `/x/<id>`; state is in the SQLite-backed Durable Object
  (`src/store.js`). Never return an email address to any page (show `maskEmail` to its owner
  only), except Zion's `/admin/` (admins only), which lists full emails and countries; private 留言, venue details and signatures are for the people allowed to see them.
  Schedules are in the initiator's phone time zone (never a choice on the form) and shown in
  each viewer's own; link previews carry no clock times.
- Accounts have no passwords (email codes). Zion is the admin through `ADMIN_EMAILS`.
- Site contact: light@zion4life.faith (Zion's address; Cloudflare forwards it to his Hotmail
  until he picks a mailbox). The question box stores every
  message (see `/admin/`) and emails it when mail is set up.
- Page views use the async Google tag for city-aware reporting; custom events and the blocked-tag
  fallback go through `/api/hit` (`src/analytics.js`). The tag shares the site's client ID and
  sends sanitized page URLs. New actions: add the name to `EVENTS` there and call `window.ygTrack`.
- Before pushing: `node build.mjs && node --test`. Pushing to `main` deploys.

- Site-wide rule: only registered, signed-in users may leave messages, prayers, replies, or questions/suggestions. Enforce this in the API as well as the UI; public messages remain readable by visitors.
- 滴灌牧养 image articles use paired Chinese/English pages, the tag:breathe subscription and per-article comments. From October 16, 2026, put the narration bar above each image: Chinese transcript contains only Chinese, English uses Aura 2 Helena with no device-voice fallback. Publish updates and verify production pages and recording status.

- Drip Shepherding uses the standard article layout with the supplied image as its body: subscription aligned right above narration, then image, sharing, member-only comments (private option labelled 私聊版主), and other drip article cards. No image-download button. Each drip article belongs to breathe, feelings, and eat. The xinli-luan sample has been removed.
