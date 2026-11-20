-- ============================================================
-- 025_equipment_studios.sql — Studio Blocking
--
-- Shoots can optionally hold a studio for a time range. Blocking
-- is HARD: overlapping bookings of the same studio are refused,
-- enforced race-safely by a Postgres exclusion constraint (the
-- server action pre-checks to give a friendly error naming the
-- clashing shoot). Studios are managed by equipment managers in
-- the Tech Console. Outdoor shoots simply never add a block.
-- ============================================================

-- Needed for uuid equality inside a gist exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE public.equipment_studios (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.equipment_studios (name) VALUES ('Studio 1');

CREATE TABLE public.equipment_studio_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id  UUID NOT NULL REFERENCES public.equipment_studios(id),
  shoot_id   UUID NOT NULL REFERENCES public.equipment_shoots(id) ON DELETE CASCADE,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  -- The hard block: one studio can never be double-booked. Cancelling a shoot
  -- deletes its blocks (server action), freeing the studio.
  CONSTRAINT equipment_studio_blocks_no_overlap
    EXCLUDE USING gist (studio_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
);

CREATE INDEX equipment_studio_blocks_studio_idx ON public.equipment_studio_blocks (studio_id, starts_at);
CREATE INDEX equipment_studio_blocks_shoot_idx  ON public.equipment_studio_blocks (shoot_id);

-- RLS
ALTER TABLE public.equipment_studios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_studio_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_studios_select" ON public.equipment_studios
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_studios_write" ON public.equipment_studios
  FOR ALL USING (public.user_can('manage_equipment'));

CREATE POLICY "equipment_studio_blocks_select" ON public.equipment_studio_blocks
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Owner/editor of the shoot, or an equipment manager (backstop; writes go
-- through server actions).
CREATE POLICY "equipment_studio_blocks_write" ON public.equipment_studio_blocks
  FOR ALL USING (
    public.user_can('manage_equipment')
    OR EXISTS (
      SELECT 1 FROM public.equipment_shoots s
      WHERE s.id = shoot_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.equipment_shoot_editors e
      WHERE e.shoot_id = equipment_studio_blocks.shoot_id AND e.user_id = auth.uid()
    )
  );
