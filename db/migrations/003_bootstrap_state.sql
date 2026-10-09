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
