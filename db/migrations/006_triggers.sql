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
