-- Customer-support chat system for "Opus".
--
-- Stores every Opus conversation and message, supports human handoff to admin
-- staff (workforce_employees), collects answer feedback, and rate-limits the
-- public chat endpoint. All tables are service-role-only: RLS is enabled with
-- NO permissive policies, so anon/authenticated clients cannot read or write
-- them directly (same posture as couple_account_notes / audit_log). Both the
-- website API routes and the admin console reach them via the service-role
-- client.

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  visitor_id text,
  status text NOT NULL DEFAULT 'bot'
    CHECK (status IN ('bot','needs_human','assigned','resolved')),
  assigned_to uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  subject text,
  topic text,
  escalation_reason text,
  contact_name text,
  contact_email text,
  contact_phone text,
  page_url text,
  locale text,
  awaiting_staff boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.support_conversations IS
  'Opus support conversations. status: bot (AI), needs_human (escalated/unassigned), assigned (an agent owns it), resolved. awaiting_staff = a human reply is pending. Service-role only.';

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL
    REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','agent','system')),
  agent_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.support_messages IS
  'Messages in an Opus conversation. role: user (customer), assistant (Opus AI), agent (human staff), system. Service-role only.';

CREATE TABLE IF NOT EXISTS public.support_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('up','down')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.support_feedback IS
  'Thumbs up/down feedback on Opus answers, for quality monitoring. Service-role only.';

CREATE INDEX IF NOT EXISTS support_messages_conversation_idx
  ON public.support_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS support_conversations_status_idx
  ON public.support_conversations (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_conversations_awaiting_idx
  ON public.support_conversations (awaiting_staff, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_conversations_assigned_idx
  ON public.support_conversations (assigned_to);
CREATE INDEX IF NOT EXISTS support_conversations_user_idx
  ON public.support_conversations (user_id);
CREATE INDEX IF NOT EXISTS support_conversations_visitor_idx
  ON public.support_conversations (visitor_id);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;

-- Rate limiting for the public chat endpoint. Atomic increment inside a
-- SECURITY DEFINER function; REVOKE from PUBLIC so it is not exposed as an
-- unauthenticated PostgREST RPC (the service-role callers still reach it).
CREATE TABLE IF NOT EXISTS public.support_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0
);
ALTER TABLE public.support_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.support_rate_limit_hit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO support_rate_limits (bucket_key, window_start, count)
  VALUES (p_bucket, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
    SET count = CASE
          WHEN support_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN 1
          ELSE support_rate_limits.count + 1
        END,
        window_start = CASE
          WHEN support_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
          THEN now()
          ELSE support_rate_limits.window_start
        END
  RETURNING count INTO v_count;
  RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.support_rate_limit_hit(text, int, int) FROM PUBLIC;
