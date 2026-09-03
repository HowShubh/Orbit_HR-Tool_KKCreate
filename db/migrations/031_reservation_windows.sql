-- ============================================================
-- 031: Per-reservation gear windows
-- ============================================================
-- Until now a reservation had no time of its own: it implicitly covered the
-- whole shoot. Real shoots don't work that way — a light might only be needed
-- while the studio is booked, a camera for the whole two days, a gimbal for one
-- afternoon. A reservation may now carry its own window.
--
-- NULL starts_at/ends_at keeps the old meaning exactly: "the whole shoot".
-- That is why the columns are nullable rather than backfilled — existing rows
-- need no migration and keep behaving as they did.
-- ============================================================

ALTER TABLE public.equipment_reservations
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at   TIMESTAMPTZ;

-- Either both set (a custom window) or both null (the whole shoot), never one.
ALTER TABLE public.equipment_reservations
  DROP CONSTRAINT IF EXISTS equipment_reservations_window_check;
ALTER TABLE public.equipment_reservations
  ADD CONSTRAINT equipment_reservations_window_check
  CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  );

COMMENT ON COLUMN public.equipment_reservations.starts_at IS
  'Custom hold start. NULL means the reservation covers the whole shoot window.';
COMMENT ON COLUMN public.equipment_reservations.ends_at IS
  'Custom hold end. NULL means the reservation covers the whole shoot window.';
