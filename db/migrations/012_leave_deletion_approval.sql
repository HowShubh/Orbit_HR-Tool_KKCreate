-- Approved leave deletion needs manager/HR approval.
-- A leave in delete_requested is still treated as approved until the request is approved.
ALTER TABLE public.leaves
  DROP CONSTRAINT IF EXISTS leaves_status_check;

ALTER TABLE public.leaves
  ADD CONSTRAINT leaves_status_check
  CHECK (status IN ('pending', 'active', 'delete_requested', 'rejected', 'deleted'));
