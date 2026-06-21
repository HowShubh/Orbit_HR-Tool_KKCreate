-- ============================================================
-- WIPE TEST DATA — keep one founder, clear everything else
-- ============================================================
-- Run this in the Supabase SQL Editor when you want to clear
-- all test users/leaves/teams and start fresh with real data.
--
-- The KEEP_EMAIL user must already exist; the script aborts if not.
-- Edit the KEEP_EMAIL value below if you want to keep a different account.

DO $$
DECLARE
  keep_email TEXT := 'shubhamsinha@kkcreate.in';
  keep_id    UUID;
BEGIN
  SELECT id INTO keep_id FROM auth.users WHERE email = keep_email LIMIT 1;

  IF keep_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found for %. Aborting.', keep_email;
  END IF;

  -- 1. Wipe every dependent data table (no user FK left dangling).
  --    leave_requests.user_id/created_by have no ON DELETE CASCADE, so it MUST
  --    be cleared here or the auth.users delete below fails with an FK violation.
  DELETE FROM public.audit_log;
  DELETE FROM public.notifications;
  DELETE FROM public.leaves;
  DELETE FROM public.leave_requests;
  DELETE FROM public.leave_balances;
  DELETE FROM public.compoff_grants;
  DELETE FROM public.team_members;
  DELETE FROM public.leave_year_resets;

  -- 2. Drop user_capabilities for everyone except the founder.
  --    Then re-point any "granted_by" on the founder's own rows
  --    to themselves, so we can safely delete the granter users next.
  DELETE FROM public.user_capabilities WHERE user_id <> keep_id;
  UPDATE public.user_capabilities SET granted_by = keep_id WHERE granted_by <> keep_id;

  -- 3. Clear team_lead refs and delete all teams (no members anymore)
  UPDATE public.teams SET team_lead_id = NULL;
  DELETE FROM public.teams;

  -- 4. Clear manager_id chains and bootstrap-by references
  UPDATE public.users SET manager_id = NULL;
  UPDATE public.system_state
     SET bootstrapped_by = keep_id
   WHERE bootstrapped_by IS DISTINCT FROM keep_id;

  -- 5. Delete from auth.users — public.users cascades automatically
  DELETE FROM auth.users WHERE id <> keep_id;

  -- 6. Re-seed founder's allocatable balances for FY 2026-27 from the CONFIGURED
  --    leave-type quotas (so it matches what HR set, not a hardcoded 18/36).
  --    Comp-off banks start at 0 (they're earned, not allocated). Idempotent.
  INSERT INTO public.leave_balances (user_id, leave_year, type, allocated, used)
  SELECT keep_id, 2026, lt.key, lt.annual_quota, 0
  FROM public.leave_types lt
  WHERE lt.key IN ('leave', 'wfh')
  ON CONFLICT (user_id, leave_year, type)
  DO UPDATE SET allocated = EXCLUDED.allocated, used = 0;

  INSERT INTO public.leave_balances (user_id, leave_year, type, allocated, used)
  VALUES
    (keep_id, 0, 'compoff_leave', 0, 0),
    (keep_id, 0, 'compoff_wfh',   0, 0)
  ON CONFLICT (user_id, leave_year, type)
  DO UPDATE SET allocated = EXCLUDED.allocated, used = 0;

  -- 7. System state — founder still exists, so the system is operational
  UPDATE public.system_state
     SET bootstrap_state = 'operational',
         bootstrapped_at = COALESCE(bootstrapped_at, NOW()),
         bootstrapped_by = keep_id
   WHERE id = 1;

  RAISE NOTICE 'Cleanup complete. Kept founder: % (id=%)', keep_email, keep_id;
END;
$$;

-- Quick sanity check — should show exactly one row
SELECT id, email, full_name, role, status FROM public.users;
SELECT id, email FROM auth.users;
SELECT * FROM public.system_state;
