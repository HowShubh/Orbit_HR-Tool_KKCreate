# PRD Addendum: Bootstrap & Self-Service Onboarding Flow

This document specifies the **first-run setup flow** for the KK Create HR system, treating it as a SaaS-style product where the company is onboarded into an empty system rather than seeded with data.

This addendum should be added as **Section 17** of the main PRD, and the implementation order in Section 12 should be updated to include the bootstrap step.

---

## 17. Bootstrap & Onboarding Flow

### 17.1 Why this approach

The system is designed as if it were a multi-tenant SaaS product, even though KK Create will be the only tenant. Reasons:

1. **Tests the production flow on day one.** No "seeded magically" data — every row enters the system through the same paths real users will use.
2. **Provides a clean recovery story.** If the database is ever wiped or reset, the bootstrap flow is the documented path back to a working state.
3. **Future-proofs for other companies.** If KK Create ever decides to offer this internally to a sister company, or open-source it, the onboarding flow already exists.
4. **Forces good UX for the most error-prone moment.** Onboarding flows are where most internal tools break — making it a first-class feature rather than an afterthought leads to a better product.

### 17.2 The bootstrap state machine

The system has four onboarding states, tracked in a singleton `system_state` table:

```sql
CREATE TABLE system_state (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single row
  bootstrap_state TEXT NOT NULL DEFAULT 'awaiting_root_admin'
                  CHECK (bootstrap_state IN (
                    'awaiting_root_admin',
                    'awaiting_first_hr',
                    'awaiting_first_team',
                    'operational'
                  )),
  bootstrapped_at TIMESTAMPTZ,
  bootstrapped_by UUID REFERENCES users(id)
);

INSERT INTO system_state (id) VALUES (1);
```

The application's behavior changes based on this state. Once `operational`, the bootstrap flow is locked and cannot be re-run.

### 17.3 State 1: `awaiting_root_admin`

**System has zero users.** No one can do anything. The login page is replaced with a setup screen.

**Setup screen (`/setup` — only accessible in this state):**

A single-page form titled "Set up KK Create HR — Step 1 of 3: Create Root Admin"

Fields:
- Full name
- Email (must match `COMPANY_EMAIL_DOMAIN`)
- Confirm email
- Temporary password
- Confirm temporary password
- A clear explanation: "This first user becomes the Root Admin (Founder role with full access). They will be able to invite other users next."

On submit:
- The form calls `POST /api/setup/root-admin`. This endpoint is only callable while `bootstrap_state = 'awaiting_root_admin'`. It uses the service role to:
  1. Create a Supabase auth user via the Admin API with role = `founder`
  2. Set a temporary password for MVP testing
  3. Create the corresponding row in `users` table (founder role; auto-grants `founder_full` bundle)
  4. Update `system_state.bootstrap_state = 'awaiting_first_hr'`
  5. Lock the `/setup` route from creating more root admins

The user signs in with email/password and lands on the dashboard. Google OAuth-only is deferred until after MVP testing validates the core flows.

**Edge cases:**
- Email domain mismatch → reject with clear error
- Network failure mid-creation → `system_state` is updated only after successful auth user creation; safe to retry
- Someone navigates to `/setup` after state moves on → redirect to `/login`

### 17.4 State 2: `awaiting_first_hr`

**Root admin (founder) is logged in.** The dashboard shows a prominent setup checklist instead of normal dashboard content.

**Setup checklist screen:**

Big card titled "Welcome to KK Create HR — let's finish setting up"

Three steps shown:
1. ✅ Root admin created
2. ⏳ **Add your first HR user** ← active step
3. ⏸ Add your first team

Step 2 is an inline form:
- Full name
- Email
- Designation (optional)
- Temporary password
- "This user will get the HR Admin bundle and can manage all leaves, holidays, and onboarding."

On submit:
- Calls existing `POST /api/hr/users` with role = `hr`
- New HR user can sign in with HR-created email/password credentials for MVP testing
- `system_state.bootstrap_state` updates to `awaiting_first_team`

**Note:** the founder *can* skip adding HR and create teams/users themselves. But the system gently nudges toward HR-first because that's the cleaner long-term setup. If they skip, the HR step is marked optional and they proceed.

### 17.5 State 3: `awaiting_first_team`

**At least one founder + (optionally) one HR exists.** Setup checklist now shows:

1. ✅ Root admin created
2. ✅ HR user added (or "Skipped — you can add HR later")
3. ⏳ **Create your first team**

Inline form:
- Team name
- WFO pattern (multi-select day chips: Mon Tue Wed Thu Fri Sat Sun)
- Team lead (dropdown of existing users; can be the founder themselves for now, or skipped)

On submit:
- Inserts row into `teams`
- If team lead picked: inserts row into `team_members` for that user with `is_primary = true`, and recomputes their role bundle (if their role was `team_lead` or got promoted)
- `system_state.bootstrap_state` updates to `operational`
- Setup checklist shows full success and disappears on next refresh
- Normal dashboard appears

### 17.6 State 4: `operational`

**The setup checklist is gone.** Normal app flows take over.

Founders / HR can now:
- Add the rest of the team via HR Console → Users tab
- Create more teams via HR Console → (a small "Teams" sub-tab — ADD THIS to Section 8.8)
- Seed holidays via the existing migration OR via a one-time CSV import
- Set up everyone's leave allocations during user creation

The bootstrap state cannot be reset from the UI. If for some reason the system needs to be re-bootstrapped, it requires a manual SQL `UPDATE system_state SET bootstrap_state = 'awaiting_root_admin'` via the service role — deliberately friction-heavy.

### 17.7 Section 8.8 (HR Console) — additions

Add two tabs to HR Console:

**Teams tab** (req: `manage_users`)
- List of all teams: name, WFO pattern, team lead, member count
- Create team / edit team / delete team (deletion only if no active members)
- Add / remove members (sets `team_members.is_primary` correctly)
- Reassign team lead (triggers role bundle recompute)

**Bulk Import tab** (req: `manage_users`) — optional, recommended
- Upload CSV of users to import in one batch
- Columns: full_name, email, role, manager_email, primary_team_name, designation, wfh_allocated, leave_allocated
- Preview before import; show validation errors per row
- On submit: creates users + sends invites in batch
- Useful for the initial 40-person migration after bootstrap

### 17.8 First-time user experience for invitees

Every user invited (after the root admin) goes through:

1. Receives their temporary email/password credentials from HR/founder during MVP testing
2. Signs in at `/login`
3. Lands on a one-time profile completion screen:
   - Confirm name (pre-filled)
   - Add phone (optional)
   - Upload photo (optional)
   - Submit → lands on their dashboard
4. From this point, normal app flows apply

If a user opens the app before HR has created their account, they see the standard "Your account hasn't been set up yet — contact HR" message.

### 17.9 RLS during bootstrap

A single special policy: while `bootstrap_state = 'awaiting_root_admin'`, the `/api/setup/root-admin` endpoint is the **only** way to insert a user. Once it transitions out of that state, the endpoint becomes inaccessible (returns 410 Gone).

After bootstrap, the standard RLS policies apply universally. There's no "admin override" mode.

### 17.10 Acceptance criteria additions (append to Section 11)

63. ✅ When the `users` table is empty, navigating to any URL redirects to `/setup`.
64. ✅ The `/setup` route accepts exactly one root admin and then transitions state.
65. ✅ The `/api/setup/root-admin` endpoint returns 410 Gone after bootstrap is complete.
66. ✅ The root admin's first dashboard view shows the setup checklist.
67. ✅ Adding the first HR user via the checklist works end-to-end (temporary credentials work, HR bundle applied).
68. ✅ Creating the first team via the checklist transitions the system to `operational` state.
69. ✅ The setup checklist disappears once `bootstrap_state = 'operational'`.
70. ✅ Bootstrap state cannot be reset from any UI.
71. ✅ Invited users receive a one-time profile completion screen on first login.
72. ✅ HR Console → Teams tab supports create/edit/delete and reassignment of team leads.
73. ✅ Bulk CSV import of users works with validation preview and per-row error reporting.

### 17.11 Implementation order additions (insert into Section 12)

After step 1 (Supabase + Next.js scaffold) and before step 7 (email/password login), add:

**1.5.** Create `system_state` table and bootstrap detection middleware.
**1.6.** Build `/setup` page (root admin creation) and `POST /api/setup/root-admin` endpoint.
**1.7.** Build the setup checklist UI gated by `bootstrap_state`.

After step 10 (Users management), add:

**10.5.** Build HR Console → Teams tab.
**10.6.** Build CSV bulk import for users (optional but recommended).

### 17.12 Recommended onboarding checklist for KK Create's go-live

Once the system is built, KK Create's actual onboarding sequence:

1. Shubham (or founder) opens the production URL → sees `/setup` page
2. Creates Lokesh as the root admin (founder role)
3. Lokesh logs in → sees setup checklist
4. Lokesh adds Jaskirat as the first HR user (HR role; gets `hr_admin` bundle and temporary credentials)
5. Jaskirat logs in → setup is operational, normal HR Console available
6. Jaskirat creates teams: Short Form, Long Form, Editing, Thumbnail, Tech, etc.
7. Jaskirat creates each user with role + manager + team + designation + leave allocations
8. (Optional) Jaskirat uses CSV import to bulk-add the 40 employees
9. Jaskirat seeds holidays via SQL migration OR Holidays tab
10. Lokesh grants special capabilities to non-default holders (e.g. tech lead bundle to Head of Tech in Phase 2)
11. HR shares login credentials/instructions with all 40 employees for MVP testing
12. June 1: Annual reset is run; system is fully operational.

This sequence mirrors how a SaaS HR product onboards a new customer — clean, repeatable, well-tested.

---

End of PRD addendum.
