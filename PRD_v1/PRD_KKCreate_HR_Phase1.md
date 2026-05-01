# KK Create HR System — Phase 1 PRD (Leave Management + Foundation)

**Owner:** Shubham
**Status:** Ready for implementation
**Target launch:** June 1
**Scope:** Web app, mobile-responsive. No native app, no Slack, no email in this phase.

---

## 1. Goal

Replace KK Create's manual Google Sheet-based leave tracking with a web application. Build the **foundational infrastructure** (auth, users, teams, roles, org tree, notifications, audit log) that all future HR modules (devices, equipment, SOPs, onboarding) will plug into.

This phase ships **leave management end-to-end** plus a **read-only org tree**. Nothing else.

## 2. Non-goals for this phase

- Device tracking
- Shared equipment QR scanning
- SOPs / document management
- Onboarding / offboarding workflows
- Native mobile app (iOS / Android)
- Push notifications
- Email notifications
- Slack integration
- NFC
- Holiday calendar management UI (seed data via SQL is fine)
- Reports / analytics dashboards
- Multi-language

## 3. Tech stack (locked)

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Hosting:** Vercel
- **Backend / DB:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions, Row-Level Security)
- **Auth:** Supabase Auth → Google OAuth only (everyone has a company Google account)
- **State / Data:** TanStack Query for server state; React Context for auth session
- **Forms:** React Hook Form + Zod validation
- **Date handling:** `date-fns` (no `moment`)
- **Real-time:** Supabase Realtime (Postgres changes channel)
- **Notifications (in-app):** Custom toast system + a notifications table; live via Realtime
- **Mobile:** Mobile-first responsive design. Test against iPhone SE width (375px) as the floor.

## 4. Roles

Four roles. Each user has exactly one role.

| Role | Description |
|------|-------------|
| `employee` | Standard team member |
| `team_lead` | Manages a team, has direct reports |
| `hr` | HR team — full leave system control |
| `founder` | Top-level — same powers as HR + audit log access |

Role determines visibility and permissions enforced via Supabase Row-Level Security (RLS).

## 5. Database schema

All tables include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()` unless stated otherwise. Use UUIDs for primary keys.

### 5.1 `users`

```
id              UUID PRIMARY KEY (matches Supabase auth.users.id)
email           TEXT UNIQUE NOT NULL
full_name       TEXT NOT NULL
phone           TEXT
photo_url       TEXT
role            TEXT NOT NULL CHECK (role IN ('employee', 'team_lead', 'hr', 'founder'))
manager_id      UUID REFERENCES users(id)  -- direct manager (team lead or founder)
status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exited'))
joined_at       DATE NOT NULL
exited_at       DATE
notifications_muted BOOLEAN DEFAULT FALSE
```

### 5.2 `teams`

```
id              UUID PRIMARY KEY
name            TEXT NOT NULL UNIQUE
wfo_pattern     TEXT NOT NULL  -- e.g. 'MWF', 'TTF', 'MTWTF', or comma list
team_lead_id    UUID REFERENCES users(id)
```

`wfo_pattern` stores days-of-week the team is expected in office. Encoding: comma-separated short codes from `MON,TUE,WED,THU,FRI,SAT,SUN`. Example: `MON,WED,FRI`.

### 5.3 `team_members`

Junction table. Supports multi-team people.

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE
is_primary      BOOLEAN NOT NULL DEFAULT FALSE
joined_at       DATE NOT NULL
left_at         DATE
UNIQUE(user_id, team_id, joined_at)
```

Constraint: each user must have exactly one row with `is_primary = TRUE` and `left_at IS NULL`. Enforced via DB trigger.

### 5.4 `leaves`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
type            TEXT NOT NULL CHECK (type IN ('wfh', 'leave', 'compoff_wfh', 'compoff_leave'))
start_date      DATE NOT NULL
end_date        DATE NOT NULL
half_day_start  BOOLEAN DEFAULT FALSE   -- start_date is a half day
half_day_end    BOOLEAN DEFAULT FALSE   -- end_date is a half day
half_day_position TEXT CHECK (half_day_position IN ('first_half', 'second_half', NULL))
                -- only relevant when half_day_start or half_day_end is true
                -- if both start and end are half days on different days,
                -- they share the same position; if same-day half day, this defines which half
reason          TEXT
days_deducted   NUMERIC(4,1) NOT NULL  -- computed at creation; stored to avoid recompute
status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'))
created_by      UUID NOT NULL REFERENCES users(id)  -- who entered this (self or HR)
deleted_by      UUID REFERENCES users(id)
deleted_at      TIMESTAMPTZ
```

Soft delete only. Never hard-delete a leave row. `status = 'deleted'` hides it from balance calculations and views, but it stays in the table forever for audit purposes.

### 5.5 `leave_balances`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
leave_year      INT NOT NULL  -- e.g. 2026 represents Jun-2026 to May-2027
type            TEXT NOT NULL CHECK (type IN ('wfh', 'leave', 'compoff_wfh', 'compoff_leave'))
allocated       NUMERIC(5,1) NOT NULL DEFAULT 0
used            NUMERIC(5,1) NOT NULL DEFAULT 0  -- computed from leaves table
UNIQUE(user_id, leave_year, type)
```

`used` is recomputed via DB function whenever a leave is created/edited/deleted. `allocated` is set by HR.

For `compoff_wfh` and `compoff_leave`, `leave_year` is always `0` (sentinel) — compoff has no annual cycle. `allocated` for compoff increases when manager approves a compoff grant.

### 5.6 `compoff_grants`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
type            TEXT NOT NULL CHECK (type IN ('compoff_wfh', 'compoff_leave'))
amount          NUMERIC(4,1) NOT NULL  -- how many days granted (typically 1.0 or 0.5)
work_date       DATE NOT NULL  -- the date the extra work was done
reason          TEXT NOT NULL
status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
manager_id      UUID NOT NULL REFERENCES users(id)  -- who must approve
decided_at      TIMESTAMPTZ
decided_by      UUID REFERENCES users(id)
```

On `approved`, a DB trigger increments the user's `compoff_*` balance.

### 5.7 `holidays`

```
id              UUID PRIMARY KEY
date            DATE NOT NULL UNIQUE
name            TEXT NOT NULL
```

Seed data via SQL migration for FY 2026-27 (Jun 1, 2026 – May 31, 2027). Admin UI to manage holidays is out of scope for this phase.

### 5.8 `notifications`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)  -- recipient
type            TEXT NOT NULL  -- e.g. 'leave_created', 'compoff_requested', 'compoff_approved'
title           TEXT NOT NULL
body            TEXT NOT NULL
link_url        TEXT  -- optional deep link inside app
related_entity_type TEXT  -- 'leave', 'compoff_grant'
related_entity_id   UUID
read_at         TIMESTAMPTZ
```

### 5.9 `audit_log`

```
id              UUID PRIMARY KEY
actor_id        UUID NOT NULL REFERENCES users(id)
action          TEXT NOT NULL  -- 'leave_created', 'leave_edited', 'leave_deleted', 'leave_backdated', 'balance_changed', 'compoff_approved', 'compoff_rejected'
entity_type     TEXT NOT NULL  -- 'leave', 'leave_balance', 'compoff_grant'
entity_id       UUID NOT NULL
diff            JSONB  -- {before: {...}, after: {...}}
note            TEXT  -- free-text reason if HR provides one
```

Only HR / Founder edits and deletions are logged. Self-created leave entries are *not* logged (they're already in the leaves table). Compoff approve/reject is logged.

### 5.10 `leave_year_resets`

```
id              UUID PRIMARY KEY
leave_year      INT NOT NULL UNIQUE  -- e.g. 2026
triggered_by    UUID NOT NULL REFERENCES users(id)
triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Tracks when annual reset was performed. Prevents double-reset.

## 6. Business logic

### 6.1 Computing `days_deducted` for a leave

Given a leave with `start_date`, `end_date`, half-day flags:

```
For each calendar date d in [start_date, end_date]:
  if d is a Saturday or Sunday: skip (0)
  if d exists in holidays table: skip (0)
  else if d == start_date AND half_day_start: count 0.5
  else if d == end_date AND half_day_end: count 0.5
  else: count 1.0

days_deducted = sum
```

Compute once at leave creation and store in `days_deducted`. Recompute on edit.

**Important:** WFO rotation does NOT affect deduction. A leave on a non-office day still deducts. Reason: leave = "I'm not working today," WFO rotation = "where I work."

### 6.2 Leave types and balances

| Type | Annual allocation default | Resets June 1 | Notes |
|------|--------------------------|---------------|-------|
| `wfh` | Set per-user by HR | Yes | Work from home |
| `leave` | Set per-user by HR | Yes | Time off |
| `compoff_wfh` | 0 (granted only) | No | Granted by manager approval |
| `compoff_leave` | 0 (granted only) | No | Granted by manager approval |

Default allocations can be set via a `team_default_allocations` lookup or hardcoded — for MVP, HR sets each user's allocation manually during onboarding.

### 6.3 Submitting a leave (employee flow)

1. Employee picks type, start_date, end_date, optional half-day flags, optional reason.
2. Validation:
   - `end_date >= start_date`
   - No overlap with another active leave by same user (block)
   - Half-day flags only valid on single-date leaves OR on first/last date of multi-date leave
   - For compoff types: balance must be > 0
3. Compute `days_deducted`. Validate user has enough balance.
4. Insert row. Recompute `leave_balances.used` for this user/year/type.
5. Create notifications:
   - For each team lead the user reports to (could be multiple if multi-team): one `leave_created` notification
   - For each user with role = `hr`: one `leave_created` notification
   - **Manager OOO logic:** if a target manager has an active leave on TODAY's date, skip them and notify HR instead. If HR is OOO too, notify all founders.
6. Return new leave to client. Realtime pushes update to all dashboards.

### 6.4 Editing / deleting a leave

- Self-edit: only allowed if the leave's `start_date` is in the future. Past or in-progress leaves can only be edited by HR / Founder.
- Self-delete: same rule.
- HR / Founder: can edit or delete any leave at any time, including backdated entries.
- Every HR / Founder edit or delete writes a row to `audit_log`.
- After edit, `days_deducted` is recomputed and `leave_balances.used` updated.
- Deleted leaves: `status = 'deleted'`, kept in DB forever. Excluded from balance calcs, calendar views, and "who's on leave today."

### 6.5 Compoff request flow

1. Employee submits compoff request: type, work_date, reason. Default amount = 1.0.
2. System picks `manager_id` = the user's primary team's `team_lead_id`. (If primary team's lead is the user themselves — i.e. the user IS a team lead — then `manager_id` = a founder, picked alphabetically by name.)
3. Notification sent to manager.
4. Manager opens request, clicks Approve or Reject.
5. On Approve: trigger increments user's compoff balance; notification to user + all HR.
6. On Reject: notification to user only.
7. Audit log entry on either decision.

### 6.6 Sandwich leave rule (already in §6.1)

Friday + Monday off → Saturday and Sunday are weekends, automatically skipped. They're never counted regardless.

### 6.7 Annual reset (manual)

HR / Founder dashboard has a "Run Annual Reset" button visible only on/after **May 25** of each year.

Action:
1. Confirm modal: "This will reset all WFH and Leave balances for FY [year]. Compoff balances are untouched. This cannot be undone. Proceed?"
2. On confirm:
   - For each active user, create new `leave_balances` rows for the new `leave_year` with `allocated` = same as previous year (HR can adjust later if needed) and `used` = 0.
   - Compoff balance rows are NOT touched.
   - Insert row into `leave_year_resets`.
3. Show banner on HR/Founder dashboard from May 25 onward: "Annual reset for FY [year] is due. [Run Reset button]". Banner disappears after reset is run.

### 6.8 Notifications

- All notifications are in-app. Show via:
  - Bell icon in top nav with unread count
  - Toast on the page when a new realtime notification arrives
- User can toggle `notifications_muted` in their profile. Muted users still get rows inserted but no toast / no bell badge increment. They can still see them in the notifications list.
- Notifications are kept forever (no auto-archive in MVP).

## 7. Visibility rules (RLS policies)

Implement these as Supabase RLS policies. Test thoroughly.

### 7.1 `users` table
- All authenticated users: SELECT all rows (needed for org tree)
- Self: UPDATE own `phone`, `photo_url`, `notifications_muted` only
- HR / Founder: UPDATE all fields

### 7.2 `leaves` table
- Self: SELECT, INSERT (for self only), UPDATE (only future leaves), DELETE (only future leaves)
- Team Lead: SELECT all leaves of users where `users.manager_id = team_lead.id` OR via team membership join
- HR / Founder: SELECT, INSERT, UPDATE, DELETE all
- All authenticated users: SELECT a *limited view* (id, user_id, type IN wfh/leave only — not compoff, start_date, end_date) where the leave is active on TODAY's date. **Reason field is excluded from this limited view.** Implement via a dedicated SQL view or a column-level policy.

### 7.3 `leave_balances` table
- Self: SELECT own rows
- Team Lead: SELECT for their team members
- HR / Founder: SELECT, INSERT, UPDATE all

### 7.4 `compoff_grants` table
- Self: SELECT own, INSERT own
- Manager (the assigned `manager_id`): SELECT, UPDATE (for approve/reject)
- HR / Founder: SELECT all

### 7.5 `audit_log` table
- HR / Founder / Team Lead: SELECT all
- No writes from clients — only via DB triggers / Edge Functions

### 7.6 `notifications` table
- Self only: SELECT, UPDATE (for marking read)

## 8. UI / screens

Mobile-first responsive. Every screen must work cleanly at 375px width.

### 8.1 Auth
- `/login` — Google sign-in button only. After auth, check if user exists in `users` table. If not, show "Your account hasn't been set up yet. Please contact HR." (HR creates user rows manually for MVP.)

### 8.2 Layout (authenticated)
- Top nav: Logo, current page title, notifications bell, profile dropdown (photo, name, role)
- Side nav (desktop) / bottom nav (mobile):
  - Dashboard
  - My Leaves
  - Calendar
  - Org Tree
  - (HR/Founder only) HR Console
  - (Founder/HR/TL only) Audit Log

### 8.3 Dashboard (`/`)

Role-specific.

**Employee:**
- Card: "My Leave Balances" — WFH, Leave, Compoff-WFH, Compoff-Leave with `allocated`, `used`, `remaining`
- Card: "My Upcoming Leaves" — next 3
- Card: "Who's Out Today" — list of names + type (WFH or Leave). No reasons shown.
- Button: "Apply for Leave" (opens modal)
- Button: "Request Compoff" (opens modal)

**Team Lead:**
- Everything Employee sees, PLUS:
- Card: "My Team Today" — each team member's status (in office / WFH / on leave / on compoff)
- Card: "Pending Compoff Requests" — list with Approve/Reject buttons
- Card: "Team Upcoming Leaves" — next 7 days

**HR:**
- Card: "Org Today" — counts: in office / WFH / on leave / on compoff
- Card: "Recent Leaves" — last 10 entries org-wide
- Card: "Pending Actions" — incoming compoff requests routed to HR (only if manager OOO)
- Quick links: Manage Leaves, Manage Balances, Audit Log
- Annual reset banner (when due)

**Founder:**
- Same as HR + same access

### 8.4 My Leaves (`/leaves`)
- Tabs: Upcoming / Past / All
- Table: type, dates, half-day, days deducted, status, reason
- Each row: edit (if future) / delete (if future)
- "Apply for Leave" button at top

### 8.5 Apply for Leave modal
- Type: radio (WFH, Leave, Compoff-WFH, Compoff-Leave)
- Start date / End date pickers
- "Half day on start date" checkbox + position select (first/second half) when checked
- "Half day on end date" checkbox + position select
- Reason: textarea (optional for WFH, required for Leave)
- Live computed preview: "This will deduct X.X days from your [type] balance"
- Validation errors inline
- Submit → POST to API → optimistic UI

### 8.6 Calendar (`/calendar`)

- Month view by default; week view toggle
- Each day cell: list of names with leaves/WFH active on that day
- Color coding: WFH = blue, Leave = orange, Compoff-WFH = light blue, Compoff-Leave = light orange, Holiday = grey, Weekend = subtle grey
- **Employee view:** only TODAY shows full names. Future and past days show only counts ("3 people on leave"). Click a future day → "You can't see this. Only Today is visible."
- **Team Lead view:** full visibility for own team members across all dates; counts only for others
- **HR / Founder view:** full visibility for everyone across all dates
- Filters (HR/TL/Founder only): date range picker, name autocomplete

### 8.7 Org Tree (`/org`)

Read-only hierarchical tree.
- Founders at top
- Team Leads below their reporting founder
- Employees below their team lead
- Each node: photo, name, role, primary team
- Click a node → side panel: full details (name, email, role, all teams, manager, joined_at) — NO leave info
- Multi-team people: shown under primary team but with a small badge listing other teams

### 8.8 HR Console (`/hr`) — HR/Founder only

- Tab: "All Leaves" — full table, filters, edit, delete, backdate
- Tab: "Balances" — table per user per type; HR can edit `allocated`
- Tab: "Compoff Grants" — manual grant form (in case manager isn't around)
- Tab: "Annual Reset" — button + history of past resets
- Tab: "User Management" — create user, edit role/manager/teams, mark as exited

### 8.9 Audit Log (`/audit`) — HR/TL/Founder only

Table with: timestamp, actor, action, entity, before/after diff (expandable JSON), note. Filters: date range, actor, action type.

### 8.10 Profile (`/profile`)

- Edit photo, phone, email
- Toggle notifications muted
- View own teams, manager, role (read-only)

### 8.11 Notifications panel

Triggered from bell. List of all notifications, newest first. Click → mark read + navigate to `link_url`.

## 9. API surface

Use Next.js Route Handlers (`app/api/*`) for server-side mutations that need privilege checks. Reads can go directly via Supabase client + RLS.

Required endpoints:
- `POST /api/leaves` — create leave (with notification fan-out)
- `PATCH /api/leaves/:id` — edit leave
- `DELETE /api/leaves/:id` — soft delete leave
- `POST /api/compoff` — request compoff
- `PATCH /api/compoff/:id` — approve/reject (manager only)
- `POST /api/hr/leaves` — HR-created leave (backdated allowed)
- `PATCH /api/hr/balances/:id` — adjust balance
- `POST /api/hr/users` — create user (also creates Supabase auth user via service role)
- `PATCH /api/hr/users/:id` — edit user
- `POST /api/hr/annual-reset` — run annual reset
- `POST /api/notifications/mark-read` — bulk mark read

Server-side actions write `audit_log` rows where applicable using a centralized `logAudit()` helper.

## 10. Folder structure

```
/app
  /(auth)/login/page.tsx
  /(app)/layout.tsx               # protected layout
  /(app)/page.tsx                 # dashboard router (renders by role)
  /(app)/leaves/page.tsx
  /(app)/calendar/page.tsx
  /(app)/org/page.tsx
  /(app)/profile/page.tsx
  /(app)/hr/page.tsx              # gated by role
  /(app)/audit/page.tsx           # gated by role
  /api/leaves/route.ts
  /api/leaves/[id]/route.ts
  /api/compoff/route.ts
  /api/compoff/[id]/route.ts
  /api/hr/leaves/route.ts
  /api/hr/balances/[id]/route.ts
  /api/hr/users/route.ts
  /api/hr/users/[id]/route.ts
  /api/hr/annual-reset/route.ts
  /api/notifications/mark-read/route.ts

/components
  /ui                              # shadcn primitives
  /leave                           # leave-specific components
  /calendar
  /org
  /dashboard                       # role-specific dashboard cards
  /layout                          # nav, top bar, etc

/lib
  /supabase/client.ts              # browser client
  /supabase/server.ts              # server client (with service role for HR ops)
  /supabase/types.ts               # generated DB types
  /leave/calculate-days.ts         # core deduction logic
  /leave/validation.ts             # Zod schemas
  /audit/log.ts                    # logAudit() helper
  /notifications/dispatch.ts       # fan-out logic with manager-OOO escalation
  /auth/get-current-user.ts
  /utils/dates.ts

/hooks
  /use-current-user.ts
  /use-realtime-notifications.ts
  /use-leaves.ts
  /use-balances.ts

/db
  /migrations/001_init.sql
  /migrations/002_seed_holidays.sql
  /migrations/003_rls_policies.sql
  /migrations/004_triggers.sql
  /seed/users.sql                  # for local dev
```

## 11. Acceptance criteria (Phase 1 ships when all of these pass)

1. ✅ A user can sign in with their company Google account.
2. ✅ Non-onboarded users see a clear "contact HR" message.
3. ✅ HR can create a user, set role, manager, teams, and per-type leave allocations.
4. ✅ HR can mark a user as exited; their data persists, login is revoked.
5. ✅ An employee can submit a single-day leave (any of 4 types) — balance deducts correctly.
6. ✅ An employee can submit a multi-day leave spanning a weekend — weekend not deducted.
7. ✅ An employee can submit a multi-day leave spanning a holiday — holiday not deducted.
8. ✅ An employee can submit a half-day leave on a single date — 0.5 deducted.
9. ✅ An employee can submit a multi-day leave with half-day on start AND half-day on end — math correct.
10. ✅ An employee can submit two leaves on the same date if one is half-day-first-half WFH and the other is half-day-second-half Leave.
11. ✅ Overlapping full-day leaves are blocked at submission.
12. ✅ Submitting more days than balance is blocked.
13. ✅ Manager and all HR users receive in-app notifications when a team member submits leave.
14. ✅ If the manager is on leave today, notification routes to HR. If HR is also on leave, routes to founders.
15. ✅ Multi-team employee submitting a leave notifies all their team leads.
16. ✅ Employee can edit/delete their own future leave; balance updates.
17. ✅ Employee cannot edit/delete a past leave.
18. ✅ HR can backdate a leave entry.
19. ✅ HR can edit any leave; audit log records before/after.
20. ✅ HR can delete any leave; balance recalculates; audit log records it.
21. ✅ Compoff request flow: employee → manager Approve → balance increases → user + HR notified.
22. ✅ Compoff request flow: employee → manager Reject → user notified, balance unchanged.
23. ✅ Compoff approval/rejection is logged in audit.
24. ✅ Compoff balance does not reset on annual reset.
25. ✅ Annual reset button visible only from May 25 onward.
26. ✅ Annual reset creates new balance rows; old leaves remain visible in history.
27. ✅ Annual reset cannot be run twice for the same year.
28. ✅ Employee dashboard shows balances + today's "who's out."
29. ✅ "Who's out today" excludes leave reasons.
30. ✅ Employee calendar view shows full names only for TODAY; counts for other days.
31. ✅ Team lead calendar view shows full names for own team across all dates.
32. ✅ HR / Founder calendar view shows everyone across all dates with date + name filters.
33. ✅ Org tree renders correctly with multi-team employees showing badges.
34. ✅ Employee can edit own photo, phone, email.
35. ✅ Employee cannot edit own role, manager, teams, or balance.
36. ✅ Notifications appear in real-time without page refresh (via Supabase Realtime).
37. ✅ User can mute notifications; muted users still see notifications in the bell list.
38. ✅ Audit log accessible to HR / Founder / Team Lead with filters.
39. ✅ Audit log captures HR/Founder edits, deletes, balance changes, compoff decisions.
40. ✅ All RLS policies tested: an employee cannot query another employee's leave history via direct Supabase calls.
41. ✅ Every screen renders cleanly at 375px width without horizontal scroll.
42. ✅ All forms validate with Zod and show inline errors.
43. ✅ All mutations have optimistic UI where reasonable.

## 12. Implementation order (recommended)

Build in this order. Don't skip ahead.

1. Supabase project setup, schema migrations, seed holidays
2. RLS policies + test queries from anon role
3. Next.js scaffold, Tailwind, shadcn, Supabase client setup
4. Google OAuth login + protected layout
5. User management (HR can create/edit users) — needed before anything else can be tested
6. Org tree page (read-only, validates user data is correct)
7. Apply Leave modal + create leave API + balance computation
8. My Leaves page (list, edit, delete)
9. Notification system (table, dispatch helper, realtime, bell, toast)
10. Manager OOO escalation logic
11. Compoff flow
12. Calendar view (start with HR view, then restrict for other roles)
13. Role-specific dashboards
14. HR Console (all tabs)
15. Audit log (page + ensuring all logged actions actually log)
16. Annual reset
17. Profile page + notification mute
18. Mobile responsive QA pass on every screen
19. RLS penetration testing — verify no role can access what it shouldn't via direct DB queries
20. Acceptance criteria sign-off

## 13. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server-only, never exposed to client
NEXT_PUBLIC_APP_URL=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
COMPANY_EMAIL_DOMAIN=          # e.g. kkcreate.com — restrict signups
```

## 14. Out-of-scope reminders

If during build you find yourself adding features for: devices, equipment, QR codes, SOPs, push notifications, native app, Slack, email — **stop**. Those are later phases. Keep this MVP tight.

## 15. Key design principles

1. **Database is source of truth.** All business logic that affects balances must live in DB triggers or carefully tested server-side functions. Never trust client computation.
2. **RLS is the security layer.** Don't rely on UI hiding things — assume any authenticated user could try to query directly.
3. **Soft delete only.** Never `DELETE FROM leaves`. Always `UPDATE status = 'deleted'`.
4. **Audit everything sensitive.** If you're not sure whether to log it, log it.
5. **Mobile-first.** Default to mobile layouts, scale up to desktop. Not the other way around.
6. **No premature abstraction.** This is an MVP. Build for 40 users, not 4000.

---

End of PRD.
