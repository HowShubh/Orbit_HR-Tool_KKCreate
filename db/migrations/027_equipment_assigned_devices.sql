-- ============================================================
-- 027_equipment_assigned_devices.sql — assigned devices
--
-- Adds a second item kind. "pooled" gear lives in a cupboard and
-- is checked out for shoots (today's model). "assigned" devices
-- (laptops, phones, SSDs) live with a person (the assignee) and
-- are only occasionally lent out — pure chain of custody, no due
-- dates. Loans reuse the checkout table with a NULL due_at.
-- ============================================================

ALTER TABLE public.equipment_items
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'pooled'
    CHECK (kind IN ('pooled', 'assigned'));

ALTER TABLE public.equipment_items
  ADD COLUMN assignee_id UUID REFERENCES public.users(id);

CREATE INDEX equipment_items_kind_idx ON public.equipment_items (kind);
CREATE INDEX equipment_items_assignee_idx ON public.equipment_items (assignee_id);

-- Assigned-device loans have no return date.
ALTER TABLE public.equipment_checkouts
  ALTER COLUMN due_at DROP NOT NULL;
