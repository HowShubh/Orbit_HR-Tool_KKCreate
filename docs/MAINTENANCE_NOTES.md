# Maintenance Notes

A running log of non-obvious changes, why they were made, and what to watch out
for. Newest entries first. Read this before touching the global store, the
dashboard, or any date math.

---

## 2026-06-22 — Delete leave type

Added `deleteLeaveType(key)` (`lib/actions/leave-types.ts`): refuses **system**
types and any type already referenced by leave entries (would lose history —
deactivate instead); otherwise clears the type's unused balance rows (eligibility
cascades) and deletes it. UI: a **Delete** button + inline confirm in the Leave
Types editor (`leave-types-tab.tsx`), shown only for non-system types.

---

## 2026-06-22 — Per-person detail view (leave history) for HR + team leads

A consolidated "everything about one person's time off" view, reachable two ways.
- **Data:** `lib/actions/person-detail.ts → getUserLeaveProfile(userId)` ('use server')
  returns profile + manager + teams + balances + ALL leave rows (enriched with
  type_name/category) + earned comp-off grants. Authorized via
  `requireCapability('view_leaves', userId)` — HR/Founders see anyone, a team lead
  sees members of teams they lead, a person sees themselves. Reconciles comp-off
  expiry first. (Types live in `lib/person-detail-types.ts` — must NOT be exported
  from the 'use server' file or the build rejects non-async exports.)
- **Shared UI:** `components/people/person-detail.tsx` — profile facts, balances,
  earned comp-off (with expiry), and a filterable leave/WFH history (type +
  status filters). Fetches on mount.
- **HR Console → Users:** click a name → `person-detail-drawer.tsx` (right
  slide-over built on radix Dialog).
- **Team section:** click a member card → inline detail panel below the grid.
  Gated client-side to HR/Founder or the lead of the selected team (matches the
  server authz, avoids a forbidden error).
- Build verified (the 'use server' + client-component split compiles).
- Fix: the balances grid initially showed duplicate cards (same type across FY
  2026 + FY 2027). `getUserLeaveProfile` now filters balances to the current FY +
  comp-off year (`[currentFiscalYearStart(), 0]`), matching the rest of the app.

---

## 2026-06-22 — Dead-code sweep + wipe-script fix + .gitignore

- **Dead code removed** (`lib/actions/leaves.ts`): legacy `createMyLeave` (no UI
  used it — the planner uses `createMyLeavePlan`), its only-consumer helper
  `expandRequestedRange`, and `getLeaveReviewers` (the old primary-team-lead
  routing). `requestLeaveDeletion` now uses the manager-primary
  `resolveLeaveApprovalRouting` (HR/Founder fallback) for its notification, so
  deletion approvals route to the same approver as everything else.
- **Wipe script fix** (`db/scripts/wipe-except-founder.sql`): it deleted `leaves`
  but not `leave_requests`, whose `user_id`/`created_by` FKs have no
  `ON DELETE CASCADE` — so `DELETE FROM auth.users` would fail on any non-founder
  with a leave request. Added `DELETE FROM public.leave_requests`. Also re-seeds
  the founder's leave/WFH balance from the **configured** leave-type quotas
  instead of hardcoded 18/36.
- **.gitignore**: added `.claude/` (local Claude Code tooling config / personal
  settings — shouldn't be in the repo).

---

## 2026-06-22 — Permissions tab: scope display + enforcement finding

- **#1 scope display:** capability chips in `permissions-client.tsx` (By-User and
  By-Capability) now show each grant's scope ("· all", "· teams: Finance",
  "· users: Asha") via a new `scopeLabel` helper. Completes the "who / what /
  source / over-what" picture (also covers #2 — role+bundle caps are materialized
  as `user_capabilities` rows, so the By-User view already lists effective access).

- **⚠️ ENFORCEMENT FINDING (important):** **manual capability grants are currently
  inert** — granting a capability via the Permissions tab does NOT change what the
  person can see/do. `requireCapability` (server, authoritative) and
  `buildCanFromRole` (client UI) both authorize by **role only** — neither reads
  `user_capabilities`. The only layer that reads grants is `user_can()` in RLS, but
  the app reads all leave/balance data via the **admin client (bypasses RLS)** and
  uses the browser client only for auth + realtime — never to read leaves/balances.
  So the "finance person gets view-only access to all leaves" example records a row
  + shows a chip but grants **no actual access**. Role/bundle capabilities DO work
  (the app authorizes by role).
  - **To make manual grants real (Option A):** wire `user_capabilities` (with scope,
    mirroring `user_can()`) into `requireCapability` AND into the client `can` (load
    the actor's grants in `CapabilityProvider`), and have view surfaces gate on it.

- **DECISION — Option B (roles-only, Permissions made read-only).** Rather than imply
  a power the app doesn't deliver, manual capability management is now locked:
  - New flag `lib/permissions-config.ts → PERMISSIONS_READ_ONLY = true` (single switch).
  - Server: `grantCapability` / `revokeCapability` / `applyBundleToUser` throw a
    read-only `ActionError` when the flag is set (defense in depth — can't be changed
    via any path).
  - UI (`permissions-client.tsx`): Apply Bundle / Grant Capability / per-user Grant /
    revoke (✕) buttons are **disabled**, with a read-only banner pointing to
    HR Console → Users for role changes. Still **founders-only** and **desktop-only**
    (unchanged). The view remains fully usable for *seeing* who has what (now with scope).
  - To switch to Option A later: flip `PERMISSIONS_READ_ONLY` to false AND do the
    enforcement wiring above.

---

## 2026-06-22 — Comp-off expiry: nightly global job

The lazy per-user reconcile (on planner/My-Leaves open) left HR's global balances
stale. Added a global path:
- `reconcileAllCompoffExpiry(adminClient)` in `lib/compoff-expiry.ts` (reconciles
  every user with approved grants).
- `app/api/cron/reconcile-compoff/route.ts` (GET) runs it, guarded by `CRON_SECRET`
  (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; set this env in prod).
- `vercel.json` cron `30 19 * * *` (19:30 UTC = 01:00 IST nightly).
- Middleware allowlists `/api/cron/`. Verified locally (returns `{ok, usersProcessed}`).
The lazy spend-path reconcile stays as a belt-and-suspenders guard.

---

## 2026-06-22 — Approval routing unified to manager-primary model (Part 1: backend)

Replaced the three disagreeing approver functions with one model (see memory
`orbit-approval-model` for the canonical spec). New `lib/approvers.ts`:
`resolveLeaveApprovalRouting` (founder→auto-approve; else manager; else HR/Founder
safety net; team leads = FYI), `downstreamAudienceForUser` (reports ∪ led-team
members), `managedUserIds` (queue scope).

Wired:
- `createMyLeavePlan`: founders' plans are created **active** (balance deducted
  immediately) and notify everyone under them; everyone else → pending with the
  **manager** (actionable) + **FYI to team leads** ("pending with <manager>").
- `requireLeaveApprover`: now **manager only**, or HR/Founder (override). Dropped
  the "any team you lead" approval path.
- `approveLeaveRequestById`: on approval, notifies everyone under the applicant
  ("X will be away").
- `listPendingApprovalsForReviewer` + `listLeaveRequestHistory` (scope 'team'):
  now show ONLY the reviewer's direct reports (`managedUserIds`).
- `requestCompoff`: founders auto-approve their own comp-off (trigger credits on
  insert).

**Part 2 (done): override confirm prompt** — `ApprovalCard` now detects when the
viewer is HR/Founder acting on someone whose manager isn't them (`user_manager_id`
added to `LeaveRequestWithDays`, resolved in `listPendingApprovalsForReviewer`) and
shows an inline amber confirm: *"This is normally &lt;manager&gt;'s request to
decide … override and approve/reject?"* before calling the action. Managers acting
on their own reports see no prompt. (The existing audit records actor vs. manager,
so overrides are traceable.)
- **Comp-off override prompt (done):** added the same confirm to the HR Console
  `compoff-tab` (it shows all grants, so HR/Founder can act on a grant whose
  `manager_id` isn't them). The dashboard comp-off card needs no prompt — its query
  only returns grants where `manager_id = the viewer`, so the viewer is always the
  assigned approver. Comp-off and leave have separate approval UIs because comp-off
  is a single `compoff_grants` row (no multi-day/grouping/conflicts) and predates
  the `ApprovalQueue` refactor.

---

## 2026-06-22 — Leave system: pending-aware balance check (double-spend fix)

Balance `used` is only deducted at approval, so pending requests didn't reserve
anything — a user could stack multiple pending requests that each fit individually
but together exceed their balance (the 2nd+ would then fail confusingly at the
approver's end). Fixed:
- New `ensurePendingAwareBalance()` in `lib/actions/leaves.ts`, called in
  `createMyLeavePlan` before building rows. It sums existing **pending** days
  (status 'pending') per type and blocks if `request + pending > allocated − used`,
  with a clear message: *"You already have N day(s) of X awaiting approval … cancel
  a pending request before applying."* (active/delete_requested are already in `used`.)
- `getMyLeavePlannerData` now returns a `pending` map (own pending days by type);
  the dialog's `buildAllocation` subtracts it so the preview/submit-gate reserve
  pending client-side too, and the balance card shows "N pending approval".

---

## 2026-06-22 — Leave system: comp-off expiry enforcement + half-day support

From the leave-flow audit. Fixed the two highest-priority items:

### 1. Comp-off expiry now actually debits the balance
Comp-off grants expire 90 days after the work date (`expires_at`), and approval
credits the year-0 comp-off balance via the `handle_compoff_approved` trigger —
but nothing debited expired comp-off, so it stayed spendable forever.
New `lib/compoff-expiry.ts → reconcileCompoffExpiry(adminClient, userId)`:
recomputes comp-off `allocated` as `earnedEver − max(0, expiredEarned − used)`
(FIFO: only forfeits expired days that weren't already used; keeps remaining ≥ 0;
idempotent). Called on the spend/read paths: `getMyLeavePlannerData` and
`createMyLeavePlan` (`lib/actions/leaves.ts`) and the My Leaves page
(`app/(app)/leaves/page.tsx`).
- **Scope note:** applied lazily per-user where comp-off is viewed/spent. HR's
  global Balances view won't reflect a user's expiry until that user next opens
  their planner / My Leaves. A nightly global job (`reconcileCompoffExpiry` over
  all users) would close that gap — not yet scheduled.

### 2. Half-day support in the leave planner
The live planner (`createMyLeavePlan` + `leave-form-dialog.tsx`) was whole-days
only; the half-day-capable `createMyLeave` was dead code. Added half-days to the
real flow:
- Schema: each plan day takes optional `half_day` + `half_day_position`
  (`first_half`/`second_half`).
- `buildPlanRows` deducts 0.5 for half days; `createMyLeavePlan` persists
  `days_deducted = 0.5`, `half_day_start`, `half_day_position`. Monthly-quota and
  balance math use the fraction; approval deducts 0.5 correctly.
- UI: each entry in the "Selected Plan" list has a **Half day** toggle + a
  **1st/2nd half** selector; balances preview reflects 0.5.
- `createMyLeave` remains dead (could be removed later).

---

## 2026-06-22 — Notifications: realtime, mute, mark-on-click, copy fix

Audit found notifications were created/stored/displayed correctly (right recipients)
but didn't feel live and had dead pieces. Fixed all five:

1. **Realtime (live bell).** `StoreProvider` (`lib/store.tsx`) now subscribes to
   Supabase Realtime `postgres_changes` (INSERT + UPDATE) on `notifications`
   filtered to the current user. New notifications prepend live; read-state updates
   apply live. **Requires migration `016_realtime_notifications.sql`** (adds the
   table to the `supabase_realtime` publication) — RUN IT in Supabase or realtime
   silently does nothing. RLS (`user_id = auth.uid()`) scopes the stream.
2. **`CLAUDE.md`** realtime claim rewritten to match the real implementation.
3. **Mute now works.** `notifyUser` (`lib/actions/notifications.ts`) checks the
   recipient's `notifications_muted` and skips creating the notification if muted.
   (Decision: mute = don't create in-app pings at all; they can still see pending
   items on the dashboard/approval queue. Change here if you want "create but
   don't badge" instead.)
4. **Email copy fixed.** Settings no longer claims to disable "email" notifications
   (none are sent) — now "Stop receiving in-app notifications".
5. **Mark-read on click.** Clicking a notification now marks just that one read via
   the previously-dead `markNotificationRead` action + new `markOneRead` store
   method (optimistic). "Mark all read" still works.

---

## 2026-06-22 — Fixed dead topbar Sign out + removed decorative search

From the "what isn't working" audit, the two genuinely-broken topbar items
(`components/layout/topbar.tsx`):
- **Sign out** (profile dropdown) had no handler — now wired to
  `createClient().auth.signOut()` → `/login` (same flow Settings uses), with a
  pending state. Uses `onSelect` + `preventDefault` so the menu doesn't fight the
  async nav.
- **Global search** box ("Search teammates, leaves…") was decorative (no state /
  handler / results) — removed. Real cross-entity search is a future feature, not
  a quick wire-up. Page-level search (Users, Audit, Permissions, leaves) already
  works and was untouched.

Still open from the audit (backlog, not bugs): date-of-birth field → Birthday
tab; profile photo upload; "Device With Me" (V2 stub); `/permissions` missing
from mobile nav.

---

## 2026-06-22 — Removed the "View as" role preview

The topbar "View as" role-preview dropdown (a build-time aid for checking role-gated
UI) was removed entirely per request — it was never a real product feature. Deleted:
the dropdown + `VIEW_AS_ALLOWLIST` in `components/layout/topbar.tsx`, and `realRole`
/ `setRoleImpersonation` / `rolePreview` from `lib/store.tsx`. `currentUser` is now
simply the real user (the store no longer overrides the displayed role). Server-side
permissions were always enforced from the real role, so nothing about access changes.

---

## 2026-06-10 — Fiscal-year de-hardcoding + bulk "apply quotas" + balances year switcher

### Fiscal year is now derived, not hardcoded
`leave_year` (integer) = the FY's **start year**; FY runs Jun 1 → May 31, so `2026`
means **FY 2026-2027**. New helpers in `lib/date.ts`:
- `currentFiscalYearStart()` — IST-aware current FY start year (Jun boundary).
- `formatFiscalYear(startYear)` → `"2026-2027"` (used for all FY labels now:
  Balances tab, Annual Reset tab, dashboard).

Removed every hardcoded `CURRENT_LEAVE_YEAR = 2026`: `app/(app)/hr/page.tsx`,
`app/(app)/leaves/page.tsx`, `lib/queries/dashboard.ts`, `lib/actions/users.ts`,
`lib/actions/users-bulk.ts`, `app/api/setup/root-admin/route.ts`. The shared
`lib/leave-types.ts` `CURRENT_LEAVE_YEAR` now = `currentFiscalYearStart()`.

### Balances tab: year switcher + "Apply current quotas"
The Balances tab was locked to one hardcoded year and couldn't be reconciled with
quota changes. Now (`components/hr/balances-tab.tsx`):
- **Fiscal-year `<select>`** — switch years; balances refetch via the new
  `fetchBalancesForYear(year)` server action (`lib/actions/balances.ts`).
- **"Apply current quotas" button** → `applyQuotasToYear({ leaveYear, prorate })`:
  sets every active user's allocation for that FY to each leave type's configured
  quota, **pro-rated by join date**, **preserving `used`** (NOT an annual reset —
  doesn't zero usage). Comp-off (earned) is untouched. Per-person manual edits are
  overwritten — there's a confirm banner.

This is the correct tool for "push a new quota to existing employees" — which is
what HR was (wrongly) trying to do via Annual Reset. Annual Reset remains for
provisioning a fresh **future** FY (and zeroes `used`).

### Bug found via DB query (why reset "gave everyone 36")
The Balances tab showed FY 2026 (hardcoded) while Annual Reset defaulted to
`leaveYear + 1` (2027) — so resets landed in a year the UI couldn't show. Combined
with the hardcoded year, quota edits looked like they did nothing. Both addressed
above (derived year + switcher).

### Also fixed: annual-reset audit UUID bug
`runAnnualReset` wrote `writeAudit(..., entity_id = String(leaveYear))`, but
`audit_log.entity_id` is a UUID — that throws when a reset runs. Changed to
`actor.id` (year recorded in the diff). Updated the reset tab copy: it uses each
type's configured quota now, not a hardcoded 18/36.

---

## 2026-06-10 — Org-clarity slice + leave-type quota fix

### Org clarity (reporting structure)
Made the org/reporting model render clearly and stay fully data-driven (tiers come
from the `manager_id` chain only — top = `manager_id` null; no hardcoded "levels").
- `lib/queries/org.ts` (`getOrgTree`): now returns `{ roots, orphans }`, enriches
  each node with `ledTeams`/`memberTeams` (with a `solo` flag for single-person
  teams), is cycle-safe, and surfaces **orphans** (active people whose manager is
  no longer active) instead of silently dropping them.
- `components/org/org-client.tsx`: redesigned — team chips on each card (manages /
  member-of, "· solo"), direct-report counts, crown on top-level people, and a
  "Needs a manager" section for orphans.
- Profile (`getMyProfileContext` + `profile-client.tsx`): added **"Reports to"** and
  **"Manager of"** (direct reports) rows.
- KK Create's real org is entered as **data** (HR Console), never hardcoded. See
  the memory note `kkcreate-org-structure` for the actual structure.
- Still TODO (agreed next slice): a guided **replace-manager / Leaver** flow
  supporting permanent replacement, temporary/acting manager + delegation, and
  promoting an existing member.

### Leave-type quota vs. per-user balances
**Model (by design):** `leave_types.annual_quota` is a *template/default*;
`leave_balances.allocated` is the *per-user actual*, copied (pro-rated) at
onboarding and then independent — so HR can set subjective per-person balances in
the Balances tab. Changing a quota does NOT (and should not) rewrite existing
balances.

**Bug fixed:** `lib/db/seed-balances.ts` previously **hardcoded** Leave→18 / WFH→36
when seeding new hires, ignoring the editable `annual_quota`. So editing those two
quotas in HR Console → Leave Types appeared to do nothing. Now seeding uses the
configured `annual_quota` for all types (still pro-rated; compoff still starts 0).
Removed the now-unused `DEFAULT_LEAVE_ALLOCATION`/`DEFAULT_WFH_ALLOCATION` exports.

**UI hint added** (`components/hr/leave-types-tab.tsx`): a banner clarifying that
quota is the default for new joiners + annual reset, and current balances are
edited in the Balances tab.

> Not done (offered, deferred): a "apply quota to existing balances" bulk action.
> Annual reset (`lib/actions/annual-reset.ts`) already respects the live quota.

---

## 2026-06-10 — Mock-prototype removal, real-data wiring, IST dates, error boundaries

### Background: why this work existed

The app began life as a **clickable prototype** backed by hardcoded sample data
in `lib/mock-data.ts` (fake users like "Kabir Kapoor", fake leaves/balances/
holidays, and a frozen "today" of `2026-04-28`). It was later wired to a real
Supabase backend (`lib/queries/*` + `lib/actions/*`), but **prototype code was
never fully removed**. Real and mock code coexisted, and in a few places the
mock data was still leaking into the live UI. This pass finished the migration.

### 1. The global store no longer holds mock data (`lib/store.tsx`)

**Before:** `StoreProvider` seeded `leaves`, `balances`, `compoffGrants`,
`users`, and `notifications` from `lib/mock-data.ts`. Worse, `currentUser` was
resolved with `users.find(u => u.email === realUser.email)` — so any logged-in
user whose email matched a seed (e.g. `kabir@kkcreate.com`) was shown the
**mock** user's role/name/team in the sidebar, topbar, and mobile nav. Users
without a match got empty `team_ids`.

**After:** the store holds **only real, server-sourced state**:
- `currentUser` / `realRole` — built straight from the real `users` row passed
  down by `AppShell` (no mock fallback). An unauthenticated `PLACEHOLDER_USER`
  is used for the login/setup shell only (those pages never render user chrome).
- `notifications` / `markNotificationsRead` — real, from `listMyNotifications`.
- `toasts` / `pushToast` / `dismissToast` — transient UI only.
- `setRoleImpersonation` — see "View as" below.

Everything else (`leaves`, `balances`, `compoffGrants`, `addLeave`,
`deleteLeave`, `addCompoffRequest`, `decideCompoff`, `useBalanceFor`,
`setCurrentUser`, `users`) was **removed**. All leave/balance/comp-off data now
flows through server components → `lib/queries/*` as props. **Do not add mock
state back to the store.** If a component needs data, fetch it in a server
component and pass it down, or call a `lib/actions/*` server action.

### 2. "View as" role preview (`components/layout/topbar.tsx`)

The old topbar had a "switch role" dropdown that swapped the entire `currentUser`
to a mock person — visible to everyone, misleading in production.

It is now a **privileged role preview**:
- Visible only to **founders** or emails in `VIEW_AS_ALLOWLIST` (top of
  `topbar.tsx` — edit this list to grant more admins access).
- It overrides **only the displayed role** (`currentUser.role`) so an admin can
  see how the nav/menus render for another role. It does **not** change the real
  user, their data, or server-side permissions (those are always enforced from
  the real role via `requireCapability` / RLS).
- `realRole` in the store always holds the true role; "Reset to my role" clears
  the preview.

> Follow-up idea: true data-level impersonation ("see the app exactly as user
> X") would require server-side support and is intentionally **not** built.

### 3. Profile page rebuilt on real data (`app/(app)/profile/`)

**Before:** `app/(app)/profile/page.tsx` was a `"use client"` page reading the
mock store, importing mock `teams`, and — a real bug — defaulting the phone
field to the *placeholder string*: `useState(currentUser.phone ?? "+91 98XXXXXXXX")`,
so a user with no phone would save the literal placeholder. Edits never
persisted.

**After:** it's a server component that loads the real user + teams + manager via
the new `getMyProfileContext()` query (`lib/queries/users.ts`) and renders
`components/profile/profile-client.tsx`. Phone + "mute notifications" persist via
the existing `updateMyProfile` action (`lib/actions/profile.ts`). The phone
placeholder is now a real `placeholder=` attribute; empty saves as `null`.

### 4. IST (Asia/Kolkata) date handling (`lib/date.ts` + ~13 call sites)

**Bug:** server code ran `new Date().toISOString().split('T')[0]` to get
"today". On a UTC server (Vercel) that returns the **UTC** calendar date, which
is a day behind IST between **00:00 and 05:30 IST**. So early-morning IST,
"who's out today", week ranges, work anniversaries, and date guards were wrong.

**Fix:** new `lib/date.ts` with timezone-aware helpers — `todayIST()`,
`istDatePlusDays()`, `istWeekRange()`, `istMonthStart/End()`,
`istMonthDay()`, `istYearMonth()` — all resolved in `Asia/Kolkata`. Every
**date-only "today"** computation on the server now uses these:
`lib/queries/dashboard.ts`, `lib/queries/leaves.ts`, `lib/actions/leaves.ts`,
`lib/actions/compoff.ts`, `lib/actions/users.ts`, `lib/actions/users-bulk.ts`,
`lib/actions/teams.ts`, `app/(app)/calendar/page.tsx`, `app/(app)/team/page.tsx`,
`app/auth/callback/route.ts`, `app/api/setup/root-admin/route.ts`.

**Left intentionally on UTC:** full timestamp writes via
`new Date().toISOString()` (e.g. `decided_at`, `read_at`, `deleted_at`,
`bootstrapped_at`) — these are `timestamptz` and correct in UTC. Only the
**date-only** values needed the IST treatment.

Rule of thumb going forward: **never compute a calendar date from
`new Date()` on the server — use `lib/date.ts`.**

### 5. Error boundaries (new)

Added so a thrown `ActionError` / failed query shows branded UI instead of an
unstyled crash:
- `app/(app)/error.tsx` — in-app error boundary with "Try again" + dashboard link.
- `app/(app)/not-found.tsx` — 404 within the app shell.
- `app/global-error.tsx` — root catch-all (renders its own `<html>`/`<body>`).

### 6. Sidebar comp-off badge wired to real data

The `/leaves` nav badge counted pending comp-off from the **mock** store
`compoffGrants` (so it was effectively always 0 against real UUIDs). It now uses
a real count: `countCompoffPendingForApprover()` (`lib/queries/compoff.ts`),
fetched in `app/(app)/layout.tsx` and threaded
`layout → AppShell → Sidebar` as the `pendingCompoffCount` prop.

### 7. Dead prototype files deleted

These were **orphaned** (not reachable from any live route) and were removed:

| Deleted | Why it was dead |
|---|---|
| `lib/mock-data.ts` | Sample data; last live consumer was the store (now real). |
| `lib/leave-utils.ts` | Used mock holidays; only imported by the dead cards/dialog below. |
| `components/leave/apply-leave-dialog.tsx` | Old mock apply dialog (hardcoded `2026-04-29`, wrote to mock store). Superseded by **`leave-form-dialog.tsx`** (the live one — calls `lib/actions/leaves`). |
| `components/leave/request-compoff-dialog.tsx` | Old mock comp-off dialog. Superseded by **`compoff-request-dialog.tsx`** (the live one — calls `requestCompoff`). |
| `components/dashboard/*` (13 cards) | `status-card`, `schedule-card`, `whos-out-today-card`, `org-pulse-card`, `my-team-card`, `holiday-card`, `upcoming-leaves-card`, `compoff-stack-card`, `annual-reset-banner`, `recent-leaves-card`, `balance-card`, `pending-compoff-card`, `quick-actions-card`. All superseded by inline cards inside **`dashboard-client.tsx`**. |

> **Naming gotcha for the future:** there were near-duplicate file names —
> `apply-leave-dialog.tsx` (dead) vs `leave-form-dialog.tsx` (live), and
> `request-compoff-dialog.tsx` (dead) vs `compoff-request-dialog.tsx` (live).
> The **live** dialogs are `leave-form-dialog.tsx` and `compoff-request-dialog.tsx`.

### Verification

`npm run typecheck` and `npm run build` both pass. Manual check: dashboard shows
the real user/date/holidays/balances; `/profile` shows the real record.

> ⚠️ Dev-server gotcha: running `npm run build` while `next dev` is live corrupts
> the dev server's `.next` cache (`TypeError: __webpack_modules__[moduleId] is
> not a function`). If you see that, stop the dev server, `rm -rf .next`, restart.

### Known follow-ups (not done)

- **`CURRENT_LEAVE_YEAR = 2026`** is still hardcoded in several files
  (`lib/queries/dashboard.ts`, `app/api/setup/root-admin/route.ts`,
  `lib/actions/users-bulk.ts`). It should become a single derived/config value
  before Jan 2027 or balances will read the wrong year.
- **Topbar "Sign out"** menu item has no handler yet.
- **No automated tests.** The leave-balance math (half-days, comp-off expiry,
  monthly quota, annual reset) is the highest-value place to add unit tests.
- Stray prototype PNGs in the repo root (`dashboard-employee.png`,
  `calendar-page.png`, etc.) are design artifacts and could be moved/removed.

### Local env (no `.env` committed)

`.env.local` must define `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (the JWT anon key, **not** the `sb_publishable_…`
key), and `SUPABASE_SERVICE_ROLE_KEY`. Next.js does not hot-reload env changes —
restart the dev server after editing.
