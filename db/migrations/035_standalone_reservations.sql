-- ============================================================
-- 035: Standalone gear reservations (no shoot)
-- ============================================================
-- Until now every reservation hung off a shoot. But people also want to hold
-- gear for a plain window: "I need the FX3 tomorrow 10am to 6pm" without
-- inventing a shoot. A reservation may now stand alone.
--
-- shoot_id becomes nullable. A reservation is EITHER attached to a shoot, OR a
-- standalone hold that must carry its own start/end (added in migration 031).
-- Nothing to backfill: existing reservations keep their shoot_id.
-- ============================================================

ALTER TABLE public.equipment_reservations
  ALTER COLUMN shoot_id DROP NOT NULL;

ALTER TABLE public.equipment_reservations
  DROP CONSTRAINT IF EXISTS equipment_reservations_shoot_or_window;
ALTER TABLE public.equipment_reservations
  ADD CONSTRAINT equipment_reservations_shoot_or_window
  CHECK (
    shoot_id IS NOT NULL
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  );

-- Feeds "reserved by me" on the With me tab and the standalone-conflict checks.
CREATE INDEX IF NOT EXISTS equipment_reservations_reserved_by_idx
  ON public.equipment_reservations (reserved_by)
  WHERE status IN ('active', 'pending');
