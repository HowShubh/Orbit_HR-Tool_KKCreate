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
