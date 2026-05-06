# Approval Queue — Design Spec

**Date:** 2026-05-07
**Status:** Draft — pending review

## Problem

Today's leave-approval surface has two related issues:

1. **Multi-day requests are scattered.** A single week-long mixed request (e.g. 3 Leave + 2 WFH days) shows up in the HR Console as 6 separate rows in `all-leaves-tab.tsx`. Approvers must approve/reject each row individually with no visual link between them.
2. **Approvers lack context.** The current row-per-leave table doesn't show whether other teammates are already out on the same days, what the request looks like as a calendar, or how the days break down by type. Decisions are made on incomplete information.

The applicant-side experience (multi-day picker with mixed Leave/WFH selection) is already well-visualized. The approver side has not caught up.

## Goals

- One pending **request** = one card. No more 1-of-6 / 2-of-6 fragmentation.
- Approvers can see **who else from the team is out** on the requested days before deciding.
- Approval is **atomic at the request level** — approve or reject the whole thing.
- Same UI for HR and team leads (one approval experience to maintain).

## Non-goals (MVP)

- Per-day partial approval. If partial is needed, applicant re-applies for the remaining days.
- Edit-before-approve flows (e.g. "trim Monday off the request").
- Bulk approve/reject across multiple requests.
- Calendar view spanning months — the roster shows only the request's date range.

## Architecture

### Approach
**Single shared `<ApprovalQueue>` component**, mounted in two places (HR Console and Dashboard). The component takes a `scope` prop that controls which requests it loads.

### Component structure
```
components/approvals/
├── approval-queue.tsx           # server component; fetches pending requests + per-card conflict counts
├── approval-card.tsx            # client; condensed card with Approve/Reject + conflict pill
├── approval-card-expanded.tsx   # client; lazy-loads roster on open
├── team-roster-grid.tsx         # client; people-as-rows, days-as-columns matrix
└── conflict-pill.tsx            # client; "⚠ N teammate(s) also out [day]"
```

### Mount points
- **HR Console > All Leaves tab** (`app/(app)/hr/page.tsx`):
  `<ApprovalQueue scope="hr">` rendered above a collapsible history table that holds all non-pending leaves grouped by request.
- **Dashboard** (`components/dashboard/dashboard-client.tsx`):
  Existing pending-approval section is replaced by `<ApprovalQueue scope="team">` for team leads, or `<ApprovalQueue scope="hr">` for founders.

### Scope behavior
- `scope="hr"` — loads all org-wide `leave_requests` with `status='pending'`. Used by HR and Founders.
- `scope="team"` — loads only requests where the current user is the resolved reviewer (primary team's `team_lead_id`, falling back to `manager_id`).

### What the existing legacy single-day leaves do
Leaves created before migration `013_leave_request_plans.sql` have `request_id = NULL`. The query treats each such leave as a standalone single-day request so nothing falls through. No data migration is needed.

## Data layer

### New file: `lib/queries/leave-requests.ts`

```ts
export type LeaveRequestWithDays = {
  id: string                              // leave_requests.id, or synthetic for legacy single-day
  user_id: string
  user_full_name: string
  user_team_id: string | null             // applicant's primary team
  user_team_name: string | null
  status: 'pending' | 'active' | 'rejected' | 'delete_requested' | 'deleted'
  reason: string | null
  created_at: string
  days: Array<{
    leave_id: string
    date: string                          // YYYY-MM-DD
    type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
    days_deducted: number
    half_day_position: 'first_half' | 'second_half' | null
  }>
  summary: {
    leave_days: number                    // sum of days_deducted for type ∈ {leave, compoff_leave}
    wfh_days: number                      // sum for type ∈ {wfh, compoff_wfh}
    start_date: string
    end_date: string
  }
  conflicts: Array<{
    date: string
    teammate_count: number                // count of distinct teammates with active|pending leave/wfh on this date
  }>
}

listPendingApprovalsForReviewer(
  reviewerUserId: string,
  scope: 'hr' | 'team'
): Promise<LeaveRequestWithDays[]>

listLeaveRequestHistory(
  reviewerUserId: string,
  scope: 'hr' | 'team',
  options?: { limit?: number; statuses?: Status[] }
): Promise<LeaveRequestWithDays[]>

listRosterContext(
  teamId: string,
  startDate: string,
  endDate: string,
  excludeUserId: string                   // applicant — pinned separately on the client
): Promise<RosterCell[]>

type RosterCell = {
  user_id: string
  user_full_name: string
  date: string                            // YYYY-MM-DD
  type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave' | 'holiday'
}
```

### Fetch timing
- `listPendingApprovalsForReviewer` runs **eagerly** at page load. Includes the conflict count per day so condensed cards render warnings immediately without N extra round trips.
- `listRosterContext` runs **lazily** — invoked from a server action when a card is expanded for the first time. Result is cached in client state for the rest of the session.
- `listLeaveRequestHistory` runs only when the user toggles the history panel open.

### No schema changes
The existing `leave_requests` and `leaves` tables (with `request_id` FK) from migration 013 are sufficient. The existing `approveLeave` / `rejectLeave` server actions already handle grouped approval atomically via `approveLeaveRequestById` / `rejectLeaveRequestById` (see `lib/actions/leaves.ts`).

## UX details

### Condensed card (default state)
Contains:
- Avatar + applicant name
- Summary line: "3 Leave + 2 WFH · May 12–16"
- Reason (truncated to 1 line; tooltip for full)
- Conflict pill (if any): "⚠ 1 teammate also out Mon May 12"
- Approve / Reject buttons (right-aligned)

Click anywhere on the card body (not buttons) → expands.

### Expanded card
- Animates open below the condensed card; condensed card stays visible at top
- Body shows the **Team Roster Grid**:
  - Rows: each member of the applicant's primary team, sorted alphabetically; applicant pinned to row 1 with a ✱ marker
  - Columns: each calendar day in the request range that's a working day per the team's `wfo_pattern` (e.g. MON–SAT). Non-working days collapsed into a single muted divider.
  - Cells: `L` (Leave), `W` (WFH), `H` (Holiday — full-column shaded), `—` (in office)
  - Bottom summary row: per-day count of absent members, rendered in red when ≥30% of team is out
- Approve / Reject buttons remain in the condensed card; no duplicate set in expanded view

### Conflict-warning logic (server-side)
For each request:
1. Identify applicant's primary team
2. For each date in the request range, count distinct **other** team members who have a non-rejected, non-deleted `leaves` row covering that date
3. Return only dates with `count >= 1`

This is one batched query for the whole queue, not per card.

### Roster team resolution
1. Applicant's primary team (`team_members.is_primary = true, left_at IS NULL`)
2. If none → applicant's manager + that manager's other direct reports
3. If neither → expanded panel hides the grid and shows a small "No team context available" caption. Approve/Reject still work.

### Holidays
Loaded from the existing `holidays` table for the request's date range. Rendered as a full shaded column in the roster grid; the day header shows the holiday name.

### Empty state
Queue header: "All caught up — 0 pending approvals." History toggle below remains accessible.

### Loading states
- Page load: server component renders cards directly (no skeleton needed for the queue itself).
- Card expand: 3-row skeleton in the roster slot while `listRosterContext` resolves.

### Error handling
- Roster fetch fails → expanded panel shows "Couldn't load team context" + retry button. Approve / Reject buttons still work.
- Approve / reject action fails → toast (existing pattern from `all-leaves-tab.tsx` and `dashboard-client.tsx`); card returns to the queue.

### Optimistic UI
- On approve/reject, card is removed from the queue immediately
- Pending counter updates optimistically
- If the server action throws, the card re-appears with the error toast

## HR Console history table

The non-pending leaves currently in `all-leaves-tab.tsx` move into a **collapsible "History" section** below the queue:
- Default collapsed, with a header line: "Past requests · 47 approved · 3 rejected · 2 deleted"
- When expanded, it renders a table grouped **by request** rather than by individual leave row
- Each row in the history table represents a whole request; clicking a row opens a read-only version of the same expanded view (roster grid + day breakdown)
- Search and Backdate Leave controls move to the queue header area so they remain available
- Status filter (All / Approved / Rejected / Deleted) lives inside the history section

## Edge cases

- **Half-day leaves.** Roster cell shows `½L` or `½W`. Conflict count treats a half-day as a present teammate (count=1).
- **Comp-off types** (`compoff_wfh`, `compoff_leave`). Treated as their base type for visualization (`L` or `W`); the condensed summary line keeps them distinct: "3 Leave (1 comp-off) + 2 WFH".
- **Delete requests** (`status = 'delete_requested'`). Appear in the queue alongside fresh requests with a "Delete request" badge instead of the standard pending badge. The Approve button label changes to "Approve Delete".
- **Cross-team applicants** (people on multiple teams). Roster uses primary team only. A small chip shows "Member of N teams" so the approver isn't surprised about who's not in the grid.
- **Applicant is the team lead approving for themselves.** Already prevented at the action layer (`getLeaveReviewers` excludes self). UI hides the Approve / Reject buttons in this case.
- **Very long requests** (≥10 working days). Roster columns scroll horizontally inside the card; the day-summary footer scrolls in sync.
- **Holiday-only days in range.** Whole column is shaded; conflict count for that day is suppressed (since nobody is "out" on a non-working day).

## Testing

- **Unit:** day-grouping helper that turns flat `leaves` rows into `LeaveRequestWithDays.days` (covers single-day legacy, multi-day grouped, half-days, comp-off types).
- **Unit:** conflict count computation (zero conflicts, one teammate, multiple teammates, half-day teammate).
- **Integration:** `listPendingApprovalsForReviewer` for both `scope` values, including a team-lead-with-no-team-set fallback path.
- **Integration:** approve / reject through the queue updates request status atomically and removes the card.
- **Component:** `<TeamRosterGrid>` rendering with mixed Leave/WFH/Holiday/Half-day cells.
- **Manual:** dev-server walk-through of HR scope and Team scope, including the empty state and the roster-fetch-failure path.

## Migration

- No DB migration required (table from `013_leave_request_plans.sql` is already present).
- Backfill: legacy single-day leaves (`request_id IS NULL`) are handled in-query, no data write needed.
- Rollout: ship behind no flag; replaces the existing pending section in HR Console and Dashboard in one PR.
