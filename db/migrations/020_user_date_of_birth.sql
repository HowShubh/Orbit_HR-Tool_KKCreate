-- ============================================================
-- 020: Date of birth on users (optional)
-- ============================================================
-- Captured at user creation/edit. Stored as a full DATE, but the UI only ever
-- displays day + month (no year/age) for privacy. Powers a "Birthdays today"
-- dashboard widget (matched on month-day, like work anniversaries).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
