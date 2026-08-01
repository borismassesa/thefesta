-- CAPTURED FROM PRODUCTION. Applied to the live database as version
-- 20260801163640 via MCP apply_migration and never committed. Recovered from
-- supabase_migrations.schema_migrations and reproduced verbatim so a clean
-- environment reaches the same state. Do not edit to "improve" it; write a new
-- migration instead.

-- workflow_events must not be readable over PostgREST.
--
-- The original policy allowed any is_workforce_reader() to SELECT. That was
-- written when the table was expected to hold only status transitions. It now
-- also holds `metadata.email_payload`, which the retry worker needs in order to
-- re-render a message hours later, and which contains the approval subject,
-- the submitter and actor addresses, and the approver's free-text decision
-- note.
--
-- That made the whole Approvals participant-scoping fix bypassable: a reader
-- who could not open a request could still read its subject and its refusal
-- reason out of the event log. Approval-request detail is visible only to the
-- request owner and explicitly named approvers, and this table has to honour
-- that too.
--
-- Nothing is broken by removing it. The only reader in the codebase is
-- emitWorkflowEvent(), which uses the service-role client and bypasses RLS.
-- With no policy and RLS enabled, PostgREST denies every authenticated role,
-- matching how the write side already behaves.
DROP POLICY IF EXISTS workflow_events_read ON workflow_events;

COMMENT ON TABLE workflow_events IS
  'Append-only domain events published by any module. SERVICE ROLE ONLY — RLS is enabled with no policies, because metadata carries the persisted email payload (subject, addresses, decision note) needed for retry. Do not add a read policy without first moving that payload somewhere scoped.';

NOTIFY pgrst, 'reload schema';
