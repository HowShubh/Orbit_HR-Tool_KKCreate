-- Public view: active leaves covering today — reason excluded by design
CREATE OR REPLACE VIEW public.leaves_today AS
SELECT
  id,
  user_id,
  type,
  start_date,
  end_date,
  half_day_start,
  half_day_end
FROM public.leaves
WHERE status = 'active'
  AND start_date <= CURRENT_DATE
  AND end_date   >= CURRENT_DATE;

-- Grant read to authenticated users
GRANT SELECT ON public.leaves_today TO authenticated;
