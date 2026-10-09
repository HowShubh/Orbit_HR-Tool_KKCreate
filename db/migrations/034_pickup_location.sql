-- ============================================================
-- 034: Remember where gear was picked up FROM
-- ============================================================
-- A checkout recorded where an item was returned to, but never where it came
-- from — on checkout the item's current_location_id is simply cleared. So on
-- return there was no way to notice "you took this off L1 and you are putting
-- it on L2", which is how shelves quietly drift out of order.
--
-- Nullable on purpose: checkouts that already exist have no answer, and an
-- unknown origin must not turn into a false mismatch warning.
-- ============================================================

ALTER TABLE public.equipment_checkouts
  ADD COLUMN IF NOT EXISTS picked_up_location_id UUID
  REFERENCES public.equipment_locations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.equipment_checkouts.picked_up_location_id IS
  'Shelf the item was taken from. Null = unknown (pre-034 checkouts).';
