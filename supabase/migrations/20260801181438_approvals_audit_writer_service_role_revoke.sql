-- Applied 2026-08-01 as version 20260801181438.
--
-- Follow-up to approvals_audit_durability (20260801175357).
--
-- That migration stated approval_activity_write() was "granted to nobody",
-- reachable only through the four definer functions that pair an audit row
-- with a business write. Verifying the applied result showed otherwise: a
-- Supabase ALTER DEFAULT PRIVILEGES rule grants EXECUTE on new public
-- functions to service_role, so the audit writer is directly callable over
-- PostgREST with the service key.
--
-- That is not an external exposure, since the service key is server-side only.
-- It does leave a way to write an audit row carrying arbitrary content with no
-- corresponding state change, which is precisely what the atomic functions
-- exist to prevent, and it contradicts a comment a future reader would rely
-- on.
--
-- Revoking from service_role does not break the callers: they are SECURITY
-- DEFINER and execute as postgres, which retains EXECUTE.
REVOKE ALL ON FUNCTION public.approval_activity_write(uuid, text, text, text, text, text, text, text, text, uuid, text, uuid) FROM service_role;

-- The trigger function picked up the same default grants. A trigger function
-- cannot meaningfully be invoked directly (TG_OP and the OLD/NEW records are
-- unset), and PostgREST does not expose a `returns trigger` function, so this
-- is tidiness rather than a hole. Removed so the audit surface has no
-- unexplained grants left to reason about.
REVOKE ALL ON FUNCTION public.approval_activity_append_only() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.approval_activity_write(uuid, text, text, text, text, text, text, text, text, uuid, text, uuid) IS
  'Internal audit-row writer. EXECUTE held only by the function owner: every audit row must come through approval_request_create/save/transition/note, which pair it with a business write in one transaction.';

NOTIFY pgrst, 'reload schema';
