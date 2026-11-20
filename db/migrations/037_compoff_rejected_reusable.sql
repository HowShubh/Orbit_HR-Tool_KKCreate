-- 037_compoff_rejected_reusable.sql
-- A rejected comp-off request should not lock its worked day forever.
-- 022 made (user_id, work_date) unique across ALL statuses, so once a manager
-- rejected a request the employee could never ask for that day again (the app
-- check and this index both refused it). Keep "one live comp-off per person per
-- worked day", but let rejected rows sit alongside a fresh request.

DROP INDEX IF EXISTS public.compoff_grants_user_workdate_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS compoff_grants_user_workdate_uniq
  ON public.compoff_grants (user_id, work_date)
  WHERE status IN ('pending', 'approved');
