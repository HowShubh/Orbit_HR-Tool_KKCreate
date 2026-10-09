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
