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
- Admin is at `/admin`, using the password from `ADMIN_PASSWORD`. From there you can add buildings, rooms and machines, mark machines out of order or fixed, hide reports, and **print QR sheets**.

To reset the demo data, run `npm run db:seed -- --reset`.

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

## Environment

| Variable | Needed | Notes |
|---|---|---|
| `DATABASE_URL` | yes in prod | `file:local.db` locally; `libsql://…turso.io` in production |
| `DATABASE_AUTH_TOKEN` | with Turso | Create with `turso db tokens create <db>` |
| `ADMIN_PASSWORD` | for admin | Leave it empty to disable admin |
| `SESSION_SECRET` | yes in prod | 32+ random characters (`openssl rand -base64 32`). Signs the admin cookie and salts the device and IP hashes. |
| `PUBLIC_BASE_URL` | for printing | The origin printed in QR codes, e.g. `https://laundry.example.com` |

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
5. Open `/admin` and add rooms and machines. Label machines to match their physical numbers. Then open **Print QR sheet**, print at 100% on US Letter, cut, and stick one near each machine's controls.

Vercel Hobby is for non-commercial use only. If a club or department officially sponsors the project, the same code can run on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare) (see PLAN.md §8).

Schema changes: edit `src/lib/db/schema.ts`, run `npm run db:generate`, commit the new file in `drizzle/`, then run `npm run db:migrate` against production.

## Project layout

```
src/app/                 routes: / · /b/[building]/[room] · /m/[code] · /about · /admin/** · /api/**
src/app/actions.ts       submitReport / undoReport (Server Actions)
src/app/admin/actions.ts admin mutations (password-protected)
src/components/          StatusBadge, SettingChip, MachineCard, HeatLadder, ReportSheet, icons
src/lib/status.ts        the status and best-setting algorithm (pure, unit-tested)
src/lib/labels.ts        enums, human copy, WASH help links
src/lib/queries.ts       DB loaders that attach computed status
src/lib/device.ts        anonymous device cookie, hashed IP, rate limits
drizzle/                 SQL migrations
scripts/                 migrate and seed
tests/                   Vitest unit tests and Playwright e2e
```

## JSON API (read-only)

- `GET /api/rooms/:roomId`: the room's machines, each with status and recommendation
- `GET /api/machines/:code`: one machine with its status, recommendation and recent reports
