-- ============================================================
-- 030: Standalone studio holds
-- ============================================================
-- Until now every studio block had to hang off a shoot, so "just hold the room
-- for an hour" meant inventing a fake shoot. A block may now stand alone:
-- shoot_id is nullable, and a standalone hold carries its own title.
-- The no-overlap exclusion constraint is untouched, so holds and shoot blocks
-- compete for the same room on equal terms and double-booking stays impossible.
-- ============================================================

ALTER TABLE public.equipment_studio_blocks
  ALTER COLUMN shoot_id DROP NOT NULL;

ALTER TABLE public.equipment_studio_blocks
  ADD COLUMN IF NOT EXISTS title TEXT;

-- A block is either attached to a shoot, or is a standalone hold with a title.
ALTER TABLE public.equipment_studio_blocks
  ADD CONSTRAINT equipment_studio_blocks_shoot_or_title
  CHECK (shoot_id IS NOT NULL OR (title IS NOT NULL AND length(trim(title)) > 0));

-- Rewrite the write policy: the old one only allowed shoot owners/editors, so a
-- standalone hold could never be created. Now the person who made the hold can
-- edit it too.
DROP POLICY IF EXISTS "equipment_studio_blocks_write" ON public.equipment_studio_blocks;
CREATE POLICY "equipment_studio_blocks_write" ON public.equipment_studio_blocks
  FOR ALL USING (
    public.user_can('manage_equipment')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.equipment_shoots s
      WHERE s.id = shoot_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.equipment_shoot_editors e
      WHERE e.shoot_id = equipment_studio_blocks.shoot_id AND e.user_id = auth.uid()
    )
  );
