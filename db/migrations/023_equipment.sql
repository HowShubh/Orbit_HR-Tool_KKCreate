-- ============================================================
-- 023_equipment.sql — Lockup (equipment tracker) module
--
-- Fully self-contained: every table is prefixed equipment_, no
-- existing table gains a column, and the only outward FKs point
-- at users(id). Dropping the module = dropping these tables +
-- the manage_equipment capability rows.
-- Spec: docs/superpowers/specs/2026-07-08-equipment-tracker-design.md
-- ============================================================

-- ============================================================
-- LOCATIONS (storage cupboards; seeded L1 + L2)
-- ============================================================
CREATE TABLE public.equipment_locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.equipment_locations (label) VALUES ('L1'), ('L2');

-- ============================================================
-- SHOOTS (reservations always hang off a shoot)
-- ============================================================
CREATE TABLE public.equipment_shoots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  location   TEXT,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  owner_id   UUID NOT NULL REFERENCES public.users(id),
  status     TEXT NOT NULL DEFAULT 'planned'
             CHECK (status IN ('planned', 'active', 'done', 'cancelled')),
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX equipment_shoots_dates_idx ON public.equipment_shoots (starts_at, ends_at);

-- ============================================================
-- ITEMS (one row per physical unit; each has its own QR code)
-- ============================================================
CREATE TABLE public.equipment_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,        -- 6-char slug encoded in the QR
  name                TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN (
                        'camera', 'lens', 'light', 'audio', 'grip', 'drone',
                        'battery', 'storage', 'computer', 'cable_adapter',
                        'accessory', 'other')),
  brand_model         TEXT,
  serial_number       TEXT,
  photo_url           TEXT,
  home_location_id    UUID REFERENCES public.equipment_locations(id),
  status              TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'checked_out', 'in_repair', 'retired', 'lost')),
  current_holder_id   UUID REFERENCES public.users(id),
  current_checkout_id UUID,                        -- FK added below (circular with checkouts)
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX equipment_items_status_idx   ON public.equipment_items (status);
CREATE INDEX equipment_items_category_idx ON public.equipment_items (category);
CREATE INDEX equipment_items_holder_idx   ON public.equipment_items (current_holder_id);

-- ============================================================
-- CHECKOUTS (one row per possession period; transfers chain rows)
-- ============================================================
CREATE TABLE public.equipment_checkouts (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                       UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  holder_id                     UUID NOT NULL REFERENCES public.users(id),
  checked_out_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at                        TIMESTAMPTZ NOT NULL,
  returned_at                   TIMESTAMPTZ,
  returned_location_id          UUID REFERENCES public.equipment_locations(id),
  transferred_from_checkout_id  UUID REFERENCES public.equipment_checkouts(id),
  shoot_id                      UUID REFERENCES public.equipment_shoots(id),
  notes                         TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX equipment_checkouts_item_idx   ON public.equipment_checkouts (item_id, returned_at);
CREATE INDEX equipment_checkouts_open_idx   ON public.equipment_checkouts (holder_id) WHERE returned_at IS NULL;
CREATE INDEX equipment_checkouts_due_idx    ON public.equipment_checkouts (due_at) WHERE returned_at IS NULL;

ALTER TABLE public.equipment_items
  ADD CONSTRAINT equipment_items_current_checkout_fk
  FOREIGN KEY (current_checkout_id) REFERENCES public.equipment_checkouts(id) ON DELETE SET NULL;

-- ============================================================
-- RESERVATIONS (item held for a shoot; expire 24h after shoot start)
-- ============================================================
CREATE TABLE public.equipment_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  shoot_id    UUID NOT NULL REFERENCES public.equipment_shoots(id) ON DELETE CASCADE,
  reserved_by UUID NOT NULL REFERENCES public.users(id),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'picked_up', 'expired', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX equipment_reservations_active_uniq
  ON public.equipment_reservations (item_id, shoot_id) WHERE status = 'active';
CREATE INDEX equipment_reservations_shoot_idx ON public.equipment_reservations (shoot_id);
CREATE INDEX equipment_reservations_item_idx  ON public.equipment_reservations (item_id) WHERE status = 'active';

-- ============================================================
-- REPAIRS (status history; item.status = 'in_repair' while open)
-- ============================================================
CREATE TABLE public.equipment_repairs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  sent_by          UUID NOT NULL REFERENCES public.users(id),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_back_on DATE,
  vendor           TEXT,
  notes            TEXT,
  returned_at      TIMESTAMPTZ
);

CREATE INDEX equipment_repairs_item_idx ON public.equipment_repairs (item_id);
CREATE INDEX equipment_repairs_open_idx ON public.equipment_repairs (item_id) WHERE returned_at IS NULL;

-- ============================================================
-- ISSUES (problem reports; optional at return, or standalone)
-- ============================================================
CREATE TABLE public.equipment_issues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(id),
  checkout_id UUID REFERENCES public.equipment_checkouts(id),
  note        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX equipment_issues_open_idx ON public.equipment_issues (status) WHERE status = 'open';

-- ============================================================
-- PRIVATE (purchase data; RLS-restricted to manage_equipment)
-- ============================================================
CREATE TABLE public.equipment_private (
  item_id            UUID PRIMARY KEY REFERENCES public.equipment_items(id) ON DELETE CASCADE,
  purchase_date      DATE,
  purchase_price_inr NUMERIC(12, 2),
  purchase_notes     TEXT
);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER set_updated_at_equipment_items
  BEFORE UPDATE ON public.equipment_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_equipment_shoots
  BEFORE UPDATE ON public.equipment_shoots
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- CAPABILITY: manage_equipment (documented in PRD_v1/CAPABILITIES.md)
-- ============================================================
INSERT INTO public.capabilities (key, description, is_scoped, is_write) VALUES
  ('manage_equipment', 'Manage Lockup equipment: items, repairs, issues, imports, labels, purchase data', FALSE, TRUE);

UPDATE public.capability_bundles
SET capabilities = capabilities || '[{"capability_key": "manage_equipment"}]'::jsonb
WHERE key IN ('hr_admin', 'founder_full');

-- Re-apply role bundles for existing HR/founder users so they pick up the
-- new capability without waiting for a role change.
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id, role FROM public.users WHERE role IN ('hr', 'founder') AND status = 'active'
  LOOP
    PERFORM public.recompute_role_bundles(u.id, u.role);
  END LOOP;
END $$;

-- ============================================================
-- RLS
--
-- Reads: any authenticated user can see all Lockup data EXCEPT
-- equipment_private (manage_equipment only). Writes normally go
-- through service-role server actions; these policies are the
-- backstop mirroring the action rules.
-- ============================================================
ALTER TABLE public.equipment_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_checkouts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_shoots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_repairs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_issues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_private      ENABLE ROW LEVEL SECURITY;

-- Locations
CREATE POLICY "equipment_locations_select" ON public.equipment_locations
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_locations_write" ON public.equipment_locations
  FOR ALL USING (public.user_can('manage_equipment'));

-- Items
CREATE POLICY "equipment_items_select" ON public.equipment_items
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_items_write" ON public.equipment_items
  FOR ALL USING (public.user_can('manage_equipment'));

-- Checkouts: anyone can open their own; close their own (or manage_equipment)
CREATE POLICY "equipment_checkouts_select" ON public.equipment_checkouts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_checkouts_insert" ON public.equipment_checkouts
  FOR INSERT WITH CHECK (holder_id = auth.uid() OR public.user_can('manage_equipment'));
CREATE POLICY "equipment_checkouts_update" ON public.equipment_checkouts
  FOR UPDATE USING (holder_id = auth.uid() OR public.user_can('manage_equipment'));

-- Shoots: anyone can create; owner or manage_equipment can edit
CREATE POLICY "equipment_shoots_select" ON public.equipment_shoots
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_shoots_insert" ON public.equipment_shoots
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "equipment_shoots_update" ON public.equipment_shoots
  FOR UPDATE USING (owner_id = auth.uid() OR public.user_can('manage_equipment'));

-- Reservations: anyone can reserve; reserver, shoot owner, or manage_equipment can change
CREATE POLICY "equipment_reservations_select" ON public.equipment_reservations
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_reservations_insert" ON public.equipment_reservations
  FOR INSERT WITH CHECK (reserved_by = auth.uid());
CREATE POLICY "equipment_reservations_update" ON public.equipment_reservations
  FOR UPDATE USING (
    reserved_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.equipment_shoots s WHERE s.id = shoot_id AND s.owner_id = auth.uid())
    OR public.user_can('manage_equipment')
  );

-- Repairs: manage_equipment only
CREATE POLICY "equipment_repairs_select" ON public.equipment_repairs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_repairs_write" ON public.equipment_repairs
  FOR ALL USING (public.user_can('manage_equipment'));

-- Issues: anyone can report; manage_equipment resolves
CREATE POLICY "equipment_issues_select" ON public.equipment_issues
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_issues_insert" ON public.equipment_issues
  FOR INSERT WITH CHECK (reported_by = auth.uid());
CREATE POLICY "equipment_issues_update" ON public.equipment_issues
  FOR UPDATE USING (public.user_can('manage_equipment'));

-- Private purchase data: manage_equipment only (read AND write)
CREATE POLICY "equipment_private_select" ON public.equipment_private
  FOR SELECT USING (public.user_can('manage_equipment'));
CREATE POLICY "equipment_private_write" ON public.equipment_private
  FOR ALL USING (public.user_can('manage_equipment'));

-- ============================================================
-- Storage bucket for item photos (public read; writes via
-- service-role server actions only, same as avatars)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment-photos', 'equipment-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;
