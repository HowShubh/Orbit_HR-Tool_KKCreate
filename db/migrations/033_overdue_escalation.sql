-- ============================================================
-- 033: Overdue escalation settings
-- ============================================================
-- Overdue gear escalates: day 1 it reaches the tech lead and the holder's
-- manager, day 3 it goes to the equipment Slack channel. The tech lead is a
-- person, not a capability — the Tech Console's Slack tab picks who it is, so
-- it can change without a deploy.
-- ============================================================

ALTER TABLE public.equipment_settings
  ADD COLUMN IF NOT EXISTS tech_lead_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Escalation thresholds, so the policy is tunable without a deploy too.
ALTER TABLE public.equipment_settings
  ADD COLUMN IF NOT EXISTS escalate_to_leads_after_days INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS escalate_to_channel_after_days INT NOT NULL DEFAULT 3;

ALTER TABLE public.equipment_settings
  DROP CONSTRAINT IF EXISTS equipment_settings_escalation_check;
ALTER TABLE public.equipment_settings
  ADD CONSTRAINT equipment_settings_escalation_check
  CHECK (
    escalate_to_leads_after_days   BETWEEN 1 AND 30
    AND escalate_to_channel_after_days BETWEEN 1 AND 60
  );

COMMENT ON COLUMN public.equipment_settings.tech_lead_user_id IS
  'Who hears about overdue gear first. Set in the Tech Console Slack tab.';
