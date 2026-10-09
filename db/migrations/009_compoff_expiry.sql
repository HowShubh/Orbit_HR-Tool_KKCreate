-- Add expires_at to compoff_grants — 90 days from work_date.
-- Generated stored column so it stays in sync without app code maintaining it.

ALTER TABLE public.compoff_grants
  ADD COLUMN expires_at DATE
  GENERATED ALWAYS AS ((work_date + INTERVAL '90 days')::DATE) STORED;

-- Optional helper view: only currently-usable approved compoff
CREATE OR REPLACE VIEW public.compoff_active AS
SELECT *
FROM public.compoff_grants
WHERE status = 'approved'
  AND expires_at >= CURRENT_DATE;

GRANT SELECT ON public.compoff_active TO authenticated;
