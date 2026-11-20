-- HR-configurable leave policies.
-- Stable categories keep app logic predictable while type keys become configurable.
CREATE TABLE IF NOT EXISTS public.leave_types (
  key              TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('leave', 'wfh', 'compoff_leave', 'compoff_wfh')),
  annual_quota     NUMERIC(5,1) NOT NULL DEFAULT 0,
  monthly_quota    NUMERIC(4,1) CHECK (monthly_quota IS NULL OR monthly_quota >= 0),
  eligibility_mode TEXT NOT NULL DEFAULT 'all' CHECK (eligibility_mode IN ('all', 'selected')),
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  is_system        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_leave_type_eligibility (
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  leave_type_key TEXT NOT NULL REFERENCES public.leave_types(key) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, leave_type_key)
);

INSERT INTO public.leave_types (key, name, category, annual_quota, eligibility_mode, is_system)
VALUES
  ('leave', 'Leave', 'leave', 18, 'all', TRUE),
  ('wfh', 'WFH', 'wfh', 36, 'all', TRUE),
  ('compoff_leave', 'Comp-off Leave', 'compoff_leave', 0, 'all', TRUE),
  ('compoff_wfh', 'Comp-off WFH', 'compoff_wfh', 0, 'all', TRUE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.leaves
  DROP CONSTRAINT IF EXISTS leaves_type_check;

ALTER TABLE public.leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leaves_type_fkey'
  ) THEN
    ALTER TABLE public.leaves
      ADD CONSTRAINT leaves_type_fkey
      FOREIGN KEY (type) REFERENCES public.leave_types(key) ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_balances_type_fkey'
  ) THEN
    ALTER TABLE public.leave_balances
      ADD CONSTRAINT leave_balances_type_fkey
      FOREIGN KEY (type) REFERENCES public.leave_types(key) ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_types_category_active
  ON public.leave_types(category, is_active);

CREATE INDEX IF NOT EXISTS idx_user_leave_type_eligibility_type
  ON public.user_leave_type_eligibility(leave_type_key);
