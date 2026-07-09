-- ============================================================
-- 026_equipment_current_location.sql — where the item ACTUALLY is
--
-- home_location_id is where an item is supposed to live; this new
-- column is where it was last dropped. Check-in sets it from the
-- "where did you put it back?" prompt, so the next person looks in
-- the right cupboard even when gear is returned somewhere else.
-- NULL while the item is checked out (it is with a person).
-- ============================================================

ALTER TABLE public.equipment_items
  ADD COLUMN current_location_id UUID REFERENCES public.equipment_locations(id);

-- Backfill: assume everything currently available sits on its home shelf
UPDATE public.equipment_items
SET current_location_id = home_location_id
WHERE status = 'available';
