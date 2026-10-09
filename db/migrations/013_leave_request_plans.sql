-- Day-wise leave plans let one employee request contain mixed Leave/WFH days.
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'delete_requested', 'rejected', 'deleted')),
  reason       TEXT,
  created_by   UUID NOT NULL REFERENCES public.users(id),
  decided_by   UUID REFERENCES public.users(id),
  decided_at   TIMESTAMPTZ,
  deleted_by   UUID REFERENCES public.users(id),
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leaves
  ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.leave_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leaves_request_id ON public.leaves(request_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user_status ON public.leave_requests(user_id, status);
