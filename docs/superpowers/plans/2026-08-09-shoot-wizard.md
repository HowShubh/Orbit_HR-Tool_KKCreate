# Shoot Wizard v2: one flow for shoots, studios, and gear

Date: 2026-08-09. Owner: Shubham. Status: approved and built 2026-08-09
(migration 028; apply to Supabase before deploying).

Replaces the single "New shoot" dialog with a three-step wizard (Details, Studio, Gear)
based on Shubham's wireframes, and adds two new subsystems the wireframe implies:
item-level approvals and kits.

## Principles

1. **The shoot stays the anchor.** Every path through the wizard creates exactly one
   `equipment_shoots` row. Studio blocks and reservations always hang off it. There is
   no such thing as a studio booking or a reservation without a shoot.
2. **Everything after the name is optional; submit anytime.** Each step has a visible
   submit. Skipping a step attaches nothing.
3. **Two doorways, one wizard.** "New shoot" starts at Details. "Book studio" starts at
   Studio with an auto-generated, editable name. Both can stop at any step.
4. **Anything skipped in the wizard can be added later** from the shoot detail page
   (which already supports reservations, studio blocks, and editors).

## Entry points

- Shoots tab: **New shoot** button (starts at step 1) and **Book studio** button
  (starts at step 2, prefills name like "Studio hold - Tue 12 Aug", editable).
- The wizard is a full page at `/lockup/shoots/new` (query param `?start=studio` for
  the studio doorway), not a dialog. Reasons: the studio week grid and gear browser
  need room, mobile gets a natural full-screen flow, and the page is deep-linkable.

## The three steps

### Step 1: Details

- **Shoot name** (required to submit; everything else optional).
- **Location type**: Studio / Outside toggle. Outside shows a free-text address field.
  Choosing Studio doesn't ask which one here; that's step 2. If a studio is booked in
  step 2, the shoot's `location` is auto-filled from it (still editable).
- **Notes** (optional).
- **Editors** (optional): multi-select people picker, "Who else can plan this shoot?"
  Uses the existing `equipment_shoot_editors` model; also editable later on the detail
  page. This covers the add-editor feature the wireframe missed.
- **Shoot window**: the calendar + time-slot picker built on 2026-08-09 (range
  calendar, 30-min chips). Prefilled to tomorrow 10:00 to 18:00. If the user books a
  studio slot in step 2 and hasn't touched the window, the window adopts the studio
  slot. The window is never NULL: reservations and conflict logic depend on it.
- Channel field from the wireframe: **cut** (decision 2026-08-09).

### Step 2: Studio

- Cards for each studio (from `equipment_studios`) with a live hint line
  ("free today after 2pm", "busy til 3pm") computed from `equipment_studio_blocks`.
- Selecting a studio shows a **week grid** (Mon to Sun columns, hour rows, IST):
  existing blocks are drawn as busy tiles labeled with their shoot names; drag or
  tap-start/tap-end selects a free range. Start/end dropdowns underneath mirror the
  grid selection for precision and accessibility (15-min steps).
- Conflicts are impossible to submit: the UI blocks selecting an occupied range, the
  server re-checks with the friendly named-clash error, and the Postgres exclusion
  constraint (23P01) remains the race-safe backstop. Unchanged from today.
- Skippable. "No studio" is a first-class outcome (outdoor shoots).

### Step 3: Gear

- Left rail: category list with counts (existing 12 categories), plus "All types".
- Toggle: **All / Kits**. Search within the current category.
- Each item row shows a live availability badge for the shoot's window:
  - `avail` (green): no conflict.
  - `out til Fri` (red): currently checked out with a due date inside/after the window.
  - `reserved: Ep 43` (amber): another shoot's active reservation overlaps the window.
    Selectable anyway (warn-but-allow stays for unflagged items).
  - `approval` (amber): item is approval-flagged (see Approvals below).
- Selecting adds to the right-hand **Selected rail** (desktop) / bottom sheet summary
  (mobile), with counts and per-item remove. The rail also shows the studio slot and
  an "N approvals needed" pill when flagged items are selected.
- Skippable. Gear can be added later from the shoot detail page, exactly as today.

### Submit (from any step)

One server action `createShootPlan` receives `{details, studioBlock?, itemIds[]}` and:

1. Creates the shoot (existing validation: name, window sanity).
2. Adds the studio block if provided (named-clash pre-check + 23P01 catch; on clash
   the wizard returns to step 2 with the error, shoot NOT yet created: the action
   validates the block before inserting the shoot so we never strand a half-plan).
3. Creates reservations: `active` for normal items, `pending` for approval-flagged
   ones (see below). Dedupe and the assigned/retired/lost filters reuse the existing
   `reserveItems` logic.
4. Audit log entry summarizing the whole plan in plain English.
5. Redirects to the shoot detail page, which shows everything just created.

The old ShootCreateDialog is retired; the schedule-picker components it introduced
are reused inside step 1.

## Edge-case matrix

| Case | Behavior |
|---|---|
| Name only, submit at step 1 | Shoot row only. Detail page nudges "reserve gear / book studio". |
| Studio only via Book studio | Minimal shoot (auto name) + studio block. Gear later. |
| Gear only, no studio | Shoot + reservations. Location = whatever step 1 said. |
| Same-day 4-hour shoot | Window picker already supports same-day + time slots. |
| Studio slot picked, window untouched | Window adopts the studio slot. |
| Window edited after studio slot picked | Both kept as-is; no forced sync (multi-day shoots can contain a shorter studio slot). |
| Studio range races with another booking | Server rejects with named clash; wizard returns to step 2; nothing created. |
| Flagged gear selected | Reservation lands as `pending`; approvers DM'd; rail shows "N approvals needed". |
| Editor added in step 1 | Editor can later modify the shoot exactly like today. |
| Wizard abandoned mid-way | Nothing persisted; all state is client-side until submit. |

## New subsystem 1: item-level approvals

Decision (2026-08-09): approvals on flagged items only; everything else stays
warn-but-allow.

- **Flagging**: `equipment_items.requires_approval boolean not null default false`,
  toggled in the Tech Console item dialog. Visible as an "approval" badge everywhere
  the item renders (browser, wizard, QR card).
- **Who approves**: anyone with `manage_equipment` (Tech Lead via individual grant,
  HR, founders). No new capability needed; CAPABILITIES.md untouched.
- **Reserving a flagged item** creates the reservation with new status `pending`.
  Approvers get a Lockup-bot Slack DM + in-app notification with a link to the
  approvals queue. (Plain link, not Slack interactive buttons: the current Slack
  integration is one-way and adding an interactivity endpoint is out of scope.)
- **Approvals queue**: new "Approvals" section in the Tech Console (badge count in
  the tab bar). Approve sets status `active` and DMs the reserver; reject sets new
  status `rejected` with an optional reason, DMs likewise. Both audited.
- **Physical checkout of a flagged item** (scan at cupboard): allowed only when the
  holder's shoot has an `active` (approved) reservation for it, or the actor has
  `manage_equipment`. Ad-hoc grabs of flagged items are refused with "This item needs
  Tech Lead approval: reserve it through a shoot first." Without this, the gate would
  be trivially bypassed by not reserving. Unflagged items keep today's rules.
- **Lifecycle**: cancelling the shoot cancels pending reservations (existing path).
  The daily sweep expires still-pending reservations 24h after shoot start, same as
  unpicked active ones. Conflict warnings treat `pending` like `active` (the intent
  to use the item is real).
- Reservation status enum grows: `active | pending | rejected | picked_up | expired |
  cancelled`. The partial-unique index on `(item_id, shoot_id)` extends to cover
  `status in ('active','pending')`.

## New subsystem 2: kits

- Tables: `equipment_kits (id, name, notes, created_by, created_at)` and
  `equipment_kit_items (kit_id, item_id, unique(kit_id, item_id))`. Prefixed, only
  outward FKs to users/items: module stays self-contained.
- **Tech Console**: new "Kits" tab: create/rename/delete kits, add/remove member
  items (pooled items only; assigned devices and retired/lost items excluded).
- **Wizard**: the Kits toggle lists kits with an availability summary ("5 of 6
  available"). Adding a kit adds its member items to the selection individually;
  unavailable members are skipped with a visible notice ("Skipped A7 IV: out til
  Fri"). Members are removable one by one after adding.
- **No kit entity downstream**: reservations, checkouts, and returns remain strictly
  per item. A kit is a selection shortcut, not a custody unit. This avoids every
  partial-return and partial-availability headache.
- Flagged members still require approval individually.

## Schema migration (028_shoot_wizard.sql)

1. `equipment_items.requires_approval boolean not null default false`.
2. `equipment_reservations.status` check constraint replaced to add `pending`,
   `rejected`; partial unique index rebuilt for `('active','pending')`.
3. `equipment_kits`, `equipment_kit_items` + RLS (org-wide read, `manage_equipment`
   write, mirroring other equipment tables).
4. Regenerate `lib/supabase/database.types.ts` (hand-maintained additions if no DB
   access from this machine; must be applied to Supabase before deploy).

## Code changes by file

- `lib/actions/lockup.ts`: `createShootPlan`, `approveReservation`,
  `rejectReservation`, kit CRUD, checkout gate for flagged items, `reserveItems`
  gains pending logic.
- `lib/queries/lockup.ts`: week-grid availability per studio, wizard gear
  availability (existing `getAvailabilityForShoot` generalized to a window instead
  of a shoot id), kits list with availability, approvals queue, approval count.
- `lib/slack-lockup.ts`: approval request DM, approval decision DM.
- `lib/lockup/sweep.ts`: expire `pending` alongside `active`.
- `app/(app)/lockup/shoots/new/page.tsx` + `components/lockup/wizard/*`: the wizard
  (step shell, details step reusing schedule-picker, studio step with week grid,
  gear step with browser + kits + selected rail).
- `components/lockup/shoot-cards.tsx`: New shoot + Book studio buttons route to the
  wizard; dialog import removed.
- `components/lockup/tech/*`: Kits tab, Approvals queue, requires_approval toggle in
  item-dialog.
- Shoot detail page: pending reservations render with an amber "awaiting approval"
  state; approvers see inline approve/reject.
- QR action card (`/e/[code]`): flagged-item checkout gate messaging.

## Build order

1. Migration + types.
2. Actions + queries (approvals, kits, createShootPlan, checkout gate, sweep).
3. Wizard UI (steps 1 to 3, rail, entry buttons, mobile layout).
4. Tech Console (kits, approvals queue, item flag).
5. Shoot detail + QR surfaces for pending/flagged states.
6. Slack DMs.
7. Typecheck, build, browser walk-through via dev harness.

## Out of scope (unchanged from Lockup v1)

Slack interactive buttons, external borrowers, maintenance schedules, quantity
pools, native app, drag-to-select on mobile (tap-start/tap-end works there).
