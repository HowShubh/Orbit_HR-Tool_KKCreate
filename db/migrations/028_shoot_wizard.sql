-- ============================================================
-- 028_shoot_wizard.sql — Shoot wizard v2: approvals + kits
--
-- Plan: docs/superpowers/plans/2026-08-09-shoot-wizard.md
--
-- 1. Item-level approvals: equipment_items.requires_approval flag;
--    reservations gain 'pending' and 'rejected' statuses. Reserving
--    a flagged item creates a pending reservation that a
--    manage_equipment holder approves or rejects.
-- 2. Kits: named bundles of pooled items, defined in the Tech
--    Console. A kit is a selection shortcut only; reservations,
--    checkouts, and returns remain strictly per item.
-- ============================================================

-- ============================================================
-- APPROVAL FLAG
-- ============================================================
ALTER TABLE public.equipment_items
  ADD COLUMN requires_approval BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- RESERVATION STATUSES: + pending, rejected
-- ============================================================
ALTER TABLE public.equipment_reservations
  DROP CONSTRAINT equipment_reservations_status_check;
ALTER TABLE public.equipment_reservations
  ADD CONSTRAINT equipment_reservations_status_check
  CHECK (status IN ('active', 'pending', 'rejected', 'picked_up', 'expired', 'cancelled'));

-- One live (active or pending) reservation per item per shoot.
DROP INDEX public.equipment_reservations_active_uniq;
CREATE UNIQUE INDEX equipment_reservations_active_uniq
  ON public.equipment_reservations (item_id, shoot_id)
  WHERE status IN ('active', 'pending');

-- The item-side partial index feeds conflict checks; pending
-- reservations count as real intent, so include them.
DROP INDEX public.equipment_reservations_item_idx;
CREATE INDEX equipment_reservations_item_idx
  ON public.equipment_reservations (item_id)
  WHERE status IN ('active', 'pending');

-- ============================================================
-- KITS (selection shortcuts; Tech Console defines them)
-- ============================================================
CREATE TABLE public.equipment_kits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  notes      TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.equipment_kit_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id     UUID NOT NULL REFERENCES public.equipment_kits(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kit_id, item_id)
);

CREATE INDEX equipment_kit_items_kit_idx ON public.equipment_kit_items (kit_id);

CREATE TRIGGER set_updated_at_equipment_kits
  BEFORE UPDATE ON public.equipment_kits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- RLS (org-wide read, manage_equipment write; mirrors the
-- other equipment tables)
-- ============================================================
ALTER TABLE public.equipment_kits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_kit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_kits_select" ON public.equipment_kits
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_kits_write" ON public.equipment_kits
  FOR ALL USING (public.user_can('manage_equipment'));

CREATE POLICY "equipment_kit_items_select" ON public.equipment_kit_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_kit_items_write" ON public.equipment_kit_items
  FOR ALL USING (public.user_can('manage_equipment'));
