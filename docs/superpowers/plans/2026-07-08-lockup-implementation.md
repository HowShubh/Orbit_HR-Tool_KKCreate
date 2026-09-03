# Lockup (Equipment Tracker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-08-equipment-tracker-design.md` (read it first; every product decision lives there).

**Goal:** Ship Lockup v1 complete: QR-driven self-serve gear checkout/return/transfer, shoots with reservations and conflict warnings, repairs, issues, Tech Console, CSV import, PNG label downloads, separate Slack bot, daily cron sweep, and a standalone Lockup website on its own host sharing the same database.

**Architecture:** Self-contained module. New tables all prefixed `equipment_` (migration `023_equipment.sql`); only outward FKs point at `users(id)`. New code lives in `app/(app)/lockup/`, `app/(app)/tech/`, `app/e/[code]/`, `components/lockup/`, `lib/queries/lockup.ts`, `lib/actions/lockup.ts`, `lib/slack-lockup.ts`. One new capability: `manage_equipment`. The standalone site is the same deployment answering on a second host (`LOCKUP_HOST`), gated in `middleware.ts` and branded via a `site` flavor passed into the app shell.

**Tech stack:** existing stack + new deps: `qrcode` (+`@types/qrcode`), `jszip`, `jsqr` (in-page camera scanning), `papaparse` (+`@types/papaparse`).

**Verification model:** No test framework. Every task ends with `npm run typecheck`; UI tasks also get a manual walk-through on `npm run dev` (mobile viewport for QR flows). Final task runs `npm run build`.

**New env vars** (all optional; module degrades gracefully):
- `LOCKUP_QR_BASE_URL` — base URL encoded in QR PNGs (e.g. `https://kklockup.com`). Label download is blocked while unset.
- `LOCKUP_HOST` — hostname of the standalone site (e.g. `kklockup.com`). Host gating is skipped while unset.
- `LOCKUP_SLACK_BOT_TOKEN` — separate Slack bot; all Lockup Slack silently no-ops without it.
- `LOCKUP_SLACK_CHANNEL` — optional activity-feed channel (off by default).

---

## File structure

**Create:**
- `db/migrations/023_equipment.sql` — schema, RLS, seeds, capability
- `lib/lockup/constants.ts` — categories, statuses, shared unions + labels
- `lib/lockup/codes.ts` — 6-char QR slug generator
- `lib/queries/lockup.ts` — all reads
- `lib/actions/lockup.ts` — all writes
- `lib/slack-lockup.ts` — separate-bot Slack helper
- `app/(app)/lockup/page.tsx` + `app/(app)/lockup/shoots/[id]/page.tsx`
- `app/(app)/tech/page.tsx`
- `app/e/[code]/page.tsx` — QR landing (authenticated, mobile-first)
- `app/api/cron/equipment-sweep/route.ts`
- `components/lockup/*` — see component layout in the spec
- `components/lockup/tech/*` — Tech Console tabs

**Modify:**
- `PRD_v1/CAPABILITIES.md` — append `manage_equipment` (BEFORE migration, per repo rule)
- `lib/supabase/database.types.ts` — regenerate after migration
- `lib/capabilities/bundles.ts`, `lib/capabilities/can.ts`, `hooks/use-capabilities.ts`, `lib/actions/_helpers.ts` — new capability plumbing
- `middleware.ts` — `/e/` stays protected (login redirect returns to it); Lockup-host gating
- `app/(app)/layout.tsx`, `components/layout/sidebar.tsx`, `components/layout/mobile-nav.tsx`, `components/layout/bottom-nav.tsx`, `components/layout/topbar.tsx` — nav entries + site flavor
- `vercel.json` — cron entry
- `package.json` — new deps
- `CLAUDE.md` — new env vars + one-paragraph module description

---

## Task 1: Capability doc + migration + types

**Files:** `PRD_v1/CAPABILITIES.md`, `db/migrations/023_equipment.sql`, `lib/supabase/database.types.ts`

- [ ] **Step 1:** Append `manage_equipment` to `PRD_v1/CAPABILITIES.md` (global capability; default in `hr_admin` and `founder_full` bundles; individually grantable — Gaurav Mandal gets it). Document the any-active-employee behaviors (view inventory, checkout, return, transfer, shoots, reservations, issue reports) as hardcoded self-permissions of the module.
- [ ] **Step 2:** Write `023_equipment.sql`:
  - `equipment_locations(id, label unique, created_at)` — seed `L1`, `L2`.
  - `equipment_items(id, code text unique not null, name, category, brand_model, serial_number, photo_url, home_location_id → equipment_locations, status check in (available|checked_out|in_repair|retired|lost) default available, current_holder_id → users, current_checkout_id, notes, created_at, updated_at)`.
  - `equipment_checkouts(id, item_id → items, holder_id → users, checked_out_at default now(), due_at timestamptz not null, returned_at, returned_location_id → locations, transferred_from_checkout_id → self, shoot_id → shoots, notes)`. Index on `(item_id, returned_at)`, `(holder_id) where returned_at is null`.
  - `equipment_shoots(id, name, location, starts_at, ends_at, owner_id → users, status check in (planned|active|done|cancelled) default planned, notes, created_at)`. Check `ends_at >= starts_at`.
  - `equipment_reservations(id, item_id, shoot_id, reserved_by → users, status check in (active|picked_up|expired|cancelled) default active, created_at, resolved_at)`. Partial unique index `(item_id, shoot_id) where status = 'active'`.
  - `equipment_repairs(id, item_id, sent_by → users, sent_at default now(), expected_back_on date, vendor, notes, returned_at)`.
  - `equipment_issues(id, item_id, reported_by → users, checkout_id, note not null, status check in (open|resolved) default open, resolved_by, resolved_at, created_at)`.
  - `equipment_private(item_id pk → items on delete cascade, purchase_date, purchase_price_inr numeric, purchase_notes)`.
  - Capability rows: insert `manage_equipment` into the capabilities table and into the `hr_admin` + `founder_full` bundle mappings (mirror how `002_capabilities.sql` inserts).
  - RLS: enable on all 8 tables. `SELECT` for any authenticated active user on all except `equipment_private` (that one: `manage_equipment` holders / hr / founder only, mirroring existing capability-check SQL helpers from `004_sql_functions.sql`). Write policies mirror action rules (self-writes for checkouts/reservations/shoots/issues; `manage_equipment` for items/locations/repairs/private) — actions use the service-role client anyway, RLS is the backstop.
  - Storage: create `equipment-photos` public-read bucket (insert into `storage.buckets`) with authenticated upload policy.
- [ ] **Step 3:** Apply migration to the dev Supabase project; regenerate `lib/supabase/database.types.ts` (same method used for 001-022).
- [ ] **Verify:** `npm run typecheck` passes; new tables visible in generated types.

## Task 2: Capability plumbing

**Files:** `lib/capabilities/bundles.ts`, `lib/capabilities/can.ts`, `hooks/use-capabilities.ts`, `lib/actions/_helpers.ts`

- [ ] Add `'manage_equipment'` to `CapabilityKey`, to `requireCapability`'s parameter union and role logic (hr + founder allowed by role; otherwise check individual grant — follow the existing branch structure), and to the client-side `can.ts` / `useCapabilities()` surface (expose e.g. `manageEquipment`).
- [ ] Check `/permissions` page: if capabilities render from the DB list it picks the new one up automatically; if from a hardcoded list, add it.
- [ ] **Verify:** typecheck; `/permissions` shows `manage_equipment` grantable.

## Task 3: Constants, codes, queries

**Files:** `lib/lockup/constants.ts`, `lib/lockup/codes.ts`, `lib/queries/lockup.ts`

- [ ] `constants.ts`: category union + display labels (camera, lens, light, audio, grip, drone, battery, storage, computer, cable_adapter, accessory, other), status labels/colors, shared types.
- [ ] `codes.ts`: `generateItemCode()` — 6 chars, unambiguous alphabet (no 0/O/1/I), collision-checked against `equipment_items.code`.
- [ ] `lib/queries/lockup.ts` (admin client, server-only), functions:
  - `listEquipment(filters?)` — items + location + holder name + active reservation summary.
  - `getItemByCode(code)` — item + open checkout + active/upcoming reservations + open repair + recent history (checkouts/transfers/repairs/issues merged, newest first).
  - `getMyGear(userId)` — open checkouts with due dates.
  - `listShoots(scope)` / `getShootDetail(id)` — reservations with per-item live status + conflict flags (item in_repair with `expected_back_on > starts_at`, or open checkout with `due_at > starts_at`, or overlapping reservation from another shoot).
  - `getAvailabilityForRange(start, end)` — for the reservation picker.
  - `getTechConsoleData()` — out-now, overdue, in-repair, open issues, upcoming shoots w/ conflict counts.
  - `getItemPrivate(itemId)` — purchase data (caller must have checked capability).
- [ ] **Verify:** typecheck.

## Task 4: Server actions

**Files:** `lib/actions/lockup.ts`

All actions: `requireUser()` (or `requireCapability('manage_equipment')`), `ActionError` for user-facing failures, `writeAudit` in plain English ("Shubham checked out Sony FX3 (AB3K7Q)"), `revalidatePath('/', 'layout')`.

- [ ] Employee actions:
  - `checkoutItems(itemIds[], dueAt, shootId?)` — validates each item is `available` (or reserved for the given shoot by anyone: pickup path); collects overlapping foreign reservations and returns them as warnings when called with `confirm: false`, commits when `confirm: true` (two-phase so the UI can show the warn-but-allow dialog); sets item status/holder; notifies conflicting reservers; marks reservation `picked_up` on the pickup path.
  - `checkinItem(itemId, locationId, issueNote?)` — closes checkout, sets status `available` + holder null; optional issue creates `equipment_issues` row + Tech Lead notification.
  - `takeOverItem(itemId, dueAt?)` — closes current checkout, opens new one linked via `transferred_from_checkout_id`, keeps due date unless overridden, notifies previous holder.
  - `createShoot(...)`, `updateShoot(...)`, `cancelShoot(id)` (owner or manage_equipment; cancelling releases active reservations).
  - `reserveItems(shootId, itemIds[])` / `cancelReservation(id)`.
  - `reportIssue(itemId, note)` — standalone report (not at return).
- [ ] Manage actions (`manage_equipment`): `createItem`, `updateItem`, `setItemStatus` (retire/lost/force-available), `deleteItem` (only if no history; else retire), `upsertItemPrivate`, `uploadItemPhoto` (storage), `createLocation`/`renameLocation`, `sendToRepair(itemId, expectedBackOn, vendor?, notes?)` (notifies owners of affected upcoming shoots), `receiveFromRepair(repairId)` (status back to available; notify Tech Lead + upcoming reservers), `resolveIssue(id)`, `forceCheckin(itemId)` (fixing reality), `importEquipmentCsv(rows)` — validates all rows (name, category, location, quantity, duplicate serials), expands `quantity > 1` into `#1..#n`, generates codes, creates items + private rows; returns per-row results. Create-only, no upsert.
- [ ] Every notification: in-app `notifyUser(...)` twin + Slack DM via Task 5 helper.
- [ ] **Verify:** typecheck.

## Task 5: Slack (separate bot) + cron

**Files:** `lib/slack-lockup.ts`, `app/api/cron/equipment-sweep/route.ts`, `vercel.json`

- [ ] `lib/slack-lockup.ts`: clone `lib/slack.ts` conventions against `LOCKUP_SLACK_BOT_TOKEN` — never throws, no-ops without token, form-encoded calls, DM via existing `users.slack_id` (fall back to email lookup like the HR bot does). Message builders for: conflict checkout, due-today, overdue, tech-lead overdue digest, issue reported, sent-to-repair (to affected shoot owners/reservers), back-from-repair, reservation expired, take-over. Optional channel feed via `LOCKUP_SLACK_CHANNEL`. No em/en dashes in message copy.
- [ ] Cron route (Bearer `CRON_SECRET`, mirroring `reconcile-compoff`):
  1. Due today → DM holder. Overdue → DM holder daily + one digest DM to all `manage_equipment` holders.
  2. Active reservations where `now() > shoot.starts_at + 24h` and not picked up → status `expired`, DM reserver.
  3. Repairs with `expected_back_on = today` → remind Tech Lead.
- [ ] Add to `vercel.json` crons (daily, pick 05:00 UTC ≈ 10:30 IST).
- [ ] **Verify:** typecheck; hit the route locally with the Bearer token against dev data.

## Task 6: QR landing page + scanner + checkout/return/transfer flows

**Files:** `app/e/[code]/page.tsx`, `components/lockup/qr-action-card.tsx`, `qr-scanner.tsx`, `checkout-sheet.tsx`, `return-sheet.tsx`, `transfer-sheet.tsx`

- [ ] `/e/[code]`: server component; unauthenticated scan hits middleware → `/login` → **must return to `/e/[code]` after login** (add redirect-back param support in middleware/login if not present). Loads `getItemByCode`, renders the action card.
- [ ] Action card (mobile-first, big buttons): photo, name, code, status, holder + due date, home location, upcoming reservations, history accordion. Primary action by state: available → "Check out"; checked out to me → "Check in"; checked out to someone else → "Take over from {name}"; reserved for a currently-running shoot → "Pick up for {shoot}"; in_repair → read-only banner with expected-back date.
- [ ] Checkout sheet: cart list (starts with scanned item), "Scan more" opens `qr-scanner.tsx` (getUserMedia + `jsqr`, decodes `/e/{code}` URLs, adds items via a lookup action, duplicate-safe), due date+time field (default tomorrow 19:00 IST), confirm → two-phase action; if warnings returned, show the reservation-conflict dialog (shoot, reserver, dates) with "Take anyway" / "Cancel".
- [ ] Return sheet: location picker defaulting to home location; optional "Report a problem" textarea. Transfer sheet: confirm + optional new due date.
- [ ] **Verify:** manual mobile-viewport walk-through: scan-sim (open `/e/{code}` directly), checkout cart with 2 items, conflict warning path, return with issue, take-over. Toast on every success/failure.

## Task 7: Employee area `/lockup`

**Files:** `app/(app)/lockup/page.tsx`, `app/(app)/lockup/shoots/[id]/page.tsx`, `components/lockup/inventory-browser.tsx`, `my-gear.tsx`, `shoot-list.tsx`, `shoot-detail.tsx`, `shoot-create-dialog.tsx`, `reservation-picker.tsx`

- [ ] `/lockup`: tabs (Gear / My gear / Shoots). Inventory browser: search + filter by category/location/status, each row shows live status ("With Varun, due Jul 10 7pm" / "In repair, back Jul 20" / "Available in L1"), tap → item page (`/e/{code}` reused). My gear: my open checkouts + due dates + quick check-in. Shoots: upcoming + mine, create button.
- [ ] Shoot detail: dates/owner/status, reserved items with live status, **loud conflict banners** (in repair past shoot start; still out past shoot start; double-reserved), add/remove reservations via availability-aware picker, cancel shoot.
- [ ] **Verify:** manual walk-through: create shoot, reserve 3 items, send one to repair via Task 8 console, confirm conflict banner + Slack/notification.

## Task 8: Tech Console `/tech`

**Files:** `app/(app)/tech/page.tsx`, `components/lockup/tech/*` (console-client with tabs: overview, inventory, shoots, repairs, issues)

- [ ] Page guarded like `/hr` (redirect unless `manage_equipment`/hr/founder). Server-fetch via `getTechConsoleData` + `listEquipment`.
- [ ] Overview: out now, overdue (red), in repair, open issues, upcoming shoots w/ conflict badges.
- [ ] Inventory: table + create/edit dialog (all fields incl. photo upload + purchase data), retire/lost, force check-in, **CSV import wizard** (upload → parse with `papaparse` → validation preview table → confirm; template + docs at `docs/equipment/README.md`), **label download** (Task 9 component), locations manager.
- [ ] Repairs: send (vendor, expected date, notes) / receive; history. Issues: open list, resolve or "send to repair" shortcut.
- [ ] **Verify:** manual: import the example template CSV (quantity expansion to numbered items), edit an item, full repair cycle, resolve an issue.

## Task 9: QR label PNGs

**Files:** `components/lockup/tech/label-download.tsx`, deps `qrcode` + `jszip`

- [ ] Client component: select items (or "all filtered"), pick variant — **standard** (QR + name + code) or **mini** (QR + code only) — render each label to an offscreen canvas (1024px QR, ECC M, URL `{LOCKUP_QR_BASE_URL}/e/{code}`), export PNGs. One item → direct download; many → `jszip` ZIP with filenames `{safe_name}__{code}.png`.
- [ ] Blocking banner when `LOCKUP_QR_BASE_URL` is unset: "Set Lockup's permanent QR domain before printing labels" — downloads disabled. Expose the value to the client via a server-passed prop (env is server-side).
- [ ] **Verify:** download ZIP for 5 items, scan a printed/on-screen QR with a real phone → lands on `/e/{code}`.

## Task 10: Nav + standalone Lockup website (host gating)

**Files:** `middleware.ts`, `app/(app)/layout.tsx`, `components/layout/sidebar.tsx`, `mobile-nav.tsx`, `bottom-nav.tsx`, `topbar.tsx`, `app/login/*` (branding only)

- [ ] Orbit nav: add "Lockup" (icon: `Camera` or `Box`) to sidebar + mobile nav for everyone; "Tech Console" entry gated on `manage_equipment` (like HR Console gating).
- [ ] Host gating in `middleware.ts`: when `LOCKUP_HOST` is set and `request.headers.get('host')` matches it, allow only `/lockup*`, `/tech*`, `/e/*`, `/login`, `/reset-password`, `/auth/*`, `/api/cron/*`; redirect `/` and anything else to `/lockup`. Orbit host behavior unchanged (Lockup module remains reachable there too).
- [ ] Site flavor: in `app/(app)/layout.tsx` read `headers().get('host')`, derive `site: 'orbit' | 'lockup'`, pass to the app shell. On `lockup`: nav shows only Gear / Shoots / My gear / Tech Console / Profile-lite, topbar says **Lockup** (not Orbit), login page shows Lockup branding (same host check in `app/login`).
- [ ] `/e/[code]` lives outside `(app)` so it renders shell-less on both hosts (it's the scan target; minimal chrome, works regardless of host).
- [ ] **Verify:** simulate with `curl -H 'Host: <LOCKUP_HOST>'` + browser via `/etc/hosts` entry: Lockup host shows only Lockup; Orbit host unchanged; same login works on both.

## Task 11: Docs, build, deploy checklist

- [ ] Update `CLAUDE.md`: env vars (`LOCKUP_*`), module summary paragraph, cron entry.
- [ ] `npm run typecheck` && `npm run build` clean.
- [ ] Full manual walk-through (both hosts, mobile viewport): import CSV → labels → scan → checkout cart → conflict warning → transfer → return with issue → repair cycle → reservation expiry (run sweep manually) → Tech Console overview accuracy.
- [ ] **Deploy/runbook (owner + Gaurav):**
  1. Run `023_equipment.sql` on prod Supabase; regenerate types already committed.
  2. Create the second Slack app/bot named "Lockup", grab `xoxb-` token → `LOCKUP_SLACK_BOT_TOKEN`.
  3. Choose + buy Lockup's domain; add to the Vercel project; set `LOCKUP_HOST` + `LOCKUP_QR_BASE_URL`.
  4. Gaurav fills `docs/equipment/inventory-template.csv`, imports in Tech Console, downloads label ZIP, prints stickers (Canva), labels all gear.
  5. Grant `manage_equipment` to Gaurav in `/permissions`.
  6. Announce in Slack; first shoot gets planned in Lockup.
