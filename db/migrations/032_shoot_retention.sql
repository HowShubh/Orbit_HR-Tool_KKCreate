-- ============================================================
-- 032: Shoot retention (archive, then delete after 3 months)
-- ============================================================
-- Shoots are archived when they finish and deleted 90 days later. Deleting a
-- shoot already cascades to its reservations, editors and studio blocks — all
-- of which are meaningless once the shoot is gone.
--
-- Checkouts are different: they are the gear's OWN history ("Rohan had the FX3,
-- returned it Tuesday"), and that has to survive the shoot being cleaned up.
-- equipment_checkouts.shoot_id had no ON DELETE rule, which defaults to
-- NO ACTION — so deleting a shoot that any gear was picked up for would have
-- failed with a foreign-key violation. SET NULL keeps the checkout row and its
-- whole timeline, and only drops the "this was for shoot X" link, which by then
-- points at something older than anything the app displays.
-- ============================================================

ALTER TABLE public.equipment_checkouts
  DROP CONSTRAINT IF EXISTS equipment_checkouts_shoot_id_fkey;

ALTER TABLE public.equipment_checkouts
  ADD CONSTRAINT equipment_checkouts_shoot_id_fkey
  FOREIGN KEY (shoot_id) REFERENCES public.equipment_shoots(id) ON DELETE SET NULL;

-- Finding "what is old enough to clean up" is a full scan without this.
CREATE INDEX IF NOT EXISTS equipment_shoots_ends_at_idx
  ON public.equipment_shoots (ends_at);
