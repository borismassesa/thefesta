-- Applied 2026-08-01 as version 20260801181509.
--
-- Approvals — attachments (receipts, quotes, invoices, contracts).
--
-- WHY THIS EXISTS
-- A payment application or a Bolt Service claim without its receipt asks an
-- approver to decide on an assertion. The module had no attachment support at
-- all, so supporting documents were either pasted into the description or sent
-- around outside the system, where nothing scopes or audits them.
--
-- THE THING THAT MAKES THIS DIFFERENT FROM THE OTHER ATTACHMENT TABLES HERE
-- Elsewhere in the admin app a signed URL is minted from a storage path handed
-- in by the caller, gated only on a broad permission. That is an IDOR: paths
-- are predictable, so anyone holding the permission can read any object in the
-- bucket. Approvals must not work that way. Downloads are resolved by
-- attachment id, the parent request is re-read, and participation is checked
-- at request time, not at the time the link was created. See
-- attachment-actions.ts.

-- ---------------------------------------------------------------------------
-- 1. Private bucket
-- ---------------------------------------------------------------------------
-- Deliberately narrower than the `employees` bucket: no Word documents. A
-- receipt is a PDF or a photograph. Office formats carry macros and are not
-- something an approver needs to open to verify a payment.
--
-- file_size_limit and allowed_mime_types are enforced by storage itself, so a
-- caller bypassing the server action still cannot land a 2GB file or an
-- executable. The server action checks the same limits first for a readable
-- error, and additionally sniffs magic bytes, because the MIME type recorded
-- here is the one the client claimed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'approval-attachments',
  'approval-attachments',
  false,
  10485760, -- 10MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- No storage RLS policies. Every read and write goes through the service role
-- in a server action that has already checked participation. With RLS enabled
-- and no policy, a direct client request is denied outright.

-- ---------------------------------------------------------------------------
-- 2. Attachment rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_request_attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  -- As the uploader named it. Rendered, so it is escaped on display and never
  -- used to build the storage path.
  file_name text NOT NULL CHECK (length(btrim(file_name)) > 0),
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  -- Same stable-identity rule as the audit feed: a display name is not an
  -- attribution.
  uploaded_by_employee_id uuid REFERENCES workforce_employees(id) ON DELETE SET NULL,
  uploaded_by_auth_id text,
  uploaded_by_name text NOT NULL,
  -- Soft delete. Removing a receipt from a decided request must not erase the
  -- fact that it was there when the decision was taken, so the row survives
  -- and the audit entry that references it stays resolvable.
  deleted_at timestamptz,
  deleted_by_auth_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_attachments_request
  ON approval_request_attachments (request_id, created_at)
  WHERE deleted_at IS NULL;

ALTER TABLE approval_request_attachments ENABLE ROW LEVEL SECURITY;

-- No policies: this table carries the same participant-scoped detail as
-- approval_requests, and scoping lives in the server actions. PostgREST denies
-- every authenticated role.

COMMENT ON TABLE approval_request_attachments IS
  'Approvals module — supporting documents (receipts, quotes, invoices). SERVICE ROLE ONLY: RLS is enabled with no policies. Download authorization is re-checked per request in attachment-actions.ts, never inherited from a previously issued signed URL.';

-- ---------------------------------------------------------------------------
-- 3. Audit vocabulary
-- ---------------------------------------------------------------------------
-- The action enum from 20260801175357 predates attachments. Widen it rather
-- than letting attachment events fall outside the structured audit trail.
ALTER TABLE approval_request_activity
  DROP CONSTRAINT IF EXISTS approval_request_activity_action_check;
ALTER TABLE approval_request_activity
  ADD CONSTRAINT approval_request_activity_action_check
  CHECK (action IS NULL OR action IN (
    'created', 'saved', 'submitted', 'approved', 'refused',
    'info_requested', 'reopened', 'note',
    'attachment_added', 'attachment_removed'
  ));

-- ---------------------------------------------------------------------------
-- 4. Atomic attach / detach
-- ---------------------------------------------------------------------------
-- Same rule as every other approvals mutation: the row and its audit entry
-- commit together or not at all. An attachment that exists with no record of
-- who added it is the same defect as a decision with no record of who made it.

CREATE OR REPLACE FUNCTION public.approval_attachment_add(
  p_request_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_actor_name text,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_actor_auth_id text,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM approval_requests WHERE id = p_request_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'approval request % not found', p_request_id
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO approval_request_attachments (
    request_id, storage_path, file_name, mime_type, file_size_bytes,
    uploaded_by_employee_id, uploaded_by_auth_id, uploaded_by_name
  ) VALUES (
    p_request_id, p_storage_path, p_file_name, p_mime_type, p_file_size_bytes,
    p_actor_employee_id, p_actor_auth_id, p_actor_name
  )
  RETURNING id INTO v_id;

  -- File name only. The storage path is an access detail and does not belong
  -- in a feed that participants read.
  PERFORM public.approval_activity_write(
    p_request_id, 'system', 'attachment_added',
    p_actor_name || ' attached ' || p_file_name || '.',
    v_status, v_status,
    p_actor_name, p_actor_initials, p_actor_color,
    p_actor_employee_id, p_actor_auth_id, p_correlation_id
  );

  UPDATE approval_requests SET updated_at = now() WHERE id = p_request_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approval_attachment_remove(
  p_attachment_id uuid,
  p_actor_name text,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_actor_auth_id text,
  p_correlation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request_id uuid;
  v_file_name text;
  v_status text;
BEGIN
  -- Guarded on deleted_at so a double-click cannot write two removal entries.
  UPDATE approval_request_attachments
     SET deleted_at = now(),
         deleted_by_auth_id = p_actor_auth_id
   WHERE id = p_attachment_id
     AND deleted_at IS NULL
  RETURNING request_id, file_name INTO v_request_id, v_file_name;

  IF v_request_id IS NULL THEN
    RETURN 'stale';
  END IF;

  SELECT status INTO v_status FROM approval_requests WHERE id = v_request_id;

  PERFORM public.approval_activity_write(
    v_request_id, 'system', 'attachment_removed',
    p_actor_name || ' removed ' || v_file_name || '.',
    v_status, v_status,
    p_actor_name, p_actor_initials, p_actor_color,
    p_actor_employee_id, p_actor_auth_id, p_correlation_id
  );

  UPDATE approval_requests SET updated_at = now() WHERE id = v_request_id;
  RETURN 'removed';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Governed purge
-- ---------------------------------------------------------------------------
-- The append-only trigger from 20260801175357 fires on cascaded deletes, so
-- deleting an approval request now fails. That is the intended default: audit
-- history should outlive a convenience delete, and the application has no
-- delete path at all.
--
-- It does leave two legitimate needs unserved. The QA harness
-- (scripts/qa-approvals.ts) creates marked rows and must remove them, and the
-- QA plan calls for "accidental decision correction through a governed
-- administrative process". Both are the same operation: a deliberate,
-- attributable purge, not an ordinary delete.
--
-- So purging is possible but never quiet. It requires a reason, it is
-- service-role only, and it writes an audit_log entry naming what was
-- destroyed before destroying it. The bypass setting is scoped with SET LOCAL
-- so it dies with the transaction and cannot leak onto a pooled connection.
CREATE OR REPLACE FUNCTION public.approval_request_purge(
  p_request_id uuid,
  p_reason text,
  p_actor_email text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_subject text;
  v_status text;
  v_activity int;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'a purge reason of at least 8 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT subject, status INTO v_subject, v_status
    FROM approval_requests WHERE id = p_request_id;
  IF v_subject IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_activity
    FROM approval_request_activity WHERE request_id = p_request_id;

  -- Recorded BEFORE the delete, so the trace survives even if the delete
  -- then fails. Deliberately records the status and the audit-row count
  -- rather than the request's contents: this log is broadly readable and the
  -- request was not.
  INSERT INTO audit_log (event_type, severity, actor_email, target_resource, message)
  VALUES (
    'approval_request.purged', 'warn', p_actor_email,
    'approval_requests:' || p_request_id,
    format('Approval request purged (status %s, %s audit rows destroyed). Reason: %s',
           v_status, v_activity, btrim(p_reason))
  );

  -- Scoped to this transaction only.
  PERFORM set_config('approvals.allow_activity_maintenance', 'on', true);

  DELETE FROM approval_request_attachments WHERE request_id = p_request_id;
  DELETE FROM approval_request_activity WHERE request_id = p_request_id;
  DELETE FROM approval_requests WHERE id = p_request_id;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lock the RPC surface down
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.approval_request_purge(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approval_request_purge(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.approval_request_purge(uuid, text, text) IS
  'Governed destruction of an approval request and its audit trail. Requires a reason, writes an audit_log entry first, service-role only. The ONLY supported way past trg_approval_activity_append_only. Does NOT delete storage objects: Supabase blocks direct DELETE on storage.objects, so a caller must remove them through the Storage API first.';

-- KNOWN LIMITATION, verified rather than assumed: this function cannot clean
-- up the attachment files. Supabase installs storage.protect_delete(), which
-- raises 42501 on any direct DELETE against storage.objects, so a plpgsql
-- function has no route to the bucket. Purging therefore leaves the objects
-- behind as orphans that no row references.
--
-- Anything calling approval_request_purge() must remove the files through the
-- Storage API BEFORE purging, while the storage_path rows still exist:
--
--   const { data } = await admin.from('approval_request_attachments')
--     .select('storage_path').eq('request_id', id)
--   await admin.storage.from('approval-attachments')
--     .remove(data.map(r => r.storage_path))
--   await admin.rpc('approval_request_purge', { ... })
--
-- Worth folding into a single server action if purging ever becomes something
-- done more than exceptionally.

REVOKE ALL ON FUNCTION public.approval_attachment_add(uuid, text, text, text, bigint, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_attachment_remove(uuid, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approval_attachment_add(uuid, text, text, text, bigint, text, text, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approval_attachment_remove(uuid, text, text, text, uuid, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
