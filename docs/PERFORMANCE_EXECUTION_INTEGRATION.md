# Performance & Execution: Integration Architecture

Status: Proposed
Date: 2026-08-03
Source specs: `OF-ENG-RPT-006 Report Formats & Content Pack v1.0`, `OF-HR-TT-0826 ALL_ROLES_master_copy.xlsx`
Scope: `apps/opus_admin`, shared Supabase project (`supabase/migrations/`)

---

## 1. Context

`OF-ENG-RPT-006` is presented as a report pack. It is not one. It specifies a complete operating
model: nine roles, their reporting cadence and reader hierarchy, a five-section employee homepage,
per-role daily tasks with definitions of done, daily targets, daily/weekly/monthly report fields
tagged by who fills them and which KPI they feed, weighted per-role KPIs, a four-criteria quarterly
review, an annual review, an assignment format, three operational lists with state machines and
database-enforced gates, an alert matrix with thresholds, and four open questions.

`ALL_ROLES_master_copy.xlsx` is the same model already running by hand. Its own subtitle reads
`OF-HR-TT-0826 - Interim tracker until the admin dashboard is live`, with one sheet per role, a
daily log per person, and a month-end summary. The process is live today in spreadsheets. The
demand is real and the success test is concrete: retire one role's sheet.

The proposal under review was to build a new top-level `Performance & Execution` module containing
Dashboard, Daily Workspace, Tasks, Assignments, Reports, KPIs, Performance Reviews, Goals, Alerts,
Strategy, Analytics and Settings, with a matching set of new tables.

### 1.1 The finding that changes the decision

A code inventory of `apps/opus_admin` shows most of this already exists and was built in the
2026-08-02 migration wave. The spec is not a greenfield brief. It is an integration spec.

| Spec block | Existing implementation | Tables |
| --- | --- | --- |
| Five-section workspace homepage | `src/lib/workspace/` + `app/(admin)/workspace/` | `workspace_preferences`, `workspace_activity_events` |
| Tasks and assignments | `src/lib/work/` | `tasks`, `task_assignments`, `task_dependencies`, `task_activity_events` |
| Today's tasks, daily targets, missed | `src/lib/tracker/` | `tracking_units`, `tracking_cycles`, `tracker_entries`, `tracker_entry_items`, `weekly_summaries` |
| Daily/weekly/monthly report forms | `src/lib/reports/` | `report_template_versions`, `report_obligations`, `report_submissions`, `report_reviews` |
| Quarterly and annual reviews, goals | `src/lib/performance/` | `performance_cycles`, `goal_periods`, `goals`, `performance_reviews`, `review_ratings` |
| Alert delivery | `src/lib/notifications/` | `workflow_events`, `staff_notifications`, `staff_notification_preferences` |
| Staff present vs scheduled | `src/lib/attendance/`, `src/lib/leave/` | `attendance_sessions`, `work_schedules`, `leave_transactions`, `holiday_calendars` |
| Vendor list | marketplace tables | `vendors`, `vendor_memberships` |
| Prospect list | marketplace tables | `inquiries` |
| Client list | OpusPass tables | `couple_accounts`, `invitation_orders` |

Building the proposed module as specified would duplicate nine existing modules. This repeats a
failure mode already recorded three times in this codebase: new screens re-implementing shared
logic instead of composing it.

---

## 2. Decisions

### D1. Performance & Execution is a composition layer, not a new module

`Performance & Execution` ships as a set of surfaces under the existing `workspace/` segment plus a
management reading surface. It owns no task, report, review, attendance or leave tables. It reads
from the modules that own them.

Rationale. The existing boundary rule is Workspace means "my work" and Approvals means "anything
needing authorization". Task ownership already sits in `workspace/work` over `tasks` /
`task_assignments`, with the HR-side surface at `workforce/tasks`. A second module owning tasks
forks that ownership and creates two write paths to the same rows.

Consequence. The vision's `Tasks`, `Assignments`, `Reports`, `Performance Reviews`, `Goals` and
`Daily Workspace` entries are not new builds. They are existing surfaces to be composed into the
five-section homepage in Section 4 of the spec.

### D2. Build the KPI engine. It is the one genuinely missing keystone

Every module listed above produces numbers. Nothing models a KPI as a first-class object that is
calculated once and read by reports, daily targets, reviews and alerts alike. Today:

- `reports/fields.ts` has a `kpi_value` field type carrying an optional `kpiKey?: string`. That key
  is an unconstrained string. It references no table and nothing downstream consumes it.
- `tracker.weekly_summaries.kpi_movement` is free-form jsonb: `[{ name, previous, current, target,
  direction }]`.
- `performance.goal_key_results` has start/target/current values, but it is a key result on a goal,
  not a metric registry.

The spec's binding constraint is explicit: "Every number appears once. A figure shown in a report, a
KPI and a list is the same figure, calculated in one place. Never entered twice." None of the three
mechanisms above satisfies it.

There is significant prior art to reuse rather than reinvent. The `growth` module
(`20260802025720_growth_phase1a_foundations.sql`) already models exactly this shape:

- `growth_metric_definitions`: `code`, `name`, `measurement_unit`, `source_mode`
  (`calculated | manual | hybrid`), `direction`, `aggregation_method`, `calculation_key`,
  `declarative_formula_config jsonb` guarded by a CHECK that forbids executable `sql` / `javascript`
  keys, `data_source_key`, `owner_employee_id`.
- `growth_metric_targets` (target value per period, with a supersede chain) and
  `growth_metric_actuals` (computed results).

Decision: extend this pattern rather than create a parallel `kpis` table.

Correction from implementation. An earlier draft of this record said scoping was missing.
It is not: `growth_metric_targets` already carries `business_unit_id`, `department` and
`employee_id` with a generated `scope_identity`, and already has a full approval and supersede
chain. Three narrower gaps are the real ones.

1. **Weight.** Nothing stores a weight. The spec requires per-role weights summing to 100% that
   produce the KPI score used in reviews.
2. **Weight cannot live on the metric definition**, because the same metric carries different
   weights for different roles. Verified against the source, not assumed: of 59 role KPI
   assignments, 55 are distinct metrics and 4 are reuses. `OpusPass events closed` is worth 20% at
   a target of 2 events to the Operations Supervisor, 30% at 6 events to the Business Development
   Officer, and 20% at 2 events to the Vendor Outreach Officer. `Fixed-cost coverage ratio` and
   `Shoots supported` reuse similarly.
3. **Targets are frequently not a single number.** `= 2 events (= TZS 800,000)` is compound and
   `= 1.0 by Month 6; = 1.5 by Month 12` is time-phased. A schema storing only `numeric` would
   silently drop half of each commitment, so the assignment keeps the verbatim target label
   alongside an optional machine-comparable value.

Implemented as `supabase/migrations/20260803120000_performance_kpi_assignments.sql`:

```
performance_kpi_assignments
  metric_definition_id  -> growth_metric_definitions
  subject_type          check ('employee','department','role')  + exactly-one CHECK
  employee_id / department / role_id
  subject_identity      generated, stable key for the weight invariant
  target_label          text, verbatim from the spec
  target_value          numeric, nullable
  target_comparator     check ('gte','lte','eq','range','qualitative')
  measured_cadence      check ('daily','weekly','monthly','quarterly','yearly')
  weight_bp             integer basis points; per-subject sum enforced = 10000
  effective_from / effective_to / is_active
```

The weight invariant is a `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, so a KPI set is
written as several rows in one transaction and only has to balance at COMMIT. Per-statement
checking would make inserting the first row of any set impossible. An empty set is permitted:
retiring a KPI set is legitimate and an unmeasured subject is not an error.

The discriminated-union shape deliberately mirrors `report_template_assignments` so an employee
does not meet two different mental models for "who does this apply to" between their report
obligations and their KPI set.

Verification. The migration was applied to a throwaway Postgres 15 container and seeded with all
59 real assignments extracted from the spec. All nine roles balance at exactly 10000 bp. Rejection
was confirmed for an unbalanced set (90%), for deleting one KPI out of a balanced set (93%), for a
subject row carrying a foreign key its `subject_type` does not name, and for a numeric comparator
with no target value. It has **not** been applied to any real database.

### D3. Report fields gain `filled_by` and `feeds`

`REPORT_FIELD_TYPES` in `src/lib/reports/fields.ts` currently defines seventeen types
(`short_text, long_text, number, percentage, currency, date, date_range, employee_select,
department_select, project_select, task_select, kpi_value, file, repeatable_list, table, yes_no,
rating`). Every field is author-entered. There is no system-filled concept and no downstream metric
mapping.

The spec's two central columns are exactly these. `Filled by: System` means the dashboard already
knows the answer and shows it for confirmation. `Feeds` names the KPI the number is used to
calculate. Both are now real field properties in the versioned template schema:

```ts
filledBy?: 'employee' | 'system' | 'calculated'   // absent means 'employee'
systemSourceKey?: string    // required when filledBy is 'system'
feedsMetricCode?: string    // growth_metric_definitions.code
```

Changed from the original plan: `feeds` holds the metric **code**, not the row id. `fields` is
jsonb and cannot carry a foreign key either way, and a code survives a restore, reads in a diff,
and can be written by hand when authoring a template. `kpiKey` is deprecated in place rather than
removed, because published template versions are immutable and must keep parsing.

This is what makes the three-minute daily report possible. A field with `filledBy: 'system'`
renders as a value with a Confirm affordance, not an empty input.

**The integrity half matters more than the rendering half.** `cleanContent` is the boundary
between the request and stored content, and it previously took the client's value for every
declared key. Once a field is system-filled, letting the browser supply it would mean the number
exists in two places that can disagree, which is precisely what "every number appears once"
forbids. `cleanContent` now takes system values from an explicit `systemValues` option and from
nowhere else, and a system field with no resolved value is emptied rather than filled from the
request. Failing to an empty box is visible and recoverable; trusting the client is neither.

Two supporting rules follow from the same reasoning:

- `parseFormDefinition` **discards** a field whose `filledBy` is unrecognised, or which claims
  `system` without a `systemSourceKey`, rather than downgrading it to `employee`. Downgrading
  would silently hand a system number back to manual entry, which is the failure this decision
  exists to prevent. This matches how the module already treats an unknown field type.
- `saveDraft` refuses outright while no resolver is wired, returning the new
  `report.system_fields_unavailable` token. A blocked draft is recoverable; a quietly blanked
  figure that someone later reads as real is not.

Backwards compatible by construction: `filledBy` is optional and absent means `employee`, so every
template written before this behaves exactly as it did. Verified by the full suite (1154 tests
passing, 8 new) plus a clean `tsc --noEmit` and `eslint`.

Note that `report_template_versions` is immutable once published, enforced by trigger. Adding these
properties to an existing report is a new template version, not an edit. That is correct and should
not be worked around.

Remaining work for D3: the server-side resolver that maps a `systemSourceKey` to a value, which is
what lifts the `saveDraft` refusal.

### D4. The alert matrix needs a rule evaluator. The notification layer stays a delivery mechanism

The notification subsystem is confirmed as publish-then-fan-out. `emit.ts` takes a caller-supplied
recipient list and writes rows. There is no condition evaluator. The conditions that exist today
(`attendance.gap_detected`, `report.due`) are computed by each module's own cron job, which then
calls `emit`.

The spec's nine alerts are threshold rules over data that lives in five different modules, with
named role recipients and severities:

| Condition | Recipient | Severity |
| --- | --- | --- |
| Complaint open 20 hours | Operations Supervisor | High |
| Enquiry unanswered 90 minutes (09:00-17:00) | Operations Supervisor | High |
| Event within 7 days and not ready | Operations Supervisor and owner | High |
| Payment failed or reversed | Finance Manager and Operations | High |
| Equipment damage or loss logged | Operations Supervisor | Medium |
| No daily report by 18:00 | Operations Supervisor | Medium |
| Cash runway below 2 months | CEO and CSFO | Critical |
| Vendor listed without full verification | CSFO | Critical |
| Customer funds held do not reconcile | CEO and Finance Manager | Critical |

Decision: add a declarative `alert_rules` registry plus one evaluator cron, emitting into the
existing `workflow_events` / `staff_notifications` pipeline. Do not extend the notification layer
into a rule engine and do not scatter nine more bespoke crons across five modules.

Two constraints carry over from the spec and from existing conventions. The complaint alert fires at
20 hours, not 24, because "an alert that arrives at the moment the standard is already broken is a
report, not a warning". Recipients resolve by role, not by employee id, and resolution must consult
`leave_is_on_leave()` so alerts do not route to someone on leave (see Q3).

The `staff_notifications.priority` enum (`critical, high, normal, info`) already covers the spec's
Critical/High/Medium if Medium maps to `normal`.

### D5. Resolve the review rating conflict explicitly

There is a direct contradiction between the spec and the schema.

The spec's quarterly review has four criteria: `Average KPI score for the quarter` at 40% filled by
System, `Quality of work` 25%, `Teamwork and professionalism` 20%, and `Initiative and continuous
improvement` 15%, all filled by Manager, producing an `Overall rating` filled by System.

The schema forbids this. `review_ratings.source` carries:

```sql
source text NOT NULL DEFAULT 'manager'
  CHECK (source IN ('self', 'manager', 'skip_level', 'calibration', 'hr_correction')),
```

with `rated_by_employee_id uuid NOT NULL`, a non-empty `rationale`, and a migration header stating
"THERE IS NO 'system' SOURCE". `performance_reviews.overall_rating` is documented as NULL until a
human sets it, with no default and no computation. This was a deliberate design decision, made to
prevent ratings being derived from activity volume.

Decision: keep the constraint. Do not add a `system` source to `review_ratings`.

Resolution. The KPI score is a **calculated input presented to the manager**, not a rating row. The
quarterly review surface renders the weighted KPI achievement from `performance_kpi_assignments` and metric
actuals as read-only context. The manager enters the three qualitative ratings as `manager`-sourced
rows with rationale, and sets `overall_rating` themselves with the computed weighting shown as a
suggested value. A human remains accountable for the number.

This preserves both the spec's intent (the employee does not retype figures the system already
knows, and the 40/25/20/15 weighting is visible and applied) and the schema's invariant (no rating
is authored by the system, every rating has a named rater and a rationale). If the business insists
the overall be literally system-written, that is a separate decision requiring an explicit migration
and sign-off, and it should not happen as a side effect of this work.

### D6. Drop gamification

The vision proposes levels, achievements, badges, streaks, leaderboards and a monthly winner.

The spec forbids the mechanism this depends on. Section 4, on the Today list: "Ticks are private and
are never counted or reported. The moment they are scored, people tick without doing."

The daily task tick is the only per-task completion signal the Today section produces. A streak, a
level or a leaderboard built on it converts a private honesty signal into a scored one and destroys
the data. The author is explicit and appears to be writing from experience.

Decision: no gamification in this scope. If engagement mechanics are wanted later, they may only be
built on signals that are already scored and reported (submitted reports, KPI actuals), never on the
private tick, and never feeding a review.

### D7. The three lists are surfaces over existing tables, not new tables

All three lists live in the same Supabase project and `public` schema as the workforce tables.
Separation is by table, not by database, so no cross-project reads are required.

- Vendor list: `vendors` + `vendor_memberships`, with existing KYC/BRELA verification.
- Prospect list: `inquiries`. There is no table named `leads` or `prospects`.
- Client list: `couple_accounts` and `invitation_orders`. Delivery readiness fields (guest list
  uploaded, invitations sent, RSVPs received, guests checked in) already exist as OpusPass data.

Two spec rules are database invariants and must be enforced as such, not in a form:

1. **A vendor cannot be listed until verification is complete.** All four items: registration
   number, three portfolio samples, two references actually called, capability confirmed.
   `verification_status` is computed from those items and is not settable by hand. The `Listed on the
   Marketplace` toggle is blocked unless `verification_status = 'verified'`. The spec says
   explicitly: "Enforced in the database, not the form."
2. **A prospect becomes a client only at the moment of payment**, and that action creates the client
   record automatically, carrying owner and source across. There is no button to add a client. This
   matters because if prospects and clients share a list, event counts include people who never
   booked.

A gap check against the current `vendors` schema is required before build: the spec's verification
model (two named references with contacted checkboxes, three portfolio samples, computed
`verification_status` badge) may be stricter than what exists today.

Note also that two identity spines are deliberately separate and co-resident: `public.users` for
couples and vendors, `workforce_employees` for staff. Staff notifications use the latter. Nothing in
this work should merge them.

---

## 3. Open questions

The spec closes with four decisions required before building. Three have a clear technical bearing.

**Q1. Is Saturday a working day? RESOLVED 2026-08-03: yes, a full day, 09:00 to 17:00.**

Both source documents say otherwise and are out of date on this point. OF-ENG-RPT-006 states
"Working day is 09:00-17:00" and raises Saturday as an open question. OF-HR-TT-0826 states "21
weekdays in August 2026 ... Monday to Friday" and notes that Nane Nane falling on Saturday 8th
loses no working day; all nine of its per-role daily logs contain exactly 21 Mon-Fri date rows and
no Saturdays. The staff rota is the authority. Recorded here so the next person does not re-derive
Monday-to-Friday from the specs.

Implemented in `supabase/migrations/20260803140000_saturday_working_day.sql`, written and validated
against a throwaway Postgres, **not applied**.

What flipped for free. The 2026-08-02 modules read
`work_schedules.working_weekdays` rather than hardcoding a week, so a single `UPDATE` to
`'{1,2,3,4,5,6}'` correctly changes `leave_expand_days`, `leave_recompute_availability`,
`tracker_day_state`, `attendance_recalculate_session`, the missing-clock-in detector and the
rostered-shift calendar feed. Verified: with the row updated, the `EXTRACT(ISODOW ...) = ANY
(working_weekdays)` predicate returns true for Saturday and false for Sunday.

What did not follow, and had to be changed:

1. **Two hardcoded leave-day counters**, both outside the new modules. There were **three**
   independent implementations of "how many days does this leave cost", and the two in TypeScript
   would have silently disagreed with the database. `workforce/_lib/leave-days.ts` drives leave
   **balances**; `workspace/_lib/home-schedule.ts` drives the "leave used" figure on Home. Both now
   take the working week as a parameter, defaulting to a single shared `COMPANY_WORKING_WEEKDAYS`
   in the pure `lib/leave/days.ts`, so the three-way disagreement collapses to one definition.
   The database remains authoritative; these are display-side approximations that also cannot see
   public holidays.
2. **Column defaults.** `working_weekdays` defaulted to `'{1,2,3,4,5}'` and
   `standard_weekly_minutes` to 2400 (40h = 5 x 480). Left alone, every schedule created in future
   would silently revert to a five-day week, one new hire at a time. Now `'{1,2,3,4,5,6}'` and 2880.
3. **Saturday's shift.** `shift_templates` carries no weekday, and the seeded 'Standard day' is
   08:00-17:00 while Saturday is 09:00-17:00. A second template is added. It is deliberately **not**
   assigned to anyone: `employee_shift_assignments` is per employee, and inventing company-wide
   assignments inside a migration would create rows nobody chose.

History is deliberately not rewritten. Approved leave spanning a Saturday keeps the `total_days` it
was approved with, because `leave_transactions` is an append-only ledger and re-pricing a past
request would leave a balance that no longer reconciles with the rows that produced it. Saturdays
already worked keep their stored `is_weekend` and their 100% overtime, which has probably already
been paid. Tracker entries already generated as `rest_day` are left alone, and
`tracker_generate_entries` is `ON CONFLICT DO NOTHING` so it will not revisit them. Moving any of
that is a separate, deliberate backfill for payroll and People Ops to decide.

One correction to an earlier draft of this record: there is **no hardcoded 22-working-day divisor**
anywhere in the codebase. Pro-rating uses `standard_daily_minutes` / `standard_weekly_minutes`. The
22-day figure exists only in the spec's prose.

**Q2. Does the Studio Intern's daily report go to the Studio Assistant or the Operations
Supervisor?** This sets `report_template_assignments` recipients and the reader hierarchy.

**Q3. Who receives alerts when the Operations Supervisor is on leave?** The Operations Supervisor is
the named recipient for five of the nine alerts. The Leave module already knows the answer via
`leave_is_on_leave()`. This should be a delegation rule in the alert recipient resolver, not a
manual reassignment.

**Q4. How long are performance records kept after someone leaves?** Affects retention on
`review_ratings`, `report_submissions` and `tracker_entries`. Note that `workspace/access.ts`
already maps `Resigned` to `documents_only` and `Terminated` to `denied`, so the access side is
handled; this question is about deletion, which is different.

**Q5 (added, and this one blocks the KPI seed). There is no job-position registry.** The spec's
nine roles are job positions. The codebase has two things, and neither is that:

- `workforce_roles` is a **permission** role: `slug`, `name`, `permission_keys[]`, `is_system`.
  Live values include `owner`, `admin`, `finance`, `content-editor`, `vendor-success`. Known traps:
  `members_count` is stale, a legacy `editor` role exists beside `content-editor`, and seeded keys
  do not match live keys.
- `workforce_employees.job_title` is **free text** with no constraint and no registry. It cannot be
  a foreign key and will drift (`Ops Supervisor` vs `Operations Supervisor`).

The report engine already resolved this by pointing `report_template_assignments.role_id` at
`workforce_roles`, so `performance_kpi_assignments` follows that convention rather than introducing
a third notion of role. But that means the nine spec positions must exist as `workforce_roles` rows
before any role-scoped KPI set can be seeded, which overloads a permission table with job-position
semantics.

Three options, in my order of preference:

1. Add a `workforce_positions` registry (the nine roles as data), point KPI and report assignments
   at it, and make `job_title` a FK. Correct, and the largest change.
2. Create the nine as `workforce_roles` rows with no `permission_keys`, accepting the overload.
   Cheapest, consistent with the report engine, and muddies an already-muddy table further.
3. Scope KPI sets to employees only and drop role scoping. Avoids the question and guarantees drift
   the first time someone is hired into a role.

This needs a decision before step 2 of the build sequence can seed anything real. It is not visible
in the spec because the spec assumes roles are a first-class thing, and here they are not.

**Q6 (added). Kiswahili labels.** The spec states these are absent and must be written by a native
speaker, not a translation tool, because "a performance form that reads slightly wrong in someone's
first language does more damage than one left in English". The bilingual CMS pattern
(`LocalizedText{en,sw}`, `BilingualField`) already exists in this codebase and should be used, but
the copy itself is a blocker on a person, not on engineering.

---

## 4. Build sequence

Nothing here is a big-bang migration. The sequence is ordered so each step is independently useful.

1. **Answer Q1 to Q5.** Q1 resolved (Saturday is a full working day; migration written, not
   applied). Q3 still blocks the alert recipient resolver. Q5 still blocks the KPI seed.
2. **KPI engine (D2).** Migration written and validated against a throwaway Postgres, not applied:
   `supabase/migrations/20260803120000_performance_kpi_assignments.sql`. Remaining work is the seed
   of 55 metric definitions and 59 assignments, which is blocked on Q5, plus the attainment
   calculation that reads `growth_metric_actuals` against each assignment's target.
3. **Report field properties (D3).** Field schema done: `filledBy`, `systemSourceKey`,
   `feedsMetricCode`, with the client-trust boundary closed in `cleanContent` and `saveDraft`
   failing closed until a resolver exists. Remaining: the system-value resolver, the Confirm
   affordance in the renderer, and new template versions for one role's daily/weekly/monthly forms.
4. **Vertical slice: Operations Supervisor.** Compose the five-section homepage from existing
   modules over the new KPI engine. This role is the richest (eight daily tasks with definitions of
   done, nine daily report fields, and it reads everyone else's dailies), so it exercises the most
   surface. Success test: that person stops using their spreadsheet.
5. **Alert rules (D4).** `alert_rules` registry plus evaluator cron, emitting through the existing
   notification pipeline. Start with the two Medium alerts that depend only on modules already
   built (`No daily report by 18:00`, `Equipment damage logged`).
6. **Remaining eight roles.** Mostly data entry into the KPI registry and template versions, not new
   code, if steps 2 to 4 are right.
7. **The three lists (D7).** Gap-check `vendors` verification against the spec, add the DB-level
   listing gate, and build the prospect-to-client conversion as the only client creation path.
8. **Quarterly review surface (D5).** Weighted KPI context plus manager-authored ratings.

Strategy, Analytics and the automation chain from the original vision are deliberately deferred.
Strategy is largely the existing `Where we are going` section plus an acknowledgement banner, which
is small. Analytics is a reading surface over the KPI engine and cannot be designed before that
engine has real actuals in it.

---

## 5. Consequences

Accepted.

- One new schema concept (`performance_kpi_assignments`), one field-schema extension, one rule registry. Not
  twenty-two new tables.
- The spec's operating model is preserved. The forms are not built literally as forms.
- The existing module boundary and the no-system-ratings invariant both survive.

Costs and risks.

- `report_template_versions` immutability means field-schema changes ship as new versions, with a
  migration path for in-flight submissions.
- The KPI engine takes a dependency on the `growth` module's metric tables, coupling two modules
  that are currently independent. The alternative, a parallel `kpis` table, was rejected as a worse
  violation of "calculated in one place".
- Legacy tables (`workforce_tasks`, `workforce_reports`, `workforce_daily_reports`,
  `md_tracker*`, `workforce_time_punches`, `workforce_leave_requests`) are superseded but not
  dropped. This work does not resolve that and should not silently start.
- The interim spreadsheet stays in use per role until that role's slice ships. Partial migration
  means some people are in two systems at once, which is worse than either. Ship role by role and
  retire each sheet on the day its slice lands.
