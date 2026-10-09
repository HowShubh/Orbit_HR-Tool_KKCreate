# Org Model, Permissions & Lifecycle — Design Note

**Status:** Draft for discussion · **Date:** 2026-06-10 · **Owner:** Shubham
**Scope:** No code changes yet. This captures the current behaviour, the gaps for
KK Create's real org, a recommended model, and a phased plan.

> Companion docs: `PRD_v1/CAPABILITIES.md` (permission source of truth),
> `docs/MAINTENANCE_NOTES.md` (recent changes), `CLAUDE.md` (architecture).

---

## 1. KK Create's real org (the thing we must model)

**Teams (6):**
- Long-form YouTube — KK Create
- Long-form YouTube — Learn
- Short-form (handles *both* Learn and KK Create short-form wings)
- Course
- Finance (1 member)
- HR

**Management tiers:** member → team manager → **divisional head** → founders.

**Three divisional heads (manage teams-of-teams):**
- **Kavya** — all creative teams (LF YT KK Create, LF YT Learn, Short-form)
- **Varun** — Course + HR
- **Lokesh** — Finance

**Complications that break a simple tree:**
- People belong to **multiple teams**.
- Reporting line ≠ team. E.g. **Gaurav** is in *LF YT KK Create* but reports to **Kavya**, not that team's manager.
- Finance has a single member reporting to Lokesh.

This is a **matrix org with 3 management tiers** — not a clean hierarchy.

---

## 2. How the platform models org today

Three *independent* mechanisms (see `db/migrations/001_core_schema.sql`):

| Mechanism | Field | Drives |
|---|---|---|
| Reporting line | `users.manager_id` (one per person) | Approval (as your manager) |
| Team leadership | `teams.team_lead_id` (one per team) | Approval (for your team) |
| Team membership | `team_members` (M:N, `is_primary`, `joined_at`/`left_at`) | Calendars, WFO, "who's out" |

**Roles are flat — four only:** `employee`, `team_lead`, `hr`, `founder`
(`users.role` CHECK constraint). **No divisional/skip-level tier exists.**

**Approval routing** (`lib/queries/leave-requests.ts → listPendingApprovalsForReviewer`):
a `team` reviewer sees the **union** of (a) members of teams they lead +
(b) their direct reports (`manager_id`). HR/founder see all. Approval is
**single-step**: any one eligible reviewer approves.

**Permissions** (`lib/capabilities/*`, `PRD_v1/CAPABILITIES.md`): hybrid
role-bundle + individually-grantable capabilities, which can be scoped
(`self` / `users` / `teams` / `all`). This part is well-designed.

---

## 3. Current-state findings (what's wrong / risky)

### 3.1 No home for the divisional heads
Kavya/Varun/Lokesh manage teams-of-teams. The model forces a bad choice:
- Make a head the `team_lead_id` of every team in their division → they approve
  everyone, but the **actual team managers have nowhere to sit**; or
- Make a head the `manager_id` of the team managers → clean 2-tier, but the
  reviewer query **does not recurse**, so the head sees **only the managers, not
  the members beneath them** — no division-wide visibility or coverage.

### 3.2 Ambiguous approval ownership (the Gaurav case)
Gaurav is in *LF YT KK Create* (some manager) but reports to Kavya. Today **both**
the team manager **and** Kavya can approve — whoever clicks first. No designated
owner → double-handling or dropped requests.

### 3.3 Multi-team people get multiple approvers
A person in Short-form + Course appears in both managers' queues. No primary.

### 3.4 No delegation / coverage
Finance member → Lokesh. If Lokesh is away, the request **stalls** — there is no
"acting approver" / delegate mechanism.

### 3.5 Leaver flow is essentially missing — **highest risk**
`deactivateUser` (`lib/actions/users.ts`) sets only `status='exited'` +
`exited_at`. It does **not**:
- reassign **direct reports** → their `manager_id` is orphaned (points at an
  exited user);
- reassign **team leadership** → a team can be left lead-less;
- close **team memberships** (`left_at` stays null);
- handle **pending approvals routed to the leaver** → stuck;
- cancel the leaver's **own future leaves**;
- disable their **auth login** (app redirects exited users, but the Supabase
  `auth.users` account persists).

**Visibility side-effects of an exit:**
- **Org tree** (`getOrgTree`) filters to active users → the leaver disappears and
  their orphaned reports can **drop out of the tree**.
- **Calendar / "Who's out today"** do **not** filter by user status
  (`lib/queries/leaves.ts`) → a leaver's **future leaves still show**. (Ghosts.)

### 3.6 Joiner / Mover are informal
- **Joiner** (`createUser`): creates auth + row, seeds **pro-rated** balances,
  recomputes capability bundles — but manager/team assignment is manual and not
  enforced; no onboarding checklist.
- **Mover:** changing `role` recomputes bundles; changing team/manager has no
  formal "effective date" record and no access re-review.

### 3.7 Audit log is a firehose
`listAuditEntries` returns the last 200 rows, newest-first, actor name resolved —
**no filtering** (person/action/date), no pagination, no export. Fine for
forensics, unusable for "show everything that happened to Gaurav's leave."

### 3.8 No permission-visibility surface
The model is configurable but there's **no screen** showing, per person, their
effective capabilities **and the source** (role bundle vs. manual grant).
`CAPABILITIES.md` references a "why does this user have access" helper — that
instinct should become UI.

---

## 4. What mature HR platforms do (patterns to borrow)

1. **Separate the reporting org from functional teams.** Leave routes **up the
   reporting line** (manager → skip-level); teams are dotted-line / scheduling.
2. **Explicit management tiers** incl. a divisional layer, with **skip-level
   visibility** (a head sees their whole sub-tree).
3. **Configurable approval workflows** (e.g. manager approves; long leaves also
   need skip-level/HR) + **delegation** when an approver is out.
4. **Separation of Duties** — can't approve your own (already enforced ✅);
   sensitive actions (backdating, balance edits) get a second check.
5. **Joiner-Mover-Leaver (JML) as first-class flows** — leaver deprovisions
   access, reassigns reports/leadership, transfers approvals, settles future
   leaves, **archives but never deletes** (audit/legal retention).
6. **Periodic access review (recertification).**
7. **Filterable, immutable, exportable audit logs** with a retention policy.

---

## 5. Recommended model for KK Create

### 5.1 Make `manager_id` the single source of truth for approvals
Set each person's `manager_id` to their **actual approver**, regardless of team.
Treat team membership as scheduling/visibility only. This resolves §3.2 and §3.3.

- Gaurav → `manager_id = Kavya`.
- Each team's members → `manager_id =` their team manager.

### 5.2 Add an explicit divisional layer via the reporting chain
```
Founders
  ├── Kavya (Creative)      ── LF YT KK Create mgr, LF YT Learn mgr, Short-form mgr
  ├── Varun (Course + HR)   ── Course mgr, HR mgr
  └── Lokesh (Finance)      ── Finance (single member)
```
Team managers' `manager_id` → their head; heads' `manager_id` → a founder.

### 5.3 Give heads division-wide visibility now, via capability scoping
Until skip-level recursion exists (Phase 2), grant each head `view_leaves`
(and `view_balance`) **scoped to their division's teams** — the scoped-capability
system already supports this (`teams` scope). This is a **config action available
today**, no code.

### 5.4 Target reviewer logic (Phase 2)
Approval should walk the **reporting chain**, with optional escalation:
- Primary approver = the requester's `manager_id`.
- Skip-level (head) can also see/approve (coverage), and *must* approve when the
  primary is the one on leave or for leaves over a threshold.
- Delegation: an approver going on leave names a delegate for that window.

---

## 6. Phased plan

### Phase 0 — Configure today (no code)
- [ ] Set every active user's `manager_id` to their real approver (fix Gaurav etc.).
- [ ] Set each team's `team_lead_id` to its real manager.
- [ ] Point team managers' `manager_id` at Kavya/Varun/Lokesh; heads' at a founder.
- [ ] Grant each head `view_leaves` + `view_balance` scoped to their division's teams.
- [ ] Write a manual offboarding checklist (interim, until Phase 1 ships).

### Phase 1 — Leaver flow + ghost fix (highest impact)
- [ ] Guided **offboard** action that, in one transaction: sets `exited`,
      **reassigns direct reports** to a chosen manager, **reassigns team
      leadership**, sets `team_members.left_at`, **reassigns/cancels pending
      approvals** owned by the leaver, **cancels future leaves**, and **revokes
      auth access**.
- [ ] Filter **calendar / "who's out" / upcoming** to active users (kill ghosts).
- [ ] Org tree: handle orphaned reports gracefully (surface "manager exited").
- [ ] Keep full history (archive, never hard-delete) for audit.

### Phase 2 — Divisional layer & approval workflow
- [ ] First-class **skip-level visibility** (a head sees their whole sub-tree)
      — either a `division`/`org_unit` concept or recursive reviewer resolution.
- [ ] **Designated primary approver** (the requester's manager) with skip-level
      fallback; remove "whoever clicks first" ambiguity.
- [ ] **Delegation / acting approver** for when a manager is on leave.
- [ ] Optional **multi-step rules** (e.g. leave > N days → skip-level or HR).

### Phase 3 — Governance & visibility
- [ ] **Audit-log filters** (person / action / entity / date) + **export**.
- [ ] **Access-review screen**: per person, effective capabilities + source
      (role vs grant), with a "why does X have access" explainer.
- [ ] Periodic **access recertification** prompt for HR/heads.
- [ ] Formal **Mover** flow with effective dates and access re-review.
- [ ] **Joiner** onboarding checklist + mandatory-manager enforcement.

---

## 7. Open questions for sign-off
1. Approval truth = **reporting line** (recommended) or keep the team-lead+manager union?
2. Should a head be able to approve **any** request in their division, or only
   when the direct manager is unavailable / over a threshold?
3. On exit, default behaviour for the leaver's **direct reports** — reassign to
   the leaver's own manager automatically, or always prompt for a target?
4. On exit, **future approved leaves** — auto-cancel, or leave on record until
   their last working day?
5. Audit-log **retention** period (compliance vs. storage)?

---

## 8. Appendix — code references
- Schema: `db/migrations/001_core_schema.sql`
- RLS / permissions: `db/migrations/005_rls_policies.sql`, `PRD_v1/CAPABILITIES.md`,
  `lib/capabilities/*`
- Approval routing: `lib/queries/leave-requests.ts` (`listPendingApprovalsForReviewer`)
- Offboarding: `lib/actions/users.ts` (`deactivateUser`, `reactivateUser`)
- Org tree: `lib/queries/org.ts` (`getOrgTree`)
- Leave visibility: `lib/queries/leaves.ts` (`listLeavesInRange`, `listLeavesToday`)
- Audit: `lib/queries/audit.ts` (`listAuditEntries`)
