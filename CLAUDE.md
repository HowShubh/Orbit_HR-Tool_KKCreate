# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KK Create HR — Phase 1 leave management + foundational HR platform (auth, users, teams, roles, capabilities, org tree, notifications, audit log). Replaces a Google Sheet–based workflow. Mobile-responsive web app, no native client.

Source of truth for product scope: `PRD_v1/PRD_KKCreate_HR_Phase1_v2.md`.
Source of truth for permissions: `PRD_v1/CAPABILITIES.md` — every new capability must be appended here before its migration runs.

## Commands

```bash
npm run dev         # next dev — local development
npm run build       # next build — production build (this is the most thorough verification; runs typecheck + build)
npm run typecheck   # tsc --noEmit — fast type validation
npm run lint        # next lint — NOTE: ESLint config is not initialized; first run is interactive. Prefer typecheck + build for CI-style checks.
```

There is **no test framework configured** (no Jest/Vitest, no test files outside `node_modules`). Verification is done via `npm run typecheck`, `npm run build`, and manual browser walk-through against `npm run dev`. Don't fabricate test commands.

## Environment

The app expects these env vars (no `.env.example` is committed — get values from another developer):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only; used by `lib/supabase/admin.ts`

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui-style primitives in `components/ui/` · Supabase (Postgres + Auth + RLS) · TanStack Query for client cache · React Hook Form + Zod · date-fns. Hosting target is Vercel.

## Architecture — the big picture

### 1. Three Supabase clients, three trust levels

- `lib/supabase/client.ts` — browser client, anon key, used by client components.
- `lib/supabase/server.ts` — server client (cookies-aware), anon key, used inside server components / middleware.
- `lib/supabase/admin.ts` — service-role client, **bypasses RLS**, only used in `lib/actions/*.ts` and `lib/queries/*.ts` (both run server-side). Never import this into a `'use client'` file.

`middleware.ts` runs on every request, redirects unauthenticated users to `/login`, and authenticated users away from `/login`. It only checks session existence — authoritative user lookup happens in protected layouts via `requireUser()`.

### 2. Server-side data layer split: queries vs actions

- `lib/queries/*.ts` — **read-only** data fetchers. Used by server components to populate pages. Imported into server-component files like `app/(app)/hr/page.tsx`.
- `lib/actions/*.ts` — **mutating** server actions (`'use server'`). Each begins with `requireUser()` or `requireCapability(...)` from `lib/actions/_helpers.ts` to enforce authentication and authorization before touching data. Most write `audit_log` rows on success and call `revalidatePath('/', 'layout')`.

This split is enforced by convention, not the type system. If you're fetching data for a page, it goes in `queries/`. If you're writing data in response to a user action, it goes in `actions/`.

### 3. Hybrid role + capability permission model

There are four roles (`employee`, `team_lead`, `hr`, `founder`) and a set of **capabilities** that act as atomic permissions. Each role auto-grants a default capability bundle, but capabilities can also be granted to individual users.

- Capability bundles are defined in `lib/capabilities/bundles.ts`.
- `lib/capabilities/can.ts` and the `useCapabilities()` hook (`hooks/use-capabilities.ts`) check capabilities client-side for UI gating.
- `requireCapability(name)` in `lib/actions/_helpers.ts` is the server-side enforcement.
- RLS policies in `db/migrations/005_rls_policies.sql` are the deepest layer.

Some permissions are **hardcoded self-permissions** (e.g. view/edit own profile, view own leaves) — these are invariants of "being an active employee" and never appear as capabilities. They're enforced as the first clause of every relevant RLS policy. See `PRD_v1/CAPABILITIES.md` for the full list.

When introducing a new permission, decide first whether it's a hardcoded self-permission (no), a global capability, or a scoped capability — then update `PRD_v1/CAPABILITIES.md` before writing the migration.

### 4. Routing: `(app)` vs `(auth)` groups

- `app/(app)/*` — authenticated routes (dashboard `/`, `/hr`, `/team`, `/leaves`, `/calendar`, `/org`, `/permissions`, `/audit`, `/profile`, `/settings`, `/leave-log`).
- `app/(auth)/*` — first-time setup flow.
- `app/login/`, `app/auth/callback/` — auth entry points.
- `app/api/setup/` — bootstrap endpoints, public-accessible (allowlisted in middleware).

Each `(app)/<route>/page.tsx` is a server component that calls one or more `lib/queries/*.ts` functions in parallel via `Promise.all`, then renders a `*-client.tsx` component that handles interactivity.

### 5. Database migrations are numbered SQL files

`db/migrations/NNN_*.sql` are applied in order against Supabase. They cover: core schema, capabilities, sql functions, RLS, triggers, holiday seed, views, and feature additions (leave approval workflow, comp-off expiry, mixed leave/wfh request plans, configurable leave types). To reset for dev, see `db/scripts/wipe-except-founder.sql`.

When adding a migration, generate fresh `lib/supabase/database.types.ts` against the updated schema so TS types stay aligned.

### 6. Leave domain model — three things to know

1. **`leaves` table holds one row per day-segment.** A multi-day request creates multiple rows. Half-days are represented via `half_day_position` ('first_half' | 'second_half') and `days_deducted = 0.5`.
2. **`leave_requests` table (migration 013) groups multi-day rows.** A `request_id` FK on `leaves` links them. `approveLeave(leaveId)` and `rejectLeave(leaveId)` detect the `request_id` and approve/reject the entire group atomically.
3. **Two reviewer paths.** `team_lead` approvers see only their led teams (resolved via `teams.team_lead_id` and `users.manager_id` fallback in `getLeaveReviewers`). HR/Founders see org-wide. The `<ApprovalQueue scope="hr" | "team">` component in `components/approvals/` is the shared approval UI for both.

### 7. Component organization

`components/<domain>/` mirrors the route structure (`hr/`, `leave/`, `dashboard/`, `calendar/`, etc.). `components/ui/` holds shadcn-style primitives. `components/approvals/` is a cross-cutting domain reused by HR Console + Dashboard.

Most domain folders pair a server-fetching `page.tsx` with a client `*-client.tsx` that receives serializable props. Dialogs (`*-dialog.tsx`) are co-located.

### 8. Toasts + global UI state

`lib/store.tsx` exports `useStore()` with `pushToast({ title, body?, variant: 'success' | 'info' | 'error' })`. Use this — there's no other toast system. Realtime notifications also flow through the store via `notifications` table changes.

## Conventions

- **Server actions throw `ActionError` from `lib/actions/errors.ts`**, not generic `Error`. The thrown message bubbles to client toasts unchanged.
- **Supabase typed-client `.in(column, values)` calls require narrow casts** because the generated types want literal-union arrays. The pattern is `as unknown as ('value1' | 'value2')[]` — keep casts narrow, avoid `as any`.
- **Audit on every write.** Server actions call `writeAudit(actorId, action, entity, entityId, { before?, after? })` from `_helpers.ts`.
- **`revalidatePath('/', 'layout')` after mutations** so all downstream caches refresh.
- **Notifications via `notifyUser({ user_id, type, title, body, link_url?, related_entity_type?, related_entity_id? })`** from `lib/actions/notifications.ts`.

## Superpowers brainstorm artifacts

`docs/superpowers/specs/` and `docs/superpowers/plans/` are produced by the Superpowers brainstorming/writing-plans skills. They're the design and implementation history for non-trivial features. Read the latest matching spec/plan when extending a feature you don't recognize.

`.superpowers/` is gitignored — visual-brainstorm session HTML lives there.
