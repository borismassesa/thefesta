-- Audit log — admin platform observability backbone.
--
-- Purpose: a single append-only stream of operational + security events
-- the Technology dashboard lane reads to surface "what's wrong on the
-- platform today" (failed auth, permission denials, expired invites,
-- whitelist toggles, deployment notes). Keeps Tech out of the
-- codebase-only zone and gives Founders a forensic timeline for
-- incident response.
--
-- Write model: the admin app writes via the service role key from
-- src/lib/audit-log.ts. Writes are best-effort — never block a server
-- action on a log insert (we catch and console.warn instead).
--
-- Severity convention:
--   info     — routine events worth recording (role granted, payroll approved)
--   warn     — degraded behavior the team should notice (sync stale, invite expired)
--   error    — failed operation that did not crash but surfaces a bug or misuse
--   critical — security-sensitive event requiring attention (denied access at policy boundary)
--
-- Retention: not enforced by this migration. A retention job can be
-- added later (delete where created_at < now() - interval '180 days')
-- once we see actual write volume.

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Short slug used both for grouping and for routing to specific UI
  -- treatments. Examples: 'auth.permission_denied',
  -- 'workforce.invite_expired', 'vendor.status_changed'.
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warn', 'error', 'critical')),
  -- Actor identity. We record the email + Clerk user id (when
  -- available) so a forensic trace works even after a Clerk user is
  -- deleted from the dashboard (the email survives in the log).
  actor_email text,
  actor_clerk_id text,
  -- What the event acted on, free-form so callers can encode whatever
  -- shape makes sense. Examples: 'workforce_employees:abc-123',
  -- 'vendors:slug=heavenly-events', 'platform.flag:beta_search'.
  target_resource text,
  -- Human-readable summary — shown in the dashboard list and the
  -- /insights/audit table without further processing.
  message text NOT NULL,
  -- Structured metadata for debugging — anything that doesn't fit on
  -- the row. Indexed via the GIN below so we can query by key later.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Recent-events scan: ORDER BY created_at DESC LIMIT N (the lane query
-- and the audit page both rely on this).
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON audit_log (created_at DESC);

-- Filter by event_type or severity (e.g. "show me all permission
-- denials in the last 72h").
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type
  ON audit_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity
  ON audit_log (severity, created_at DESC);

-- Filter by actor (forensic timeline for one user).
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_email
  ON audit_log (actor_email, created_at DESC);

-- GIN index so callers can later query metadata->>'key' = '…' or
-- metadata @> '{"target":"…"}' without sequential scans.
CREATE INDEX IF NOT EXISTS idx_audit_log_metadata
  ON audit_log USING GIN (metadata);

-- RLS — admin-only. The audit log can leak sensitive operational
-- detail (which emails got denied, which vendor ids were suspended) so
-- only workforce readers (owner/admin/editor/viewer) see it; writes go
-- through the service role and bypass RLS entirely.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_read" ON audit_log;
CREATE POLICY "audit_log_read" ON audit_log
  FOR SELECT TO authenticated
  USING (is_workforce_reader());

-- No user-facing write policy. Inserts happen via the service role
-- (bypasses RLS), and there is no UPDATE/DELETE path — the table is
-- append-only by convention.

COMMENT ON TABLE audit_log
  IS 'Admin platform observability — append-only event log. RLS: admin-only read; writes via service role.';

NOTIFY pgrst, 'reload schema';
