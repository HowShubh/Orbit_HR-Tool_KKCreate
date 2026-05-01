# Supabase Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the KK Create HR Tool to Supabase — install packages, deploy the full database schema, implement Google OAuth auth, capability-based permissions foundation, and the bootstrap onboarding flow — leaving mock data in place for leaves/balances until Phase 2.

**Architecture:** Supabase SSR with Next.js 14 App Router. Server components use `createServerClient` from `@supabase/ssr`; client components use `createBrowserClient`. Auth is enforced via `middleware.ts` (session refresh + route protection). Capabilities are derived client-side from the user's role using hardcoded bundle definitions (auto-mapping). The `system_state` table drives the bootstrap state machine. The mock `StoreProvider` stays for leaves/balances until Phase 2; a new `CapabilityProvider` wraps it with real auth data.

**Tech Stack:** `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, Next.js 14 App Router, TypeScript

---

## File Map

**Create:**
- `.env.local` — env vars
- `lib/supabase/database.types.ts` — full hand-written DB types
- `lib/supabase/client.ts` — browser Supabase client
- `lib/supabase/server.ts` — server Supabase client (SSR cookies)
- `lib/supabase/admin.ts` — service-role Supabase client
- `middleware.ts` — auth session refresh + route guard
- `app/auth/callback/route.ts` — OAuth callback handler (handles bootstrap)
- `app/(auth)/setup/page.tsx` — 3-step bootstrap wizard
- `app/api/setup/root-admin/route.ts` — root admin creation endpoint
- `lib/auth/get-current-user.ts` — server-side current user fetch
- `lib/capabilities/bundles.ts` — bundle definitions + role→bundle map
- `lib/capabilities/can.ts` — `buildCanFromRole` + `CanHelpers` interface
- `lib/contexts/capability-context.tsx` — React context + `CapabilityProvider`
- `hooks/use-capabilities.ts` — `useCapabilities()` hook
- `hooks/use-current-user.ts` — client-side auth user hook
- `db/migrations/001_core_schema.sql`
- `db/migrations/002_capabilities.sql`
- `db/migrations/003_bootstrap_state.sql`
- `db/migrations/004_sql_functions.sql`
- `db/migrations/005_rls_policies.sql`
- `db/migrations/006_triggers.sql`
- `db/migrations/007_holidays_seed.sql`
- `db/migrations/008_leaves_today_view.sql`

**Modify:**
- `app/layout.tsx` — add `QueryClientProvider` + `CapabilityProvider`
- `app/(app)/layout.tsx` — server-side auth check, pass real user to shell
- `app/(auth)/login/page.tsx` — real Google OAuth button
- `lib/types.ts` — add `CanHelpers` re-export, update `User` to match DB
- `components/layout/sidebar.tsx` — capability-gated nav items

---

## Task 1: Install packages & configure environment

**Files:**
- Create: `.env.local`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install Supabase and form packages**

```bash
cd /Users/shubh/Documents/GitHub/Orbit_HR-Tool_KKCreate
npm install @supabase/supabase-js @supabase/ssr @tanstack/react-query react-hook-form @hookform/resolvers zod
```

Expected output: `added N packages`

- [ ] **Step 2: Create `.env.local`**

Create file `/Users/shubh/Documents/GitHub/Orbit_HR-Tool_KKCreate/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://bwhixenkcawqydtuczif.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3aGl4ZW5rY2F3cXlkdHVjemlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MzczMDMsImV4cCI6MjA5MzIxMzMwM30.9-dPxb1MpkJ3otW1Zgh25o6zwAwJSrobAORyTzaIQgg
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3aGl4ZW5rY2F3cXlkdHVjemlmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzYzNzMwMywiZXhwIjoyMDkzMjEzMzAzfQ.AOHh-6a8bGM_hRW3xjxlAb6uCtqxCKvWAcPn6SZE1TI
NEXT_PUBLIC_APP_URL=http://localhost:3000
COMPANY_EMAIL_DOMAIN=kkcreate.com
```

- [ ] **Step 3: Add `.env.local` to `.gitignore`**

Verify `.gitignore` already has `.env.local` (it should from create-next-app). If not, add it.

```bash
grep ".env.local" /Users/shubh/Documents/GitHub/Orbit_HR-Tool_KKCreate/.gitignore
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install supabase, react-query, react-hook-form, zod"
```

---

## Task 2: Database types

**Files:**
- Create: `lib/supabase/database.types.ts`

- [ ] **Step 1: Create `lib/supabase/database.types.ts`**

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          id: string
          actor_id: string
          action: string
          entity_type: string
          entity_id: string
          diff: Json | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          action: string
          entity_type: string
          entity_id: string
          diff?: Json | null
          note?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>
      }
      capabilities: {
        Row: {
          key: string
          description: string
          is_scoped: boolean
          is_write: boolean
        }
        Insert: {
          key: string
          description: string
          is_scoped: boolean
          is_write: boolean
        }
        Update: Partial<Database['public']['Tables']['capabilities']['Insert']>
      }
      capability_bundles: {
        Row: {
          key: string
          name: string
          description: string
          capabilities: Json
        }
        Insert: {
          key: string
          name: string
          description: string
          capabilities: Json
        }
        Update: Partial<Database['public']['Tables']['capability_bundles']['Insert']>
      }
      compoff_grants: {
        Row: {
          id: string
          user_id: string
          type: 'compoff_wfh' | 'compoff_leave'
          amount: number
          work_date: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          manager_id: string
          decided_at: string | null
          decided_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'compoff_wfh' | 'compoff_leave'
          amount: number
          work_date: string
          reason: string
          status?: 'pending' | 'approved' | 'rejected'
          manager_id: string
          decided_at?: string | null
          decided_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['compoff_grants']['Insert']>
      }
      holidays: {
        Row: {
          id: string
          date: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          name: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['holidays']['Insert']>
      }
      leave_balances: {
        Row: {
          id: string
          user_id: string
          leave_year: number
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          allocated: number
          used: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          leave_year: number
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          allocated?: number
          used?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_balances']['Insert']>
      }
      leave_year_resets: {
        Row: {
          id: string
          leave_year: number
          triggered_by: string
          triggered_at: string
        }
        Insert: {
          id?: string
          leave_year: number
          triggered_by: string
          triggered_at?: string
        }
        Update: Partial<Database['public']['Tables']['leave_year_resets']['Insert']>
      }
      leaves: {
        Row: {
          id: string
          user_id: string
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          start_date: string
          end_date: string
          half_day_start: boolean
          half_day_end: boolean
          half_day_position: 'first_half' | 'second_half' | null
          reason: string | null
          days_deducted: number
          status: 'active' | 'deleted'
          created_by: string
          deleted_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          start_date: string
          end_date: string
          half_day_start?: boolean
          half_day_end?: boolean
          half_day_position?: 'first_half' | 'second_half' | null
          reason?: string | null
          days_deducted: number
          status?: 'active' | 'deleted'
          created_by: string
          deleted_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['leaves']['Insert']>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string
          link_url: string | null
          related_entity_type: string | null
          related_entity_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body: string
          link_url?: string | null
          related_entity_type?: string | null
          related_entity_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
      }
      system_state: {
        Row: {
          id: number
          bootstrap_state: 'awaiting_root_admin' | 'awaiting_first_hr' | 'awaiting_first_team' | 'operational'
          bootstrapped_at: string | null
          bootstrapped_by: string | null
        }
        Insert: {
          id?: number
          bootstrap_state?: 'awaiting_root_admin' | 'awaiting_first_hr' | 'awaiting_first_team' | 'operational'
          bootstrapped_at?: string | null
          bootstrapped_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['system_state']['Insert']>
      }
      team_members: {
        Row: {
          id: string
          user_id: string
          team_id: string
          is_primary: boolean
          joined_at: string
          left_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          team_id: string
          is_primary?: boolean
          joined_at?: string
          left_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>
      }
      teams: {
        Row: {
          id: string
          name: string
          wfo_pattern: string
          team_lead_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          wfo_pattern: string
          team_lead_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['teams']['Insert']>
      }
      user_capabilities: {
        Row: {
          id: string
          user_id: string
          capability_key: string
          scope_type: 'self' | 'users' | 'teams' | 'all' | null
          scope_user_ids: string[] | null
          scope_team_ids: string[] | null
          granted_by: string
          granted_at: string
          source: 'manual' | 'role' | 'bundle'
          source_ref: string | null
          note: string | null
        }
        Insert: {
          id?: string
          user_id: string
          capability_key: string
          scope_type?: 'self' | 'users' | 'teams' | 'all' | null
          scope_user_ids?: string[] | null
          scope_team_ids?: string[] | null
          granted_by: string
          granted_at?: string
          source?: 'manual' | 'role' | 'bundle'
          source_ref?: string | null
          note?: string | null
        }
        Update: Partial<Database['public']['Tables']['user_capabilities']['Insert']>
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          phone: string | null
          photo_url: string | null
          role: 'employee' | 'team_lead' | 'hr' | 'founder'
          manager_id: string | null
          status: 'active' | 'exited'
          joined_at: string
          exited_at: string | null
          notifications_muted: boolean
          designation: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          phone?: string | null
          photo_url?: string | null
          role: 'employee' | 'team_lead' | 'hr' | 'founder'
          manager_id?: string | null
          status?: 'active' | 'exited'
          joined_at: string
          exited_at?: string | null
          notifications_muted?: boolean
          designation?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
    }
    Views: {
      leaves_today: {
        Row: {
          id: string
          user_id: string
          type: 'wfh' | 'leave' | 'compoff_wfh' | 'compoff_leave'
          start_date: string
          end_date: string
          half_day_start: boolean
          half_day_end: boolean
        }
      }
    }
    Functions: {
      user_can: {
        Args: { cap: string; target_user_id?: string }
        Returns: boolean
      }
      apply_bundle: {
        Args: {
          p_user_id: string
          p_bundle_key: string
          p_granted_by: string
          p_source?: string
          p_source_ref?: string
        }
        Returns: undefined
      }
      recompute_role_bundles: {
        Args: { p_user_id: string; p_new_role: string }
        Returns: undefined
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "feat: add database types for all supabase tables"
```

---

## Task 3: Supabase clients

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Create browser client `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create server client `lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component context — cookies cannot be set, ignored safely
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Create admin client `lib/supabase/admin.ts`**

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/shubh/Documents/GitHub/Orbit_HR-Tool_KKCreate
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors on the new files (existing files may have unrelated errors).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/
git commit -m "feat: add supabase browser, server, and admin clients"
```

---

## Task 4: Migration 001 — Core schema

**Files:**
- Create: `db/migrations/001_core_schema.sql`

- [ ] **Step 1: Write `db/migrations/001_core_schema.sql`**

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE public.users (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT UNIQUE NOT NULL,
  full_name           TEXT NOT NULL,
  phone               TEXT,
  photo_url           TEXT,
  role                TEXT NOT NULL CHECK (role IN ('employee', 'team_lead', 'hr', 'founder')),
  manager_id          UUID REFERENCES public.users(id),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exited')),
  joined_at           DATE NOT NULL DEFAULT CURRENT_DATE,
  exited_at           DATE,
  notifications_muted BOOLEAN NOT NULL DEFAULT FALSE,
  designation         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE public.teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  wfo_pattern  TEXT NOT NULL,
  team_lead_id UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TEAM MEMBERS (junction — supports multi-team people)
-- ============================================================
CREATE TABLE public.team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  left_at    DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, team_id, joined_at)
);

-- ============================================================
-- LEAVES
-- ============================================================
CREATE TABLE public.leaves (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id),
  type              TEXT NOT NULL CHECK (type IN ('wfh', 'leave', 'compoff_wfh', 'compoff_leave')),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  half_day_start    BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_end      BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_position TEXT CHECK (half_day_position IN ('first_half', 'second_half')),
  reason            TEXT,
  days_deducted     NUMERIC(4,1) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_by        UUID NOT NULL REFERENCES public.users(id),
  deleted_by        UUID REFERENCES public.users(id),
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT end_after_start CHECK (end_date >= start_date)
);

-- ============================================================
-- LEAVE BALANCES
-- ============================================================
CREATE TABLE public.leave_balances (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id),
  leave_year INT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('wfh', 'leave', 'compoff_wfh', 'compoff_leave')),
  allocated  NUMERIC(5,1) NOT NULL DEFAULT 0,
  used       NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, leave_year, type)
);

-- ============================================================
-- COMPOFF GRANTS
-- ============================================================
CREATE TABLE public.compoff_grants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id),
  type       TEXT NOT NULL CHECK (type IN ('compoff_wfh', 'compoff_leave')),
  amount     NUMERIC(4,1) NOT NULL,
  work_date  DATE NOT NULL,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  manager_id UUID NOT NULL REFERENCES public.users(id),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HOLIDAYS
-- ============================================================
CREATE TABLE public.holidays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id),
  type                TEXT NOT NULL,
  title               TEXT NOT NULL,
  body                TEXT NOT NULL,
  link_url            TEXT,
  related_entity_type TEXT,
  related_entity_id   UUID,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID NOT NULL REFERENCES public.users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  diff        JSONB,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LEAVE YEAR RESETS
-- ============================================================
CREATE TABLE public.leave_year_resets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_year   INT NOT NULL UNIQUE,
  triggered_by UUID NOT NULL REFERENCES public.users(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/001_core_schema.sql
git commit -m "feat: add core schema migration (users, teams, leaves, balances, etc.)"
```

---

## Task 5: Migration 002 — Capabilities schema + seeds

**Files:**
- Create: `db/migrations/002_capabilities.sql`

- [ ] **Step 1: Write `db/migrations/002_capabilities.sql`**

```sql
-- ============================================================
-- CAPABILITIES CATALOG
-- ============================================================
CREATE TABLE public.capabilities (
  key         TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_scoped   BOOLEAN NOT NULL,
  is_write    BOOLEAN NOT NULL
);

-- ============================================================
-- CAPABILITY BUNDLES
-- ============================================================
CREATE TABLE public.capability_bundles (
  key          TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  capabilities JSONB NOT NULL
);

-- ============================================================
-- USER CAPABILITIES
-- ============================================================
CREATE TABLE public.user_capabilities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL REFERENCES public.capabilities(key),
  scope_type     TEXT CHECK (scope_type IN ('self', 'users', 'teams', 'all')),
  scope_user_ids UUID[],
  scope_team_ids UUID[],
  granted_by     UUID NOT NULL REFERENCES public.users(id),
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'role', 'bundle')),
  source_ref     TEXT,
  note           TEXT
);

-- ============================================================
-- SEED: capability catalog
-- ============================================================
INSERT INTO public.capabilities (key, description, is_scoped, is_write) VALUES
  ('view_leaves',         'View leaves of others',                 TRUE,  FALSE),
  ('edit_leaves',         'Create, edit, delete leaves of others', TRUE,  TRUE),
  ('view_balance',        'View leave balances of others',         TRUE,  FALSE),
  ('edit_balance',        'Edit leave balances of others',         TRUE,  TRUE),
  ('approve_compoff',     'Approve or reject compoff requests',    TRUE,  TRUE),
  ('manage_holidays',     'Edit company holiday calendar',         FALSE, TRUE),
  ('view_audit_log',      'View audit log',                        FALSE, FALSE),
  ('manage_users',        'Create and edit user records',          FALSE, TRUE),
  ('manage_capabilities', 'Grant or revoke capabilities',          FALSE, TRUE),
  ('run_annual_reset',    'Run the annual leave reset',            FALSE, TRUE);

-- ============================================================
-- SEED: bundles
-- ============================================================
INSERT INTO public.capability_bundles (key, name, description, capabilities) VALUES
  (
    'team_lead',
    'Team Lead',
    'Powers over teams the user leads',
    '[
      {"capability_key": "view_leaves",    "scope_type": "teams", "dynamic_scope": "led_teams"},
      {"capability_key": "view_balance",   "scope_type": "teams", "dynamic_scope": "led_teams"},
      {"capability_key": "approve_compoff","scope_type": "teams", "dynamic_scope": "led_teams"}
    ]'::jsonb
  ),
  (
    'hr_admin',
    'HR Admin',
    'Full HR powers across the org',
    '[
      {"capability_key": "view_leaves",    "scope_type": "all"},
      {"capability_key": "edit_leaves",    "scope_type": "all"},
      {"capability_key": "view_balance",   "scope_type": "all"},
      {"capability_key": "edit_balance",   "scope_type": "all"},
      {"capability_key": "approve_compoff","scope_type": "all"},
      {"capability_key": "manage_users"},
      {"capability_key": "manage_holidays"},
      {"capability_key": "run_annual_reset"},
      {"capability_key": "view_audit_log"}
    ]'::jsonb
  ),
  (
    'founder_full',
    'Founder Full Access',
    'Everything HR has plus capability management',
    '[
      {"capability_key": "view_leaves",         "scope_type": "all"},
      {"capability_key": "edit_leaves",         "scope_type": "all"},
      {"capability_key": "view_balance",        "scope_type": "all"},
      {"capability_key": "edit_balance",        "scope_type": "all"},
      {"capability_key": "approve_compoff",     "scope_type": "all"},
      {"capability_key": "manage_users"},
      {"capability_key": "manage_holidays"},
      {"capability_key": "run_annual_reset"},
      {"capability_key": "view_audit_log"},
      {"capability_key": "manage_capabilities"}
    ]'::jsonb
  );
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/002_capabilities.sql
git commit -m "feat: add capabilities tables and seed bundles"
```

---

## Task 6: Migration 003 — Bootstrap state

**Files:**
- Create: `db/migrations/003_bootstrap_state.sql`

- [ ] **Step 1: Write `db/migrations/003_bootstrap_state.sql`**

```sql
-- ============================================================
-- SYSTEM STATE (singleton row, enforced by CHECK id = 1)
-- ============================================================
CREATE TABLE public.system_state (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bootstrap_state TEXT NOT NULL DEFAULT 'awaiting_root_admin'
                  CHECK (bootstrap_state IN (
                    'awaiting_root_admin',
                    'awaiting_first_hr',
                    'awaiting_first_team',
                    'operational'
                  )),
  bootstrapped_at TIMESTAMPTZ,
  bootstrapped_by UUID REFERENCES public.users(id)
);

-- Insert the singleton row
INSERT INTO public.system_state (id) VALUES (1);
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/003_bootstrap_state.sql
git commit -m "feat: add system_state table for bootstrap flow"
```

---

## Task 7: Migration 004 — SQL functions

**Files:**
- Create: `db/migrations/004_sql_functions.sql`

- [ ] **Step 1: Write `db/migrations/004_sql_functions.sql`**

```sql
-- ============================================================
-- user_can(): main permission check called from RLS policies
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_can(
  cap             TEXT,
  target_user_id  UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Global capability (is_scoped = FALSE): just needs to exist for caller
  IF EXISTS (
    SELECT 1
    FROM public.user_capabilities uc
    JOIN public.capabilities c ON c.key = uc.capability_key
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
    SELECT 1 FROM public.user_capabilities
    WHERE user_id = caller_id
      AND capability_key = cap
      AND scope_type = 'all'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope: self
  IF caller_id = target_user_id AND EXISTS (
    SELECT 1 FROM public.user_capabilities
    WHERE user_id = caller_id
      AND capability_key = cap
      AND scope_type = 'self'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope: specific users array
  IF EXISTS (
    SELECT 1 FROM public.user_capabilities
    WHERE user_id = caller_id
      AND capability_key = cap
      AND scope_type = 'users'
      AND target_user_id = ANY(scope_user_ids)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope: teams (target must be active member of any scoped team)
  IF EXISTS (
    SELECT 1
    FROM public.user_capabilities uc
    WHERE uc.user_id = caller_id
      AND uc.capability_key = cap
      AND uc.scope_type = 'teams'
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
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

-- ============================================================
-- apply_bundle(): insert user_capabilities rows for a bundle
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_bundle(
  p_user_id    UUID,
  p_bundle_key TEXT,
  p_granted_by UUID,
  p_source     TEXT DEFAULT 'bundle',
  p_source_ref TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  bundle_cap   JSONB;
  cap_record   public.capabilities%ROWTYPE;
  led_teams    UUID[];
  v_scope_type TEXT;
  v_team_ids   UUID[];
  v_source_ref TEXT;
BEGIN
  v_source_ref := COALESCE(p_source_ref, 'bundle:' || p_bundle_key);

  -- Teams this user leads (for dynamic_scope = 'led_teams')
  SELECT ARRAY_AGG(id) INTO led_teams
  FROM public.teams
  WHERE team_lead_id = p_user_id;

  FOR bundle_cap IN
    SELECT value FROM jsonb_array_elements(
      (SELECT capabilities FROM public.capability_bundles WHERE key = p_bundle_key)
    )
  LOOP
    SELECT * INTO cap_record
    FROM public.capabilities
    WHERE key = bundle_cap->>'capability_key';

    IF cap_record.is_scoped THEN
      v_scope_type := bundle_cap->>'scope_type';
      v_team_ids   := CASE
        WHEN bundle_cap->>'dynamic_scope' = 'led_teams' THEN led_teams
        ELSE NULL
      END;

      INSERT INTO public.user_capabilities
        (user_id, capability_key, scope_type, scope_team_ids, granted_by, source, source_ref)
      VALUES
        (p_user_id, cap_record.key, v_scope_type, v_team_ids, p_granted_by, p_source, v_source_ref);
    ELSE
      INSERT INTO public.user_capabilities
        (user_id, capability_key, scope_type, granted_by, source, source_ref)
      VALUES
        (p_user_id, cap_record.key, NULL, p_granted_by, p_source, v_source_ref);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- recompute_role_bundles(): wipe + reapply role-derived caps
-- Called whenever a user's role changes or team lead assignment changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.recompute_role_bundles(
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.user_capabilities
  WHERE user_id = p_user_id AND source = 'role';

  CASE p_new_role
    WHEN 'team_lead' THEN
      PERFORM public.apply_bundle(p_user_id, 'team_lead', p_user_id, 'role', 'role:team_lead');
    WHEN 'hr' THEN
      PERFORM public.apply_bundle(p_user_id, 'hr_admin',  p_user_id, 'role', 'role:hr');
    WHEN 'founder' THEN
      PERFORM public.apply_bundle(p_user_id, 'founder_full', p_user_id, 'role', 'role:founder');
    ELSE
      NULL; -- 'employee' gets no capabilities
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/004_sql_functions.sql
git commit -m "feat: add user_can, apply_bundle, recompute_role_bundles SQL functions"
```

---

## Task 8: Migration 005 — RLS policies

**Files:**
- Create: `db/migrations/005_rls_policies.sql`

- [ ] **Step 1: Write `db/migrations/005_rls_policies.sql`**

```sql
-- Enable RLS on all tables
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaves            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compoff_grants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_year_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capabilities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capability_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_state      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SYSTEM STATE — anyone can read (needed for bootstrap check)
-- ============================================================
CREATE POLICY "system_state_select_all" ON public.system_state
  FOR SELECT USING (TRUE);

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY "users_select_authenticated" ON public.users
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Self-update: limited columns enforced by trigger (Task 9)
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE USING (id = auth.uid());

-- Privileged update via manage_users capability
CREATE POLICY "users_manage_update" ON public.users
  FOR UPDATE USING (public.user_can('manage_users'));

-- Insert requires manage_users; also service role bypasses RLS
CREATE POLICY "users_insert" ON public.users
  FOR INSERT WITH CHECK (public.user_can('manage_users'));

-- ============================================================
-- TEAMS & TEAM MEMBERS — read by all, write requires manage_users
-- ============================================================
CREATE POLICY "teams_select" ON public.teams
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT WITH CHECK (public.user_can('manage_users'));

CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE USING (public.user_can('manage_users'));

CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE USING (public.user_can('manage_users'));

CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT WITH CHECK (public.user_can('manage_users'));

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE USING (public.user_can('manage_users'));

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE USING (public.user_can('manage_users'));

-- ============================================================
-- LEAVES
-- ============================================================
CREATE POLICY "leaves_select" ON public.leaves
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.user_can('view_leaves', user_id)
  );

CREATE POLICY "leaves_insert" ON public.leaves
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR public.user_can('edit_leaves', user_id)
  );

CREATE POLICY "leaves_update" ON public.leaves
  FOR UPDATE USING (
    (user_id = auth.uid() AND start_date > CURRENT_DATE)
    OR public.user_can('edit_leaves', user_id)
  );

CREATE POLICY "leaves_delete" ON public.leaves
  FOR DELETE USING (
    (user_id = auth.uid() AND start_date > CURRENT_DATE)
    OR public.user_can('edit_leaves', user_id)
  );

-- ============================================================
-- LEAVE BALANCES
-- ============================================================
CREATE POLICY "balance_select" ON public.leave_balances
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.user_can('view_balance', user_id)
  );

CREATE POLICY "balance_insert" ON public.leave_balances
  FOR INSERT WITH CHECK (public.user_can('edit_balance', user_id));

CREATE POLICY "balance_update" ON public.leave_balances
  FOR UPDATE USING (public.user_can('edit_balance', user_id));

-- ============================================================
-- COMPOFF GRANTS
-- ============================================================
CREATE POLICY "compoff_select" ON public.compoff_grants
  FOR SELECT USING (
    user_id    = auth.uid()
    OR manager_id = auth.uid()
    OR public.user_can('approve_compoff', user_id)
  );

CREATE POLICY "compoff_insert" ON public.compoff_grants
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "compoff_update" ON public.compoff_grants
  FOR UPDATE USING (
    manager_id = auth.uid()
    OR public.user_can('approve_compoff', user_id)
  );

-- ============================================================
-- HOLIDAYS — read by all, write requires manage_holidays
-- ============================================================
CREATE POLICY "holidays_select" ON public.holidays
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "holidays_insert" ON public.holidays
  FOR INSERT WITH CHECK (public.user_can('manage_holidays'));

CREATE POLICY "holidays_update" ON public.holidays
  FOR UPDATE USING (public.user_can('manage_holidays'));

CREATE POLICY "holidays_delete" ON public.holidays
  FOR DELETE USING (public.user_can('manage_holidays'));

-- ============================================================
-- NOTIFICATIONS — own rows only
-- ============================================================
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- AUDIT LOG — view_audit_log capability; no client writes
-- ============================================================
CREATE POLICY "audit_select" ON public.audit_log
  FOR SELECT USING (public.user_can('view_audit_log'));

-- ============================================================
-- LEAVE YEAR RESETS
-- ============================================================
CREATE POLICY "resets_select" ON public.leave_year_resets
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "resets_insert" ON public.leave_year_resets
  FOR INSERT WITH CHECK (public.user_can('run_annual_reset'));

-- ============================================================
-- CAPABILITIES & BUNDLES — read by all authenticated
-- ============================================================
CREATE POLICY "capabilities_select" ON public.capabilities
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "bundles_select" ON public.capability_bundles
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- USER CAPABILITIES
-- ============================================================
CREATE POLICY "uc_select" ON public.user_capabilities
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.user_can('manage_capabilities')
  );

CREATE POLICY "uc_insert" ON public.user_capabilities
  FOR INSERT WITH CHECK (public.user_can('manage_capabilities'));

CREATE POLICY "uc_update" ON public.user_capabilities
  FOR UPDATE USING (public.user_can('manage_capabilities'));

CREATE POLICY "uc_delete" ON public.user_capabilities
  FOR DELETE USING (public.user_can('manage_capabilities'));
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/005_rls_policies.sql
git commit -m "feat: add RLS policies for all tables"
```

---

## Task 9: Migration 006 — Triggers

**Files:**
- Create: `db/migrations/006_triggers.sql`

- [ ] **Step 1: Write `db/migrations/006_triggers.sql`**

```sql
-- ============================================================
-- updated_at auto-update function
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_teams
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_leaves
  BEFORE UPDATE ON public.leaves
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_leave_balances
  BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_compoff_grants
  BEFORE UPDATE ON public.compoff_grants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- Enforce exactly one is_primary = TRUE per active user
-- When a new primary is set, demote all others for that user
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_single_primary_team()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = TRUE AND NEW.left_at IS NULL THEN
    UPDATE public.team_members
    SET is_primary = FALSE
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND left_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_primary_team_trigger
  AFTER INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_primary_team();

-- ============================================================
-- Compoff approval: auto-increment leave_balances
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_compoff_approved()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO public.leave_balances (user_id, leave_year, type, allocated, used)
    VALUES (NEW.user_id, 0, NEW.type, NEW.amount, 0)
    ON CONFLICT (user_id, leave_year, type)
    DO UPDATE SET
      allocated  = public.leave_balances.allocated + EXCLUDED.allocated,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_compoff_approved_trigger
  AFTER INSERT OR UPDATE ON public.compoff_grants
  FOR EACH ROW EXECUTE FUNCTION public.handle_compoff_approved();

-- ============================================================
-- Self-update guard: users can only change phone, photo_url,
-- notifications_muted on their own row
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role bypasses this trigger (auth.uid() = NULL in service role context)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- If actor IS the row owner, restrict editable fields
  IF auth.uid() = OLD.id THEN
    NEW.id                  := OLD.id;
    NEW.email               := OLD.email;
    NEW.full_name           := OLD.full_name;
    NEW.role                := OLD.role;
    NEW.manager_id          := OLD.manager_id;
    NEW.status              := OLD.status;
    NEW.joined_at           := OLD.joined_at;
    NEW.exited_at           := OLD.exited_at;
    NEW.designation         := OLD.designation;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER guard_users_self_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_self_update();
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/006_triggers.sql
git commit -m "feat: add updated_at, primary team, compoff approval, and self-update guard triggers"
```

---

## Task 10: Migration 007 — Holiday seed + leaves_today view

**Files:**
- Create: `db/migrations/007_holidays_seed.sql`
- Create: `db/migrations/008_leaves_today_view.sql`

- [ ] **Step 1: Write `db/migrations/007_holidays_seed.sql`**

```sql
-- FY 2026-27 (Jun 1 2026 – May 31 2027) — Indian national + company holidays
INSERT INTO public.holidays (date, name) VALUES
  ('2026-06-17', 'Eid al-Adha (Bakrid)'),
  ('2026-07-07', 'Muharram'),
  ('2026-08-15', 'Independence Day'),
  ('2026-08-24', 'Janmashtami'),
  ('2026-09-15', 'Onam'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-10-19', 'Dussehra'),
  ('2026-11-01', 'Diwali (Naraka Chaturdashi)'),
  ('2026-11-02', 'Diwali (Laxmi Puja)'),
  ('2026-11-05', 'Bhai Dooj'),
  ('2026-11-24', 'Guru Nanak Jayanti'),
  ('2026-12-25', 'Christmas'),
  ('2027-01-14', 'Makar Sankranti / Pongal'),
  ('2027-01-26', 'Republic Day'),
  ('2027-02-26', 'Maha Shivaratri'),
  ('2027-03-29', 'Holi'),
  ('2027-03-30', 'Holi (second day)'),
  ('2027-04-02', 'Good Friday'),
  ('2027-04-14', 'Ambedkar Jayanti'),
  ('2027-04-17', 'Ram Navami'),
  ('2027-05-18', 'Eid al-Fitr'),
  ('2027-05-26', 'Buddha Purnima');
```

- [ ] **Step 2: Write `db/migrations/008_leaves_today_view.sql`**

```sql
-- Public view: active leaves covering today — reason excluded by design
CREATE OR REPLACE VIEW public.leaves_today AS
SELECT
  id,
  user_id,
  type,
  start_date,
  end_date,
  half_day_start,
  half_day_end
FROM public.leaves
WHERE status = 'active'
  AND start_date <= CURRENT_DATE
  AND end_date   >= CURRENT_DATE;

-- Grant read to authenticated users
GRANT SELECT ON public.leaves_today TO authenticated;
```

- [ ] **Step 3: Commit**

```bash
git add db/migrations/007_holidays_seed.sql db/migrations/008_leaves_today_view.sql
git commit -m "feat: seed FY 2026-27 holidays and create leaves_today view"
```

---

## Task 11: Apply migrations in Supabase dashboard

This task has no code changes — it deploys the SQL to the live project.

- [ ] **Step 1: Open the Supabase SQL editor**

Navigate to: `https://supabase.com/dashboard/project/bwhixenkcawqydtuczif/sql/new`

- [ ] **Step 2: Run migrations in order**

Paste and execute each file in sequence. After each one, verify it succeeds (green ✓) before proceeding:

1. `db/migrations/001_core_schema.sql`
2. `db/migrations/002_capabilities.sql`
3. `db/migrations/003_bootstrap_state.sql`
4. `db/migrations/004_sql_functions.sql`
5. `db/migrations/005_rls_policies.sql`
6. `db/migrations/006_triggers.sql`
7. `db/migrations/007_holidays_seed.sql`
8. `db/migrations/008_leaves_today_view.sql`

- [ ] **Step 3: Verify tables exist**

Run this in the SQL editor to verify:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected output includes: `audit_log`, `capabilities`, `capability_bundles`, `compoff_grants`, `holidays`, `leave_balances`, `leave_year_resets`, `leaves`, `notifications`, `system_state`, `team_members`, `teams`, `user_capabilities`, `users`.

- [ ] **Step 4: Verify bootstrap state**

```sql
SELECT * FROM public.system_state;
```

Expected: one row with `bootstrap_state = 'awaiting_root_admin'`.

- [ ] **Step 5: Verify holiday count**

```sql
SELECT COUNT(*) FROM public.holidays;
```

Expected: `22`

---

## Task 12: Configure Google OAuth

This task has no code changes — it configures external services.

- [ ] **Step 1: Enable Google provider in Supabase**

1. Go to: `https://supabase.com/dashboard/project/bwhixenkcawqydtuczif/auth/providers`
2. Find **Google** → toggle **Enable**
3. Note the **Callback URL** shown (e.g. `https://bwhixenkcawqydtuczif.supabase.co/auth/v1/callback`)

- [ ] **Step 2: Create Google OAuth credentials**

1. Go to: `https://console.cloud.google.com/apis/credentials`
2. Create a new project or use an existing one
3. Click **Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs: add the Supabase callback URL from step 1
   - Also add `http://localhost:3000/auth/callback` for local dev
6. Copy the **Client ID** and **Client Secret**

- [ ] **Step 3: Add credentials to Supabase**

Back in Supabase Auth Providers → Google:
- Paste **Client ID** and **Client Secret**
- Save

- [ ] **Step 4: Add to `.env.local`**

Append to `.env.local`:
```
GOOGLE_OAUTH_CLIENT_ID=<your-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<your-client-secret>
```

- [ ] **Step 5: Set Site URL in Supabase**

Go to: `https://supabase.com/dashboard/project/bwhixenkcawqydtuczif/auth/url-configuration`

Set:
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`

---

## Task 13: Next.js middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts` at project root**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session token — IMPORTANT: do not remove
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/setup') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/setup/')

  // Unauthenticated user trying to reach a protected route
  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated user going to login — redirect home
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep middleware
```

Expected: no errors on `middleware.ts`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Next.js middleware for auth session refresh and route protection"
```

---

## Task 14: Auth callback route

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Create `app/auth/callback/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createClient()
  const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  const authUser = data.user
  const adminClient = createAdminClient()

  // Check bootstrap state
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  const bootstrapState = stateRow?.bootstrap_state ?? 'awaiting_root_admin'

  // Check if this auth user already has a users row
  const { data: existingUser } = await adminClient
    .from('users')
    .select('id, email, status')
    .eq('id', authUser.id)
    .single()

  // Bootstrap: first OAuth user becomes founder
  if (bootstrapState === 'awaiting_root_admin' && !existingUser) {
    const emailDomain = authUser.email?.split('@')[1]
    const allowedDomain = process.env.COMPANY_EMAIL_DOMAIN

    if (allowedDomain && emailDomain !== allowedDomain) {
      await supabase.auth.signOut()
      return NextResponse.redirect(
        `${origin}/setup?error=wrong_domain&domain=${allowedDomain}`
      )
    }

    // Create the founder user row
    const { error: createError } = await adminClient.from('users').insert({
      id: authUser.id,
      email: authUser.email!,
      full_name:
        authUser.user_metadata?.full_name ??
        authUser.user_metadata?.name ??
        authUser.email!.split('@')[0],
      role: 'founder',
      joined_at: new Date().toISOString().split('T')[0],
    })

    if (createError) {
      return NextResponse.redirect(`${origin}/login?error=user_create_failed`)
    }

    // Apply founder_full bundle via SQL function
    await adminClient.rpc('recompute_role_bundles', {
      p_user_id: authUser.id,
      p_new_role: 'founder',
    })

    // Advance bootstrap state
    await adminClient
      .from('system_state')
      .update({ bootstrap_state: 'awaiting_first_hr' })
      .eq('id', 1)

    return NextResponse.redirect(`${origin}/`)
  }

  // Sync email from Google if it changed
  if (existingUser && existingUser.email !== authUser.email) {
    await adminClient
      .from('users')
      .update({ email: authUser.email! })
      .eq('id', authUser.id)
  }

  // User is exited — deny login
  if (existingUser?.status === 'exited') {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=account_exited`)
  }

  // No users row and not in bootstrap → contact HR
  if (!existingUser) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=not_onboarded`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat: add OAuth callback route with bootstrap flow and email sync"
```

---

## Task 15: Login page

**Files:**
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Replace `app/(auth)/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

const ERROR_MESSAGES: Record<string, string> = {
  not_onboarded:
    "Your account hasn't been set up yet. Please contact HR to get access.",
  account_exited: 'Your account has been deactivated. Contact HR for assistance.',
  wrong_domain: 'Please sign in with your company Google account.',
  exchange_failed: 'Sign-in failed. Please try again.',
  no_code: 'Sign-in was cancelled. Please try again.',
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const errorKey = searchParams.get('error')
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null

  const [loading, setLoading] = useState(false)

  async function handleGoogleSignIn() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    // Page will redirect to Google — no need to setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Orbit HR</h1>
            <p className="text-sm text-muted-foreground mt-1">KK Create · People & Culture</p>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {/* Sign-in card */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-[15px] font-semibold">Sign in to continue</h2>
            <p className="text-[13px] text-muted-foreground">
              Use your KK Create Google account
            </p>
          </div>

          <Button
            className="w-full gap-3"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {/* Google icon SVG */}
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </Button>
        </div>

        <p className="text-center text-[12px] text-muted-foreground">
          Access is managed by HR. Contact your HR team if you need an account.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(auth)/login/page.tsx
git commit -m "feat: replace login page with real Google OAuth sign-in"
```

---

## Task 16: Bootstrap setup page

**Files:**
- Create: `app/(auth)/setup/page.tsx`
- Create: `app/api/setup/root-admin/route.ts`

- [ ] **Step 1: Create `app/(auth)/setup/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sparkles, CheckCircle2, Clock, CircleDashed } from 'lucide-react'
import SetupChecklist from './checklist'

export default async function SetupPage() {
  const adminClient = createAdminClient()
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  const state = stateRow?.bootstrap_state ?? 'awaiting_root_admin'

  // Already operational — nothing to do here
  if (state === 'operational') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 grid place-items-center shadow-xl">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Set up Orbit HR</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Let's get KK Create HR up and running
            </p>
          </div>
        </div>

        <SetupChecklist bootstrapState={state} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(auth)/setup/checklist.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

type BootstrapState =
  | 'awaiting_root_admin'
  | 'awaiting_first_hr'
  | 'awaiting_first_team'
  | 'operational'

const STEPS = [
  {
    id: 'awaiting_root_admin',
    label: 'Create Root Admin',
    description:
      'The first person to sign in becomes the Root Admin (Founder role with full access).',
  },
  {
    id: 'awaiting_first_hr',
    label: 'Add first HR user',
    description: 'Add your HR person who will manage leaves, holidays, and onboarding.',
  },
  {
    id: 'awaiting_first_team',
    label: 'Create first team',
    description: 'Create at least one team before inviting the rest of the organisation.',
  },
]

const STATE_ORDER: BootstrapState[] = [
  'awaiting_root_admin',
  'awaiting_first_hr',
  'awaiting_first_team',
  'operational',
]

function stepStatus(
  stepId: string,
  currentState: BootstrapState
): 'done' | 'active' | 'pending' {
  const stepIdx = STATE_ORDER.indexOf(stepId as BootstrapState)
  const currentIdx = STATE_ORDER.indexOf(currentState)
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'pending'
}

export default function SetupChecklist({
  bootstrapState,
}: {
  bootstrapState: BootstrapState
}) {
  const router = useRouter()

  async function handleGoogleSignIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-6">
      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const status = stepStatus(step.id, bootstrapState)
          return (
            <div key={step.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={
                    status === 'done'
                      ? 'text-emerald-500'
                      : status === 'active'
                      ? 'text-violet-500'
                      : 'text-muted-foreground/40'
                  }
                >
                  {status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : status === 'active' ? (
                    <Clock className="h-5 w-5" />
                  ) : (
                    <CircleDashed className="h-5 w-5" />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-px flex-1 mt-1 ${
                      status === 'done' ? 'bg-emerald-200' : 'bg-border'
                    }`}
                  />
                )}
              </div>
              <div className="pb-4 min-w-0">
                <div
                  className={`text-[14px] font-semibold ${
                    status === 'pending' ? 'text-muted-foreground' : ''
                  }`}
                >
                  Step {i + 1}: {step.label}
                </div>
                <div className="text-[12.5px] text-muted-foreground mt-0.5">
                  {step.description}
                </div>
                {status === 'active' && step.id === 'awaiting_root_admin' && (
                  <Button className="mt-3 gap-2" onClick={handleGoogleSignIn}>
                    Sign in with Google to become Root Admin
                  </Button>
                )}
                {status === 'active' && step.id === 'awaiting_first_hr' && (
                  <p className="mt-2 text-[12.5px] text-violet-600 font-medium">
                    You're in! Go to HR Console → Users to add your first HR user.
                  </p>
                )}
                {status === 'active' && step.id === 'awaiting_first_team' && (
                  <p className="mt-2 text-[12.5px] text-violet-600 font-medium">
                    Go to HR Console → Teams to create your first team.
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/setup/
git commit -m "feat: add bootstrap setup page with 3-step checklist"
```

---

## Task 17: Auth-aware app layout + get-current-user

**Files:**
- Create: `lib/auth/get-current-user.ts`
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Create `lib/auth/get-current-user.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Tables } from '@/lib/supabase/database.types'

export type AppUser = Tables<'users'>

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  // Use admin client to bypass RLS for the layout check
  const adminClient = createAdminClient()
  const { data: user } = await adminClient
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  return user ?? null
}
```

- [ ] **Step 2: Replace `app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  if (user.status === 'exited') {
    redirect('/login?error=account_exited')
  }

  // Check bootstrap state — redirect to setup if not operational
  const adminClient = createAdminClient()
  const { data: stateRow } = await adminClient
    .from('system_state')
    .select('bootstrap_state')
    .single()

  if (
    stateRow?.bootstrap_state &&
    stateRow.bootstrap_state !== 'operational'
  ) {
    redirect('/setup')
  }

  // Fetch teams this user leads (for capability derivation)
  const { data: ledTeams } = await adminClient
    .from('teams')
    .select('id')
    .eq('team_lead_id', user.id)

  // Fetch team memberships for capability scope resolution
  const { data: allMembers } = await adminClient
    .from('team_members')
    .select('user_id, team_id')
    .is('left_at', null)

  const ledTeamIds = (ledTeams ?? []).map((t) => t.id)
  const membersByTeam: Record<string, string[]> = {}
  for (const m of allMembers ?? []) {
    if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = []
    membersByTeam[m.team_id].push(m.user_id)
  }

  return (
    <AppShell
      currentUser={user}
      ledTeamIds={ledTeamIds}
      membersByTeam={membersByTeam}
    >
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 3: Create `components/layout/app-shell.tsx`**

This is a client component that receives real server data and provides it to context:

```tsx
'use client'

import { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { StoreProvider } from '@/lib/store'
import { CapabilityProvider } from '@/lib/contexts/capability-context'
import type { Tables } from '@/lib/supabase/database.types'

interface AppShellProps {
  currentUser: Tables<'users'>
  ledTeamIds: string[]
  membersByTeam: Record<string, string[]>
  children: ReactNode
}

export function AppShell({
  currentUser,
  ledTeamIds,
  membersByTeam,
  children,
}: AppShellProps) {
  return (
    <StoreProvider realUser={currentUser}>
      <CapabilityProvider
        userId={currentUser.id}
        role={currentUser.role}
        ledTeamIds={ledTeamIds}
        membersByTeam={membersByTeam}
      >
        <div className="min-h-screen bg-background flex">
          <Sidebar />
          <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
          <BottomNav />
        </div>
      </CapabilityProvider>
    </StoreProvider>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/auth/get-current-user.ts app/(app)/layout.tsx components/layout/app-shell.tsx
git commit -m "feat: server-side auth check in app layout, pass real user to shell"
```

---

## Task 18: Capability system

**Files:**
- Create: `lib/capabilities/bundles.ts`
- Create: `lib/capabilities/can.ts`

- [ ] **Step 1: Create `lib/capabilities/bundles.ts`**

```typescript
export type CapabilityKey =
  | 'view_leaves'
  | 'edit_leaves'
  | 'view_balance'
  | 'edit_balance'
  | 'approve_compoff'
  | 'manage_holidays'
  | 'view_audit_log'
  | 'manage_users'
  | 'manage_capabilities'
  | 'run_annual_reset'

export type Role = 'employee' | 'team_lead' | 'hr' | 'founder'

export const ROLE_BUNDLE_MAP: Partial<Record<Role, string>> = {
  team_lead: 'team_lead',
  hr: 'hr_admin',
  founder: 'founder_full',
}
```

- [ ] **Step 2: Create `lib/capabilities/can.ts`**

```typescript
import type { Role } from './bundles'

export interface CanHelpers {
  viewLeaves(targetUserId: string): boolean
  editLeaves(targetUserId: string): boolean
  viewBalance(targetUserId: string): boolean
  editBalance(targetUserId: string): boolean
  approveCompoff(targetUserId: string): boolean
  manageHolidays(): boolean
  viewAuditLog(): boolean
  manageUsers(): boolean
  manageCapabilities(): boolean
  runAnnualReset(): boolean
  /** True if user has any HR-level access (hr or founder) */
  isHROrAbove: boolean
  /** True if user can see any data beyond their own (team lead, hr, founder) */
  hasTeamAccess: boolean
}

export function buildCanFromRole(
  userId: string,
  role: Role,
  ledTeamIds: string[],
  membersByTeam: Record<string, string[]>
): CanHelpers {
  const isFounder = role === 'founder'
  const isHR = role === 'hr'
  const isTeamLead = role === 'team_lead'

  function inLedTeam(targetUserId: string): boolean {
    return ledTeamIds.some((teamId) =>
      (membersByTeam[teamId] ?? []).includes(targetUserId)
    )
  }

  return {
    viewLeaves: (targetUserId) => {
      if (targetUserId === userId) return true
      if (isFounder || isHR) return true
      if (isTeamLead) return inLedTeam(targetUserId)
      return false
    },
    editLeaves: (targetUserId) => {
      if (isFounder || isHR) return true
      return false
    },
    viewBalance: (targetUserId) => {
      if (targetUserId === userId) return true
      if (isFounder || isHR) return true
      if (isTeamLead) return inLedTeam(targetUserId)
      return false
    },
    editBalance: () => isFounder || isHR,
    approveCompoff: (targetUserId) => {
      if (isFounder || isHR) return true
      if (isTeamLead) return inLedTeam(targetUserId)
      return false
    },
    manageHolidays: () => isFounder || isHR,
    viewAuditLog: () => isFounder || isHR,
    manageUsers: () => isFounder || isHR,
    manageCapabilities: () => isFounder,
    runAnnualReset: () => isFounder || isHR,
    isHROrAbove: isFounder || isHR,
    hasTeamAccess: isFounder || isHR || isTeamLead,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/capabilities/
git commit -m "feat: add capability bundles definitions and buildCanFromRole helper"
```

---

## Task 19: CapabilityProvider + hook

**Files:**
- Create: `lib/contexts/capability-context.tsx`
- Create: `hooks/use-capabilities.ts`

- [ ] **Step 1: Create `lib/contexts/capability-context.tsx`**

```tsx
'use client'

import { createContext, ReactNode, useMemo } from 'react'
import { buildCanFromRole, type CanHelpers } from '@/lib/capabilities/can'
import type { Role } from '@/lib/capabilities/bundles'

interface CapabilityContextShape {
  can: CanHelpers
  role: Role
  userId: string
}

export const CapabilityContext = createContext<CapabilityContextShape | null>(null)

interface CapabilityProviderProps {
  userId: string
  role: Role
  ledTeamIds: string[]
  membersByTeam: Record<string, string[]>
  children: ReactNode
}

export function CapabilityProvider({
  userId,
  role,
  ledTeamIds,
  membersByTeam,
  children,
}: CapabilityProviderProps) {
  const can = useMemo(
    () => buildCanFromRole(userId, role, ledTeamIds, membersByTeam),
    [userId, role, ledTeamIds, membersByTeam]
  )

  const value = useMemo(
    () => ({ can, role, userId }),
    [can, role, userId]
  )

  return (
    <CapabilityContext.Provider value={value}>
      {children}
    </CapabilityContext.Provider>
  )
}
```

- [ ] **Step 2: Create `hooks/use-capabilities.ts`**

```typescript
'use client'

import { useContext } from 'react'
import { CapabilityContext } from '@/lib/contexts/capability-context'

export function useCapabilities() {
  const ctx = useContext(CapabilityContext)
  if (!ctx) throw new Error('useCapabilities must be inside CapabilityProvider')
  return ctx
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/contexts/capability-context.tsx hooks/use-capabilities.ts
git commit -m "feat: add CapabilityProvider and useCapabilities hook"
```

---

## Task 20: Update StoreProvider to accept real user

**Files:**
- Modify: `lib/store.tsx`

The `StoreProvider` currently hard-codes `u-rahul`. Update it to accept a `realUser` prop from the server, falling back to the mock for local dev.

- [ ] **Step 1: Update `lib/store.tsx`**

Change the `StoreProvider` signature and the `currentUser` initial state:

Find this block (lines 43–46):
```typescript
export function StoreProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUserRaw] = useState<User>(
    () => users.find((u) => u.id === DEFAULT_USER_ID)!
  );
```

Replace with:
```typescript
import type { Tables } from '@/lib/supabase/database.types'

export function StoreProvider({
  children,
  realUser,
}: {
  children: ReactNode
  realUser?: Tables<'users'>
}) {
  const [currentUser, setCurrentUserRaw] = useState<User>(() => {
    if (realUser) {
      // Map DB user to mock User shape (team fields filled from mock for Phase 1)
      const mockMatch = users.find((u) => u.email === realUser.email)
      if (mockMatch) return mockMatch
      // Fallback: return a minimal User built from realUser
      return {
        id: realUser.id,
        email: realUser.email,
        full_name: realUser.full_name,
        role: realUser.role,
        manager_id: realUser.manager_id ?? null,
        status: realUser.status as 'active' | 'exited',
        joined_at: realUser.joined_at,
        designation: realUser.designation ?? '',
        primary_team_id: '',
        team_ids: [],
        notifications_muted: realUser.notifications_muted,
      }
    }
    return users.find((u) => u.id === DEFAULT_USER_ID)!
  })
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "store|error TS" | head -15
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/store.tsx
git commit -m "feat: StoreProvider accepts realUser from server auth, falls back to mock"
```

---

## Task 21: Capability-gated sidebar navigation

**Files:**
- Modify: `components/layout/sidebar.tsx`

- [ ] **Step 1: Update `components/layout/sidebar.tsx`**

Replace the static `roles?: string[]` filter with `useCapabilities`. Find the `NAV` array definition and the `visibleNav` filter, and replace both:

**Remove:**
```typescript
const NAV: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: "compoff" | "audit";
}[] = [
  ...
  { href: "/team", label: "My Team", icon: Users, roles: ["team_lead", "hr", "founder"] },
  { href: "/hr", label: "HR Console", icon: UserCog, roles: ["hr", "founder"] },
  { href: "/audit", label: "Audit Log", icon: History, roles: ["hr", "founder", "team_lead"] },
];
```

**Add** import at top:
```typescript
import { useCapabilities } from '@/hooks/use-capabilities'
```

**Replace** `NAV` array and `visibleNav` filter:
```typescript
const NAV = [
  { href: "/",           label: "Dashboard",    icon: LayoutDashboard, always: true },
  { href: "/leaves",     label: "My Leaves",    icon: ClipboardList,   always: true },
  { href: "/calendar",   label: "Calendar",     icon: CalendarDays,    always: true },
  { href: "/org",        label: "Organization", icon: Network,         always: true },
  { href: "/team",       label: "My Team",      icon: Users,           cap: "hasTeamAccess" as const },
  { href: "/hr",         label: "HR Console",   icon: UserCog,         cap: "isHROrAbove" as const },
  { href: "/audit",      label: "Audit Log",    icon: History,         cap: "viewAuditLog" as const },
  { href: "/permissions",label: "Permissions",  icon: UserCog,         cap: "manageCapabilities" as const },
] as const
```

**Replace** the `visibleNav` computation inside the component:
```typescript
const { can } = useCapabilities()

const visibleNav = NAV.filter((n) => {
  if ('always' in n && n.always) return true
  if ('cap' in n) {
    const capKey = n.cap
    if (capKey === 'hasTeamAccess') return can.hasTeamAccess
    if (capKey === 'isHROrAbove')   return can.isHROrAbove
    if (capKey === 'viewAuditLog')  return can.viewAuditLog()
    if (capKey === 'manageCapabilities') return can.manageCapabilities()
  }
  return false
})
```

- [ ] **Step 2: Add `/permissions` placeholder page**

Create `app/(app)/permissions/page.tsx`:

```tsx
import { Topbar } from '@/components/layout/topbar'

export default function PermissionsPage() {
  return (
    <>
      <Topbar title="Permissions" subtitle="Grant and revoke capabilities" />
      <div className="px-5 lg:px-8 py-5 text-muted-foreground text-sm">
        Permissions UI — coming in Phase 2.
      </div>
    </>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add components/layout/sidebar.tsx app/(app)/permissions/page.tsx
git commit -m "feat: capability-gated sidebar navigation, add permissions placeholder page"
```

---

## Task 22: Root layout — QueryClient provider

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create `lib/query-client.ts`**

```typescript
import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
      },
    },
  })
}
```

- [ ] **Step 2: Create `components/providers/query-provider.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/query-client'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

- [ ] **Step 3: Update `app/layout.tsx` to wrap with QueryProvider**

Find the root layout's `<body>` children and wrap with `<QueryProvider>`:

```tsx
import { QueryProvider } from '@/components/providers/query-provider'
// ... existing imports

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
          <StoreProvider>
            {children}
          </StoreProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
```

Note: `StoreProvider` will be removed from root layout in Phase 2 when it moves entirely to AppShell. For now it stays to not break dashboard/leave pages that still use mock data.

- [ ] **Step 4: Commit**

```bash
git add lib/query-client.ts components/providers/query-provider.tsx app/layout.tsx
git commit -m "feat: add TanStack Query provider to root layout"
```

---

## Task 23: End-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify bootstrap redirect**

Navigate to `http://localhost:3000`. You should be redirected to `/login` (not `/setup`) because middleware redirects unauthenticated users.

Navigate to `http://localhost:3000/setup`. Verify the 3-step checklist renders with Step 1 as active ("Sign in with Google to become Root Admin").

- [ ] **Step 3: Verify Google OAuth flow**

Click "Sign in with Google" on the setup page. You should be redirected to Google's OAuth consent screen.

After signing in with a `@kkcreate.com` Google account (or whichever domain is configured), you should:
1. Be redirected to `/auth/callback`
2. Have a `users` row created with `role = 'founder'`
3. Be redirected to `/` (dashboard)
4. The `system_state.bootstrap_state` should now be `'awaiting_first_hr'`

Verify in Supabase:
```sql
SELECT id, email, role FROM public.users;
SELECT bootstrap_state FROM public.system_state;
SELECT * FROM public.user_capabilities LIMIT 10;
```

Expected: one users row with role=founder, state=awaiting_first_hr, and multiple user_capabilities rows from the founder_full bundle.

- [ ] **Step 4: Verify sidebar is capability-gated**

After signing in as founder: HR Console, Audit Log, Permissions, My Team should all be visible in the sidebar.

Open browser devtools → Application → Cookies → verify Supabase auth cookies exist (`sb-*`).

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Fix any errors before committing.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete supabase foundation — auth, schema, capabilities, bootstrap flow"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Task 1: Packages + env (PRD §3 tech stack)
- ✅ Tasks 4–10: All 14 tables from PRD §5 + addendum §17.2
- ✅ Task 7: `user_can()`, `apply_bundle()`, `recompute_role_bundles()` (PRD §7.1, §6.2)
- ✅ Task 8: RLS on all tables (PRD §7.2)
- ✅ Task 9: `updated_at`, primary team, compoff approval, self-update guard triggers (PRD §5.3, §6.6, §4.3)
- ✅ Task 10: Holiday seed + `leaves_today` view (PRD §5.7, §7.2)
- ✅ Tasks 13–16: Google OAuth, auth callback, login page, bootstrap `/setup` (PRD §8.1, addendum §17.3–17.5)
- ✅ Tasks 17–19: `getCurrentUser`, `CapabilityProvider`, `useCapabilities` (PRD §10 hooks)
- ✅ Task 20: `StoreProvider` accepts real user (transition bridge)
- ✅ Task 21: Capability-gated sidebar (PRD §8.2)
- ✅ Task 22: TanStack Query setup (PRD §3)

**Not in this plan (Phase 2):**
- Leave/compoff/balance API routes and real data
- HR Console CRUD (real DB)
- Teams tab in HR Console
- CSV bulk import
- Notifications (Realtime)
- Permissions UI (`/permissions`)
- Calendar/Org real data
- Annual reset API
