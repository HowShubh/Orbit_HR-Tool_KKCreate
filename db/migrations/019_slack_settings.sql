-- ============================================================
-- 019: App settings (Slack feature toggles)
-- ============================================================
-- Singleton row (id = 1) holding runtime on/off switches for the Slack
-- integration, so HR can enable/disable features from the HR Console without a
-- redeploy. Defaults to ON to match the pre-toggle behaviour. These are layered
-- ON TOP of the SLACK_BOT_TOKEN env gate — Slack stays fully off without a token.
CREATE TABLE IF NOT EXISTS public.app_settings (
  id                            INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  slack_dm_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  slack_whereabouts_on_approval BOOLEAN NOT NULL DEFAULT TRUE,
  slack_daily_digest            BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
