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

-- Self-update: limited columns enforced by trigger
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
