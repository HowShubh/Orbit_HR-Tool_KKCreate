-- ============================================================
-- 024_equipment_shoot_editors.sql — per-shoot write access
--
-- Shoots are readable org-wide. Writing (editing the shoot,
-- adding/removing reservations) belongs to the owner, the people
-- on this editors list, and equipment managers (manage_equipment,
-- which HR + Founders hold via their bundles).
-- ============================================================

CREATE TABLE public.equipment_shoot_editors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shoot_id   UUID NOT NULL REFERENCES public.equipment_shoots(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by   UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shoot_id, user_id)
);

CREATE INDEX equipment_shoot_editors_shoot_idx ON public.equipment_shoot_editors (shoot_id);

ALTER TABLE public.equipment_shoot_editors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipment_shoot_editors_select" ON public.equipment_shoot_editors
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Owner, an existing editor, or an equipment manager can manage the list
-- (backstop; writes go through server actions).
CREATE POLICY "equipment_shoot_editors_write" ON public.equipment_shoot_editors
  FOR ALL USING (
    public.user_can('manage_equipment')
    OR EXISTS (
      SELECT 1 FROM public.equipment_shoots s
      WHERE s.id = shoot_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.equipment_shoot_editors e
      WHERE e.shoot_id = equipment_shoot_editors.shoot_id AND e.user_id = auth.uid()
    )
  );
