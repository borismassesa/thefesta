#!/usr/bin/env bash
#
# Applies ONLY the Workspace modules' migrations to a target database:
# identity, attendance, the report engine, the daily tracker, leave,
# tasks/projects/calendar, and goals/performance.
#
# WHY THIS EXISTS INSTEAD OF `supabase db push`
#
# Production's migration history was stamped by MCP apply_migration, which uses
# wall-clock versions that never match the repo's filenames. `supabase migration
# list` therefore reports 46 local-only migrations, most of which are already
# live under a different version, and `supabase db push` would try to apply all
# 46 — other people's in-flight work included. That is how you break a
# production database on a Tuesday.
#
# This applies exactly the files listed below, in order, each in its own
# transaction. Any failure rolls that file back and stops the run, so a partial
# apply cannot leave the schema half-built.
#
# All of them are re-runnable: every object uses IF NOT EXISTS or CREATE OR
# REPLACE, the status CHECK is dropped by definition rather than by name, the
# seed rows use ON CONFLICT DO NOTHING, and both backfills are guarded by
# NOT EXISTS.
#
# USAGE
#
#   Against production (get the URI from the Supabase dashboard, Project
#   Settings -> Database -> Connection string -> URI):
#
#     ./scripts/apply-workspace-migrations.sh "postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
#
#   Against a local database:
#
#     ./scripts/apply-workspace-migrations.sh "postgresql://postgres:postgres@localhost:5432/postgres"
#
# The connection string is read from argv and never written anywhere. Prefix the
# command with a space if your shell records history.
#
# AFTER APPLYING
#
#   1. Set the cron secrets, or the hourly attendance job no-ops with a notice:
#        ALTER DATABASE postgres SET app.settings.opus_admin_base_url = 'https://admin.opusfesta.com';
#        ALTER DATABASE postgres SET app.settings.attendance_cron_secret = '<matches ATTENDANCE_CRON_SECRET on Vercel>';
#        ALTER DATABASE postgres SET app.settings.reports_cron_secret = '<matches REPORTS_CRON_SECRET on Vercel>';
#        ALTER DATABASE postgres SET app.settings.tracker_cron_secret = '<matches TRACKER_CRON_SECRET on Vercel>';
#        ALTER DATABASE postgres SET app.settings.leave_cron_secret = '<matches LEAVE_CRON_SECRET on Vercel>';
#   2. Add ATTENDANCE_CRON_SECRET, REPORTS_CRON_SECRET, TRACKER_CRON_SECRET and
#      LEAVE_CRON_SECRET to the opus_admin project on Vercel.
#   3. Give People Ops workforce.write. It is the permission that gates moving a
#      performance cycle between stages and opening a correction on a closed
#      review; without it nobody can advance the cycle past goal setting.
#   4. Assign shift templates in employee_shift_assignments. Employees with no
#      assignment fall back to the seeded 'OpusFesta standard' schedule, so the
#      clock works before you do this.

set -euo pipefail

DB_URL="${1:-}"
if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 <postgres-connection-uri>" >&2
  exit 64
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install it, or run the SQL files through the Supabase" >&2
  echo "dashboard SQL editor in the order listed in this script." >&2
  exit 69
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_ERROR_FILE="$(mktemp "${TMPDIR:-/tmp}/opus-workspace-migrate.XXXXXX")"

cleanup() {
  rm -f "$MIGRATION_ERROR_FILE"
}
trap cleanup EXIT

MIGRATIONS=(
  # Workspace identity, access state, preferences, activity stream. Also widens
  # workforce_employees.status with Suspended/Terminated, which the attendance
  # module's lifecycle handling depends on.
  "20260802113000_workspace_foundation.sql"
  # Attendance: schema, then the transition functions that depend on it, then
  # the hourly maintenance schedule. Order matters.
  "20260802140000_attendance_schema.sql"
  "20260802140100_attendance_functions.sql"
  "20260802140200_attendance_cron.sql"
  # Report engine: schema, functions, then the backfill that needs both, then
  # the schedule. The backfill converts the existing report_templates into
  # published version 1 rows and copies workforce_reports forward; it is
  # guarded by NOT EXISTS, so re-running it imports nothing twice.
  "20260802160000_report_engine_schema.sql"
  "20260802160100_report_engine_functions.sql"
  "20260802160200_report_engine_backfill.sql"
  "20260802160300_report_engine_cron.sql"
  # Daily tracker: schema, functions, then the backfill that imports
  # md_tracker's brands as tracking_units, then the schedule.
  "20260802180000_tracker_schema.sql"
  "20260802180100_tracker_functions.sql"
  "20260802180200_tracker_backfill.sql"
  "20260802180300_tracker_cron.sql"
  # Leave: schema, functions, then the integration patch that repoints
  # attendance and the tracker at the shared leave definition, then the
  # backfill and the schedule. The integration MUST come after the functions
  # it calls and before anything relies on suppression.
  "20260802200000_leave_schema.sql"
  "20260802200100_leave_functions.sql"
  "20260802200200_leave_integration.sql"
  "20260802200300_leave_backfill.sql"
  "20260802200400_leave_cron.sql"
  # Tasks, projects, dependencies, meetings and the merged calendar. Comes last
  # because work_calendar() reads leave, holidays, shifts, report obligations
  # and tracker items, so every one of those tables must already exist. The
  # backfill imports the existing intern_tasks and workforce task rows.
  "20260802231000_work_schema.sql"
  "20260802231100_work_functions.sql"
  "20260802231200_work_backfill.sql"
  # Goals and performance: schema, functions, then the backfill that opens the
  # current cycle. Comes last because performance_evidence() reads tasks,
  # report_submissions and tracker_entries, and because the schema adds the
  # foreign keys that tasks.linked_goal_id and
  # tracker_entry_items.linked_goal_id were waiting for.
  "20260802240000_performance_schema.sql"
  "20260802240100_performance_functions.sql"
  "20260802240200_performance_backfill.sql"
)

echo "Applying ${#MIGRATIONS[@]} migrations."
echo

for file in "${MIGRATIONS[@]}"; do
  path="$ROOT/supabase/migrations/$file"
  if [[ ! -f "$path" ]]; then
    echo "MISSING: $path" >&2
    exit 66
  fi

  printf '  %-52s ' "$file"
  # --single-transaction so a failure rolls the whole file back rather than
  # leaving half a schema behind. ON_ERROR_STOP so the run halts here.
  if psql "$DB_URL" \
        --quiet \
        --single-transaction \
        --set ON_ERROR_STOP=1 \
        --file "$path" >/dev/null 2>"$MIGRATION_ERROR_FILE"; then
    echo "ok"
  else
    echo "FAILED"
    echo
    echo "--- error ---" >&2
    cat "$MIGRATION_ERROR_FILE" >&2
    echo >&2
    echo "Nothing from this file was applied. Earlier files in the list did" >&2
    echo "apply; they are all re-runnable, so fix the cause and run again." >&2
    exit 1
  fi
  : >"$MIGRATION_ERROR_FILE"
done

echo
echo "Verifying the schema landed."
psql "$DB_URL" --quiet --tuples-only --no-align --command "
  SELECT 'tables created: ' || count(*) || ' of 63'
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'workspace_preferences', 'workspace_activity_events',
      'work_schedules', 'shift_templates', 'employee_shift_assignments',
      'attendance_sessions', 'attendance_punches', 'attendance_breaks',
      'attendance_corrections', 'timesheets', 'timesheet_entries',
      'holiday_calendars',
      'report_templates', 'report_template_versions', 'report_template_assignments',
      'report_obligations', 'report_submissions', 'report_submission_versions',
      'report_reviews', 'report_comments', 'report_attachments',
      'projects', 'project_members',
      'tracking_units', 'tracking_cycles', 'tracking_assignments',
      'tracker_entries', 'tracker_entry_items', 'tracker_reviews',
      'tracker_comments', 'weekly_summaries',
      'leave_types', 'leave_policies', 'leave_policy_assignments',
      'leave_balances', 'leave_transactions', 'leave_requests',
      'leave_request_days', 'leave_documents', 'employee_availability',
      'project_milestones', 'tasks', 'task_assignments', 'task_dependencies',
      'task_comments', 'task_attachments', 'task_activity_events',
      'calendar_events', 'meeting_records',
      'competencies', 'performance_cycles', 'goal_periods', 'goals',
      'goal_key_results', 'goal_updates', 'check_ins',
      'feedback_requests', 'feedback_responses', 'performance_reviews',
      'review_sections', 'review_ratings',
      'development_plans', 'development_actions'
    );
  SELECT 'employee statuses now allowed: ' || (
    SELECT count(*) FROM unnest(ARRAY['Active','On Leave','Onboarding','Resigned','Suspended','Terminated']) s
    WHERE pg_get_constraintdef(c.oid) LIKE '%' || s || '%'
  )
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'workforce_employees' AND c.conname = 'workforce_employees_status_check';
  SELECT 'default work schedule: ' || COALESCE((SELECT name FROM work_schedules WHERE is_default), 'MISSING');
  SELECT 'report templates with a published version: ' || count(DISTINCT template_id)
  FROM report_template_versions WHERE published_at IS NOT NULL;
  SELECT 'tracking units: ' || count(*) || ' (' || count(*) FILTER (WHERE kind = 'brand') || ' brands, as data)'
  FROM tracking_units;
  SELECT 'leave types: ' || count(*) FROM leave_types;
  SELECT 'leave ledger reconciles: ' || CASE WHEN count(*) = 0 THEN 'yes' ELSE 'NO (' || count(*) || ' drifted)' END
  FROM leave_balances b
  WHERE b.balance_days <> COALESCE((
    SELECT SUM(t.days) FROM leave_transactions t
    WHERE t.employee_id = b.employee_id AND t.leave_type_id = b.leave_type_id
      AND t.leave_year_start = b.leave_year_start), 0);
  SELECT 'tasks: ' || count(*) || ' (' || count(*) FILTER (WHERE deleted_at IS NOT NULL) || ' removed but kept)'
  FROM tasks;
  SELECT 'projects default to members-only: ' || CASE
    WHEN count(*) FILTER (WHERE visibility NOT IN ('members','department','organisation')) = 0
    THEN 'yes' ELSE 'NO' END
  FROM projects;
  SELECT 'dependency cycles: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'FOUND ' || count(*) END
  FROM task_dependencies a
  JOIN task_dependencies b ON b.task_id = a.depends_on_task_id AND b.depends_on_task_id = a.task_id;
  SELECT 'performance cycle: ' || COALESCE((SELECT code || ' at ' || stage FROM performance_cycles ORDER BY starts_on DESC LIMIT 1), 'MISSING');
  SELECT 'competencies: ' || count(*) FROM competencies WHERE is_active;
  SELECT 'review shells: ' || count(*) || ' (' || count(*) FILTER (WHERE kind = 'self') || ' self)'
  FROM performance_reviews;
  -- Every rating must have a person and a reason on it. A row failing this
  -- would be one the system produced by itself, which is the thing this module
  -- exists to make impossible.
  SELECT 'ratings without a rater or a reason: ' || count(*)
  FROM review_ratings WHERE rated_by_employee_id IS NULL OR btrim(rationale) = '';
  SELECT 'live ratings per subject: ' || CASE WHEN count(*) = 0 THEN 'one each, as intended' ELSE 'DUPLICATED on ' || count(*) END
  FROM (
    SELECT review_id, competency_id, goal_id FROM review_ratings
    WHERE superseded_at IS NULL
    GROUP BY review_id, competency_id, goal_id HAVING count(*) > 1
  ) d;
"

echo
echo "Done. Workspace, the time clock, reports, the tracker, leave, My Work and"
echo "Goals and Performance are live."
