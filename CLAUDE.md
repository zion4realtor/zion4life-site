# CLAUDE.md

Zion Chen's outreach site (zion4life.faith). Read README.md first.

- Static site: `node build.mjs` → `dist/`. No dependencies; keep it that way.
- All content is in `content/`. Chinese (simplified) only.
- Zion maintains the site by telling Claude what to change. Content (articles,
  messages, testimonies, prayer items, video links) comes from Zion; never write
  doctrinal content or quote ministry publications from memory. Placeholders
  carry `sample: true` until his real content replaces them.
- Scripture: he uses the Recovery Version (恢复本). Quote it only as he sends it.
  Placeholder verses are marked 和合本.
- Audience is largely in mainland China: nothing may load from Google, YouTube
  thumbnails or public CDNs on page load; videos load on tap; keep text mobile
  first (WeChat-article style reading).
- Keep the site low-key: life/light framing on the front door, no loud
  religious imagery in titles or the home page.
- Groups (读经 / 祷告 / 喂养, `/square/`, `/g/<id>`): `src/worker.js` routes
  `/api/*` to `src/api.js`; state is in the SQLite-backed Durable Object
  (`src/store.js`); the 5-minute cron sends email reminders via Resend. Never
  return contacts (email / phone) to any page; check-in notes and member names
  are for members only. Schedules are in the initiator's time zone and shown in
  each viewer's own (`src/schedule.js`).
- Before pushing: `node build.mjs && node --test`. Pushing to `main` deploys.
