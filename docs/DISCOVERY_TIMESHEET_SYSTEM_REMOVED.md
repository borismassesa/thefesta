# Discovery: the timesheet system was removed in February 2026

Status: discovery note. Records a fact found while scoping Phase 3D. Makes no
recommendation about whether the removal should be reversed.

## What was found

Phase 3D was originally specified as "team-scoped Timesheets", including
submission states, approval, reviewer attribution and single-winner
concurrency on decisions. Inspecting the domain before changing it showed
there is no timesheet system to retrofit.

`supabase/migrations/066_remove_timesheet_system.sql`, dated **2026-02-15**,
deliberately dropped it. The migration header reads: "Drops timesheet /
integration schema objects and employee fields added for timesheet workflows."

Removed by that migration:

- `timesheet_summary_by_week` (materialised view)
- `department_summary_by_week` (materialised view)
- `project_hours_summary` (materialised view)
- `employee_utilization_summary` (materialised view)
- `refresh_timesheet_analytics()`
- `can_approve_timesheet(uuid, uuid)`
- employee fields added for timesheet workflows

## What `/workforce/timesheets` actually is

A read-only weekly grid **derived from time punches**. It reads
`workforce_time_punches` for a date range plus a "currently clocked in" board.

There is no submission record, no status column, no attestation, no approval,
no reviewer, and no project, client or cost-centre dimension. The three
mutations are `adminInsertPunch`, `adminUpdatePunch` and `adminDeletePunch`:
corrections to the punch log, not decisions on a submitted document.

Consequences for the Phase 3D specification, all of which had no counterpart
in the schema: Draft/Submitted/Approved transitions, deciding a submitted
record once only, self-approval prohibition on timesheets, single-winner
concurrency on decisions, and reviewer attribution.

## What is NOT known

**Why it was removed.** The migration states what it drops, not the reasoning.
Nothing in the repository that was inspected explains the decision, and no
motivation should be inferred from its absence. It may have been unused, it
may have been superseded, it may have been removed to unblock something else.

## What Phase 3D did instead

Redefined as **team-scoped attendance review**:

- Team callers see current direct reports' punch-derived records
- `workforce.attendance.read` grants the organisation-wide view
- A manager with zero active reports sees nothing, never a widened scope
- Punch corrections were separated onto `workforce.attendance.admin`, so team
  visibility does not imply authority to rewrite when somebody worked
- The visible product language became "Attendance"; the route stayed at
  `/workforce/timesheets` for link stability

## If a timesheet feature is wanted later

Start from product requirements and a review of this history, not by restoring
the dropped tables. The questions that would need answering first:

- What is being attested to, and by whom?
- Does approval feed payroll, and if so through what contract?
- Are project, client or cost-centre dimensions in scope? Those introduce
  access boundaries that reporting lines alone do not model.
- Is overtime in scope?
- Why was the previous implementation removed, and does that reason still hold?

A future implementation should also decide deliberately whether attendance and
timesheets are one domain or two. Today attendance is a factual log of punches;
a timesheet is a claim an employee makes about their work. Conflating them was
plausibly part of what made the original system hard to keep.
