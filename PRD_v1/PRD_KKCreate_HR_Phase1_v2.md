# KK Create HR System — Phase 1 PRD v2 (Leave Management + Foundation)

**Owner:** Shubham
**Status:** Ready for implementation
**Target launch:** June 1
**Scope:** Web app, mobile-responsive. No native app, no Slack, no external email notifications in this phase.
**Auth decision for MVP testing:** Use Supabase email/password login for v1 testing. Move to Google OAuth-only after the core HR flows are proven end-to-end.

**Changelog from v1:** Replaced rigid RBAC with a hybrid role + capability system. Roles act as default capability bundles. Scoped capabilities support self / specific users / specific teams / all. Capabilities split into read and write where relevant. Capability bundles defined at code level for MVP.

---

## 1. Goal

Replace KK Create's manual Google Sheet-based leave tracking with a web application. Build the **foundational infrastructure** (auth, users, teams, roles, capabilities, org tree, notifications, audit log) that future HR modules will plug into.

This v1 MVP focuses on **Core HR + Leave + Attendance/WFO visibility + Comp-off + Org + Permissions**. It ships leave management end-to-end, WFO schedule/status visibility, a read-only org tree, and a complete capability-based permission system. Nothing else.

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
- Holiday calendar management UI (seed data via SQL)
- Reports / analytics dashboards
- Multi-language
- UI for creating new capability bundles (code-level only in MVP)
- Payroll, recruitment, performance reviews, expenses, and full time-clock attendance
- Google OAuth-only auth until after MVP testing validates the core flows

## 3. Tech stack (locked)

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Hosting:** Vercel
- **Backend / DB:** Supabase (Postgres, Auth, Realtime, Storage, Edge Functions, Row-Level Security)
- **Auth:** Supabase Auth → email/password for MVP testing; Google OAuth-only after validation
- **State / Data:** TanStack Query for server state; React Context for auth + capabilities session
- **Forms:** React Hook Form + Zod
- **Date handling:** `date-fns`
- **Real-time:** Supabase Realtime (Postgres changes channel)
- **Notifications (in-app):** Custom toast system + notifications table; live via Realtime
- **Mobile:** Mobile-first responsive. Floor: 375px width.

## 4. Permission model

This system uses a **hybrid role + capability model**.

### 4.1 Roles

Four roles. Each role is a *default capability bundle*. Setting a user's role automatically grants the role's capabilities. Changing a role recomputes them.

| Role | Description | Default bundle |
|------|-------------|----------------|
| `employee` | Standard team member | Hardcoded self-permissions only |
| `team_lead` | Manages a team | `team_lead` bundle, scoped to their teams |
| `hr` | HR team member | `hr_admin` bundle |
| `founder` | Founder / super admin | `founder_full` bundle |

### 4.2 Capabilities

A **capability** is an atomic permission. Two flavors:

**Global capabilities** — apply org-wide, no scope:
- `manage_holidays` — edit company holiday calendar
- `view_audit_log` — read audit trail
- `manage_users` — create/edit user records (role, manager, teams, status)
- `manage_capabilities` — grant/revoke capabilities to other users
- `run_annual_reset` — trigger annual leave reset

**Scoped capabilities** — apply to a defined set of targets, split into read and write:
- `view_leaves` (read) / `edit_leaves` (write)
- `view_balance` (read) / `edit_balance` (write)
- `approve_compoff` (write — implies read of compoff requests)

For scoped capabilities, scope is one of:
- `self` — only the holder themselves (default for employees)
- `users` — specific user IDs (multi-target array)
- `teams` — specific team IDs (multi-target array; expands to all current members)
- `all` — every user in the org

### 4.3 Hardcoded self-permissions

Every authenticated user, regardless of role or capabilities, *always* has these — no rows in `user_capabilities`:

- View own user record (all fields)
- Update own `phone`, `photo_url`, `notifications_muted` (no email change in MVP — email is the auth identity)
- View own leaves (all of them, all reasons)
- Insert own leaves (subject to validation in §6.3)
- Update own leaves (only if `start_date > CURRENT_DATE`)
- Delete own leaves (only if `start_date > CURRENT_DATE`; soft delete)
- View own leave balances
- Insert own compoff requests
- View own notifications, mark them read
- View org tree (everyone's name, role, team, manager — no leave info)

These are enforced as the first clause in every RLS policy. They cannot be revoked.

### 4.4 Capability bundles

Bundles are reusable preset packs of capabilities. Defined at the code level via migration. **No UI to create/edit bundles in MVP.**

| Bundle key | Name | Capabilities |
|------------|------|--------------|
| `team_lead` | Team Lead | `view_leaves(teams=user's teams)`, `view_balance(teams=user's teams)`, `approve_compoff(teams=user's teams)` |
| `hr_admin` | HR Admin | `view_leaves(all)`, `edit_leaves(all)`, `view_balance(all)`, `edit_balance(all)`, `manage_users`, `manage_holidays`, `run_annual_reset`, `view_audit_log` |
| `founder_full` | Founder Full Access | Everything in `hr_admin` + `manage_capabilities` |

Granting a bundle creates one `user_capabilities` row per capability with `source = 'bundle'` and `source_ref = 'bundle:<key>'`. Revoking a bundle deletes all rows with that `source_ref`.

The `team_lead` bundle is special: its team scope is *dynamic* — it always reflects the user's currently-led teams (where `teams.team_lead_id = user.id`). When a user is assigned as team lead of a new team, the bundle's scope auto-updates. Implementation: bundle uses a special `scope_type = 'led_teams'` that resolves dynamically, OR rebuild bundle rows on team-lead reassignment. For MVP, use the second approach (simpler).

### 4.5 Granting and revoking

- Only users with `manage_capabilities` (founders by default) can grant/revoke capabilities or bundles to/from others.
- Founders can grant `hr_admin` bundle to HR users (this is how HR gets their powers).
- HR by default does *not* have `manage_capabilities` — they cannot grant capabilities to others. Founders grant capabilities to HR.
- Granting any capability or bundle creates an audit log entry.

### 4.6 Permission resolution (the mental model)

When the system checks "can user X do action Y on target Z?":

1. Is it a hardcoded self-permission and X == Z? → Yes
2. Does X have capability Y with scope `all`? → Yes
3. Does X have capability Y with scope `users` containing Z? → Yes
4. Does X have capability Y with scope `teams` and Z is in any of those teams? → Yes
5. Does X have capability Y with scope `self` and X == Z? → Yes
6. Otherwise → No

For global capabilities, only steps 1 and 2-style (capability exists, no scope check) apply.

## 5. Database schema

UUIDs for primary keys. All tables include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()` unless stated otherwise.

### 5.1 `users`

```
id              UUID PRIMARY KEY (matches Supabase auth.users.id)
email           TEXT UNIQUE NOT NULL
full_name       TEXT NOT NULL
phone           TEXT
photo_url       TEXT
role            TEXT NOT NULL CHECK (role IN ('employee', 'team_lead', 'hr', 'founder'))
manager_id      UUID REFERENCES users(id)
status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exited'))
joined_at       DATE NOT NULL
exited_at       DATE
notifications_muted BOOLEAN DEFAULT FALSE
designation     TEXT
```

### 5.2 `teams`

```
id              UUID PRIMARY KEY
name            TEXT NOT NULL UNIQUE
wfo_pattern     TEXT NOT NULL  -- comma list of MON,TUE,WED,THU,FRI,SAT,SUN
team_lead_id    UUID REFERENCES users(id)
```

### 5.3 `team_members`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE
is_primary      BOOLEAN NOT NULL DEFAULT FALSE
joined_at       DATE NOT NULL
left_at         DATE
UNIQUE(user_id, team_id, joined_at)
```

Trigger: each active user must have exactly one row with `is_primary = TRUE` and `left_at IS NULL`.

### 5.4 `leaves`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
type            TEXT NOT NULL CHECK (type IN ('wfh', 'leave', 'compoff_wfh', 'compoff_leave'))
start_date      DATE NOT NULL
end_date        DATE NOT NULL
half_day_start  BOOLEAN DEFAULT FALSE
half_day_end    BOOLEAN DEFAULT FALSE
half_day_position TEXT CHECK (half_day_position IN ('first_half', 'second_half', NULL))
reason          TEXT
days_deducted   NUMERIC(4,1) NOT NULL
status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'))
created_by      UUID NOT NULL REFERENCES users(id)
deleted_by      UUID REFERENCES users(id)
deleted_at      TIMESTAMPTZ
```

Soft delete only.

### 5.5 `leave_balances`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
leave_year      INT NOT NULL
type            TEXT NOT NULL CHECK (type IN ('wfh', 'leave', 'compoff_wfh', 'compoff_leave'))
allocated       NUMERIC(5,1) NOT NULL DEFAULT 0
used            NUMERIC(5,1) NOT NULL DEFAULT 0
UNIQUE(user_id, leave_year, type)
```

For compoff types, `leave_year = 0` (sentinel — no annual cycle).

### 5.6 `compoff_grants`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
type            TEXT NOT NULL CHECK (type IN ('compoff_wfh', 'compoff_leave'))
amount          NUMERIC(4,1) NOT NULL
work_date       DATE NOT NULL
reason          TEXT NOT NULL
status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
manager_id      UUID NOT NULL REFERENCES users(id)
decided_at      TIMESTAMPTZ
decided_by      UUID REFERENCES users(id)
```

### 5.7 `holidays`

```
id              UUID PRIMARY KEY
date            DATE NOT NULL UNIQUE
name            TEXT NOT NULL
```

Seeded via SQL migration for FY 2026-27.

### 5.8 `notifications`

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL REFERENCES users(id)
type            TEXT NOT NULL
title           TEXT NOT NULL
body            TEXT NOT NULL
link_url        TEXT
related_entity_type TEXT
related_entity_id   UUID
read_at         TIMESTAMPTZ
```

### 5.9 `audit_log`

```
id              UUID PRIMARY KEY
actor_id        UUID NOT NULL REFERENCES users(id)
action          TEXT NOT NULL
entity_type     TEXT NOT NULL
entity_id       UUID NOT NULL
diff            JSONB
note            TEXT
```

Logged actions:
- Leave: `leave_created_by_other`, `leave_edited`, `leave_deleted`, `leave_backdated`
- Balance: `balance_changed`, `annual_reset_run`
- Compoff: `compoff_approved`, `compoff_rejected`
- User: `user_created`, `user_role_changed`, `user_team_changed`, `user_marked_exited`
- Capabilities: `capability_granted`, `capability_revoked`, `bundle_granted`, `bundle_revoked`

Self-created leaves do NOT log (already in leaves table).

### 5.10 `leave_year_resets`

```
id              UUID PRIMARY KEY
leave_year      INT NOT NULL UNIQUE
triggered_by    UUID NOT NULL REFERENCES users(id)
triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 5.11 `capabilities`

```
key             TEXT PRIMARY KEY
description     TEXT NOT NULL
is_scoped       BOOLEAN NOT NULL
is_write        BOOLEAN NOT NULL
```

Seed:

```sql
INSERT INTO capabilities (key, description, is_scoped, is_write) VALUES
  ('view_leaves',        'View leaves of others',                  TRUE,  FALSE),
  ('edit_leaves',        'Create, edit, delete leaves of others',  TRUE,  TRUE),
  ('view_balance',       'View leave balances of others',          TRUE,  FALSE),
  ('edit_balance',       'Edit leave balances of others',          TRUE,  TRUE),
  ('approve_compoff',    'Approve or reject compoff requests',     TRUE,  TRUE),
  ('manage_holidays',    'Edit company holiday calendar',          FALSE, TRUE),
  ('view_audit_log',     'View audit log',                         FALSE, FALSE),
  ('manage_users',       'Create and edit user records',           FALSE, TRUE),
  ('manage_capabilities','Grant or revoke capabilities',           FALSE, TRUE),
  ('run_annual_reset',   'Run the annual leave reset',             FALSE, TRUE);
```

### 5.12 `user_capabilities`

```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
capability_key  TEXT NOT NULL REFERENCES capabilities(key)
scope_type      TEXT CHECK (scope_type IN ('self', 'users', 'teams', 'all') OR scope_type IS NULL)
scope_user_ids  UUID[]
scope_team_ids  UUID[]
granted_by      UUID NOT NULL REFERENCES users(id)
granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'role', 'bundle'))
source_ref      TEXT
note            TEXT
```

Constraints (DB-level):
- If `is_scoped = FALSE` for the capability → `scope_type` must be NULL
- If `is_scoped = TRUE` for the capability → `scope_type` must NOT be NULL
- If `scope_type = 'users'` → `scope_user_ids` must be non-empty array
- If `scope_type = 'teams'` → `scope_team_ids` must be non-empty array

### 5.13 `capability_bundles`

```
key             TEXT PRIMARY KEY
name            TEXT NOT NULL
description     TEXT NOT NULL
capabilities    JSONB NOT NULL
```

Seed (in migration):

```sql
INSERT INTO capability_bundles (key, name, description, capabilities) VALUES
  ('team_lead', 'Team Lead', 'Powers over teams the user leads',
   '[
     {"capability_key": "view_leaves", "scope_type": "teams", "dynamic_scope": "led_teams"},
     {"capability_key": "view_balance", "scope_type": "teams", "dynamic_scope": "led_teams"},
     {"capability_key": "approve_compoff", "scope_type": "teams", "dynamic_scope": "led_teams"}
   ]'),
  ('hr_admin', 'HR Admin', 'Full HR powers across the org',
   '[
     {"capability_key": "view_leaves", "scope_type": "all"},
     {"capability_key": "edit_leaves", "scope_type": "all"},
     {"capability_key": "view_balance", "scope_type": "all"},
     {"capability_key": "edit_balance", "scope_type": "all"},
     {"capability_key": "approve_compoff", "scope_type": "all"},
     {"capability_key": "manage_users"},
     {"capability_key": "manage_holidays"},
     {"capability_key": "run_annual_reset"},
     {"capability_key": "view_audit_log"}
   ]'),
  ('founder_full', 'Founder Full Access', 'Everything HR has plus capability management',
   '[
     {"capability_key": "view_leaves", "scope_type": "all"},
     {"capability_key": "edit_leaves", "scope_type": "all"},
     {"capability_key": "view_balance", "scope_type": "all"},
     {"capability_key": "edit_balance", "scope_type": "all"},
     {"capability_key": "approve_compoff", "scope_type": "all"},
     {"capability_key": "manage_users"},
     {"capability_key": "manage_holidays"},
     {"capability_key": "run_annual_reset"},
     {"capability_key": "view_audit_log"},
     {"capability_key": "manage_capabilities"}
   ]');
```

`dynamic_scope: "led_teams"` means at apply-time, the team list is resolved as `SELECT id FROM teams WHERE team_lead_id = <user>`.

## 6. Business logic

### 6.1 Computing `days_deducted`

Given `start_date`, `end_date`, half-day flags:

```
For each calendar date d in [start_date, end_date]:
  if d is Saturday or Sunday: skip
  if d in holidays table: skip
  else if d == start_date AND half_day_start: count 0.5
  else if d == end_date AND half_day_end: count 0.5
  else: count 1.0
```

WFO rotation does NOT affect deduction.

### 6.2 Role → bundle mapping (on user create / role change)

```
function recomputeRoleBundles(userId, newRole):
  delete from user_capabilities where user_id = userId AND source = 'role'
  switch newRole:
    case 'employee': nothing
    case 'team_lead': apply bundle 'team_lead' with source='role', source_ref='role:team_lead'
    case 'hr': apply bundle 'hr_admin' with source='role', source_ref='role:hr'
    case 'founder': apply bundle 'founder_full' with source='role', source_ref='role:founder'
```

When a `team_lead` is assigned to a new team OR removed as lead from a team, the team_lead bundle's scope must be recomputed for that user (`recomputeRoleBundles`).

### 6.3 Submitting a leave (employee flow)

1. Pick type, start_date, end_date, optional half-day flags, optional reason.
2. Validation:
   - `end_date >= start_date`
   - No overlap with another active leave (block, except: half-day-first-half-X and half-day-second-half-Y on same date is allowed)
   - For compoff types: balance > 0
3. Compute `days_deducted`. Validate user has enough balance.
4. Insert leave. Recompute `leave_balances.used`.
5. Notification fan-out (§6.4).

### 6.4 Notification fan-out for new leave

Targets:
- All team leads of all teams the user is in (multi-team aware)
- All users with `hr_admin` bundle (i.e. role = `hr`)

For each target:
- If target has an active leave today: skip them, find escalation
- Escalation order: target → HR → all founders

If a multi-team user has 2 team leads and one is OOO, only that one's notification escalates; the other gets it directly.

### 6.5 Editing / deleting a leave

- Self-edit / self-delete: only if `start_date > CURRENT_DATE`
- Anyone with `edit_leaves` over the leave's owner: anytime (including backdate)
- HR/Founder edit/delete → audit log entry
- After change, recompute `days_deducted` and `leave_balances.used`

### 6.6 Compoff request flow

1. Employee submits: type, work_date, reason, amount (default 1.0).
2. Auto-pick `manager_id`:
   - If user is a `team_lead` themselves: pick a founder (alphabetical by name)
   - Else: pick the team_lead of user's primary team
3. Notify manager.
4. Manager (or anyone with `approve_compoff` over the user) clicks Approve / Reject.
5. Approve → balance increment + notify user + notify all `hr` users + audit log
6. Reject → notify user + audit log

### 6.7 Annual reset

- Button visible from May 25 onward, only to users with `run_annual_reset`
- Confirm modal
- For each active user: insert new `leave_balances` rows for new year, allocated = same as previous year, used = 0
- Compoff balances untouched
- Insert `leave_year_resets` row
- Cannot run twice for same year (UNIQUE constraint)
- Audit log entry

## 7. RLS policies

Every table that has user-scoped data uses the `user_can()` SQL function (defined in §7.1). RLS is the security layer — never trust the UI alone.

### 7.1 The `user_can()` SQL function

```sql
CREATE OR REPLACE FUNCTION user_can(
  cap TEXT,
  target_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Global capability check (is_scoped = FALSE)
  IF EXISTS (
    SELECT 1 FROM user_capabilities uc
    JOIN capabilities c ON c.key = uc.capability_key
    WHERE uc.user_id = caller_id
    AND uc.capability_key = cap
    AND c.is_scoped = FALSE
  ) THEN
    RETURN TRUE;
  END IF;

  IF target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Scope: all
  IF EXISTS (
    SELECT 1 FROM user_capabilities
    WHERE user_id = caller_id
    AND capability_key = cap
    AND scope_type = 'all'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope: self
  IF caller_id = target_user_id AND EXISTS (
    SELECT 1 FROM user_capabilities
    WHERE user_id = caller_id
    AND capability_key = cap
    AND scope_type = 'self'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope: users
  IF EXISTS (
    SELECT 1 FROM user_capabilities
    WHERE user_id = caller_id
    AND capability_key = cap
    AND scope_type = 'users'
    AND target_user_id = ANY(scope_user_ids)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope: teams
  IF EXISTS (
    SELECT 1 FROM user_capabilities uc
    WHERE uc.user_id = caller_id
    AND uc.capability_key = cap
    AND uc.scope_type = 'teams'
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = target_user_id
      AND tm.team_id = ANY(uc.scope_team_ids)
      AND tm.left_at IS NULL
    )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
```

### 7.2 Per-table policies

**`users`:**
```sql
-- Read: everyone authenticated can read all (org tree needs this)
CREATE POLICY users_select ON users FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Self update: limited columns enforced via trigger
CREATE POLICY users_self_update ON users FOR UPDATE
USING (id = auth.uid());

-- Privileged update: anyone with manage_users
CREATE POLICY users_manage_update ON users FOR UPDATE
USING (user_can('manage_users'));

-- Insert: only with manage_users
CREATE POLICY users_insert ON users FOR INSERT
WITH CHECK (user_can('manage_users'));
```

A trigger on `users` UPDATE ensures self-updates can only modify `phone`, `photo_url`, `notifications_muted`. Everything else requires `user_can('manage_users')`.

**`leaves`:**
```sql
CREATE POLICY leaves_select ON leaves FOR SELECT
USING (
  user_id = auth.uid()  -- self
  OR user_can('view_leaves', user_id)
  OR (
    -- Limited "who's out today" view: anyone can see active leaves where start_date <= TODAY <= end_date
    -- But this is via a separate VIEW, not the table itself
    FALSE
  )
);

CREATE POLICY leaves_insert ON leaves FOR INSERT
WITH CHECK (
  (user_id = auth.uid())  -- self insert
  OR user_can('edit_leaves', user_id)
);

CREATE POLICY leaves_update ON leaves FOR UPDATE
USING (
  (user_id = auth.uid() AND start_date > CURRENT_DATE)
  OR user_can('edit_leaves', user_id)
);

CREATE POLICY leaves_delete ON leaves FOR DELETE
USING (
  (user_id = auth.uid() AND start_date > CURRENT_DATE)
  OR user_can('edit_leaves', user_id)
);
```

**`leaves_today_view`** — a SECURITY DEFINER view exposing only active leaves on TODAY's date with type but no reason:

```sql
CREATE OR REPLACE VIEW leaves_today AS
SELECT id, user_id, type, start_date, end_date, half_day_start, half_day_end
FROM leaves
WHERE status = 'active'
  AND start_date <= CURRENT_DATE
  AND end_date >= CURRENT_DATE;

GRANT SELECT ON leaves_today TO authenticated;
```

Frontend uses this view for the "Who's Out Today" card. The reason field is excluded by construction.

**`leave_balances`:**
```sql
CREATE POLICY balance_select ON leave_balances FOR SELECT
USING (user_id = auth.uid() OR user_can('view_balance', user_id));

CREATE POLICY balance_modify ON leave_balances FOR ALL
USING (user_can('edit_balance', user_id));
```

**`compoff_grants`:**
```sql
CREATE POLICY compoff_select ON compoff_grants FOR SELECT
USING (
  user_id = auth.uid()
  OR manager_id = auth.uid()
  OR user_can('approve_compoff', user_id)
);

CREATE POLICY compoff_insert ON compoff_grants FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY compoff_update ON compoff_grants FOR UPDATE
USING (manager_id = auth.uid() OR user_can('approve_compoff', user_id));
```

**`audit_log`:**
```sql
CREATE POLICY audit_select ON audit_log FOR SELECT
USING (user_can('view_audit_log'));
-- No client writes; only via SECURITY DEFINER functions
```

**`notifications`:**
```sql
CREATE POLICY notif_select ON notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY notif_update ON notifications FOR UPDATE
USING (user_id = auth.uid());
```

**`user_capabilities`:**
```sql
CREATE POLICY uc_select ON user_capabilities FOR SELECT
USING (user_id = auth.uid() OR user_can('manage_capabilities'));

CREATE POLICY uc_modify ON user_capabilities FOR ALL
USING (user_can('manage_capabilities'));
```

**`capabilities`, `capability_bundles`, `holidays`:**
Read by all authenticated users. Writes via service-role API only.

## 8. UI / screens

Mobile-first responsive. 375px floor.

### 8.1 Auth
- `/login` — email/password sign-in for MVP testing. After auth, lookup user in `users` table. If absent: "Your account hasn't been set up yet. Contact HR." No public self-signup.
- HR/founders create users and temporary credentials during MVP testing. Google OAuth-only replaces this after all core flows are validated.
- Email remains the auth identity. Users cannot edit their own email from Profile.

### 8.2 Layout
- Top nav: logo, page title, notifications bell, profile dropdown
- Side nav (desktop) / bottom nav (mobile):
  - Dashboard
  - My Leaves
  - Calendar
  - Org Tree
  - HR Console *(visible if user has any of: `manage_users`, `edit_leaves(all)`, `manage_holidays`, `run_annual_reset`)*
  - Audit Log *(visible if user has `view_audit_log`)*
  - Permissions *(visible if user has `manage_capabilities`)*

### 8.3 Dashboard (`/`)

Composable bento cards rendered based on capabilities, not role. Cards shown if the user has the required capability.

**Always shown (hardcoded self-permissions):**
- "My Leave Balances" — own balances per type
- "My Upcoming Leaves" — next 3
- "Who's Out Today" — names + type, no reasons (from `leaves_today` view)
- Quick-action buttons: Apply for Leave, Request Compoff

**Shown if `view_leaves` over any teams (i.e. team lead):**
- "My Team Today" — status per direct report
- "Team Upcoming Leaves" — next 7 days

**Shown if `approve_compoff` (any scope):**
- "Pending Compoff Requests"

**Shown if `view_leaves(all)` (i.e. HR / Founder):**
- "Org Today" — counts: in office / WFH / on leave / on compoff
- "Recent Leaves" — last 10 entries org-wide

**Shown if `run_annual_reset` AND date >= May 25 AND not yet reset for current year:**
- "Annual reset due" banner with button

### 8.4 My Leaves (`/leaves`)
- Tabs: Upcoming / Past / All
- Table: type, dates, half-day, days deducted, status, reason
- Edit / Delete buttons (only if `start_date > today` for self; always if user has `edit_leaves` over self... but self is hardcoded anyway)
- "Apply for Leave" button

### 8.5 Apply Leave modal

- Type radio: WFH / Leave / Compoff-WFH / Compoff-Leave
- Date pickers
- Half-day toggles + first/second half select
- Reason textarea (optional for WFH, required for Leave)
- Live preview: "This will deduct X.X days from your [type] balance"
- Inline validation
- Submit → API → optimistic UI

### 8.6 Calendar (`/calendar`)

- Month view default; week toggle
- Cells show names with type-coded chips
- **Visibility per row:**
  - Self: always full
  - Others on TODAY: name + type only (no reason) — for everyone
  - Others on past/future dates: shown only if `view_leaves` over that user
  - Counts shown for everyone-else cells the user can't see fully
- Filters (visible if `view_leaves` over anyone but self): date range, name autocomplete

### 8.7 Org Tree (`/org`)

- Hierarchical tree: founders → team leads → employees
- Click node → side panel: name, email, role, designation, all teams, manager, joined_at
- Multi-team badge
- No leave info anywhere

### 8.8 HR Console (`/hr`)

Tab-gated by capability:

- **All Leaves** (req: `edit_leaves(all)`) — full table, filters, edit/delete/backdate
- **Balances** (req: `edit_balance(any)`) — table per user × type; edit allocated
- **Compoff Grants** (req: `approve_compoff(any)`) — manual grant form + history
- **Holidays** (req: `manage_holidays`) — list view (read-only in MVP; seeded via migration)
- **Annual Reset** (req: `run_annual_reset`) — button + reset history
- **Users** (req: `manage_users`) — create/edit users, set role, manager, teams, mark exited
- **Teams** (req: `manage_users`) — create/edit teams, WFO pattern, team lead, and active members
- **Bulk Import** (req: `manage_users`) — import users, teams, managers, and initial allocations from CSV for go-live

### 8.9 Permissions (`/permissions`) — req: `manage_capabilities`

Three sub-tabs:

**By User:**
- Pick a user → see their full effective permissions:
  - Hardcoded self-permissions section (read-only, informational)
  - Role-derived rows (source = 'role')
  - Bundle rows (source = 'bundle')
  - Manual grant rows (source = 'manual')
- Each non-hardcoded row: revoke button
- Below the list: "Why does this user have access to X?" debug query input

**By Capability:**
- Pick a capability → see all users who have it, with scope and source
- Useful for audits

**Grant:**
- Form:
  - Pick user
  - Pick: capability OR bundle
  - If capability and is_scoped: pick scope_type → scope targets
  - Optional note
  - Submit → creates rows with source='manual' + audit log

### 8.10 Audit Log (`/audit`) — req: `view_audit_log`

Table: timestamp, actor, action, entity, before/after diff (expandable JSON), note. Filters: date range, actor, action type.

### 8.11 Profile (`/profile`)

- Edit photo, phone (NOT email — email = auth identity)
- Toggle notifications muted
- View role, designation, teams, manager (read-only)

### 8.12 Notifications panel

Bell-triggered. Newest first. Click → mark read + navigate to `link_url`.

## 9. API surface

Next.js Route Handlers for privileged mutations. Reads via Supabase client + RLS.

- `POST /api/leaves` — create leave (own or by privileged user)
- `PATCH /api/leaves/:id` — edit
- `DELETE /api/leaves/:id` — soft delete
- `POST /api/compoff` — request
- `PATCH /api/compoff/:id` — approve/reject
- `POST /api/hr/users` — create user (uses service role to provision `auth.users` with temporary email/password credentials for MVP testing)
- `PATCH /api/hr/users/:id` — edit user (also recomputes role bundle if role changed)
- `PATCH /api/hr/balances/:id` — adjust balance
- `POST /api/hr/annual-reset` — run reset
- `POST /api/permissions/grant` — grant capability or bundle
- `DELETE /api/permissions/:id` — revoke capability grant
- `POST /api/permissions/grant-bundle` — grant a bundle
- `DELETE /api/permissions/revoke-bundle` — revoke a bundle (deletes all rows with matching source_ref)
- `POST /api/notifications/mark-read` — bulk mark read
- `GET /api/permissions/why` — debug: explain why user X has capability Y over target Z

All privileged routes go through a centralized `requireCapability(req, cap, targetId?)` middleware. All privileged mutations call `logAudit()`.

## 10. Folder structure

```
/app
  /(auth)/login/page.tsx
  /(app)/layout.tsx
  /(app)/page.tsx
  /(app)/leaves/page.tsx
  /(app)/calendar/page.tsx
  /(app)/org/page.tsx
  /(app)/profile/page.tsx
  /(app)/hr/page.tsx
  /(app)/audit/page.tsx
  /(app)/permissions/page.tsx
  /api/leaves/...
  /api/compoff/...
  /api/hr/...
  /api/permissions/...
  /api/notifications/...

/components
  /ui                          # shadcn primitives
  /leave
  /calendar
  /org
  /dashboard
  /permissions
  /layout

/lib
  /supabase/{client,server,types}.ts
  /auth/{get-current-user, permissions}.ts
  /leave/{calculate-days, validation}.ts
  /capabilities/{apply-bundle, recompute-role-bundles, why}.ts
  /audit/log.ts
  /notifications/dispatch.ts
  /utils/dates.ts

/hooks
  /use-current-user.ts
  /use-capabilities.ts
  /use-realtime-notifications.ts
  /use-leaves.ts
  /use-balances.ts

/db
  /migrations/001_init_schema.sql
  /migrations/002_capabilities_seed.sql
  /migrations/003_bundles_seed.sql
  /migrations/004_holidays_seed_2026_27.sql
  /migrations/005_rls_policies.sql
  /migrations/006_triggers.sql
  /seed/dev_users.sql
```

## 11. Acceptance criteria

### Core auth & users
1. ✅ User can sign in with HR-created email/password credentials; non-onboarded shows "contact HR".
2. ✅ A user with `manage_users` can create a user, set role + manager + teams + per-type allocations.
3. ✅ Setting a user's role auto-applies the corresponding role bundle.
4. ✅ Changing a user's role removes old role-derived capabilities and applies new ones.
5. ✅ Marking a user as exited preserves data; login is revoked.

### Capabilities
6. ✅ A founder can grant the `hr_admin` bundle to a new HR user; that user immediately gains all HR capabilities.
7. ✅ A founder can grant any current individual capability (for example `view_audit_log` or scoped `view_leaves`) to a non-HR employee.
8. ✅ A founder can grant a scoped capability with `users` scope (multi-target user array).
9. ✅ A founder can grant a scoped capability with `teams` scope (multi-target team array).
10. ✅ A user added to a team that has team-scoped capabilities granted to them is automatically visible to the holder.
11. ✅ Removing a user from a team removes the holder's access to that user.
12. ✅ Bundle revoke removes all rows tied to that bundle source_ref.
13. ✅ Granting/revoking any capability or bundle creates an audit log entry.
14. ✅ HR by default cannot grant capabilities (no `manage_capabilities`).
15. ✅ When a `team_lead` is reassigned to a new team, their team_lead bundle scope updates.
16. ✅ When a `team_lead` stops leading a team, their access to that team is revoked.

### Leaves — core
17. ✅ Single-day leave (any of 4 types) — balance deducts correctly.
18. ✅ Multi-day leave spanning weekend — weekend not deducted.
19. ✅ Multi-day leave spanning holiday — holiday not deducted.
20. ✅ Half-day leave on single date — 0.5 deducted.
21. ✅ Multi-day leave with half-day on start AND end — math correct.
22. ✅ Same date can hold half-day-first-half WFH AND half-day-second-half Leave.
23. ✅ Overlapping full-day leaves blocked.
24. ✅ Insufficient balance blocked.

### Leaves — notifications
25. ✅ All team leads of all teams the user belongs to are notified.
26. ✅ All `hr` users are notified.
27. ✅ If a target is on leave today, notification routes to next escalation.
28. ✅ Multi-team user → multiple team leads notified independently.

### Leaves — edits
29. ✅ Self can edit/delete own future leaves; balance updates.
30. ✅ Self cannot edit/delete past leaves.
31. ✅ User with `edit_leaves` can backdate, edit, delete any leave; audit logged.
32. ✅ Soft-delete only — row stays in DB, hidden from balance calcs and views.

### Compoff
33. ✅ Employee submits compoff → routed to primary team lead.
34. ✅ If user is team_lead, compoff routes to a founder.
35. ✅ Approve → balance increments, user + HR notified, audit logged.
36. ✅ Reject → user notified, audit logged.
37. ✅ Compoff balance does NOT reset on annual reset.

### Annual reset
38. ✅ Reset button visible only if user has `run_annual_reset` AND date >= May 25 AND no reset for current year.
39. ✅ Reset creates new balance rows for all active users.
40. ✅ Cannot run twice for same year.
41. ✅ Audit log entry created.

### Visibility
42. ✅ Employee dashboard shows balances + today's "who's out" with no reasons.
43. ✅ Employee calendar: full names only TODAY; counts on other days.
44. ✅ Team lead calendar: full visibility for own team across all dates.
45. ✅ HR / Founder calendar: full visibility for everyone with date + name filters.
46. ✅ Org tree shows everyone with multi-team badges; no leave info.
47. ✅ Profile self-edit limited to phone, photo, notifications_muted.

### Security (RLS)
48. ✅ An employee querying `leaves` directly via Supabase client cannot see another employee's leaves.
49. ✅ An employee cannot UPDATE another user's profile via direct query.
50. ✅ A team lead cannot see audit log unless granted `view_audit_log` separately.
51. ✅ Granting a capability via API without `manage_capabilities` returns 403.
52. ✅ The `leaves_today` view never exposes the `reason` column.

### Permissions UI
53. ✅ "By User" view shows full effective permissions with sources.
54. ✅ "By Capability" view shows all holders with scope.
55. ✅ "Grant" form supports global, self, users, teams, all scope types.
56. ✅ "Why does this user have access?" debug returns reasoning chain.

### Notifications
57. ✅ Notifications appear in real-time via Supabase Realtime — no refresh.
58. ✅ User can mute notifications; muted users still see them in bell list.
59. ✅ Bell badge shows correct unread count.

### Mobile / UX
60. ✅ Every screen renders cleanly at 375px width without horizontal scroll.
61. ✅ All forms validate via Zod with inline errors.
62. ✅ Optimistic UI on leave create / edit / delete.

## 12. Implementation order

Strict order. Don't skip ahead.

1. Supabase project + Next.js scaffold + Tailwind + shadcn
2. Schema migrations: users, teams, team_members, leaves, leave_balances, compoff_grants, holidays, notifications, audit_log, leave_year_resets
3. Schema migrations: capabilities, user_capabilities, capability_bundles + seed data
4. SQL functions: `user_can()`, `apply_bundle()`, `recompute_role_bundles()`
5. RLS policies on all tables (and `leaves_today` view)
6. Triggers: balance recompute, team_members primary uniqueness, role-change recomputes bundles
7. Email/password login + protected layout
8. `useCurrentUser` hook with capabilities loaded into session cache
9. Centralized `requireCapability()` middleware + `logAudit()` helper
10. Users management (HR Console → Users tab) — needed before anything else can be tested
11. Permissions UI (grant, revoke, by user, by capability, why-debug)
12. Org tree page (read-only)
13. Apply Leave modal + create leave API + balance computation
14. My Leaves page (list, edit, delete)
15. Notification system (table, dispatch helper, realtime, bell, toast)
16. Manager OOO escalation logic
17. Compoff flow
18. Calendar view (HR scope first, then restrict for other roles)
19. Role-specific dashboard cards (capability-gated)
20. HR Console remaining tabs (All Leaves, Balances, Compoff, Holidays, Annual Reset)
21. Audit log page
22. Annual reset flow
23. Profile page + notification mute
24. Mobile responsive QA on every screen
25. RLS penetration testing — verify each role + capability combination cannot exceed its bounds via direct DB queries
26. Acceptance criteria sign-off

## 13. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
COMPANY_EMAIL_DOMAIN=
```

## 14. Out-of-scope reminders

If during build you find yourself adding: payroll, recruitment, performance reviews, expenses, devices, equipment, QR, SOPs, push, native app, Slack, external email notifications, bundle UI editor, multi-language, or Google-only auth migration — **stop**. Phase 2+.

## 15. Key design principles

1. **DB is source of truth.** Business logic in DB triggers / SQL functions. Never trust client computation.
2. **RLS is the security layer.** Assume every authenticated user could try direct queries. Test that they fail.
3. **Soft delete only.** Never `DELETE FROM leaves`.
4. **Audit everything sensitive.** Capability changes, leave edits, balance changes, role changes, compoff decisions, annual reset.
5. **Mobile-first.** 375px floor on every screen.
6. **Never check `user.role === 'x'` in feature code.** Always use `can.*` helpers (frontend) or `user_can()` (DB). Roles bundle capabilities; capabilities are the atoms.
7. **Capabilities are documented in `CAPABILITIES.md`.** Adding a new capability requires a written justification in that file. Forces deliberateness.
8. **No premature abstraction.** Built for 100-200 users, not 10,000.
9. **MVP focus is operational trust.** Core HR records, leave, WFO/attendance visibility, comp-off, org structure, and permissions must work end-to-end before adding broad HRMS modules.

## 16. CAPABILITIES.md (committed alongside this PRD)

Required documentation for every capability in the system. Template:

```
## <capability_key>

**Description:** What this capability lets the holder do.
**Type:** Global / Scoped (read | write)
**Default holders:** Which roles auto-grant this via their bundle.
**Used in:** List of files / API routes / RLS policies that reference this.
**Justification:** Why this exists as a separate capability rather than being merged with another.
**Phase added:** v1 / v2 / v3
```

Every PR adding a new capability must update this file.

---

End of PRD v2.
