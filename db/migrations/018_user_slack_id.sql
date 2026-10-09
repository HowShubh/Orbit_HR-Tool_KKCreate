-- ============================================================
-- 018: Slack member ID on users (for the #whereabouts bot DMs)
-- ============================================================
-- Stores each person's Slack member ID (e.g. "U0XXXXXXX") so the bot can DM
-- them about leave approvals. Usually auto-matched by email at send time and
-- cached here; the profile also exposes a manual override field.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS slack_user_id TEXT;
