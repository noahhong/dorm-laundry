# dorm-laundry

Finding the best setting for dorm laundry (starting at Hedrick Summit) so no more burned underwear :)

**Dorm Laundry** is a mobile-first website for any WASH Connect laundry room. Residents scan a QR sticker on a machine and see:

- whether the machine **works** (Works / Caution / Broken / No reports)
- for dryers, the **setting that actually dries** without cooking your clothes

After a load, they report how it went in **3 taps**, with no login and no app. Status and recommendations come from recent reports, with time decay (see [PLAN.md §6](PLAN.md#6-algorithm-status-and-best-setting)).

> An independent student project. Not affiliated with WASH Multifamily Laundry Systems or any university.

The full research, design system and roadmap are in **[PLAN.md](PLAN.md)**.

## Stack

- Next.js 16 (App Router, Server Components, Server Actions) with TypeScript
- Tailwind CSS v4, with design tokens in CSS variables; light and dark themes
- SQLite through libSQL and Drizzle ORM: a local file in development, [Turso](https://turso.tech) in production
- `qrcode` for server-rendered SVG QR stickers
- Vitest (algorithm unit tests) and Playwright (mobile end-to-end smoke tests)

## Run locally

Requires Node 20.9+ (22 recommended).

```bash
npm install
cp .env.example .env.local        # then set ADMIN_PASSWORD and SESSION_SECRET
npm run setup                     # creates local.db, runs migrations, seeds Hedrick Summit demo data
npm run dev                       # http://localhost:3000
```

- `/` redirects to the only room, `/b/hedrick-summit/laundry`.
- Machine pages are at `/m/<code>`. The seed uses readable codes: `hsd1`–`hsd6` for dryers and `hsw1`–`hsw4` for washers. Try `/m/hsd2?r=1` to see what a QR scan opens.
- Students can add the site to their home screen (it's a PWA), and switch light/dark/auto with the header toggle.
- On a broken machine, **Notify me when it's fixed** sends one push notification when it works again (needs the `VAPID_*` keys below).
- Admin is at `/admin`, using the password from `ADMIN_PASSWORD` (see below).

To reset the demo data, run `npm run db:seed -- --reset`.

## The admin panel (`/admin`)

| Page | What you can do |
|---|---|
| **Dashboard** | Reports today / this week with trends, a 14-day chart, top problems, every machine that needs attention (broken, doubtful, weak, never reported), a per-room overview, and the rules currently in effect |
| **Rooms & machines** | Add, rename and delete buildings and rooms. Per room: which **dryer settings those dryers actually have** (residents can only report, and get recommended, what you tick), minutes per payment, WASH room code. Add machines in bulk, edit, mark out of order / fixed, retire, and **print QR sticker sheets**. Each machine shows how many residents are waiting to hear it's fixed; **Mark fixed** notifies them |
| **Reports** | Search and filter every report (room, kind, outcome, visible/hidden/undone, period), hide or unhide one or many, and **download a CSV** |
| **Settings** | Every rule, editable live: site name, tagline and announcement banner; whether notes are public; **how many reports mark a machine Broken**; status and setting memory; weak-dryer thresholds; rate limits and bot speed bumps. Each field shows its default and a "Changed" badge; one click resets everything |
| **Activity log** | Who-did-what record of every admin action, including before → after for each setting |

Settings are stored in the database, not in code, so they survive deploys and apply to the public pages immediately. Secrets (admin password, bot-check keys) stay in environment variables.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates route types, then runs `tsc` |
| `npm test` | Vitest unit tests for the status and recommendation algorithm |
| `npm run test:e2e` | Playwright smoke tests on an iPhone-sized viewport. Run `npm run build` first; uses a throwaway `e2e.db`. In the Claude Code cloud sandbox, prefix with `CHROMIUM_PATH=/opt/pw-browsers/chromium`. |
| `npm run db:generate` | Creates a new SQL migration after you edit `src/lib/db/schema.ts` |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL` |
| `npm run db:seed` | Seeds the demo building (add `-- --reset` to recreate it) |
| `npm run preflight` | Checks your production env vars and that the database is reachable and migrated. Run it before and after deploying |

## Environment

| Variable | Needed | Notes |
|---|---|---|
| `DATABASE_URL` | yes in prod | `file:local.db` locally; `libsql://…turso.io` in production |
| `DATABASE_AUTH_TOKEN` | with Turso | Create with `turso db tokens create <db>` |
| `ADMIN_PASSWORD` | for admin | 12+ characters. Leave it empty to disable admin. Changing it signs every admin out. Five wrong passwords lock an IP out for 15 minutes. |
| `SESSION_SECRET` | yes | 32+ random characters (`openssl rand -base64 32`). Signs the admin cookie and salts the device and IP hashes. The app refuses to run without it, except under `next dev` (or with `ALLOW_DEV_SECRET=1`, for throwaway previews only). Rotating it also resets all device and IP hashes. |
| `PUBLIC_BASE_URL` | for printing | The origin printed in QR codes, e.g. `https://laundry.example.com` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | optional | Turns on the invisible Cloudflare Turnstile bot check for reports. Both must be set; leave empty to disable. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | optional | Turns on "Notify me when it's fixed" (Web Push). Generate once with `npx web-push generate-vapid-keys`; both must be set. Changing them drops every pending alert. |
| `VAPID_SUBJECT` | optional | Contact the push services can reach you at: `mailto:you@example.com` or your `https://` site. Defaults to `PUBLIC_BASE_URL`. |

## Deploy (Vercel + Turso, both free tiers)

1. **Database**
   ```bash
   brew install tursodatabase/tap/turso   # or: curl -sSfL https://get.tur.so/install.sh | bash
   turso auth signup
   turso db create dorm-laundry --location lax   # choose the region nearest your users
   turso db show dorm-laundry --url              # this is DATABASE_URL
   turso db tokens create dorm-laundry           # this is DATABASE_AUTH_TOKEN
   ```
2. **Migrate (and optionally seed)** from your laptop:
   ```bash
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:migrate
   DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:seed    # optional demo data
   ```
3. **Vercel**
   - Import the GitHub repo at vercel.com/new. The framework is detected automatically.
   - Set the five environment variables above.
   - Deploy.
   - In Project → Settings → Functions, pick the region closest to your Turso database (e.g. `sfo1` for `lax`).
4. **Custom domain** (optional). Set `PUBLIC_BASE_URL` to it **before** printing QR codes, so stickers never point at a preview URL.
5. (Optional) If spam shows up, create a free Turnstile widget in the Cloudflare dashboard for your domain and set both `TURNSTILE_*` variables.
   (Optional) For "Notify me when it's fixed", run `npx web-push generate-vapid-keys` once and set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. On iPhone, residents must add the site to their Home Screen first (iOS 16.4+); the page tells them how.
6. Run `npm run preflight` with the same variables to confirm everything is set, then check `https://your-domain/api/health` returns `{"ok":true}` after the deploy.
7. Open `/admin`, then **Settings** to set your site name and rules, and **Rooms & machines** to add your rooms and tick the dryer settings they have. Label machines to match their physical numbers. Then open **Print QR sheet**, print at 100% on US Letter, cut, and stick one near each machine's controls.

Vercel Hobby is for non-commercial use only. If a club or department officially sponsors the project, the same code can run on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare) (see PLAN.md §8).

Schema changes: edit `src/lib/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, then run `npm run db:migrate` against production.

## Project layout

```
src/app/                 routes: / · /b/[building]/[room] · /m/[code] · /about · /admin/** · /api/**
src/app/actions.ts       submitReport / undoReport, watchForFix (Server Actions)
src/app/admin/actions.ts admin mutations (password-protected)
src/components/          StatusBadge, SettingChip, MachineCard, HeatLadder, ReportSheet, icons
src/lib/status.ts        the status and best-setting algorithm (pure, unit-tested)
src/lib/labels.ts        enums, human copy, WASH help links
src/lib/queries.ts       DB loaders that attach computed status
src/lib/device.ts        anonymous device cookie, hashed IP, rate limits
src/lib/push*.ts         "notify me when it's fixed": rules (pure) and sending (web-push)
public/sw.js             service worker that shows those notifications (no caching)
drizzle/                 SQL migrations
scripts/                 migrate and seed
tests/                   Vitest unit tests and Playwright e2e
```

## Health and JSON API

- `GET /api/health`: `{"ok":true}` when the database is up and migrated (503 otherwise), for uptime monitors.

- `GET /api/rooms/:roomId`: the room's machines, each with status and recommendation
- `GET /api/machines/:code`: one machine with its status, recommendation and recent reports
