-- Two names per leave policy.
--
-- `name`        is what the person applying sees, and what HR sees in the console.
-- `public_name` is what EVERYONE ELSE sees: approval queues, the calendar, the
--               dashboard, in-app notifications and every Slack message.
--
-- They start identical for every existing policy, so nothing changes until HR
-- deliberately sets a different public name. That is the whole point of the
-- column: a menstrual leave can read "Menstrual Leave" to the person taking it
-- and "Leave" to the rest of the org.
--
-- Deliberately NOT unique. Making a private policy's public name collide with an
-- existing one (both "Leave") is the intended use — a colliding name is what
-- makes the pill on the calendar indistinguishable from an ordinary day off. In a
-- small company a unique-but-neutral name like "Wellness Leave" would still
-- identify both the person and the reason.
--
-- NOT NULL with no default is intentional too: a policy can never be created
-- without an explicit public name, so there is no code path where the private
-- name leaks by omission.

ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS public_name TEXT;

UPDATE public.leave_types
SET public_name = name
WHERE public_name IS NULL;

ALTER TABLE public.leave_types
  ALTER COLUMN public_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_public_name_not_blank'
  ) THEN
    ALTER TABLE public.leave_types
      ADD CONSTRAINT leave_types_public_name_not_blank
      CHECK (btrim(public_name) <> '');
  END IF;
END $$;
