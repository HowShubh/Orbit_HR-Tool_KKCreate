# CAPABILITIES.md

This document is the source of truth for every capability in the KK Create HR system. Every capability **must** be documented here before being added to the database. Every PR introducing a new capability must update this file.

## Purpose

A capability is an atomic permission. The system uses a hybrid role + capability model where roles auto-grant default capability bundles, and individual capabilities can be granted to any user regardless of role.

This file exists to:

1. Force deliberation before adding new capabilities (preventing capability creep)
2. Give any developer (or future Claude Code session) a single place to understand the permission model
3. Serve as a reference for HR / Founders deciding who should have what access
4. Document the *reasoning* behind why each capability exists separately rather than being merged

## How to use this document

- **Adding a new capability:** Append a new section using the template at the bottom. Get sign-off before running the migration.
- **Granting a capability to a user:** Check the "Default holders" field. If the user matches, no action needed — they get it via their role. If not, grant manually via the Permissions UI.
- **Auditing access:** Use the "Who has this?" question on any capability to drive an audit conversation.

## Capability types

**Global capabilities** apply org-wide. They have no scope. You either have them or you don't.

**Scoped capabilities** apply to a defined set of targets:
- `self` — the holder themselves
- `users` — specific user IDs (multi-target array)
- `teams` — specific team IDs (multi-target array; expands dynamically to current members)
- `all` — every user in the org

**Read capabilities** allow viewing data. **Write capabilities** allow modification. They are split where meaningful so view-only access can be granted without write powers.

## Hardcoded self-permissions (not capabilities)

These are NOT capabilities — they are invariant permissions every authenticated user always has, enforced as the first clause of every relevant RLS policy. They cannot be granted, revoked, or scoped:

- View own user record
- Update own `phone`, `photo_url`, `notifications_muted`
- View, insert, update (future only), delete (future only) own leaves
- View own leave balances
- Insert own compoff requests
- View own notifications, mark read
- View org tree (everyone's name, role, team, manager — no leave info)

These were made hardcoded because they're invariants of "being an active employee," not permissions to be configured. If the requirement ever changes (e.g. "interns can't see the org tree"), these become real capabilities — not before.

---

## v1 capabilities

### `view_leaves`

**Description:** View leaves of other users (entries, dates, types, reasons, status). Used to populate calendars, dashboards, and the My Team views.

**Type:** Scoped, read-only.

**Default holders:**
- `team_lead` — scoped to teams the user leads (dynamic)
- `hr` — scoped `all`
- `founder` — scoped `all`

**Used in:**
- `leaves` table SELECT RLS policy
- Calendar view (`/calendar`)
- HR Console → All Leaves tab
- Dashboard cards: "My Team Today," "Team Upcoming Leaves," "Recent Leaves"
- "Why does this user have access" debug helper

**Justification:** Separated from `edit_leaves` so a user can be granted view-only access for transparency or audit purposes (e.g. a finance team member running payroll doesn't need to *edit* leaves). Without this split, granting any leave access requires granting edit power, which is unsafe.

**Common scenarios:**
- A trusted senior employee given visibility into a partner team's leaves to coordinate shoots
- A finance person who needs leave data for payroll processing
- A future analytics user who needs read access for reporting

**Phase added:** v1

---

### `edit_leaves`

**Description:** Create, edit (including backdating), and soft-delete leaves of other users. Triggers audit log entries on every change.

**Type:** Scoped, write (implies read).

**Default holders:**
- `hr` — scoped `all`
- `founder` — scoped `all`

**Used in:**
- `leaves` table INSERT, UPDATE, DELETE RLS policies
- HR Console → All Leaves tab (edit / delete / backdate buttons)
- API routes: `POST /api/hr/leaves`, `PATCH /api/leaves/:id`, `DELETE /api/leaves/:id`

**Justification:** This is the single most consequential capability in the system — it controls who can rewrite history. Kept separate from `view_leaves` so view access can be granted without giving away edit power. Required for HR to handle backdated entries, correct mistakes, and clean up after misfilled forms.

**Common scenarios:**
- HR editing a leave that the employee filled incorrectly
- HR backdating a leave for an emergency that happened before the employee could file
- HR deleting a leave that was filed by mistake
- Founders making corrections during audits

**Phase added:** v1

---

### `view_balance`

**Description:** View leave balances (allocated, used, remaining) of other users.

**Type:** Scoped, read-only.

**Default holders:**
- `team_lead` — scoped to teams led
- `hr` — scoped `all`
- `founder` — scoped `all`

**Used in:**
- `leave_balances` table SELECT RLS policy
- HR Console → Balances tab
- Team lead dashboard cards

**Justification:** Separated from `edit_balance` so managers can see how much leave their reports have left without being able to change it. Important for planning and conversations like "you've got 3 days left this year, plan accordingly."

**Common scenarios:**
- Team lead checking remaining balance before approving a long leave-of-absence conversation
- Finance / payroll viewing balances at year-end

**Phase added:** v1

---

### `edit_balance`

**Description:** Modify the `allocated` field of leave balances. Used during onboarding (setting pro-rated balances), corrections, and special grants.

**Type:** Scoped, write (implies read).

**Default holders:**
- `hr` — scoped `all`
- `founder` — scoped `all`

**Used in:**
- `leave_balances` table UPDATE RLS policy
- HR Console → Balances tab (edit field)
- API: `PATCH /api/hr/balances/:id`
- Audit log entries

**Justification:** Strictly more sensitive than `view_balance`. Editing balances directly affects how much time off an employee gets — must be tightly controlled and always audit-logged. Cannot be merged with `edit_leaves` because balance edits are conceptually different (administrative grants vs. leave entries).

**Common scenarios:**
- HR setting pro-rated balances for a new joiner
- HR adjusting a balance after a recompute discrepancy
- Founders granting bonus leave as a one-off reward

**Phase added:** v1

---

### `approve_compoff`

**Description:** Approve or reject compoff requests submitted by other users. Approval triggers a balance increment. Both decisions are audit-logged.

**Type:** Scoped, write.

**Default holders:**
- `team_lead` — scoped to teams led
- `hr` — scoped `all`
- `founder` — scoped `all`

**Used in:**
- `compoff_grants` table UPDATE RLS policy
- Pending Compoff card on dashboard
- API: `PATCH /api/compoff/:id`

**Justification:** Compoff approval is a managerial decision rather than a leave entry, so kept separate from `edit_leaves`. A team lead should approve their reports' compoff but not edit historical leave entries — exactly the split this enables.

**Common scenarios:**
- Team lead approving compoff for a Saturday shoot the team did
- HR approving compoff when a team lead is unreachable
- Founders approving compoff for a team lead themselves

**Phase added:** v1

---

### `manage_holidays`

**Description:** Create, edit, and delete entries in the company holiday calendar.

**Type:** Global, write.

**Default holders:**
- `hr`
- `founder`

**Used in:**
- `holidays` table INSERT, UPDATE, DELETE policies (read is open to all authenticated)
- HR Console → Holidays tab (read-only in v1; edit UI in v2)
- Affects leave deduction logic

**Justification:** Holidays affect every employee's leave deductions, so this is high-impact. Global (not scoped) because there's only one company calendar — there's nothing to scope. Kept separate so a future "HR-lite" role could be created without giving holiday-management powers.

**Common scenarios:**
- HR adding a new public holiday at start of FY
- HR adjusting the calendar mid-year for a declared holiday

**Note:** v1 ships read-only — holidays are seeded via SQL migration. The capability exists and is granted, but the UI to edit ships in v2.

**Phase added:** v1 (UI: v2)

---

### `view_audit_log`

**Description:** Read the full audit trail of sensitive actions (leave edits, balance changes, capability grants, role changes, compoff decisions, annual reset).

**Type:** Global, read-only.

**Default holders:**
- `hr`
- `founder`

**Used in:**
- `audit_log` table SELECT RLS policy
- `/audit` page

**Justification:** Audit visibility is sensitive — it reveals internal management actions and the patterns of who's editing what. Kept narrow by default. Granting it to a non-HR user (e.g. a senior employee acting as a fairness watchdog) is a deliberate decision a founder makes.

**Why team leads don't get this by default:** Team leads see their team's data in operational views (calendars, dashboards). The audit log is broader — it shows actions across the org. Defaulting team leads in would leak too much. If a team lead genuinely needs it, a founder can grant it manually.

**Common scenarios:**
- HR investigating a leave discrepancy
- Founders auditing how often balance edits happen
- A trust-and-safety review of any past period

**Phase added:** v1

---

### `manage_users`

**Description:** Create new user records, edit any user's role / manager / teams / status / designation / name. Excludes capability management (separate).

**Type:** Global, write.

**Default holders:**
- `hr`
- `founder`

**Used in:**
- `users` table INSERT, UPDATE policies (privileged columns)
- HR Console → Users tab
- API: `POST /api/hr/users`, `PATCH /api/hr/users/:id`
- Triggers role-bundle recompute on role change

**Justification:** User record management is the foundation of HR work — onboarding, role changes, exits all go through this. Separated from `manage_capabilities` because adjusting org structure (who manages whom) is a different concern from adjusting permissions (who can do what). HR should manage org structure; only founders should manage permissions.

**Common scenarios:**
- HR onboarding a new joiner
- HR moving someone from Team A to Team B
- HR marking someone as exited
- HR updating a designation after a promotion

**Phase added:** v1

---

### `manage_capabilities`

**Description:** Grant or revoke capabilities and bundles to/from any user. Includes granting bundles, granting individual capabilities with any scope, and revoking either.

**Type:** Global, write.

**Default holders:**
- `founder` only

**Used in:**
- `user_capabilities` table INSERT, UPDATE, DELETE policies
- `/permissions` page
- API: `POST /api/permissions/grant`, `DELETE /api/permissions/:id`, bundle endpoints

**Justification:** This is the most powerful capability in the system — whoever holds it can grant *any* other capability, including granting `manage_capabilities` itself. Restricted to founders by default to enforce a single small group as the root of trust. HR explicitly does NOT get this — HR manages people, founders manage powers.

**Why this isn't given to HR by default:** Separating "manages the people" from "manages the access model" is a deliberate principle of least privilege. HR's job is operational. Capability granting is structural. Different concerns, different hands.

**Common scenarios:**
- Founder granting `hr_admin` bundle to a new HR hire
- Founder granting `tech_lead` bundle (Phase 2) to the Head of Tech
- Founder granting a one-off `view_audit_log` to a senior employee

**Recovery scenario:** If all founders are simultaneously locked out, capability grants can be made directly via SQL with the service role key. Document this for HR/founders so they know there's an emergency lever.

**Phase added:** v1

---

### `run_annual_reset`

**Description:** Trigger the annual leave reset that creates new balance rows for the new fiscal year (June 1 onward). Cannot be run twice for the same year.

**Type:** Global, write.

**Default holders:**
- `hr`
- `founder`

**Used in:**
- API: `POST /api/hr/annual-reset`
- HR Console → Annual Reset tab
- Dashboard banner (shown from May 25 onward when not yet reset)

**Justification:** Annual reset is a once-a-year, irreversible event. Kept as its own capability rather than bundled into `edit_balance` because the reset is a single transactional event with very different semantics (mass balance creation vs. individual edit). Restricting it to `hr` + `founder` ensures only intentional, considered triggering.

**Common scenarios:**
- HR running the reset on or after June 1
- Founder running the reset if HR forgets

**Phase added:** v1

---

## Capability bundles

Bundles are reusable preset packs of capabilities. Defined at the code level via migration. **No UI to create/edit bundles in v1.**

### `team_lead`

**Capabilities granted:**
- `view_leaves` scoped to teams the user leads
- `view_balance` scoped to teams the user leads
- `approve_compoff` scoped to teams the user leads

**Auto-applied to:** Users with role = `team_lead`

**Dynamic scope:** The team scope reflects the user's currently-led teams (`teams.team_lead_id = user.id`). When a user is assigned to lead a new team or removed from leading one, the bundle is recomputed.

### `hr_admin`

**Capabilities granted:**
- `view_leaves` scoped `all`
- `edit_leaves` scoped `all`
- `view_balance` scoped `all`
- `edit_balance` scoped `all`
- `approve_compoff` scoped `all`
- `manage_users`
- `manage_holidays`
- `run_annual_reset`
- `view_audit_log`

**Auto-applied to:** Users with role = `hr`

### `founder_full`

**Capabilities granted:**
- Everything in `hr_admin`
- `manage_capabilities`

**Auto-applied to:** Users with role = `founder`

---

## Future capabilities (not in v1, documented for planning)

These are reserved capability keys that will be added in later phases. Documenting now to prevent naming collisions and to make planning easier.

### `view_devices` (Phase 2)

Read-only access to device records (permanent device assignments).

**Default holders (planned):** `hr`, `founder`. Plus a future `tech_lead` bundle for the Head of Tech.

### `manage_devices` (Phase 2)

Write access to device records — assign, reassign, mark returned.

**Default holders (planned):** `hr`, `founder`, `tech_lead` bundle.

### `view_equipment` (Phase 2)

Read-only access to shared equipment ownership state. Note: every employee can see who has what shared equipment by design (search feature) — so this capability gates *administrative* equipment views (history, audit), not the basic "who has X" lookup.

### `manage_equipment` (Phase 2)

Write access to equipment records — register new equipment, generate QR codes, override ownership in edge cases.

**Default holders (planned):** `hr`, `founder`, `tech_lead` bundle.

### `manage_sops` (Phase 4)

Create, edit, delete SOP entries (metadata + Drive links).

**Default holders (planned):** `hr`, `founder`, `team_lead`.

---

## Adding a new capability — checklist

Before adding a new capability:

1. **Can this be modeled with an existing capability?** If `manage_devices` already covers what you need, don't add `manage_specific_device_type`. Use scope instead.
2. **Does it need read/write split?** If yes, add two capabilities (`view_x`, `edit_x`). If no, one capability is fine — but bias toward splitting unless there's a clear reason not to.
3. **Is it global or scoped?** If it's about administering data that doesn't belong to a specific user/team, it's global. If it's about acting on or viewing data of specific users/teams, it's scoped.
4. **Which bundles should auto-grant it?** Update bundle definitions in the migration accordingly.
5. **Document it here in the v1 / Phase X capabilities section using the template below.**
6. **Add an acceptance criterion** to the relevant phase's PRD: "User with `<capability>` can do X; user without it cannot."
7. **Add a migration** that inserts the capability row and updates relevant bundles.

## Capability documentation template

```markdown
### `<capability_key>`

**Description:** What this capability lets the holder do, in plain English.

**Type:** Global | Scoped, read-only | write (implies read)

**Default holders:**
- `<role>` — scope details
- ...

**Used in:**
- Tables / RLS policies
- UI surfaces
- API routes
- Other capabilities this affects

**Justification:** Why this exists as a separate capability rather than being merged with another. What gets *worse* if this is merged?

**Common scenarios:**
- Concrete examples of when this capability gets granted

**Phase added:** vN
```

---

End of CAPABILITIES.md.
