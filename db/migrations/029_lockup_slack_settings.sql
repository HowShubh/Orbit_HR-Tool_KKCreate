-- ============================================================
-- 029: Lockup Slack settings (Tech Console toggles)
-- ============================================================
-- Singleton row (id = 1) of runtime on/off switches for the Lockup Slack bot,
-- mirroring app_settings (019) for the Orbit HR bot. Lives in its own
-- equipment_-prefixed table so the Lockup module stays self-contained (no
-- pre-existing table gains a column). Defaults to ON to match pre-toggle
-- behaviour; the LOCKUP_SLACK_BOT_TOKEN env gate still sits underneath
-- (no token = the bot is fully off regardless of these switches).
CREATE TABLE IF NOT EXISTS public.equipment_settings (
  id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slack_dm_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  slack_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  slack_channel_feed      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.equipment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.equipment_settings ENABLE ROW LEVEL SECURITY;

-- Reads are harmless (feature flags only); writes are Tech Console territory.
CREATE POLICY "equipment_settings_select" ON public.equipment_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_settings_write" ON public.equipment_settings
  FOR ALL USING (public.user_can('manage_equipment'));
