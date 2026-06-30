-- 022_leave_integrity_constraints.sql
-- Audit finding 6: integrity was only enforced in app code, so races or manual
-- SQL could create overlapping leaves / duplicate comp-off grants. These add the
-- guarantees at the database level.
--
-- IMPORTANT: run this AFTER reconciling existing data. Both statements will FAIL
-- to create if the table already contains a violation (e.g. the duplicate /
-- overlapping rows from the earlier backlog-import date issue). Clean those up
-- first (use the reconciliation script), then apply this migration.

-- One comp-off grant per person per worked day.
CREATE UNIQUE INDEX IF NOT EXISTS compoff_grants_user_workdate_uniq
  ON public.compoff_grants (user_id, work_date);

-- No overlapping non-cancelled leaves for the same person. Deleted/rejected rows
-- are excluded so they never conflict. daterange is inclusive of both ends.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.leaves
  ADD CONSTRAINT leaves_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status IN ('active', 'pending', 'delete_requested'));
