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
- Phase 2 (reading groups: covenant link, phone/email reminders at the agreed
  time, calendar invite, check-ins with notes/voice, a public 广场) will follow
  the zion4realtor pattern: `src/worker.js` for `/api/*`, a SQLite-backed
  Durable Object for state, a cron trigger for reminders, Resend for email.
- Before pushing: `node build.mjs && node --test`. Pushing to `main` deploys.
