# Lockup - Equipment Tracker Design Spec

**Date:** 2026-07-08
**Status:** Draft - pending review

**Product name:** the gear system is called **Lockup** (film-industry slang for the equipment storage room). Lockup is its own identity: it has its own name in the nav, its own Slack bot voice, and its own QR link domain (not Orbit's). Database tables keep the descriptive `equipment_` prefix because product names can change but schemas shouldn't.

## Problem

KK Create owns 50-200 pieces of camera/production gear used by 10-30 people. Today the process is informal, loosely overseen by the Tech Lead (Gaurav Mandal) who has many other responsibilities. Three recurring failures:

1. **Nobody knows who has what.** Gear leaves the cupboard without a record; shoot planning is guesswork.
2. **Gear gets returned to the wrong place.** Two storage cupboards (L1: 1st floor, L2: 2nd floor) and no record of where an item actually went back.
3. **Repair surprises.** Items go for repair silently; a shoot plans around gear that isn't in the building.

## Goals

- Any employee can answer "who has it, and until when" from their phone in seconds.
- Shoot planning surfaces conflicts early: reservations against named shoots, with repair status flagged loudly.
- Checkout is self-serve, instant (no approvals), phone-first, driven by QR stickers on every item.
- A **Tech Console** (analogous to the HR Console) gives the Tech Lead, HR, and Founders full management access.
- The module is **fully self-contained**: droppable with one migration + folder deletion, extractable to a standalone site later with only an auth/user-sync migration.

## Decisions (from discovery, all confirmed by owner)

| Topic | Decision |
| --- | --- |
| Placement | Module inside Orbit; self-contained (own tables, folders, capabilities; only outward FK is `users.id`) |
| Tracking granularity | **Every physical item gets its own QR**, including batteries and SD cards (CSV `quantity` column expands identical units into numbered items) |
| Kits | **No kit entity.** Checkout is a cart: scan/select multiple items in one go |
| Shoots | First-class entity; reservations are always made against a shoot |
| Reservation conflicts at checkout | **Warn but allow**; the reserver gets a Slack DM immediately |
| Approvals | None. Checkout, return, transfer, reservation are all instant |
| Physical presence (added 2026-07-09) | Reserving happens online, but **taking, returning, taking over, and picking up require scanning the item's sticker**. A direct QR load counts as the scan; opening an item page from inside the app asks for a scan (or typing the sticker's code) before acting. Equipment managers (Tech Lead, HR, Founders) are exempt: they can force entry/exit online |
| Shoot write access (added 2026-07-09) | Shoots stay org-wide readable. Changing one (details, reservations) is limited to the owner, a per-shoot **editors list** (managed on the shoot page), and equipment managers. Migration `024_equipment_shoot_editors.sql` |
| Assigned devices (added 2026-07-09) | A second item **kind**: `pooled` gear (cupboard + shoot checkout, today's model) vs `assigned` devices (laptops/phones/SSDs) that rest **with a person** (the `assignee_id`), not a cupboard. Loans are pure chain-of-custody, **no due date** (`equipment_checkouts.due_at` is nullable; assigned loans never trigger overdue reminders). Own **Devices** tab in `/lockup` (browse) and `/tech` (manage); never reservable for shoots. Borrow / hand-back / take-over reuse the scan-gated flows; managers set the owner. The Orbit dashboard "Device With Me" button opens `/lockup?tab=mine` (With me: assigned + borrowed + checked-out gear, hand-back by scan). Migration `027_equipment_assigned_devices.sql` |
| Return location tracking (added 2026-07-09) | The check-in prompt already asks which cupboard the gear went back to; migration `026` adds `equipment_items.current_location_id` so that answer is now **shown** everywhere ("Available in L2"), separate from the item's home shelf. When an available item sits somewhere other than home it is flagged "away" / "currently kept elsewhere" so the tech lead can spot misplaced gear. Nulled while checked out; reset to home on force check-in, manual "available", and repair return |
| Shoot cleanup (added 2026-07-09) | Shoots **auto-archive one week after their last day**: they drop off the shoots tab (data kept; direct links still work) and the daily sweep marks them done. Owners and equipment managers also get a permanent **Delete** (removes reservations, studio bookings, editors via cascade; checkout history is kept but unlinked). Cancel remains the "not happening" path |
| Studio Blocking (added 2026-07-09) | Optional per-shoot studio bookings (date + from/to time, multiple per shoot). **Hard block**: overlaps of the same studio are refused, race-safe via a Postgres exclusion constraint; the error names the clashing shoot. Studios are managed by equipment managers in the Tech Console (Locations tab); seeded with "Studio 1". Cancelling a shoot frees its studio. A "Studio schedule" list (upcoming bookings grouped by day) sits on the shoots tab; a drag-select calendar grid is planned for v2. Migration `025_equipment_studios.sql` (needs `btree_gist`) |
| Overdue | Slack DM to holder (due date, then daily) + Tech Lead notified |
| Returns | One-tap check-in with **optional** issue report; must pick which cupboard it went back to |
| On-set handover | **Scan to transfer**: new holder scans QR, taps "take over" |
| Externals/freelancers | Never take gear; employees only |
| Locations | `L1` and `L2` cupboards, seeded; manageable in Tech Console |
| Repairs | Tech Lead sends and records; item status `in_repair` + expected-back date; planning views flag reserved-but-in-repair loudly |
| Notifications | **Separate Slack bot** (`SLACK_EQUIPMENT_BOT_TOKEN`), plus in-app notifications via existing `notifyUser` |
| Reservation expiry | Auto-expire if not picked up within **24h of the shoot's start** |
| Inventory seeding | CSV import (template at `docs/equipment/inventory-template.csv`); afterwards all edits happen in the Tech Console |
| Name | **Lockup**; the module carries its own identity, not Orbit's |
| QR labels | App generates **PNG downloads** (single PNG, or ZIP of PNGs for multi-select); Tech Lead prints them himself (Canva etc.). Standard + mini sizes |
| QR URL domain | Not Orbit's domain. Built against `LOCKUP_QR_BASE_URL`; final domain to be chosen before stickers are printed (owner deciding; current orbit.shubhamsinha.com domain will change soon) |
| Separate website | **Yes, in v1.** Lockup is also reachable as its own standalone website on its own domain, using the very same database as the Lockup module inside Orbit. Implemented as the same codebase serving two hosts (see Architecture), so there is one implementation and zero data sync |
| Device | Mobile web; QR opens a short URL in the phone browser |
| Scope | Everything above ships in v1; nothing deferred |

## Non-goals

- Approval workflows for taking gear.
- Kit/bundle entities (cart checkout covers the "grab a bag" case).
- External borrowers or guest accounts.
- Maintenance schedules, depreciation, insurance, or purchase workflows.
- Native app or offline mode.
- Quantity pools (owner chose individual QR for everything).

## Architecture

### Self-containment rules

- All tables prefixed `equipment_` (including `equipment_shoots`). No existing table gains a column. The only outward FKs are to `users(id)`.
- All code in dedicated locations: `app/(app)/lockup/`, `app/(app)/tech/`, `app/e/[code]/`, `components/lockup/`, `lib/queries/lockup.ts`, `lib/actions/lockup.ts`, `lib/slack-lockup.ts`.
- Reuses (read-only or service-level, no schema coupling): auth/`requireUser`, capability framework, `notifyUser`, `users.slack_id`, `writeAudit`, UI primitives, toast store.
- **Drop story:** one `DROP TABLE` migration + delete the folders above + remove nav links + remove the cron entry.
- **Extract story:** export `equipment_*` tables, map users by email, swap auth. UI/queries port as-is (same Next.js + Supabase stack).

### Two websites, one database

Lockup is served two ways from the **same codebase and the same Supabase database**:

1. **Inside Orbit** (Orbit's domain): "Lockup" appears in the nav next to HR features; employees use it alongside leaves.
2. **Standalone Lockup website** (Lockup's own domain, same one the QR stickers use): the same Vercel deployment answers on a second domain. Middleware detects the host (`LOCKUP_HOST` env var): on the Lockup host, only the Lockup surface is served (`/login`, `/e/*`, `/lockup`, `/tech`, auth callback); every other path redirects to `/lockup`. The app shell renders Lockup-only branding and nav on that host (site flavor resolved server-side from the request host and passed to the layout).

Because both hosts are one deployment on one database, there is no sync, no duplicated code, and a checkout made on either site is instantly visible on both. Login works on both hosts with the same Supabase credentials (auth cookies are per-domain, so a user signs in once per site). If Lockup is later extracted into a truly separate codebase, the standalone domain and its QR stickers move with it unchanged.

### Routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/lockup` | All employees | Browse inventory with live status, filter by category/location/status; "My gear" (what I hold, due dates); shoots list |
| `/lockup/shoots/[id]` | All employees | Shoot detail: reserved items, conflicts, in-repair flags, pickup state |
| `/e/[code]` | All employees | **QR landing page** (mobile-first): item card + the one action that makes sense right now (check out / check in / take over / pick up reservation) |
| `/tech` | `manage_equipment` | Tech Console |
| `/api/cron/equipment-sweep` | Vercel Cron | Daily: overdue DMs, reservation expiry, repair due-back reminders |

The QR URL is deliberately short (`{LOCKUP_QR_BASE_URL}/e/{code}`, code = 6-char slug) so the QR stays low-density enough to print at 15mm for batteries. `LOCKUP_QR_BASE_URL` is a dedicated env var precisely because the QR domain must outlive Orbit's own domain (stickers are printed once): the owner will pick Lockup's domain before the first labels are downloaded, and the label screen warns while it is unset. When the app is later served on that domain too (Vercel supports multiple domains on one project), scans resolve directly; until then a redirect covers it.

### Data model - migration `023_equipment.sql`

- **`equipment_items`** - `id`, `code` (unique 6-char slug for QR), `name`, `category`, `brand_model`, `serial_number`, `photo_url`, `home_location_id`, `status` (`available | checked_out | in_repair | retired | lost`), `current_holder_id → users`, `current_checkout_id`, `notes`, timestamps.
- **`equipment_locations`** - `id`, `label`; seeded `L1`, `L2`.
- **`equipment_checkouts`** - `id`, `item_id`, `holder_id → users`, `checked_out_at`, `due_at` (date + time, required), `returned_at`, `returned_location_id`, `transferred_from_checkout_id` (self-FK; transfers close the old row and open a new one, preserving the chain), `shoot_id` (set when picked up from a reservation), `notes`. Item history = this table + repairs + issues.
- **`equipment_shoots`** - `id`, `name`, `location` (free text), `starts_at`, `ends_at`, `owner_id → users`, `status` (`planned | active | done | cancelled`), `notes`.
- **`equipment_reservations`** - `id`, `item_id`, `shoot_id`, `reserved_by → users`, `status` (`active | picked_up | expired | cancelled`), timestamps. Partial unique index: one active reservation per (item, shoot).
- **`equipment_repairs`** - `id`, `item_id`, `sent_by → users`, `sent_at`, `expected_back_on`, `vendor`, `notes`, `returned_at`.
- **`equipment_issues`** - `id`, `item_id`, `reported_by → users`, `checkout_id`, `note`, `status` (`open | resolved`), `resolved_by`, `resolved_at`.
- **`equipment_private`** - `item_id` (PK/FK), `purchase_date`, `purchase_price_inr`, `purchase_notes`. Separate table so RLS can hide purchase data from non-admins cleanly.
- **`equipment_shoot_editors`** (migration `024`) - `id`, `shoot_id`, `user_id`, `added_by`, `created_at`; unique per (shoot, user). The per-shoot write list.

Photos live in a new Supabase Storage bucket `equipment-photos`.

**RLS:** active employees can `SELECT` every `equipment_*` table **except `equipment_private`** (readable only with `manage_equipment`). All writes go through server actions (service-role client, per repo convention); RLS write policies mirror the action rules as backstop: any active employee may create/close their own checkouts, transfers, reservations, shoots, and issues; item CRUD, repairs, locations, and issue resolution require `manage_equipment`.

### Permissions

One new capability, appended to `PRD_v1/CAPABILITIES.md` before the migration: **`manage_equipment`** - add/edit/retire items, CSV import, QR label sheets, manage locations, record repairs, resolve issues, see purchase data, delete/correct any checkout or reservation. Added to the `hr_admin` and `founder_full` bundles; granted individually to Gaurav Mandal.

Everything else (view inventory and availability, check out, return, transfer, create shoots, reserve, report issues) is any-active-employee behavior, like viewing one's own leaves: no capability needed.

### Core flows

**Checkout (cart):** scan any item's QR with the phone camera → `/e/{code}` shows the item + "Check out" → an in-page scanner ("Add more items", getUserMedia + JS QR decode) lets them scan the rest of the pile → set return date & time (one field, sensible default next-day evening) → confirm. If any item has an active reservation overlapping the period: prominent warning naming the shoot and reserver ("Reserved by Varun for Spiti shoot from tomorrow"), proceed allowed, reserver DM'd instantly.

**Return:** scan → "Check in" → pick cupboard (L1/L2, defaults to the item's home) → optional "report a problem" (note; optionally flags the item `in_repair` pending Tech Lead review via an open issue). One tap on the happy path.

**Transfer:** item is checked out to someone else → scanner sees "Take over from {name}" → confirm → old checkout closes, new one opens with the transfer link, previous holder gets a DM. History shows the chain.

**Shoots & reservations:** anyone creates a shoot (name, dates, location) and reserves items against it, browsing availability for that date range. Shoot page shows every reserved item with live status; anything `in_repair` with `expected_back_on` after the shoot start renders as a loud conflict. Pickup: scanning a reserved item during the shoot window converts the reservation to a checkout (due date defaults to shoot end). Reservations not picked up within 24h of shoot start auto-expire (cron) and the reserver is DM'd.

**Repairs:** Tech Lead marks an item `in_repair` with vendor + expected-back date. Any shoot holding a reservation on it gets flagged and its owner DM'd. When marked back, status returns to `available` and upcoming reservers + Tech Lead are notified.

### QR labels

Tech Console → Inventory → select items → "Download labels". Output is **PNG files** the Tech Lead prints himself (Canva or any tool):

- Single item selected: direct PNG download.
- Multiple items: **ZIP of PNGs**, one per item, filenames like `Sony_FX3__AB3K7Q.png`.
- Two label variants, chosen at download time: **standard** (QR + item name + code, for bodies/lenses/lights) and **mini** (QR + code only, for batteries/cards).
- PNGs are high-resolution (1024px QR) so they can be scaled down to 15mm print size without losing scannability. QR encodes `{LOCKUP_QR_BASE_URL}/e/{code}`, ECC level M, generated with the `qrcode` npm package. ZIP assembled client-side (jszip), no server storage.
- If `LOCKUP_QR_BASE_URL` is unset the download screen shows a blocking warning, so no sticker can ever be printed with a throwaway URL.

### Slack integration (separate bot)

New env vars: `LOCKUP_SLACK_BOT_TOKEN` (separate bot identity from the HR bot; the bot is named Lockup in Slack), optional `LOCKUP_SLACK_CHANNEL` for a public activity feed (off by default). `lib/slack-lockup.ts` mirrors `lib/slack.ts` conventions: silently no-ops without a token, never throws. DMs resolve recipients via existing `users.slack_id`.

| Event | Recipients |
| --- | --- |
| Checked out over someone's reservation | Reserver |
| Due today / overdue (daily) | Holder; Tech Lead gets a daily overdue digest |
| Issue reported at return | Tech Lead |
| Item sent to repair while reserved by an upcoming shoot | Shoot owner + reservers |
| Item back from repair | Tech Lead + upcoming reservers |
| Reservation auto-expired | Reserver |
| Take-over transfer | Previous holder |

Every Slack DM has an in-app `notifyUser` twin, so the module works fully without Slack configured.

### Cron

`/api/cron/equipment-sweep` (daily, guarded by `CRON_SECRET`, added to `vercel.json`): overdue reminders + Tech Lead digest, reservation auto-expiry, "expected back today" repair reminders.

### CSV import

Tech Console → Inventory → Import. Template + column docs: `docs/equipment/inventory-template.csv` and `docs/equipment/README.md`. Upload → full validation + preview (bad category, missing name, duplicate serial, unknown location) → confirm → items created with generated codes. `quantity > 1` expands into numbered items ("Sony NP-FZ100 Battery #1" ... "#6"). v1 import is create-only (no upsert); after seeding, all edits happen in the Tech Console.

### Tech Console (`/tech`)

Mirrors the HR Console pattern (server page + client tabs):

- **Overview** - out now, overdue (red), in repair with expected-back dates, upcoming shoots with conflict badges, open issues.
- **Inventory** - full CRUD, photos, statuses (retire/lost), CSV import, label printing, locations.
- **Shoots** - all shoots, reservation states, conflicts.
- **Repairs** - send/receive, history per item.
- **Issues** - open reports, resolve or convert to repair.

### Component layout

```
components/lockup/
├── inventory-browser.tsx        # /lockup client: filterable live-status list
├── my-gear.tsx                  # current holdings + due dates
├── shoot-*.tsx                  # shoot list/detail/create + reservation picker
├── qr-action-card.tsx           # /e/[code] mobile action page (client)
├── qr-scanner.tsx               # in-page camera scanner for cart checkout
├── checkout-*.tsx / return-*.tsx / transfer-*.tsx
└── tech/                        # Tech Console tabs
```

`app/(app)/lockup/page.tsx` and `app/(app)/tech/page.tsx` follow the repo pattern: server component fetching via `lib/queries/lockup.ts` in `Promise.all`, rendering a `*-client.tsx`.

### Conventions honored

`ActionError` for user-facing failures; `writeAudit` on every mutation; `revalidatePath('/', 'layout')` after writes; narrow `.in()` casts; regenerated `database.types.ts` after the migration; no em/en dashes in any user-facing copy.

## Open questions

None. All discovery questions answered by the owner on 2026-07-08.
