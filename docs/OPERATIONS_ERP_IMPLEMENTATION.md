# Operations ERP implementation map

## North star

Operations in `opus_admin` is the canonical workspace for planning, executing,
monitoring, controlling, and auditing OpusFesta's operational delivery. It
coordinates existing event, workforce, vendor, finance, approval, document, and
product systems; it does not fork their sources of truth.

The product test is: can an authorized operator understand what must happen,
who owns it, when it is due, what it needs, whether it is blocked, whether it
was completed correctly, and what evidence proves that?

## Domain boundaries and canonical sources

| Concern | Canonical source today | Operations boundary |
| --- | --- | --- |
| OpusPass events | `wedding_events`, `users`, check-in credentials and admission tables | Reference the event and expose delivery readiness; do not clone event or couple data. |
| Vendor demand and delivery | `inquiries`, `vendors`, `vendor_bookings` | Represent operational dependencies and delivery status; vendors and marketplace bookings remain product truth. |
| OpusStudio demand | `studio_inquiries` | Treat as an upstream requirement only. The former Studio booking/resource lifecycle was deliberately dropped; no current Studio execution record exists. |
| People and teams | `workforce_employees`, roles, departments, reporting lines | Consume identity and team facts. HR records and employee lifecycle remain Workforce. |
| Work | `projects`, `project_members`, `project_milestones`, `tasks`, `task_assignments`, `task_dependencies`, task comments/attachments/activity | Reuse these execution primitives. Operations should add job/work-order linkage, not another task table. |
| Recurring employee chores | `workforce_task_assignments` and generated `workforce_tasks` | Legacy/specialized system still used by Workspace and Tracker. Do not use it as the Operations task model. |
| Workforce availability | `workforce_shifts`, leave, attendance, and `work_calendar()` | Consume availability; operational assignments must not rewrite the employee roster. |
| Approvals | `approval_categories`, `approval_requests`, `approval_request_activity`, approval attachments | Reuse the engine and its personal request-level visibility. Do not create an Operations approval engine. |
| Finance | payment, order, invoice, expense, payout, payroll, and product finance tables | Operations may request or verify a need; Finance owns monetary and accounting truth. |
| Audit | `audit_log`, append-only `task_activity_events`, approval activity, domain event tables | Important Operations transitions must write durable domain history and security audit events where applicable. |
| Documents | domain-specific Storage and attachment registries | Reuse the owning domain's access and signed-URL flow. A general operational record store is not yet established. |
| Studio assets | `studio_assets` | These are CMS media assets, not operational cameras/equipment. They must not be treated as inventory. |

## Current capability matrix

| Capability | State | What exists | Main gap or risk |
| --- | --- | --- | --- |
| Operations navigation | Partial | Operations group, Bookings, editorial routes; Cycle 1 adds Command Center | Editorial moderation is historically grouped under Operations even though it is not operational ERP. |
| Command Center | Foundation implemented | Permission-safe aggregation of OpusPass events, canonical tasks, booking inquiries, and the caller's approvals | Vendor bookings, Studio demand, incidents, resources, readiness, and workload are not yet integrated. |
| Operational jobs | Missing | Several upstream records can originate work | No canonical job that references source records and carries owner/readiness/closure. |
| Work orders | Missing | Rich tasks and projects exist | No meaningful execution unit between a job and its tasks. |
| Tasks | Partial | Canonical project tasks support owners, multiple assignees, dependencies, blockers, lifecycle commands, soft deletion, and append-only activity | Admin recurring assignments and canonical `tasks` coexist. UI and migration history must make their distinct purposes explicit. |
| Executable checklists | Missing | Static planning checklist JSON and task primitives exist | No versioned template/instance/item/evidence workflow for live operations. |
| Scheduling | Partial | Weekly workforce shifts and merged personal work calendar | No operational assignment calendar or resource/team conflict view. |
| Logistics | Missing | None found | Pickup, delivery, dispatch, return, route timing, and evidence are absent. |
| Assets/equipment | Missing | CMS media registries and legacy-dropped Studio resources are not equipment inventory | Availability, reservation, checkout, maintenance, damage/loss, and conflict prevention are absent. |
| Vendors/procurement | Partial | Vendor directory, inquiries, vendor bookings, approval engine, Finance ledgers | No operational requirement/request that hands financial settlement to Finance. |
| Service delivery | Partial | Check-in execution and vendor booking lifecycle expose product-specific delivery | No cross-product delivery requirement/readiness/exception model. |
| Issues/risks/incidents | Missing | Task blockers exist | No structured incident severity, ownership, escalation, resolution, evidence, or root-cause trail. |
| Approvals | Exists | Reusable category-driven engine with personal scoping, attachments, audit durability, and transition tests | Operations-specific request types and entity linkage need design; org detail is intentionally not ambient. |
| Documents | Partial | Domain-specific attachments and signed URL patterns | No job/work-order document linkage or operational evidence contract. |
| Reports/analytics | Partial | General admin dashboard, audit viewer, product analytics, task data | No defended Operations metric catalog or historical job performance. |
| Operations settings/templates | Missing | None found | Job/work-order/checklist defaults and SLA configuration do not exist. |

## Architectural decisions

1. The Operations Command Center is a read model, not a new source of truth.
2. Command Center access is the union of the permissions on each source lane.
   There is no broad permission that silently reveals every lane.
3. Each lane is queried only when authorized, and the pure snapshot builder
   drops rows supplied for disabled lanes as defense in depth.
4. Existing detail workflows remain the mutation boundary. The Command Center
   links into Check-in, My Work, Bookings, and Approvals rather than duplicating
   their commands.
5. `tasks` is the reusable execution task model. `workforce_tasks` remains a
   recurring-assignment compatibility system until its consumers are migrated.
6. An operational job must reference its source with an explicit source type
   and source identifier. It must not copy mutable event/client/vendor fields
   except deliberate audit snapshots.
7. Work orders are not tasks. A work order will own execution scope, lifecycle,
   planned/actual timing, job linkage, responsibility, dependencies, and close
   semantics; tasks are the smaller actions required to complete it.

## Completed cycles

### Cycle 1 — permission-safe Operations Command Center foundation

Goal: establish the real architecture and make the Operations landing page
actionable from canonical records without adding a parallel data model.

Implemented:

- `/operations` Command Center with an operational pulse, prioritized attention
  queue, seven-day delivery horizon, and direct links to owning workflows;
- authorized aggregation of OpusPass events/check-in staffing, canonical open
  tasks/blockers, pending booking inquiries, and approvals waiting on the caller;
- lane-independent failure handling, loading state, empty states, and a
  catastrophic error recovery state;
- server-side permission gating plus a second pure filtering boundary;
- Operations navigation entry;
- corrected the Operations layout gate so a caller with only
  `opuspass.checkin` is no longer shown Check-in in navigation and then rejected
  by the parent layout;
- pure tests for permission derivation, unauthorized row suppression, metrics,
  date windows, closed-task exclusion, and priority ordering.

No schema or migration was added. This was deliberate: all Cycle 1 data already
has a canonical owner.

Verification:

- `npx tsx --test src/lib/operations/command-center.test.ts`: 4/4 pass;
- `npm test` in `apps/opus_admin`: 1,442/1,442 pass;
- `npm run type-check` in `apps/opus_admin`: pass;
- focused ESLint over the new Operations module, route, and updated Operations
  layout: pass. Including the already-modified shared `Sidebar.tsx` surfaces its
  pre-existing `react-hooks/set-state-in-effect` finding in local-storage
  hydration (the same code is present in `HEAD`);
- `npm run build` in `apps/opus_admin`: pass, including dynamic `/operations`;
- real-browser review against the live route: HTTP 200, no browser console
  errors, correct empty/live-data states, working source links, and no
  horizontal overflow at 1440×900 or 1024×900;
- the repository-wide `npm run lint` gate is not currently usable as a clean
  signal: it scans generated `.next-localdb` output and existing editor/hooks
  code, producing 16,021 unrelated errors/warnings. No generated lint findings
  or pre-existing editor issues were changed in this cycle.

## Known integrity and product risks

- There is no operational job, so a single delivery cannot yet connect source,
  work orders, tasks, people, resources, vendors, incidents, and closure.
- `workforce_tasks` and `tasks` can look like duplicates to product code even
  though one is recurring generated chores and the other is project work.
- `studio_inquiries` has no surviving Studio booking/execution model; the old
  Studio booking, resource, quote, contract, payment, and schedule scaffold was
  explicitly dropped. Operations must not revive it blindly.
- Service-role server reads bypass RLS. Every new Operations query needs an
  explicit server authorization and row-scope review before data is returned.
- The generic approval UI intentionally exposes only requests raised by or
  assigned to the caller. An Operations dashboard must preserve that rule.
- Important booking inquiry states are currently editable from a status
  selector. Future job/work-order lifecycles must use explicit commands and
  tested transitions instead of copying that pattern.
- The admin shell is intentionally desktop-only below its supported breakpoint;
  tablet/mobile field execution remains an ERP-level UX gap.

## Deferred items

- New Operations permissions until the first owned, mutating Operations entity
  exists. The read-only Command Center correctly composes source permissions.
- Incident, asset, logistics, procurement, checklist, readiness, and reporting
  schema until an operational job foundation defines their parent and scope.
- Moving editorial content routes out of the historical `/operations` path.
  That is information architecture cleanup, not a prerequisite for core ERP
  integrity.

## Recommended next loop

Implement canonical Operational Jobs end to end.

The slice should:

1. define a job as an Operations-owned execution record that references one
   canonical source (`wedding_event`, `vendor_booking`, `studio_inquiry`, or
   internal work) without copying that source;
2. define and transactionally enforce a small lifecycle such as draft →
   planned → ready → in progress → completed → closed, with blocked/cancelled
   semantics derived during design rather than accepted as arbitrary strings;
3. add explicit read/write/transition permissions and server denial tests;
4. record owner, priority, planned dates, source reference, business context,
   readiness summary, close reason, actual timestamps, and append-only activity;
5. provide searchable/paginated list, create flow, detail page, source drilldown,
   lifecycle commands, loading/empty/error states, and audit history;
6. link existing canonical tasks by adding a constrained job relationship or a
   defensible bridge, without creating a second task table;
7. backfill no synthetic jobs. Existing sources should be discoverable as
   candidates and explicitly adopted into Operations.

Work Orders should follow after Operational Jobs because they need a canonical
parent, authorization scope, and closure boundary.
