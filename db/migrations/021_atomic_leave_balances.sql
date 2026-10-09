-- 021_atomic_leave_balances.sql
-- Makes balance changes and leave-status transitions atomic and race-safe.
-- Addresses leave-audit findings 1-5:
--   1. non-atomic `used` increment (read-modify-write -> lost updates)
--   2. balance check-then-act (TOCTOU overdraw)
--   3. money-moving flows not wrapped in a transaction (partial writes)
--   4. status guards not atomic with the update (double-approve / double-deduct)
--   5. no in-app way to reverse a comp-off grant and refund the balance
--
-- All of these are fixed by doing the status flip AND the balance change inside a
-- single function body (one implicit transaction). The server actions keep the
-- permission checks, audit, and notifications; only the integrity-critical core
-- moves here.

-- ---------------------------------------------------------------------------
-- Balance year for a leave type. Mirrors lib/date's fiscal-year logic (FY runs
-- Jun 1 -> May 31, keyed by the start year); comp-off lives in leave_year 0.
-- Evaluated in IST so it matches the app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_balance_year(p_type text)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_type LIKE 'compoff%' THEN
    RETURN 0;
  END IF;
  IF EXTRACT(MONTH FROM d) >= 6 THEN
    RETURN EXTRACT(YEAR FROM d)::int;
  ELSE
    RETURN EXTRACT(YEAR FROM d)::int - 1;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic balance delta. Single-statement upsert-increment so concurrent callers
-- cannot lose each other's update. When p_enforce is true, an overdraw (remaining
-- < 0) raises and rolls back, which closes the check-then-act race for approvals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_balance_delta(
  p_user_id uuid,
  p_leave_year int,
  p_type text,
  p_delta numeric,
  p_enforce boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining numeric;
BEGIN
  INSERT INTO public.leave_balances (user_id, leave_year, type, allocated, used)
  VALUES (p_user_id, p_leave_year, p_type, 0, p_delta)
  ON CONFLICT (user_id, leave_year, type)
  DO UPDATE SET used = public.leave_balances.used + p_delta,
                updated_at = now();

  IF p_enforce THEN
    SELECT allocated - used INTO v_remaining
    FROM public.leave_balances
    WHERE user_id = p_user_id AND leave_year = p_leave_year AND type = p_type;
    IF v_remaining < 0 THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE:%', p_type USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Approve a leave (single row or a whole multi-day request) atomically:
--   - compare-and-swap pending -> active (only one caller can win)
--   - deduct balance per type from exactly the rows just activated, enforcing
--     non-negative remaining (a shortage rolls back the approval too)
-- Returns the number of leave rows activated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_leave_atomic(
  p_leave_id uuid,
  p_actor uuid
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_request uuid;
  v_user uuid;
  v_count int;
  rec record;
BEGIN
  SELECT request_id, user_id INTO v_request, v_user
  FROM public.leaves WHERE id = p_leave_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEAVE_NOT_FOUND';
  END IF;

  IF v_request IS NOT NULL THEN
    UPDATE public.leaves
    SET status = 'active', decided_by = p_actor, decided_at = now()
    WHERE request_id = v_request AND status = 'pending';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.leave_requests
    SET status = 'active', decided_by = p_actor, decided_at = now()
    WHERE id = v_request AND status = 'pending';
  ELSE
    UPDATE public.leaves
    SET status = 'active', decided_by = p_actor, decided_at = now()
    WHERE id = p_leave_id AND status = 'pending';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED';
  END IF;

  FOR rec IN
    SELECT type, SUM(days_deducted) AS days
    FROM public.leaves
    WHERE status = 'active'
      AND (
        (v_request IS NOT NULL AND request_id = v_request)
        OR (v_request IS NULL AND id = p_leave_id)
      )
    GROUP BY type
  LOOP
    PERFORM public.apply_balance_delta(
      v_user, public.leave_balance_year(rec.type), rec.type, rec.days, true
    );
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Mark a single leave row deleted atomically, refunding balance only if the row
-- had actually consumed it (active or delete_requested; pending never did).
-- Row is locked + compare-and-swapped so a refund happens exactly once.
-- Returns the prior status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_leave_deleted_atomic(
  p_leave_id uuid,
  p_actor uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_old text;
  v_user uuid;
  v_type text;
  v_days numeric;
  v_count int;
BEGIN
  SELECT status, user_id, type, days_deducted
  INTO v_old, v_user, v_type, v_days
  FROM public.leaves WHERE id = p_leave_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEAVE_NOT_FOUND';
  END IF;
  IF v_old NOT IN ('active', 'pending', 'delete_requested') THEN
    RAISE EXCEPTION 'NOT_DELETABLE';
  END IF;

  UPDATE public.leaves
  SET status = 'deleted', deleted_by = p_actor, deleted_at = now()
  WHERE id = p_leave_id AND status = v_old;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ALREADY_PROCESSED';
  END IF;

  IF v_old IN ('active', 'delete_requested') THEN
    PERFORM public.apply_balance_delta(
      v_user, public.leave_balance_year(v_type), v_type, -v_days, false
    );
  END IF;

  RETURN v_old;
END;
$$;

-- ---------------------------------------------------------------------------
-- Remove a comp-off grant and refund the credit it added, atomically. Blocks
-- removal of an approved grant whose credit has already been spent (so HR is
-- forced to handle that case deliberately rather than driving the balance
-- negative). Pending/rejected grants never credited the balance, so they are
-- simply deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_compoff_grant_atomic(
  p_grant_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_user uuid;
  v_type text;
  v_amount numeric;
  v_status text;
  v_remaining numeric;
BEGIN
  SELECT user_id, type, amount, status
  INTO v_user, v_type, v_amount, v_status
  FROM public.compoff_grants WHERE id = p_grant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GRANT_NOT_FOUND';
  END IF;

  IF v_status = 'approved' THEN
    SELECT allocated - used INTO v_remaining
    FROM public.leave_balances
    WHERE user_id = v_user AND leave_year = 0 AND type = v_type;

    IF v_remaining IS NULL OR v_remaining < v_amount THEN
      RAISE EXCEPTION 'COMPOFF_ALREADY_USED';
    END IF;

    UPDATE public.leave_balances
    SET allocated = allocated - v_amount, updated_at = now()
    WHERE user_id = v_user AND leave_year = 0 AND type = v_type;
  END IF;

  DELETE FROM public.compoff_grants WHERE id = p_grant_id;
END;
$$;
