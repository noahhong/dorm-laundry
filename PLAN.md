# Dorm Laundry: Plan

> Crowdsourced machine status and per-machine dryer settings for any WASH Connect laundry room.
> Pilot: Hedrick Summit (UCLA). Built to work for any building, room and campus.

Status: **draft v1**, written 2026-09-30. Sections marked **(decision)** record a choice made in this plan; the owner can revisit them. Open questions are in §15.

---

## 1. Problem, users, goals

### Problem
1. **You can't tell which machines are broken.** Some washers and dryers take your money and don't start. Some don't heat, leave clothes soaking, or leak. That knowledge lives in hallway conversations and group chats, and it goes stale.
2. **Every dryer behaves differently.** On one dryer, Medium still leaves clothes damp after a full cycle. On the dryer next to it, Medium is hot enough to melt a spandex waistband or crack a screen print. The README's goal: "no more burned underwear."

### Users
| Persona | Context | What they need |
|---|---|---|
| **Resident at the machine** (primary) | Standing in the laundry room, phone in one hand and a basket in the other. Scans the QR sticker on the machine. | In under 5 seconds: *does this machine work, and what setting should I use?* Report the result in about 3 taps without logging in. |
| **Resident planning a trip** | In their room, deciding whether to go down now. | A room view: how many machines work and which to avoid. |
| **Room steward / RA / project owner** (admin) | Occasional. | Add buildings, rooms and machines; print QR stickers; mark machines out of order or fixed; hide spam. |
| **Another campus** (later) | A student at another school with WASH machines. | Set up their own building with no code changes. |

### Goals
- **G1:** Each machine shows an honest, fresh **status** (Works / Caution / Broken / Unknown) based on recent reports, with a confidence level and a "last report" time.
- **G2:** Each dryer shows a **recommended setting** learned from reports, plus warnings ("High runs hot here"). This is new: no existing tool does it (§2.3).
- **G3:** Reporting takes **3 taps from a QR scan**, with no account or app install.
- **G4:** Works for any WASH Connect laundry room: multiple buildings, rooms, washers and dryers.
- **G5:** Fast on a phone over bad basement Wi-Fi: server-rendered, very little JavaScript, small pages.
- **G6:** Free or near-free to run, and simple enough that a student can maintain it.

### Non-goals (for now)
- **No payments, refunds or starting machines.** WASH-Connect does that. We link to WASH's service and refund channels (§2.1).
- **No real-time free/busy status from WASH.** The data exists behind undocumented endpoints, but we have no permission to use it (§2.1). Also, the WASH-Connect app already shows availability to residents (UCLA launched it in Oct 2025).
- **No hardware sensors** (vibration or current clamps). Possibly much later (§2.3).
- **No required accounts or social features.**
- **Not an official WASH or university service.** The site says so clearly.

---

## 2. Research summary

Five parallel research passes (WASH Connect; machine behavior; prior art; stack; UI/UX). Their sandboxes blocked many direct page fetches, so some claims come from search-result snippets. Those are marked *(snippet)*.

### 2.1 WASH Connect and data access

**How it works (confirmed):**
- WASH fits a Bluetooth "WASH-Connect" module to each machine.
- The app (iOS and Android only, no web app) needs an email login and a wallet loaded with a credit or debit card.
- To start a machine: pick your room, pick the machine, scan the machine's QR code or type its machine number, then tap Pay.
- You join a room over Bluetooth when you're near it, or with an 8-digit location code. After that you can see room status remotely.
- A separate **"WASH-Connect Campus"** app advertises availability and service requests "with no account required" *(snippet)*.
- UCLA Housing launched WASH-Connect with real-time availability in Oct 2025 *(snippet, Daily Bruin)*.

**API (confirmed from public GitHub and a blog; not official):**
- The Home Assistant integration `yostinso/wash-connect` documents reverse-engineered endpoints on Firebase Cloud Functions: `GET /locations?srcode=…` and `GET /get_machine_status_v1?uln=…`, both **unauthenticated**.
- They return machine number, type, status, `start_time` and `time_remaining`. `time_remaining` is set when a cycle starts, not a live countdown.
- A Nov 2025 blog scraped these nationwide and was **IP-blocked after about a week**. The author says WASH told them the data is "intentionally" public. That is a private reply, not a license.
- There is no official API or developer program.
- WASH's actual Terms of Service could not be retrieved. Typical app terms forbid reverse engineering and automated access.

**Service and refunds (confirmed, snippet):**
- In the app: Support → Machine Not Working / Request a Refund.
- Web forms: `wash.com/service-request`, `wash.com/refund-request`.
- Refunds: (800) 342-5932.
- No documented deep-link URL scheme for the app.

> **Verdict (decision):** WASH's data is technically reachable, but it is undocumented, unlicensed, rate-limited, and could break or be locked down at any time. **We will not depend on it.**
>
> - The product is **crowdsourced status + crowdsourced dryer settings**. That is data WASH doesn't have: WASH knows whether a machine is in use, not whether it actually heats.
> - We **link out** to WASH's service and refund channels on every broken machine. Our reports complement WASH's service requests; they don't replace them.
> - The schema has a nullable `wash_machine_number` field so a future *licensed* integration can join on it.
> - Route to permission: ask UCLA Housing to ask WASH for a partner feed (§15).
> - Rules if anyone prototypes against the endpoints: never ship it, poll gently, never use other people's credentials, never touch payment endpoints, never work around a block.

### 2.2 Machine behavior

**Washer failure modes:**
- Took money, won't start
- Door lock error (dL / F21)
- Won't drain (OE)
- Slow fill (LF)
- Didn't spin, clothes soaking (drain, unbalanced load uL, or suds Sd)
- Leaks
- No hot water
- Dispenser problems
- Stopped mid-cycle
- Loud or vibrating
- Odor

**Dryer failure modes:**
- Took money, won't start
- No heat (igniter, element or thermal fuse)
- Runs too hot (vent restriction or failed cycling thermostat)
- Doesn't tumble (belt)
- Stops early (high-limit trips on low airflow)
- Clothes still damp
- Burnt smell
- Lint screen full or torn
- Door won't latch

**Why "identical" dryers differ:**
- **Exhaust restriction** is the big one. 1/8" of compacted lint in a 4" duct cuts airflow by about 43%. Long or shared ducts slow drying *and* make the drum hotter.
- Thermostat drift.
- Gas vs electric (gas is roughly 20–50% faster).
- Top vs bottom pocket on stacked units.
- Load size, and how well the washer spun.
- Operator-programmed minutes per payment.

So per-machine learning is the right model. A machine whose "still damp" rate is far above its siblings' is an **outlier worth reporting to WASH**.

**Commercial dryer settings (approximate exhaust setpoints):**

| Setting | Huebsch/Alliance manual | Small stacked Speed Queen (user-measured) |
|---|---|---|
| High | ~190°F / 88°C | ~150°F |
| Medium | ~180°F / 82°C | ~140°F |
| Low | ~160°F / 71°C | ~130°F |
| Delicates | ~130°F / 54°C | n/a |
| No Heat | ambient | ambient |

- Drum air is hotter than exhaust air.
- Vend controls usually offer High / Medium / Low / Delicates / No Heat.
- Perm Press is roughly Medium plus a cool-down.
- Paying again adds time, often in fixed increments of about 30–60 min.

**Fabric heat risk:**

| Fabric | Risk | Advice |
|---|---|---|
| Spandex / elastane | Degrades above ~155°F / 68°C | Low / Delicates / No Heat |
| Nylon | Turns shiny or stiff at ~140–180°F | Low |
| TPU bonded seams (athletic wear) | Soften at ~125°F / 52°C | No Heat |
| Acrylic | Shrinks or warps on Medium and above | Low |
| Wool | Felts and shrinks with heat plus tumbling | No Heat / air dry |
| Screen prints | Crack or peel | Low, inside out |
| Cotton | Tolerates High, but shrinks | Medium–High |

Signs of heat damage: melted or glazed spots, shine, a plastic feel, shrinking, lost stretch, cracked prints, scorching or yellowing, burnt smell. Damage to synthetics is permanent.

**Report form (adopted in §5 and §9):**
- Machine preselected by the QR code.
- Tap 1: outcome.
- Tap 2: setting (or symptom if it didn't work).
- Tap 3: submit.
- Everything else goes in an optional "More details" section.
- Remember the reporter's last setting.

### 2.3 Prior art

| Tool | Data source | Features | Complaints / lessons |
|---|---|---|---|
| **LaundryView** (Mac-Gray → CSC) | Machine sensors | Free/in-use, minutes left, email alerts | "Free" is stale by the time you arrive; alerts don't stop people pulling your clothes out. CSC-only, not WASH. |
| **CSC GO** | Vendor | Wallet, alerts, availability, in-app service/refund | Bluetooth flakiness, money charged but not credited, tickets "resolved" without a fix |
| **PayRange** | BLE payment retrofit | Payment only | Refund disputes. **Lesson: stay away from money.** |
| **Penn Mobile / Laundry Alert** | Vendor feed | Status, alerts, busy-hours charts, favorite halls | – |
| **MIT Random Hall Laundry Server** | Sensors, open source | Free/Busy/🔒broken states, notify when free | – |
| **NUS RC4 Laundry Bot** (Telegram) | **Crowdsourced via per-machine QR codes** (scan on load, scan on collect) | Availability | Closest to our concept. Weak point: depends on people scanning twice. |
| **CycleTag** (Gordon College) | QR scan + estimated time | Done-notifications, anonymous in-app messaging to the load's owner | – |
| **FixMyStreet / SeeClickFix** | Crowd reports | Duplicate suggestions ("already reported — confirm?"), "me too" upvotes, public open/fixed states | We copy these for broken machines. |
| Busy-hours studies (Harvard HODP, Binghamton, Stanford Daily) | Logged vendor data | Busy-time heatmaps | Patterns differ per building, so compute per room. |

**Lessons:**
1. Stale data kills trust. Every status shows its age and decays on its own.
2. Friction kills participation. No login, no app install, the QR code lands directly on the machine.
3. Show broken reports publicly, with a time and a confirmation count. Students trust what they can see.
4. Duplicate reports should become confirmations ("Still broken?" / "Works now").
5. **No existing tool crowdsources the best dryer setting.** That is our differentiator.

### 2.4 Stack (details in §10)

- **Next.js (App Router, TS) + Tailwind + Drizzle ORM + SQLite/libSQL.** Local file DB for development, Turso in production.
- **Host on Vercel Hobby.** Fallback: Cloudflare Workers via OpenNext.
- **Free tiers are ample:**
  - Turso free: 5 GB, 500M row reads and 10M writes per month.
  - Vercel Hobby: about 1M edge requests per month.
- **Vercel Hobby is for non-commercial use only.** Fine for a free student project; switch to Cloudflare if a club or department officially sponsors it.
- **Rejected alternatives:**
  - Supabase: pauses after 7 idle days, which would hit over school breaks.
  - Fly.io: no free tier anymore.
  - Netlify: its credit cap pauses sites when credits run out.

### 2.5 UI/UX
Patterns we borrow:
- Apple Find My / Uber bottom sheets with detents.
- Transit-app relative times and confidence hints.
- Apple Weather / MTA glanceable "one big value".
- Statuspage-style summaries ("1 of 6 dryers down").
- Vercel Geist tinted pills.
- Linear's equal-lightness status hues.

Each status gets a distinct **shape, glyph and label**, never color alone. Palette with computed WCAG contrast in §9.

**Sources** (full list in Appendix A).

---

## 3. Feature list

### MVP (this PR)
- Multi-building / multi-room data model; seed data for Hedrick Summit.
- **Room page:**
  - Machine cards (status badge + recommended-setting chip + last report age).
  - Summary line ("5 of 6 dryers working").
  - Washers / dryers filter.
- **Machine page:**
  - Status hero with confidence.
  - Recommended setting with a per-setting "heat ladder".
  - Warnings.
  - Recent reports.
  - WASH service and refund links.
- **3-tap report bottom sheet**, auto-opened from the QR code (`/m/{code}?r=1`), with an undo toast.
- **Duplicate-aware reporting:** when a machine is already flagged, the sheet leads with "Still broken?" and "Works now".
- **Status and recommendation algorithm** with time decay, per-device de-duplication, and an admin override (§6).
- **Anonymous device cookie**, hashed-IP rate limits, honeypot (§11).
- **Admin** (password):
  - Create buildings and rooms.
  - Bulk-add machines.
  - Rename or retire machines.
  - Mark out of order / mark fixed.
  - Hide reports.
  - **Print QR sheet.**
- Design system: tokens, dark mode, skeleton loaders, motion with reduced-motion support.
- Read-only JSON API; unit tests for the algorithm; README with deploy steps.

### v1 (next)
- Optional **school-email magic link** (Better Auth + Resend) for a trust boost and "my reports".
- ✅ Cloudflare **Turnstile** on report submit (invisible), turned on by setting two env vars.
- ✅ **"I started it" timer**: done-at estimate and "in use until ~3:40" on the card. Crowdsourced free/busy, auto-expiring. Pre-fills the room's minutes per payment (dryers) or a site-wide default; the newest tap wins; reporting how it went, or "Stop timer", ends your own. Stored in `machine_runs`; logic is `currentRun` in `src/lib/status.ts`.
- ✅ **Notify me** when a broken machine is marked fixed (Web Push via PWA, §17).
- ✅ **"Notify me when it's done"** on your own "I started it" timer: one push when the estimate runs out (§18).
- ✅ **Fabric-aware tips** ("Athletic wear? Use Low on this machine"): the "What's in your load?" picker (§6.7), with thickness, learning from residents' recorded loads per fabric and thickness.
- ✅ **Laundry helper chat**: describe the clothes in your own words, get the machine and setting (§6.8). Only on once an admin saves an Anthropic API key in Settings (or `ANTHROPIC_API_KEY` is set).
- ✅ Room-level fallback recommendation (§6.4).
- ✅ Outlier detection: "Dries worse than the other dryers here" with a link to WASH's service request (§6.5). Still to do: pre-filled service request.
- ✅ PWA manifest + add-to-home-screen. Still to do: favorite room.
- ✅ Manual theme toggle (Auto / Light / Dark). Still to do: Spanish / Chinese / Korean i18n.
- ✅ Admin: moderation queue for flagged reports (§19), CSV export, report counts over time.

### Later
- ✅ Busy hours from our own timer events (§6.10).
- ✅ "Same here" / "Not for me" on individual reports (§6.9).
- Multi-tenant self-serve onboarding for other campuses (a campus admin role).
- Licensed WASH status integration, *only with written permission*.
- Optional hardware sensor feed (current clamp) behind the same `reports` pipeline.
- Anonymous "your laundry is done, please collect it" pings to *whoever* started a machine, sent by the next person waiting (CycleTag-style). (Pinging yourself is done: §18.)

---

## 4. Data model

SQLite / libSQL through Drizzle. All IDs are text (`nanoid`-style); timestamps are unix ms integers.

```
buildings
  id            text pk
  slug          text unique          -- "hedrick-summit"
  name          text                 -- "Hedrick Summit"
  campus        text null            -- "UCLA"
  created_at    int

rooms
  id            text pk
  building_id   text fk → buildings  (cascade)
  slug          text                 -- "laundry-2f"   unique(building_id, slug)
  name          text                 -- "2nd floor laundry"
  location_hint text null            -- "Next to the elevators, 2nd floor"
  wash_location_code text null       -- WASH-Connect 8-digit room code (display only)
  created_at    int

machines
  id            text pk
  room_id       text fk → rooms (cascade)
  code          text unique          -- short public code in QR URL: "k7p2xq"
  kind          text enum            -- 'washer' | 'dryer'
  label         text                 -- "Dryer 3" (matches physical sticker)
  wash_machine_number text null      -- number printed by WASH, for service requests
  position      int                  -- sort order in the room grid
  admin_state   text enum null       -- null | 'out_of_order'
  admin_note    text null            -- "Waiting on WASH tech, ticket #1234"
  status_reset_at int null           -- "mark fixed": status ignores reports before this
  retired_at    int null
  created_at    int

reports
  id            text pk
  machine_id    text fk → machines (cascade)
  created_at    int
  outcome       text enum            -- see below
  setting       text enum null       -- dryer: high|medium|low|delicates|no_heat
                                     -- washer: hot|warm|cold
  symptoms      text (json array)    -- see below, [] if none
  error_code    text null            -- ≤ 8 chars, uppercased ("OE", "F21")
  minutes       int null             -- minutes paid/run (optional)
  load_size     text enum null       -- small|medium|full|overstuffed
  fabrics       text (json array) null -- everyday|towels|jeans|athletic|delicates|wool|prints (v1, §6.7)
  thickness     text null              -- thin|regular|thick (pilot, §6.7)
  note          text null            -- ≤ 280 chars, shown publicly
  device_hash   text                 -- sha256(device cookie + secret)
  ip_hash       text                 -- sha256(ip + day + secret); rate limiting only
  trust         real default 1.0     -- 1 anon, 2 verified email (v1), 3 admin
  damaged_items text (json array) null -- on "damaged": which FABRICS got damaged (v1, §5)
  damage_kinds  text (json array) null -- on "damaged": melted|shrunk|lost_stretch|print_cracked|scorched|felted|color_bled|torn
  hidden_at     int null             -- moderation
  index(machine_id, created_at), index(device_hash, created_at), index(ip_hash, created_at)
```

**Enums:**

- **Dryer outcome:** `dry` · `damp` · `wet` · `too_hot` · `damaged` · `not_working`
- **Washer outcome:** `good` · `soaking` (didn't spin) · `dirty` · `damaged` (v1) · `not_working`

`report_votes` (pilot, §6.9): `report_id` fk → reports (cascade) · `device_hash` · `ip_hash` · `vote` same|different · `created_at`; unique (report_id, device_hash).

`report_photos` (v1): `report_id` pk/fk → reports (cascade) · `mime` · `bytes` blob · `created_at`. One optional load photo per report, downscaled on the phone (≤ 1024 px JPEG, ≤ 400 KB, usually 80–200 KB) and re-encoded, which strips EXIF/GPS. Kept in the database so it works with no file storage, locally or on Turso.
- **Washer symptoms:** `took_money` · `wont_start` · `door_lock` · `wont_drain` · `no_spin` · `leaking` · `no_hot_water` · `stopped_midcycle` · `loud` · `dispenser` · `error_code` · `other`
- **Dryer symptoms:** `took_money` · `wont_start` · `no_heat` · `too_hot` · `not_tumbling` · `stopped_early` · `burnt_smell` · `lint_screen` · `door` · `loud` · `error_code` · `other`

**Symptom severity (decision):**
- `broken`: took_money, wont_start, door_lock, wont_drain, no_spin, leaking, no_heat, not_tumbling, burnt_smell, door
- `caution`: everything else

Derived values (status, recommendation) are **computed at read time** from the last 60 days of visible reports. That is cheap at our scale: a room is about 12 machines × tens of reports. If it ever gets slow, cache per machine in a `machine_stats` table, updated on write. The algorithm is a pure function (`src/lib/status.ts`) and unit-tested.

---

## 5. Report flow semantics

Each report is one sentence: *"I used **this machine** on **this setting** and it came out **this way**"* or *"**This machine** didn't work: **symptoms**."*

| Outcome | Status evidence | Setting evidence (dryers) |
|---|---|---|
| `dry` / `good` | ok 1.0 | good 1.0 at setting |
| `damp` | ok 1.0; caution 0.5 if setting was High | under 0.5 |
| `wet` | caution 0.5; caution 1.0 if High or Medium | under 1.0 |
| `too_hot` | caution 0.6 (0.3 if High) | over 0.7, good 0.3 |
| `damaged` | caution 1.0 (0.5 if High) | over 1.5 |
| `soaking` / `dirty` / `damaged` (washer) | caution 1.0 ("Damaged clothes" for `damaged`) | – |
| `not_working` | broken 1.0 if any broken-severity symptom (or none given), else caution 1.0 | – |

Reasoning:
- "Wet on Low" is a settings problem, not a broken machine.
- "Wet on High" suggests no heat.
- "Too hot on Low" is a machine problem ("runs hot"): caution.

---

## 6. Algorithm: status and best setting

### 6.1 Weights
For each visible report *r* with age *a*:

```
w(r) = trust(r) · 0.5^(a / H)
H_status  = 72 h   (broken/works evidence halves every 3 days)
H_setting = 21 d   (dryer character changes slowly; thermostats and ducts drift)
```

- Reports before `machine.status_reset_at` are ignored for **status**. They still count for settings, because a "fix" rarely changes how hot a dryer runs.
- **Per-device de-duplication:** for status, only each device's *latest* report counts. For settings, only each device's latest report *per setting* counts. One person spamming "broken" counts once.
- **Recency tiebreak:** the single most recent report gets ×1.5 on status. When one person reports broken and a later person says it works, the later report wins the tie.

### 6.2 Status
```
B = Σ w·broken, C = Σ w·caution, O = Σ w·ok, W = B + C + O

if admin_state = out_of_order         → BROKEN (source: admin)
if W < 0.25                           → UNKNOWN (hint: last report's outcome & age, if any)
if B ≥ 0.5 and B / W ≥ 0.6            → BROKEN
if (B + C) ≥ 0.4 and (B + C) / W ≥ 0.3 → CAUTION   (label: "Mixed reports" if B dominates, else top issue)
else                                  → WORKS

confidence = W < 1 → low | W < 3 → medium | else high
```

The badge's **headline reason** is the top-weighted symptom or outcome among non-ok evidence, e.g. "No heat", "Runs hot", "Won't drain".

Examples:
- One fresh `not_working/no_heat` → BROKEN.
- 3 days later with no other reports (w = 0.5) → still BROKEN.
- About 7 days later (w < 0.25) → UNKNOWN, with "last report: broken, 7d ago".
- Broken 6 h ago, then "works" now → B = 0.94, O = 1.5 → CAUTION "Mixed reports".
- Admin "mark fixed" → old broken reports are ignored → UNKNOWN until the next report.

### 6.3 Recommended dryer setting
Heat ladder `L = [no_heat, delicates, low, medium, high]` (index 0 to 4).

```
for each setting s: G[s], U[s], O[s] = Σ w_setting · (good, under, over evidence)

# monotonic propagation (physics: less heat never dries better; more heat never runs cooler)
for each s with U[s]: add 0.5·U[s] to U at every lower setting
for each s with O[s]: add 0.5·O[s] to O at every higher setting

n[s]     = G + U + O
pGood[s] = (G + 0.5) / (n + 1.5)          # Beta-ish prior, ≈0.33 with no data
pOver[s] = O / (n + 1.5)
pUnder[s]= U / (n + 1.5)

candidates = { s : n[s] ≥ 0.5 and pOver[s] < 0.25 }
best = argmax pGood over candidates; ties within 0.05 → lower heat (safer for clothes)

if best exists and pGood[best] ≥ 0.5  → RECOMMEND best
                                         tip "may need extra time" if pUnder[best] ≥ 0.3
elif some candidates, all mostly under → RECOMMEND the highest non-hot setting + "add extra time"
                                         (status gets a "weak heat" hint)
else                                   → DEFAULT "Medium" with confidence "none"
                                         ("No reports yet: start with Medium")

avoid = { s : O[s] ≥ 0.5 and pOver[s] ≥ 0.35 }  → "Avoid High: runs hot (2 reports)"
confidence = Σ n near best: <1 low, <3 medium, else high
```

**Why this design:**
- **Safety first:** among equally good settings we pick the cooler one.
- **Propagation** makes a few reports go further. "Too hot on Medium" also warns about High; "wet on Medium" also says Low won't work.
- **The prior** keeps a single report from producing a "high confidence" recommendation.
- It is **explainable**: the machine page shows the heat ladder with counts per setting, so students can see *why*.

### 6.4 Room fallback for untested dryers *(added in v1)*
A dryer with no setting reports borrows from its siblings in the same room, so a new or unpopular dryer doesn't just say "Try Medium":

```
informed = sibling dryers whose recommendation is report-based with confidence ≥ low
if |informed| ≥ 2:
    suggest the LOWER median of their settings (cooler pick when the room is split)
    show the range: "The other 4 dryers here range Low–High; start in the middle."
```
The lower median, not the majority, keeps the safety-first rule: an untested dryer may be the one that runs hot. Retired machines don't vote. Implemented in `applyRoomFallback` (`src/lib/status.ts`).

### 6.5 Outlier dryers *(added in v1)*
A dryer that leaves clothes damp at Medium/High far more often than its room-mates probably has a vent or heater fault, which no setting tweak fixes. It is flagged with a link to WASH's service request.

```
per dryer: latest report per device, Medium/High only, drying outcomes only (dry=0, damp=0.5, wet=1),
           weighted with the 21-day setting decay -> rate = damp-weight / total-weight
flag if   reports ≥ 3   and   rate ≥ 0.45
     and  sibling pooled weight ≥ 4 from ≥ 2 dryers   and   sibling rate ≤ 0.25
     and  rate - sibling rate ≥ 0.30
```
Deliberately conservative: Low and Delicates are ignored (damp is expected there), broken dryers are excluded (their wet loads say nothing about the rest), and if the whole room is weak nothing is flagged, since that points at the room. Implemented in `detectWeakDryers` (`src/lib/status.ts`).

### 6.6 Washers
Status only. Washer settings are recorded (hot/warm/cold) but not learned from reports; §6.7 suggests a water temperature from the load's fabrics.

### 6.7 Load-based suggestions *(added in v1)*
An optional "What's in your load?" card on every machine page. The resident taps fabrics (Everyday cotton, Towels & bedding, Jeans, Athletic / stretch, Delicates, Wool & sweaters, Graphic tees), how thick most of it is (Thin: tees, leggings, silk / Regular / Thick: hoodies, towels, denim) and how full the drum is (Small / Medium / Full / Packed, washers and dryers). It never adds a step to reporting: the picks are kept on the phone and pre-fill the report's "More details".

**In the report** *(v1)*: a "Damaged clothes" report (dryers and washers) asks, optionally, *what* got damaged (the same fabric chips) and *how* (Melted or shiny, Shrunk, Lost stretch, Print cracked, Scorched or yellowed, Felted or pilled, Colors bled, Torn or snagged). Any non-broken report can carry one optional photo of the load, to show how full the drum was. Photos are admin-only by default (Settings → "Show load photos publicly"), served by `/api/photos/[id]`; a hidden or undone report's photo is always admin-only.

Each fabric has two admin-editable limits (Settings → Load advice): the hottest dryer setting and the hottest wash water. Defaults come from the fabric table in §2.2:

| Fabric | Dryer max | Wash max |
|---|---|---|
| Everyday cotton | High | Warm |
| Towels & bedding | High | Hot |
| Jeans | Medium | Cold |
| Athletic / stretch | Low | Cold |
| Delicates | Delicates | Cold |
| Wool & sweaters | No heat | Cold |
| Graphic tees | Low | Cold |

```
dryer:  base    = this dryer's recommendation (§6.3/6.4), or the no-data default
        limit   = coolest "dryer max" among the picked fabrics
        pick    = hottest setting the room offers that is ≤ min(base, limit) and not in this dryer's "avoid" list
                  (if none is cool enough: the coolest offered, and "hang the wool to dry instead")
        tips    = "expect it to take longer" and "or dry the athletic wear separately and the rest on <base>" when pick < base;
                  full / small load hints; care tips (prints inside out, wool flat)
washer: pick    = coolest "wash max" among the picked fabrics; "Mixed load: Cold is safe for all of it"
```
Starting from the machine's own learned setting is the point: "Low" on a dryer that runs hot is cooler than on its neighbour, and a dryer that dries fine on Low never gets pushed to High for towels. Implemented in `suggestForLoad` (`src/lib/load-advice.ts`), unit-tested.

Reports record the fabrics and thickness (`reports.fabrics`, `reports.thickness`, both optional, pre-filled from the picker).

**Thickness.** Thick loads get "Thick items take longer: check seams, hoods and pockets"; thin loads on Medium or hotter get "Thin items dry fast: check it early"; a thick washer load gets "leave extra room so they rinse and spin out". On its own, thickness never changes the setting; learning does.

**Learning** *(added for the pilot; Settings → Load advice)*. The room's recent dryer reports that say what was in the load are tallied per fabric, per thickness and per setting: loads, loads that came out too hot or damaged, and loads that came out damp or wet (`learnFabricOutcomes`). A damaged report that says *what* got damaged only blames those fabrics. Reports residents voted down to zero (§6.9) are skipped. Then, after the rules above pick a setting:

```
counts(f, s) = this fabric at this thickness on setting s, if it has ≥ "loads needed" (default 3); else any thickness; else nothing
too hot:  while some fabric's counts at the pick say too hot in ≥ "share that must agree" (default 0.5) of loads:
            go one cooler (skipping settings that run hot here); none left → "hang them to dry instead"
damp:     else if some fabric's counts at the pick say damp in ≥ that share:
            go one hotter if it's offered, within every fabric's limit, not in the dryer's avoid list and not itself
            "too hot" by the counts; otherwise keep the pick and add "Add about 15 minutes, or split it into two loads"
why:      "Residents here say thick everyday clothes came out damp on Medium (3 of 4 loads), so go one hotter."
```
So a thick cotton hoodie that keeps coming out damp on Medium moves to High, but jeans never go above their limit, and what thick loads taught doesn't apply to a thin load once thin loads have their own data. Counts are room-wide (the dryer's own heat is already in its base setting). The laundry helper passes thickness through `plan_load` and uses the same learning.

### 6.8 Laundry helper chat *(added in v1)*
An "Ask the laundry helper" card on room and machine pages. The resident types what they're washing ("gym leggings and a white hoodie") and gets which washer and dryer to use and on what setting, with links to those machines. Optional: it never touches reporting, and the page works the same without it.

Claude (Anthropic's API) only does the language part. It maps the description onto the seven fabric categories of §6.7 and calls one tool, `plan_load`, which runs on our server:

```
plan_load(fabrics, size, thickness):
  for washers and for dryers:
    ranked  = usable machines, best first: Works > No reports > Caution (Broken left out);
              weak dryers (§6.5) sink; more confident setting data wins; ties go to the machine the resident is at
    pick    = suggestForLoad(kind, load, fabric limits, ranked[0].recommendation, room's offered settings, learning)   -- §6.7
    also    = the other usable machines, the broken ones to avoid, and the setting for the machine the resident
              is standing at if it isn't the best one
```
So every setting the helper names comes from the admin's fabric limits and this room's reports, never from the model. The system prompt lists the room's machines, status and dryer settings; tells Claude to call `plan_load` before recommending anything, to ask one question when the load is unclear, to flag dry-clean-only or leather, to keep answers to a few sentences, and to decline off-topic questions. The helper's reading of the load also fills in "What's in your load?" on the machine page (and so the report sheet).

- **Model**: Claude Opus 5.5 at low effort (short chat answers); `ANTHROPIC_MODEL=claude-sonnet-5-5` halves the cost. If a safety filter declines, the API's default fallback model retries.
- **Stateless**: the browser sends the last 12 turns (600 characters each) with every question; nothing is stored.
- **API key**: pasted in Admin → Settings → "Laundry helper API key". It's checked with Anthropic before saving (a free model lookup, no tokens), stored AES-GCM-encrypted with a key derived from `SESSION_SECRET` in the `settings` table under `secret.anthropicApiKey`, and never sent back to the browser (the page shows only its last four characters). "Test key" re-checks it; "Remove key" hides the helper again. "Reset everything to defaults" keeps it. `ANTHROPIC_API_KEY` in the environment wins when set. Rotating `SESSION_SECRET` makes a saved key unreadable, so it has to be saved again (`src/lib/api-key.ts`, `src/lib/secret-box.ts`).
- **Limits** (Settings → Laundry helper chat): on/off, questions per network per hour (default 20), questions per day for the whole site (default 1,000). Counted in memory per server process, so a restart resets them.
- Code: `src/lib/assistant.ts` (prompt, tool, ranking; pure, unit-tested), `src/lib/assistant-server.ts` (the Claude call), `POST /api/assistant`, `src/components/laundry-helper.tsx`. E2E runs against a local stand-in for the API (`tests/e2e/mock-anthropic.mjs`).

### 6.9 "Same here" / "Not for me" *(added for the pilot)*
Under each report on a machine page, other residents can tap **Same here** or **Not for me** (one tap, no login; not on your own report; tapping again takes it back; one vote per device per report, capped per device and per network per day like reports). Votes change the report's weight everywhere it counts (status, best setting, weak-dryer detection, load learning):

```
weight = trust × clamp(1 + same × "Same here" weight − different × "Not for me" weight, 0, "most a report can count")
defaults: 0.5, 0.5, 2.5   → two "Same here" double it; two more "Not for me" than "Same here" and it's ignored
```
Each "Same here" on a broken report also counts as another device toward "Reports needed to mark Broken" (unless the "Same here" weight is 0), so a second resident can confirm a breakdown without filing their own report. Implemented as `votedTrust` in `src/lib/status.ts`, applied when reports are loaded (`src/lib/queries.ts`); the action is `voteOnReport`.

### 6.10 Busy hours *(added for the pilot)*
A "When is it busy?" card on the room page: a bar per hour (6am to midnight) for each weekday, today first, plus "Right now: usually quiet / busy / packed" and "Quietest later today: 9–11am". Built from the room's "I started it" timers over the last few weeks (Settings → "I started it" timer: on/off, look-back weeks, taps needed before it shows):

```
for each timer: from start until it was stopped (or its estimate ran out), split across local hours → machine-hours per weekday × hour
share(day, hour) = machine-hours ÷ (how many of that weekday the look-back covers) ÷ machines in the room
level: quiet < 0.25 ≤ busy < 0.6 ≤ packed
```
Local time uses Settings → Site → Time zone (default America/Los_Angeles). It's only as good as the taps, so it stays hidden until the room has enough of them (default 20). Code: `src/lib/busy.ts` (pure, unit-tested), `busyForRoom` in `src/lib/queries.ts`, `src/components/busy-hours.tsx`.

---

## 7. Pages and routes

| Route | Type | Purpose |
|---|---|---|
| `/` | server | Opens the only room when one building has one room (the Hedrick Summit pilot). One building with several rooms lists just its rooms; the building picker only appears once a second building has rooms. Buildings without rooms are ignored. The room page drops its back link when `/` would only loop back to it (`src/lib/home.ts`). |
| `/b/[building]/[room]` | server + small client filter | Room grid (§9.6 wireframe A), busy hours (§6.10) |
| `/m/[code]` | server + client sheet | Machine detail (B). `?r=1` opens the report sheet (C). This is the QR target. |
| `/about` | static | How it works, privacy, "not affiliated with WASH" |
| `/admin/login` | server action | Password login |
| `/admin` | server | **Dashboard**: report trends, top problems, machines needing attention, per-room overview, rules in effect, recent admin activity |
| `/admin/rooms` | server | Buildings and rooms: create, rename, delete (type-the-name confirmation) |
| `/admin/rooms/[id]` | server | Room settings (**which dryer settings the room has**, minutes per payment, WASH code); machines: add in bulk, rename, out-of-order, mark fixed, retire; recent reports; delete room |
| `/admin/reports` | server | Global moderation: search and filter, hide/unhide one or many; `?state=flagged` is the Flagged queue with Keep (§19) |
| `/admin/reports/export` | route handler | CSV download of the filtered reports (admin only) |
| `/admin/settings` | server + client form | Every tunable rule, live (see §16) |
| `/admin/audit` | server | Activity log of all admin actions |
| `/admin/rooms/[id]/qr` | server, print CSS | Printable QR sticker sheet (Letter, 3×4) |

### API
Mutations are **Server Actions**: progressive enhancement, no hand-written fetch code.

- `submitReport(formData)`: validates with zod, rate-limits, inserts, `revalidatePath` on room and machine.
- `undoReport(id)`: only the same device, within 5 minutes.
- `watchForFix(code, subscription)` / `stopWatchingForFix(code, endpoint)` / `isWatchingForFix(code, endpoint)`: "notify me when it's fixed" (§17).
- `alertWhenDone(runId, subscription)` / `cancelRunAlert(runId)`: "notify me when it's done" on your own timer (§18).
- `flagReport({ reportId, reason })` / `unflagReport(reportId)`: "Flag this report" (§19). Admin: `keepReport`.
- Admin actions: `createBuilding`, `createRoom`, `addMachines`, `updateMachine`, `setOutOfOrder`, `markFixed`, `retireMachine`, `hideReport`, `login`, `logout`.

Read-only JSON for widgets, bots and future apps:
- `GET /api/rooms/[roomId]`: `{ room, machines: [{ code, label, kind, status, recommendation }] }`
- `GET /api/machines/[code]`: machine + status + recommendation + recent visible reports (no hashes)

Laundry helper (§6.8):
- `POST /api/assistant` with `{ roomId, machineCode?, messages: [{ role, content }] }` → `{ reply, plan: { load, picks } | null }`. 404 when the helper is off or unconfigured, 429 over the limits.

---

## 8. Tech stack (decision) and deployment

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 App Router, TypeScript** | Server components give fast first paint with no client fetch waterfall. Server Actions for forms. Largest ecosystem for student maintainers. |
| Styling | **Tailwind v4 + CSS variables** | Design tokens live in CSS custom properties, so light and dark themes are just token swaps. |
| DB | **SQLite (libSQL)** via `@libsql/client` + **Drizzle ORM** | One file locally, Turso in production (free: 5 GB, 500M reads/month). The SQLite dialect also ports to Cloudflare D1. |
| Validation | zod | Shared schemas for actions and API. |
| QR | `qrcode` → server-rendered SVG | Crisp at any print size; no client JS. |
| Auth | Anonymous device cookie; `ADMIN_PASSWORD` + HMAC-signed admin cookie | Zero friction for students. One secret for the admin. School-email magic link in v1. |
| Tests | Vitest (algorithm, validation) + Playwright smoke (mobile viewport) | – |
| Hosting | **Vercel Hobby** (fallback: Cloudflare Workers via OpenNext) | Git push deploys, preview URLs, free. Hobby is non-commercial only. |

**Deploy (full steps in README):**
1. `turso db create dorm-laundry` and `turso db tokens create dorm-laundry`.
2. In Vercel, import the GitHub repo and set these env vars:
   - `DATABASE_URL=libsql://…`
   - `DATABASE_AUTH_TOKEN`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET` (32+ random bytes)
   - `PUBLIC_BASE_URL`
3. Run `npm run db:migrate` against Turso (from a laptop or a CI step), then optionally `npm run db:seed`.
4. Deploy. Log in at `/admin`, add rooms and machines, print QR sheets.
5. Place Vercel functions in the region nearest the Turso primary (e.g. `sfo1` / `aws-us-west-1` for UCLA).

---

## 9. UI design system

### 9.1 Principles
1. **Answer first.** The machine page's first screen answers "does it work, and which setting?" in type you can read at arm's length.
2. **One-handed.** Primary actions sit in the bottom 40% of the screen (thumb zone). The header is information only.
3. **Never color alone.** Every status = shape + glyph + word (+ color).
4. **Honest about uncertainty.** Always show "N reports · 12 min ago". Stale data fades to Unknown.
5. **Fast and calm.** Server-rendered; skeletons only if loading takes more than about 300 ms; motion is subtle and turned off under reduced-motion.

### 9.2 Color tokens (WCAG contrast computed)

**Neutrals**

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--bg` | `#F6F7F9` | `#0B0D10` | page |
| `--surface` | `#FFFFFF` | `#16191E` | cards, sheet |
| `--surface-2` | `#F0F2F5` | `#1E2228` | chips, skeletons, pressed |
| `--text` | `#111827` | `#F3F4F6` | 17.7:1 / 16.0:1 on surface |
| `--text-2` | `#4B5563` | `#AEB4BE` | 7.6:1 / 8.5:1 |
| `--text-3` | `#6B7280` | `#8B929C` | 4.8:1 / 5.6:1: timestamps |
| `--border` | `#E4E7EC` | `#2A2F37` | decorative |
| `--border-strong` | `#8A94A3` | `#8B929C` | inputs, ≥3:1 |
| `--accent` | `#2E5BFF` | `#8AA4FF` | links, focus, primary button (white on accent 5.2:1) |

**Status** (text on its own tint passes AA ≥ 4.5; icons ≥ 3:1 on surface)

| Status | Shape / glyph | Light fg / tint / icon | Dark fg / tint / icon |
|---|---|---|---|
| **Works** | circle ✓ | `#067647` / `#E7F6EC` / `#079455` (5.09:1) | `#6CE9A6` / `#0F2E1F` / `#32D583` (9.67:1) |
| **Caution** | triangle ! | `#8A4B00` / `#FEF3DC` / `#C4620A` (6.18:1) | `#FDC96B` / `#33240A` / `#F5A524` (9.83:1) |
| **Broken** | octagon × | `#B42318` / `#FDECEA` / `#D92D20` (5.75:1) | `#FDA29B` / `#3A1512` / `#F97066` (8.35:1) |
| **Unknown** | dashed circle ? | `#475467` / `#EEF0F3` / `#667085` (6.73:1) | `#C0C6D0` / `#23272E` / `#8B929C` (8.73:1) |

- In dark mode the tints are nearly as dark as the surface, so badges get a 1px border in the icon color at 40% alpha.
- Works vs Broken also differ in lightness, so they stay distinct under deuteranopia and protanopia.

### 9.3 Type scale
System stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. No web-font download, for speed. Numbers use `tabular-nums`. Sizes in rem.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| display | 32/38 | 700 | status hero ("Works") |
| title | 22/28 | 650 | page and machine titles |
| headline | 17/24 | 600 | card titles |
| body | 16/24 | 400 | body; inputs never < 16px (prevents iOS zoom) |
| label | 14/20 | 500 | chips, badges, buttons |
| caption | 12/16 | 500 | timestamps, counts |

### 9.4 Spacing, radius, elevation, motion
- **Spacing** (4px base): `4 8 12 16 20 24 32 40 48 64`. Page gutter 16; card gap 12; sheet padding 20.
- **Radius:** `xs 6` inputs · `sm 10` chips in cards · `md 14` cards · `lg 20` sheet top corners · `pill 9999`.
- **Elevation:**
  - e1 cards: `0 1px 2px rgb(16 24 40/.06), 0 1px 3px rgb(16 24 40/.10)`
  - e2 toast: `0 8px 24px rgb(16 24 40/.12)`
  - e3 sheet: `0 -8px 32px rgb(16 24 40/.18)`
  - Dark mode shows depth with lighter surfaces instead of shadows.
- **Motion:**
  - press 100 ms; chip/hover 150 ms; toast 250 ms; sheet 350 ms `cubic-bezier(.32,.72,0,1)`
  - enter `cubic-bezier(.2,.8,.2,1)`; exit `cubic-bezier(.4,0,1,1)`
  - Cards fade up with a 30 ms stagger (max 8).
  - Under `prefers-reduced-motion: reduce`: no slides or shimmer, 150 ms opacity only.

### 9.5 Components
- **StatusBadge.** Pill, 28px tall, 10px horizontal padding.
  - 16px status icon (shape) + label, weight 600, status fg on status tint.
  - Variants: `sm` (cards) and `lg` (hero, 40px, with reason).
  - Unknown uses a dashed outline.
- **SettingChip.** Neutral pill (`surface-2` + border) with a thermometer icon, "Medium", and a confidence dot-meter (●●○) with an accessible label ("based on 4 reports").
  - Warning variant: amber outline, "Avoid High".
  - "No data" variant: dashed outline, "Try Medium".
  - Kept visually distinct from the status badge.
- **MachineCard.**
  - Minimum height 88px; the whole card is one link.
  - Left: 44px status icon tile (tint).
  - Middle: label (headline) + reason · "12m ago" (caption).
  - Right: SettingChip for dryers, kind icon for washers.
  - Accessible name: "Dryer 3, Broken: no heat, reported 12 minutes ago. Recommended Medium."
  - Pressed state scales to 0.98.
- **HeatLadder.** On the machine page. Five rows (High to No heat), each with a stacked bar (good / under / over counts) and a ★ on the recommended row.
- **ReportSheet.**
  - Modal bottom sheet: grab handle 36×5, top radius 20, safe-area padding, max height 90dvh.
  - Step 1: 2×2 or 3×2 grid of 64px outcome tiles (icon + label).
  - Step 2: setting segmented control (dryer) or symptom chips (not working).
  - "More details" disclosure: minutes, load size, error code, note.
  - Sticky 52px Submit button in the thumb zone.
  - Focus trapped; Esc, backdrop tap or swipe down closes; focus returns to the trigger.
  - If the machine is currently BROKEN or CAUTION, the sheet leads with "Still broken?" / "Works now" quick buttons (1 tap + submit).
- **Toast.** Bottom, above the safe area, `role="status"`. "Thanks! Report saved." with an Undo button (44px) for 6 s.
- **Skeleton.** Card-shaped blocks in `surface-2` with a 1.2 s shimmer (off under reduced motion); `aria-busy` on the list.
- **Buttons.** Primary (accent fill), secondary (surface + border), ghost. Height 48 (52 in the sheet); focus ring 2px accent with a 2px offset (`:focus-visible`).

### 9.6 Wireframes

**A. Room grid** (`/b/hedrick-summit/laundry`)
```
┌─────────────────────────────────────┐
│ ‹ Hedrick Summit                    │  ← small back link
│ Laundry room                        │  ← title
│ 2nd floor, by the elevators         │  ← caption
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ✓ 7 working  ▲ 1 caution  ✕ 1   │ │  ← summary strip (counts + shapes)
│ └─────────────────────────────────┘ │
│  [ All ][ Washers ][ Dryers ]       │  ← segmented control (sticky)
│                                     │
│ DRYERS                              │
│ ┌─────────────────────────────────┐ │
│ │ (✓)  Dryer 1          [🌡 Med ●●○]│ │
│ │      Works · 2h ago             │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ (▲)  Dryer 2          [🌡 Low ●●●]│ │
│ │      Runs hot · 1d ago          │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ (✕)  Dryer 3          [   —    ]│ │
│ │      Broken: no heat · 3h ago   │ │
│ └─────────────────────────────────┘ │
│ WASHERS                             │
│ ┌──────────────┐ ┌──────────────┐   │  ← 2-col grid ≥ 360px wide
│ │(✓) Washer 1  │ │(?) Washer 2  │   │
│ │ Works · 5h   │ │ No reports   │   │
│ └──────────────┘ └──────────────┘   │
│                                     │
│  Scan the sticker on a machine to   │
│  report how it went.                │
└─────────────────────────────────────┘
```

**B. Machine detail** (`/m/k7p2xq`)
```
┌─────────────────────────────────────┐
│ ‹ Laundry room · Hedrick Summit     │
│ Dryer 2                     #D-02   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ▲  Caution                      │ │  ← display-size status hero, tinted
│ │    Runs hot on Medium           │ │
│ │    5 reports · last 1d ago ●●○  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Best setting                        │
│ ┌─────────────────────────────────┐ │
│ │ 🌡  LOW        ★ recommended    │ │
│ │ Dries in ~1 cycle · 4 reports   │ │
│ │ ⚠ Avoid High: runs hot (2)      │ │
│ │                                 │ │
│ │ High     ██████░░ too hot  2    │ │  ← heat ladder
│ │ Medium   ███▒▒░   mixed    3    │ │
│ │ Low ★    █████    dry      4    │ │
│ │ Delicate ▒▒       damp     1    │ │
│ │ No heat  ·        no data       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Recent reports                      │
│  ✓ Low · Dry · 45 min · 1d ago      │
│  ▲ Medium · Too hot · 2d ago        │
│    "waistband melted a bit"         │
│  ✓ Low · Dry · 3d ago               │
│  Show more                          │
│                                     │
│ Broken? Get your money back →       │  ← WASH refund / service links
│                                     │
│ ┌─────────────────────────────────┐ │
│ │        Report how it went       │ │  ← sticky bottom CTA, 52px
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**C. 3-tap report from a QR code** (`/m/k7p2xq?r=1`, the sheet opens over B)
```
Tap 1 (outcome)                    Tap 2 (setting)                    Tap 3
┌───────────────────────────┐     ┌───────────────────────────┐      ┌─────────────────────┐
│          ───              │     │ ‹  Dryer 2 · Too hot      │      │                     │
│ Dryer 2: how'd it go?     │     │ Which setting?            │      │  ✓ Thanks! Saved.   │
│ ┌──────────┐┌──────────┐  │     │ ┌───┬────┬───┬────┬────┐ │      │  Dryer 2 → Caution  │
│ │ ✓  Dry   ││ ≈ Damp   │  │ ──► │ │Hi │Med │Low│Deli│None│ │ ──►  │          [ Undo ]   │  ← toast, sheet closes
│ └──────────┘└──────────┘  │     │ └───┴────┴───┴────┴────┘ │      └─────────────────────┘
│ ┌──────────┐┌──────────┐  │     │ ▸ More details (optional) │
│ │ 💧 Wet   ││ 🔥 Too hot│  │     │                           │
│ └──────────┘└──────────┘  │     │ ┌───────────────────────┐ │
│ ┌──────────┐┌──────────┐  │     │ │    Submit report      │ │  ← tap 3
│ │ ✂ Damaged││ ✕ Didn't │  │     │ └───────────────────────┘ │
│ └──────────┘│   work   │  │     └───────────────────────────┘
│             └──────────┘  │
└───────────────────────────┘
"Didn't work" → Tap 2 is symptom chips instead (Took money · No heat · Won't start · …)
Machine already Broken → the sheet opens with [ Still broken ] [ Works now ] first
```

**D. Empty / first use** (room with no reports yet)
```
┌─────────────────────────────────────┐
│ Laundry room                        │
│ ┌─────────────────────────────────┐ │
│ │   (?)                           │ │
│ │   No reports yet                │ │
│ │   Be the first: scan the QR     │ │
│ │   sticker on a machine after    │ │
│ │   your load and tap how it went.│ │
│ │   It takes 3 taps, no login.    │ │
│ └─────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────┐   │
│ │ (?) Dryer 1  │ │ (?) Dryer 2  │   │  ← dashed "Unknown" cards
│ │ Try Medium   │ │ Try Medium   │   │
│ └──────────────┘ └──────────────┘   │
└─────────────────────────────────────┘
```

**E. Admin: room management** (`/admin/rooms/[id]`)
```
┌───────────────────────────────────────────────────────────┐
│ Admin › Hedrick Summit › Laundry room   [Print QR sheet]  │
│ Add machines:  [Dryer ▾] prefix [Dryer ] from [7] to [9] [Add] │
│───────────────────────────────────────────────────────────│
│ Label     Kind   Code    Status        Actions            │
│ Dryer 1   dryer  k7p2xq  ✓ Works       [Out of order][Mark fixed][Rename][Retire] │
│ Dryer 3   dryer  a9f3mm  ✕ Out of order "WASH ticket 1234"  [Clear]               │
│───────────────────────────────────────────────────────────│
│ Recent reports                                            │
│ 3h ago  Dryer 3  not_working [no_heat] "took $2"   [Hide] │
└───────────────────────────────────────────────────────────┘
QR sheet: US Letter, 3×4 cards: QR code, "Dryer 3", room name, short URL, "Scan → 3-tap report"
```

---

## 10. Architecture notes
```
src/
  app/                     routes (§7), loading.tsx skeletons, actions.ts
  components/              StatusBadge, SettingChip, MachineCard, HeatLadder, ReportSheet, Toast, icons
  lib/
    db/schema.ts           Drizzle schema (§4)
    db/index.ts            libSQL client (file: locally, libsql:// in prod)
    status.ts              pure algorithm (§6), unit-tested
    labels.ts              enum → human copy, severity tables
    queries.ts             room/machine loaders that combine DB + status
    device.ts              device cookie, hashing, rate limits
    admin-auth.ts          HMAC-signed admin cookie
  scripts/seed.ts          Hedrick Summit seed with realistic reports
drizzle/                   SQL migrations
tests/                     vitest unit tests + playwright smoke
```

---

## 11. Abuse and moderation
Layered, cheapest first:
1. **Device cookie** (`dl_device`, random 128-bit, httpOnly, 1 year). Stored only as `sha256(id + SESSION_SECRET)`.
2. **Rate limits** (queried from `reports`, no extra infrastructure):
   - 1 report per device per machine per 3 min
   - 30 per device per day
   - 60 per IP hash per day
3. **Per-device de-duplication** in the algorithm, so repeat reports don't stack (§6.1).
4. **Honeypot field** plus a minimum 800 ms from sheet open to submit.
5. **Duplicate-aware UI.** Existing issues are shown as "Still broken?" confirmations, not fresh reports.
6. **Admin tools:** hide report, out-of-order override, mark fixed (resets status evidence).
7. **Notes** are limited to 280 characters, rendered as plain text, and never linkified.
8. **v1:** Turnstile (invisible) on submit; verified school email counts 2×; ✅ "flag this report" (§19).

### 11.1 Hardening pass *(after the first security review)*
- The minimum-time check needs a client-supplied `elapsedMs`; it is now required, and the honeypot is dropped silently instead of failing validation. Both are speed bumps for naive scripts, not real bot defenses: turn on Turnstile before relying on them.
- The client IP comes from platform-set headers (`x-vercel-forwarded-for`, `x-real-ip`) before the client-appendable `x-forwarded-for`. The per-IP daily cap is 300, because a whole dorm can share one NAT address.
- Undo soft-deletes (`undone_at`), so report → undo → report can't reset the rate limits.
- Admin login failures are counted per salted IP in the database (5 per 15 min), which works across serverless instances and can't be used to lock out the real admin from elsewhere.
- The admin cookie is bound to the current `ADMIN_PASSWORD`; `SESSION_SECRET` (32+ chars) is mandatory outside `next dev`; admin password must be 12+ chars.
- "Mark fixed" also clears the outlier flag (§6.5); retired machines 404 in the JSON API.
- **Known gap (owner decision):** one fresh device can still flip a machine to "broken" (PLAN.md §6.2 treats one fresh `not_working` report as enough), and a script that mints fresh devices can do this to many machines. That is what makes "it ate my money" useful immediately, so it is left as is for the pilot; see open question 9.

## 12. Privacy
- No accounts, names or emails in the MVP. Raw IPs are never stored (hashed with a daily salt, only for rate limiting).
- Device IDs are stored only as a hash.
- Report notes are public. The UI says so, and asks not to include names.
- Laundry helper questions are sent to Anthropic's API to be answered, and are not stored by the site. The card says the answers come from AI.
- Load photos are optional, admin-only unless the owner turns on "Show load photos publicly", and re-encoded on the phone so location metadata is never uploaded. Hiding a report hides its photo; deleting a report deletes it.
- Reports older than 180 days can be purged (they no longer affect results after about 60 days).
- "Notify me when it's fixed" stores the browser's push endpoint and keys (plus the device hash, for a cap) only until the one notification is sent, the resident cancels, or 90 days pass (§17).
- "Notify me when it's done" keeps the push endpoint and keys on the resident's own timer row only until the timer runs out, is stopped or replaced, or they cancel (§18).
- `/about` explains all of this and states that the site is **not affiliated with WASH or the university**.

## 13. Accessibility
- WCAG 2.2 AA:
  - text ≥ 4.5:1; icons, borders and focus ≥ 3:1
  - status is never shown by color alone
  - `:focus-visible` rings
- Semantic HTML: `<main>`, `<nav>`, lists for machines, `<time dateTime>`, real `<button>`s; `role="radiogroup"` for outcome and setting choices.
- The sheet is a modal dialog (`role="dialog" aria-modal`), with a focus trap, Esc to close, and focus returned to the trigger.
- Toasts use polite live regions.
- Tap targets ≥ 48px; no horizontal scroll at 320px width or 200% zoom; `prefers-reduced-motion` and `prefers-color-scheme` respected.
- Test with VoiceOver and TalkBack, plus a colorblind simulation, before each release.

## 14. Milestones
| # | Milestone | Scope | Target |
|---|---|---|---|
| M0 | Plan | This document | ✅ |
| M1 | MVP | §3 MVP list; seed data; unit tests; README | This PR |
| M2 | Pilot | Deploy to Vercel + Turso; print and stick QR codes in one Hedrick Summit room; collect 2 weeks of reports; fix UX friction | +1–2 weeks |
| M3 | v1 trust & engagement | Turnstile, school-email magic link, "I started it" timer, notify-when-fixed, PWA | +3–4 weeks |
| M4 | Multi-building | All Hedrick rooms + one more building; room-level fallback recommendations; outlier alerts to WASH | +6 weeks |
| M5 | Other campuses | Campus admin role, self-serve onboarding, i18n | later |

## 15. Open questions for the owner

> **Update:** most of these are now **settings you change yourself** in `/admin` instead of questions for me: which dryer settings a room has and minutes per payment (Rooms & machines), how many reports mark a machine Broken, public vs admin-only notes, site name, and every threshold (Settings). The defaults below are what ships until you change them.

1. **Which rooms first?** How many laundry rooms does Hedrick Summit have, and roughly how many washers and dryers are in each? Are machines stacked (top/bottom pockets)?
2. **Dryer controls:** which settings do the dryers actually offer (High/Med/Low/Delicates/No Heat? Perm Press?) and how many minutes does one payment buy? This tunes the enum and the "extra time" tip.
3. **Permission to post QR stickers:** do we need Housing or RA approval? Would Housing ask WASH for a status feed on our behalf?
4. **Domain and hosting:** OK with Vercel Hobby (non-commercial) + Turso free? A custom domain (e.g. `laundry.<something>`)?
5. **Admin model:** is one shared admin password OK for the pilot, or do you want per-person admin logins from day one?
6. **School email:** restrict the optional v1 sign-in to `@g.ucla.edu` / `@ucla.edu`?
7. **Tone and branding:** a name for the site? (Placeholder: "Dorm Laundry".)
8. **Public notes:** allow free-text notes publicly, or admin-reviewed only?
9. **One report marks a machine broken:** today a single fresh "didn't work" report flips a machine to Broken (fast warnings, but a script could abuse it). Keep that for the pilot, or require two separate reports unless the reporter is verified or Turnstile is on?

---

## Appendix A: Sources

**WASH Connect**
- WASH Connect: https://www.wash.com/wash-connect
- WASH smart-laundry FAQ PDF: https://www.wash.com/wp-content/uploads/2025/01/Getting-Started-with-Smart-Laundry-FAQs-2.pdf
- App Store listings:
  - https://apps.apple.com/us/app/wash-connect/id1469627109
  - https://apps.apple.com/us/app/-/id1623286810
- University guides:
  - SDSU: https://housing.sdsu.edu/_resources/documents/laundry-guide-operating-machines.pdf
  - CSULB: https://www.csulb.edu/student-affairs/student-housing/laundry-the-halls
- Daily Bruin (UCLA WASH-Connect launch, Oct 2025): https://dailybruin.com/2025/10/06/ucla-housing-launches-laundry-payment-app-wash-connect-track-machine-availability
- Reverse-engineered API docs (Home Assistant integration): https://github.com/yostinso/wash-connect
- San Francisco laundry analysis blog: https://github.com/DoubleGremlin181/DoubleGremlin181.github.io/blob/master/_posts/2025-11-09-san-francisco-laundry-analysis.md

**Machines**
- Alliance/Huebsch manual (temperature setpoints): https://docs.alliancelaundry.com/tech_pdf/Production/70693401en.pdf
- WASH Quantum Gold vend sheet: https://www.wash.com/wp-content/uploads/2019/04/AM18-0133_SD_RC_Vend_Gold.pdf
- Speed Queen exhaust temperature thread: https://automaticwasher.org/threads/speed-queen-2017-dryer-exhaust-temps-for-adge9rgs.74711/latest
- Maytag error codes:
  - https://www.mrappliance.com/expert-tips/appliance-care/maytag-washer-error-codes/
  - https://producthelp.maytag.com/Laundry/Washers/Top_Load_Washer/Error_Codes_or_Flashing_Lights/Other_Error_Codes/uL_-_Error_Code
- Speed Queen dL error: https://easybear-appliancerepair.com/blog/speed-queen-washer-error-code-dl
- Whirlpool tech sheet (vend/top-off pricing): https://www.whirlpool.com/content/dam/global/documents/201905/tech-sheet-w11316893-rev-a.pdf
- Maytag MDG30 tech sheet (shared-duct backpressure): https://assets.skulytics.io/assets/docs/MDG30PCDWW-105711160.pdf
- Fabric heat:
  - https://plasticranger.com/can-you-put-nylon-in-the-dryer/
  - https://precisionapplianceleasing.com/2026/05/what-dryer-temperature-should-you-use-for-polyester-activewear/
  - https://www.bluecotton.com/blog/garment/how-to-wash-screen-printed-shirts/

**Prior art**
- MIT Random Hall Laundry Server: https://laundry.mit.edu/
- NUS RC4 laundry bot: https://vulcanpost.com/587994/nus-computing-undergrads-create-a-laundry-bot
- CycleTag (Gordon College): https://tartan.gordon.edu/doing-laundry-without-the-guesswork-meet-woobensky-pierre-creator-founder-of-cycle-tag/
- Rams Wash (Cornell College): https://news.cornellcollege.edu/2025/07/First-year-creates-laundry-app-to-reduce-wait-times.html
- Harvard Open Data Project: https://hodp.org/project/laundry-in-harvard-dorms
- Binghamton / SUNY busy-times study: https://blog.suny.edu/whats-the-best-time-to-do-laundry-a-statistical-examination/
- Stanford Daily: https://stanforddaily.com/2020/01/30/when-do-students-do-laundry/
- Penn Laundry Alert (Daily Pennsylvanian): https://www.thedp.com/article/2008/12/new_feature_allows_students_to_track_the_status_of_their_clothes
- Trustpilot reviews:
  - CSC ServiceWorks: https://www.trustpilot.com/review/cscsw.com?page=3
  - PayRange: https://www.trustpilot.com/review/payrange.com?page=3
- FixMyStreet duplicate reports: https://www.mysociety.org/2019/04/24/stop-right-there-thats-already-been-reported/

**Stack**
- Turso pricing: https://turso.tech/pricing
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- OpenNext on Cloudflare: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Supabase free-project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Fly.io discontinued plans: https://fly.io/docs/about/discontinued-plans/
- Cloudflare Turnstile plans: https://developers.cloudflare.com/turnstile/plans/
- Better Auth magic link: https://better-auth.com/docs/plugins/magic-link

**UI**
- Apple HIG, sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Material bottom sheets: https://m3.material.io/components/bottom-sheets
- "When(ish) is my bus" (transit uncertainty research): https://mucollective.northwestern.edu/project/when-ish-is-my-bus
- Statuspage top-level status: https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations
- Vercel Geist: https://vercel.com/geist
- Linear UI redesign: https://linear.app/blog/how-we-redesigned-the-linear-ui
- Target size (WCAG 2.5.5): https://adrianroselli.com/2019/06/target-size-and-2-5-5.html

---

## 16. Admin-editable configuration *(added after the MVP)*

Nothing the owner might want to change is hard-coded any more.

**Where it lives**
- `settings` table: one row per key, JSON value, `updated_at`. A missing row means "use the default", so a fresh database works and a bad row can't break the site (invalid values fall back per field).
- `rooms.dryer_settings` (JSON subset of the heat ladder, `null` = all five) and `rooms.minutes_per_cycle`.
- `audit_log`: every admin action, with before → after for settings.

**How it is wired**
- `src/lib/config.ts` has one descriptor list (`FIELDS`) that drives the defaults, validation, cross-field checks and the settings form, so adding a knob is one entry. `toParams` turns the config into the algorithm's `Params`; a test asserts the defaults reproduce the built-in parameters exactly.
- `src/lib/status.ts` takes `Params` (and a room's offered settings) as arguments, with defaults, so all earlier behavior and tests are unchanged.
- Loaded once per request (`getConfig`, memoized), applied to public pages, the report action (rate limits, minimum time, undo window), the manifest and the metadata.

**What can be changed**
| Group | Settings |
|---|---|
| Site | name, tagline, time zone, announcement banner, notes public/admin-only, load photos on/off and public/admin-only, untested-dryer suggestion on/off |
| Machine status | **reports needed to mark Broken** (1 = fastest, 2+ = "Caution: reported broken, not yet confirmed" until that many different devices agree), status half-life, report window, newest-report boost, "Same here" / "Not for me" weights and cap (§6.9) |
| Dryer settings | setting half-life; per room: which settings exist, minutes per payment |
| Load advice | on/off; learning on/off, loads needed, share that must agree; per fabric: hottest dryer setting and hottest wash water (§6.7) |
| Laundry helper chat | the Anthropic API key (write-only, encrypted); on/off, questions per network per hour, questions per day site-wide (§6.8) |
| Weak-dryer detection | on/off, reports needed, damp share, sibling damp share, gap |
| "I started it" timer | default washer and dryer cycle length, how long "should be done" shows after the estimate; busy hours on/off, look-back, taps needed (§6.10) |
| Abuse | per-machine cooldown, reports per device/day, per network/day, minimum fill time, undo window |

**Broken quorum.** This resolves open question 9 without forcing a choice: the default stays at 1 (fast warnings); setting it to 2 means a single script can no longer mark a machine Broken, and admins can still mark out of order directly. The quorum counts distinct devices, so one phone can't satisfy it twice.

**Per-room dryer settings.** The report sheet offers only the room's settings, the server rejects others, and the ladder, the recommendation and the "no data" default (Medium if offered, else the lower middle of what is) are all restricted to them.

---

## 17. Notify when a broken machine is fixed *(v1, M3)*

A resident looking at a Broken machine taps **Notify me when it's fixed** and gets **one** push notification when it works again. No account, opt-in per machine, cancellable from the same card.

**When it's offered**
- Only on machines whose status is Broken (reports or admin out-of-order), and only when `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set.
- iPhone/iPad Safari can only receive Web Push from a site added to the Home Screen (iOS 16.4+), so there the card explains how instead of showing the button. Browsers without push support don't see the card. If the resident blocked notifications, the card says how to unblock them.

**What counts as fixed (decision)**
| Trigger | Notifies when |
|---|---|
| Admin **Mark fixed** | Always: the admin's word is enough. |
| Admin **Clear out-of-order** | The report-based status is no longer Broken or Caution. |
| A resident's report | The status becomes Works or Unknown. With default settings one "works" against one "broken" is only *Mixed reports* (Caution), so it takes a second person; one fake "works" can't page everyone. |

Status decaying on its own (no new report, no admin action) does not send anything.

**How it works**
- `public/sw.js` is a tiny service worker that only shows the notification and opens `/m/<code>` when tapped; it caches nothing. It is served with `Cache-Control: no-cache`.
- `push_subscriptions` table: machine, endpoint, `p256dh`/`auth` keys, device hash, created time; unique per (machine, endpoint).
- Sending uses `web-push` with VAPID, TTL 24 h, from `after()` so admins and reporters never wait on push services. The rows are deleted *before* sending (one-shot, and two overlapping triggers can't double-send). 404/410 from a push service is silently dropped.
- The admin room page shows "N waiting to hear it's fixed" per machine.

**Abuse limits**
- The server POSTs to the endpoint a browser supplies, so only the browsers' push services are accepted: FCM (Chrome, Edge, Brave, Opera, Samsung), Mozilla autopush, Apple, and WNS; https only, no custom ports or credentials. Keys must be a 65-byte P-256 point and a 16-byte secret.
- A browser can only watch a machine that is currently Broken; at most 20 watches per device and 500 per machine; watches expire after 90 days.
- Cancelling requires the (unguessable) endpoint.

## 18. Notify me when my load is done *(v1, added after the pilot features)*

Whoever taps **I started it** on a machine can then tap **Notify me when it's done** on the same card and gets **one** push notification when their timer's estimate runs out: "Washer 3 should be done. Laundry room: time to move your clothes to a dryer so the next person can use it." (dryers say "grab your clothes"). Tapping it opens that machine's page, where "I took my clothes out" ends the timer.

**When it's offered**
- Only on your own running timer (same device cookie as the tap), and only when the `VAPID_*` keys are set. Same browser support as §17: iPhone needs the site on the Home Screen first, and the card says so; blocked notifications get a hint; unsupported browsers see nothing.
- Cancellable from the card ("We'll notify you when it's done. Cancel"), and remembered across reloads.

**What sends it, and what doesn't**
| Run state at the estimate | Result |
|---|---|
| Still running | One push, TTL 30 min (a "done" alert is useless hours later) |
| Stopped, reported on ("how did it go?") or replaced by a newer tap | Nothing: the subscription is dropped |
| More than 30 min past the estimate (server was off or asleep) | Nothing: dropped |

**How it works**
- No new table: `machine_runs` gains `alert_endpoint`, `alert_p256dh`, `alert_auth` (migration 0008). They are cleared as soon as the alert is sent or dropped.
- `src/instrumentation.ts` starts a sweep every 20 s in the Node server (`startRunAlertSweep` in `src/lib/run-alerts.ts`). Each alert is claimed by clearing its columns before sending, so two overlapping sweeps can't double-send. Rules are pure in `push-rules.ts` (`doneAlertAction`, `donePayload`).
- This needs a long-running server, which is how the site runs today (`next dev` / `next start` on one machine). A serverless host would need a cron that calls `sendDueRunAlerts` instead.
- Same push-service allowlist and key checks as §17. Only the device that started the run can set or cancel its alert.

## 19. Flag this report *(v1)*

Under someone else's report on a machine page, **Flag** opens four reasons: *Spam or fake*, *Rude or offensive*, *Names or personal info*, *Wrong machine or not true*. One tap on a reason records it ("Flagged. Thanks, an admin will take a look." with **Undo**). No login; not offered on your own report (undo that instead).

**What a flag does**
- One flag per device per report (picking again changes the reason). Same daily caps per device and per network as reports, counted separately.
- When **Settings → Reports & abuse limits → Flags that hide a report** different devices have flagged it (default 3, 0 = never), it is hidden on the spot. The status and recommendation recompute without it, and if it was a bogus "broken" report, people waiting on "notify me when it's fixed" hear about it (§17). The audit log records "Residents' flags hid a report".
- Flags never change a report's weight; only hiding does. "Not for me" (§6.9) is the way to disagree with an honest report.

**Admin**
- The dashboard shows "N flagged reports need a look" whenever any report has flags an admin hasn't settled. It opens **Reports → Flagged, needs a look**, which lists those reports (hidden or not, any age) with their reasons, e.g. "Spam or fake ×2 · Wrong machine or not true".
- **Keep**: the report is fine. It shows again and the flags so far stop counting (`reports.flags_cleared_at`), so it takes a fresh set of flags to hide it again.
- **Hide** (row, bulk, or anywhere else): it stays hidden and leaves the queue the same way.

**Data**: `report_flags` (report, device hash, IP hash, reason, time; unique per report and device) and `reports.flags_cleared_at`, migration 0009. Rules are pure in `src/lib/flags.ts`.
