-- ============================================================
-- 017: Per-team weekly schedule (off days) + profile photos
-- ============================================================
-- Until now a team only declared its work-from-office days
-- (`wfo_pattern`), and "Sunday" was treated as the off day for
-- everyone in app code. This migration lets each team declare its
-- own off days, so e.g. one team can work Saturdays and another can
-- have Sat+Sun off. Any weekday that is neither an office day nor an
-- off day is treated as a work-from-home day.
--
-- Day codes match `wfo_pattern`: comma-separated MON,TUE,WED,THU,FRI,SAT,SUN.
-- Default 'SUN' preserves the previous behaviour for existing teams.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS off_days TEXT NOT NULL DEFAULT 'SUN';

-- Team profile photo. NULL renders a generated initials avatar.
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- ============================================================
-- Avatars storage bucket (public read; writes go through service-role
-- server actions only). `users.photo_url` already exists from 001.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;
