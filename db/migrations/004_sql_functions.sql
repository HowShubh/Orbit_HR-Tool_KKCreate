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
