-- Extend the team_lead bundle so team leads can edit balances for their team members.
-- This complements their existing view_leaves/view_balance/approve_compoff powers.

UPDATE public.capability_bundles
SET capabilities = capabilities ||
  '[{"capability_key": "edit_balance", "scope_type": "teams", "dynamic_scope": "led_teams"}]'::jsonb
WHERE key = 'team_lead'
  AND NOT (capabilities @> '[{"capability_key": "edit_balance"}]'::jsonb);

-- Recompute capabilities for existing team_lead users so they pick up the new grant.
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM public.users WHERE role = 'team_lead' AND status = 'active'
  LOOP
    PERFORM public.recompute_role_bundles(u.id, 'team_lead');
  END LOOP;
END;
$$;
