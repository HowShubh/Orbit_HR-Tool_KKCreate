-- ============================================================
-- 016 — Realtime for notifications
-- Adds the notifications table to the supabase_realtime publication so the
-- in-app bell updates live (StoreProvider subscribes to postgres_changes for
-- the current user). RLS (notif_select: user_id = auth.uid()) still applies to
-- realtime, so each session only receives its own rows.
-- Idempotent: safe to run more than once.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
