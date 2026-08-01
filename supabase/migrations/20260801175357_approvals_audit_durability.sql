-- Approvals — audit durability.
--
-- WHY THIS EXISTS
-- The approvals module could commit a final decision without committing its
-- audit record. `transitionApprovalRequest` updated the status, then called
-- insertActivity(), which logged its own failure and returned void. The action
-- carried on and returned ok:true. An approved request with no attributable
-- history was therefore reachable through ordinary error paths, not just
-- exotic ones.
--
-- Three separate problems, fixed together here:
--
--   1. NOT ATOMIC. Status change and audit insert were two round trips over
--      PostgREST, so there was no transaction to roll back. Fixed by moving
--      each write pair into a plpgsql function: one statement from the app,
--      one transaction in the database, audit failure aborts the decision.
--
--   2. NOT ATTRIBUTABLE. Activity rows identified the actor by display name
--      only. Renaming someone in Clerk rewrote how their past decisions read,
--      and two people sharing a display name were indistinguishable. Fixed by
--      recording workforce_employees.id and the Clerk user id alongside the
--      name, which stays for presentation.
--
--   3. NOT IMMUTABLE. Both the table comment and the migration described the
--      feed as "append-only", but nothing enforced it: the RLS write policy
--      was FOR ALL, and every application write uses the service role, which
--      bypasses RLS entirely. Fixed with a trigger, because a trigger is the
--      only layer the service role cannot walk past.
--
-- Structured transition columns (previous_status, new_status, action) are
-- added because the prose `body` was the only record of what changed. A string
-- reading "Boris approved this request." cannot be queried, cannot be checked
-- against the request's current state, and is written by the same code whose
-- correctness it is supposed to evidence.

-- ---------------------------------------------------------------------------
-- 1. Structured, attributable audit columns
-- ---------------------------------------------------------------------------
-- All nullable: rows written before this migration have no structured
-- equivalent, and backfilling them from prose would fabricate audit history.
-- Historical rows keep `body` and read as action IS NULL.

ALTER TABLE approval_request_activity
  -- Stable identity. Survives display-name changes; null for system rows and
  -- for an actor with no employee record yet.
  ADD COLUMN IF NOT EXISTS actor_employee_id uuid
    REFERENCES workforce_employees(id) ON DELETE SET NULL,
  -- The Clerk user id. Kept even when actor_employee_id is null, so a roster
  -- actor without an employee row is still pinned to an authenticated subject.
  ADD COLUMN IF NOT EXISTS actor_auth_id text,
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  -- What was done, as an enum rather than a sentence.
  ADD COLUMN IF NOT EXISTS action text CHECK (action IS NULL OR action IN (
    'created', 'saved', 'submitted', 'approved', 'refused',
    'info_requested', 'reopened', 'note'
  )),
  -- When the action happened, as distinct from when the row was written.
  -- Equal in the normal path; they diverge if a record is ever reconstructed.
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Ties the activity row to the workflow_events row emitted for the same
  -- action, so the two audit surfaces can be reconciled.
  ADD COLUMN IF NOT EXISTS correlation_id uuid;

-- Status transitions are what an auditor reads. Partial, because notes are the
-- bulk of the table and carry no transition.
CREATE INDEX IF NOT EXISTS idx_approval_activity_transitions
  ON approval_request_activity (request_id, occurred_at DESC)
  WHERE action IS NOT NULL AND action <> 'note';

CREATE INDEX IF NOT EXISTS idx_approval_activity_actor
  ON approval_request_activity (actor_employee_id, occurred_at DESC)
  WHERE actor_employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_activity_correlation
  ON approval_request_activity (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON COLUMN approval_request_activity.actor_employee_id IS
  'Stable actor identity (workforce_employees.id). Null for system rows or an actor with no employee record. Display name lives in `author` and is presentation only.';
COMMENT ON COLUMN approval_request_activity.correlation_id IS
  'Links this row to the workflow_events row emitted for the same action.';

-- ---------------------------------------------------------------------------
-- 2. Append-only, enforced
-- ---------------------------------------------------------------------------
-- The previous FOR ALL policy let a workforce admin holding a direct JWT
-- rewrite decision history. It is replaced with insert + select only.
--
-- RLS alone would still be decorative here: the admin app writes with the
-- service role key, which bypasses every policy. The trigger below is the
-- actual control, and it applies to the service role too.

DROP POLICY IF EXISTS "approval_request_activity_write" ON approval_request_activity;

DROP POLICY IF EXISTS "approval_request_activity_insert" ON approval_request_activity;
CREATE POLICY "approval_request_activity_insert" ON approval_request_activity
  FOR INSERT TO authenticated
  WITH CHECK (is_workforce_admin());

-- No UPDATE and no DELETE policy exists by design. Absent policy means denied.

CREATE OR REPLACE FUNCTION public.approval_activity_append_only()
RETURNS trigger
LANGUAGE plpgsql
-- Runs as the definer so the guard cannot be weakened by whichever role
-- happens to hold the connection attempting the UPDATE or DELETE.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Deliberate, per-transaction escape hatch for genuine maintenance (a
  -- correction ordered through a governed process, a data migration). It must
  -- be set explicitly inside the transaction doing the work:
  --
  --   SET LOCAL approvals.allow_activity_maintenance = 'on';
  --
  -- SET LOCAL, so it cannot leak into the next statement on a pooled
  -- connection. Nothing in the application ever sets it.
  IF current_setting('approvals.allow_activity_maintenance', true) = 'on' THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION
    'approval_request_activity is append-only; % denied on row %', TG_OP, OLD.id
    USING ERRCODE = '42501',
          HINT = 'Set approvals.allow_activity_maintenance for a governed correction.';
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_activity_append_only ON approval_request_activity;
CREATE TRIGGER trg_approval_activity_append_only
  BEFORE UPDATE OR DELETE ON approval_request_activity
  FOR EACH ROW EXECUTE FUNCTION public.approval_activity_append_only();

COMMENT ON FUNCTION public.approval_activity_append_only() IS
  'Blocks UPDATE/DELETE on approval_request_activity, including for the service role. Bypass requires SET LOCAL approvals.allow_activity_maintenance = ''on'' inside the transaction.';

-- NOTE ON CASCADE: approval_request_activity.request_id is ON DELETE CASCADE,
-- and this trigger fires on the cascaded delete. Deleting an approval request
-- therefore fails unless the maintenance setting is on. That is intended:
-- there is no request-delete path in the application, and audit history should
-- outlive a convenience delete.

-- ---------------------------------------------------------------------------
-- 3. Atomic write + audit
-- ---------------------------------------------------------------------------
-- Each function performs its business write and its mandatory audit insert in
-- one transaction. If the audit insert raises, the business write is rolled
-- back with it, which is the property the application could not provide by
-- making two PostgREST calls.
--
-- SECURITY DEFINER + revoked from PUBLIC: Postgres grants EXECUTE to PUBLIC by
-- default and PostgREST would publish these as RPC endpoints that mutate
-- approval state. Service role only.

-- Shared audit insert. Not exposed; called only by the functions below.
CREATE OR REPLACE FUNCTION public.approval_activity_write(
  p_request_id uuid,
  p_kind text,
  p_action text,
  p_body text,
  p_previous_status text,
  p_new_status text,
  p_actor_name text,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_actor_auth_id text,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
-- SECURITY DEFINER is load-bearing, not decoration. approval_activity_write is
-- granted to nobody, so a caller running as service_role could not reach it;
-- these run as the definer, which can. It is also what stops the append-only
-- trigger being sidestepped by whoever happens to hold the connection.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO approval_request_activity (
    request_id, kind, action, body,
    previous_status, new_status,
    author, author_initials, author_color,
    actor_employee_id, actor_auth_id, correlation_id, occurred_at
  ) VALUES (
    p_request_id, p_kind, p_action, p_body,
    p_previous_status, p_new_status,
    -- System rows are authored by the system, but the acting person is still
    -- recorded structurally in actor_employee_id / actor_auth_id.
    CASE WHEN p_kind = 'system' THEN 'System' ELSE p_actor_name END,
    CASE WHEN p_kind = 'system' THEN 'SY' ELSE p_actor_initials END,
    CASE WHEN p_kind = 'system' THEN '#94A3B8' ELSE p_actor_color END,
    p_actor_employee_id, p_actor_auth_id, p_correlation_id, now()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- --- transition ------------------------------------------------------------
-- Compare-and-swap on the status we validated against, plus the mandatory
-- audit row, plus an optional decision note.
--
-- Returns 'updated' when the swap took, 'stale' when it matched no row
-- because someone else decided first. 'stale' is a normal outcome, not an
-- error, so it is returned rather than raised: raising would roll back
-- nothing useful and would reach the app as an opaque failure.
CREATE OR REPLACE FUNCTION public.approval_request_transition(
  p_request_id uuid,
  p_expected_status text,
  p_next_status text,
  p_action text,
  p_body text,
  p_note text,
  p_actor_name text,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_actor_auth_id text,
  p_correlation_id uuid
)
RETURNS text
LANGUAGE plpgsql
-- SECURITY DEFINER is load-bearing, not decoration. approval_activity_write is
-- granted to nobody, so a caller running as service_role could not reach it;
-- these run as the definer, which can. It is also what stops the append-only
-- trigger being sidestepped by whoever happens to hold the connection.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE approval_requests
     SET status = p_next_status,
         -- Stamped on every submission. A reopen/resubmit cycle should date
         -- from the submission the approvers are actually looking at.
         submitted_at = CASE WHEN p_next_status = 'Submitted' THEN now() ELSE submitted_at END
   WHERE id = p_request_id
     AND status = p_expected_status;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN 'stale';
  END IF;

  -- Mandatory. Any failure here raises and takes the status change with it.
  PERFORM public.approval_activity_write(
    p_request_id, 'system', p_action, p_body,
    p_expected_status, p_next_status,
    p_actor_name, p_actor_initials, p_actor_color,
    p_actor_employee_id, p_actor_auth_id, p_correlation_id
  );

  IF p_note IS NOT NULL AND btrim(p_note) <> '' THEN
    PERFORM public.approval_activity_write(
      p_request_id, 'note', 'note', btrim(p_note),
      p_expected_status, p_next_status,
      p_actor_name, p_actor_initials, p_actor_color,
      p_actor_employee_id, p_actor_auth_id, p_correlation_id
    );
  END IF;

  RETURN 'updated';
END;
$$;

-- --- create ----------------------------------------------------------------
-- Request row and its creation audit row, together. Previously the request
-- was inserted first and the audit insert could fail behind it, leaving a
-- request whose history did not record its own creation.
CREATE OR REPLACE FUNCTION public.approval_request_create(
  p_category text,
  p_subject text,
  p_owner_name text,
  p_owner_email text,
  p_owner_initials text,
  p_owner_clerk_id text,
  p_fields jsonb,
  p_approvers jsonb,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
-- SECURITY DEFINER is load-bearing, not decoration. approval_activity_write is
-- granted to nobody, so a caller running as service_role could not reach it;
-- these run as the definer, which can. It is also what stops the append-only
-- trigger being sidestepped by whoever happens to hold the connection.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO approval_requests (
    category, subject, owner_name, owner_email, owner_initials,
    owner_clerk_id, fields, approvers, status
  ) VALUES (
    p_category, p_subject, p_owner_name, p_owner_email, p_owner_initials,
    p_owner_clerk_id, p_fields, p_approvers, 'To Submit'
  )
  RETURNING id INTO v_id;

  PERFORM public.approval_activity_write(
    v_id, 'system', 'created',
    p_owner_name || ' created this request.',
    NULL, 'To Submit',
    p_owner_name, p_actor_initials, p_actor_color,
    p_actor_employee_id, p_owner_clerk_id, p_correlation_id
  );

  RETURN v_id;
END;
$$;

-- --- save ------------------------------------------------------------------
-- Draft edits were not audited at all: subject, amounts and the approver list
-- could change with nothing recorded. Section 7 of the QA plan requires an
-- edit event, so a save now writes one in the same transaction as the edit.
--
-- Guarded on status so a request that was submitted between the caller's read
-- and this write cannot be edited underneath its approvers. Returns 'stale'
-- in that case, same contract as the transition.
CREATE OR REPLACE FUNCTION public.approval_request_save(
  p_request_id uuid,
  p_expected_status text,
  p_subject text,
  p_fields jsonb,
  p_approvers jsonb,
  p_changed text,
  p_actor_name text,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_actor_auth_id text,
  p_correlation_id uuid
)
RETURNS text
LANGUAGE plpgsql
-- SECURITY DEFINER is load-bearing, not decoration. approval_activity_write is
-- granted to nobody, so a caller running as service_role could not reach it;
-- these run as the definer, which can. It is also what stops the append-only
-- trigger being sidestepped by whoever happens to hold the connection.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE approval_requests
     SET subject = p_subject,
         fields = p_fields,
         approvers = p_approvers
   WHERE id = p_request_id
     AND status = p_expected_status;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN 'stale';
  END IF;

  PERFORM public.approval_activity_write(
    p_request_id, 'system', 'saved',
    p_actor_name || ' edited this draft (' || p_changed || ').',
    p_expected_status, p_expected_status,
    p_actor_name, p_actor_initials, p_actor_color,
    p_actor_employee_id, p_actor_auth_id, p_correlation_id
  );

  RETURN 'updated';
END;
$$;

-- --- note ------------------------------------------------------------------
-- The note row is the primary write, so there is no second write to be atomic
-- with. It goes through a function anyway so that touching updated_at cannot
-- succeed while the note itself fails.
CREATE OR REPLACE FUNCTION public.approval_request_note(
  p_request_id uuid,
  p_body text,
  p_actor_name text,
  p_actor_initials text,
  p_actor_color text,
  p_actor_employee_id uuid,
  p_actor_auth_id text,
  p_correlation_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
-- SECURITY DEFINER is load-bearing, not decoration. approval_activity_write is
-- granted to nobody, so a caller running as service_role could not reach it;
-- these run as the definer, which can. It is also what stops the append-only
-- trigger being sidestepped by whoever happens to hold the connection.
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

  v_id := public.approval_activity_write(
    p_request_id, 'note', 'note', p_body,
    v_status, v_status,
    p_actor_name, p_actor_initials, p_actor_color,
    p_actor_employee_id, p_actor_auth_id, p_correlation_id
  );

  -- Resurfaces the request at the top of the feed.
  UPDATE approval_requests SET updated_at = now() WHERE id = p_request_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Lock the RPC surface down
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.approval_activity_write(uuid, text, text, text, text, text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_request_transition(uuid, text, text, text, text, text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_request_create(text, text, text, text, text, text, jsonb, jsonb, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_request_save(uuid, text, text, jsonb, jsonb, text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approval_request_note(uuid, text, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approval_request_transition(uuid, text, text, text, text, text, text, text, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approval_request_create(text, text, text, text, text, text, jsonb, jsonb, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approval_request_save(uuid, text, text, jsonb, jsonb, text, text, text, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approval_request_note(uuid, text, text, text, text, uuid, text, uuid) TO service_role;
-- approval_activity_write is intentionally granted to nobody. It is called
-- internally by the functions above, which run as their definer.

COMMENT ON FUNCTION public.approval_request_transition(uuid, text, text, text, text, text, text, text, text, uuid, text, uuid) IS
  'Atomic approval transition: compare-and-swap on the expected status plus a mandatory audit row. Returns ''updated'' or ''stale''. Audit failure rolls back the decision. Service-role only.';

COMMENT ON TABLE approval_request_activity IS
  'Approvals module — append-only audit feed (system transitions + notes) per approval request. Append-only is enforced by trg_approval_activity_append_only, which the service role cannot bypass.';

NOTIFY pgrst, 'reload schema';
