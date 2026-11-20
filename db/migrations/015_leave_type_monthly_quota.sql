-- Optional per-policy monthly caps, used for policies like Menstrual Leave.
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS monthly_quota NUMERIC(4,1);

ALTER TABLE public.leave_types
  DROP CONSTRAINT IF EXISTS leave_types_monthly_quota_check;

ALTER TABLE public.leave_types
  ADD CONSTRAINT leave_types_monthly_quota_check
  CHECK (monthly_quota IS NULL OR monthly_quota >= 0);

-- `type` remains the balance bucket deducted. `requested_type` preserves
-- the policy the employee actually selected, even when comp-off is consumed first.
ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS requested_type TEXT;

UPDATE public.leaves
SET requested_type = type
WHERE requested_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leaves_requested_type_fkey'
  ) THEN
    ALTER TABLE public.leaves
      ADD CONSTRAINT leaves_requested_type_fkey
      FOREIGN KEY (requested_type) REFERENCES public.leave_types(key) ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leaves_requested_type_month
  ON public.leaves(user_id, requested_type, start_date, end_date, status);
