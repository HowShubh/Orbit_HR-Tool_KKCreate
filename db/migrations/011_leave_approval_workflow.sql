-- Employee-applied leave should wait for review.
-- Existing approved rows stay as "active" for compatibility with calendar/balance queries.
ALTER TABLE public.leaves
  DROP CONSTRAINT IF EXISTS leaves_status_check;

ALTER TABLE public.leaves
  ADD CONSTRAINT leaves_status_check
  CHECK (status IN ('pending', 'active', 'delete_requested', 'rejected', 'deleted'));

ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
