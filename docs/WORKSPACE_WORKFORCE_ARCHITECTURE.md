# Workspace vs Workforce: Phase 0 technical specification

Status: revision 4. Signed off. This is the implementation contract for PR A,
PR B and PR C.

Workspace and Workforce are not two modules. They are two perspectives over the
same data.

- **Workspace** answers "what do I need to do today?" Everything is scoped to me.
- **Workforce** answers "how do I manage people?" Everything is team or
  organisation wide.

Same tables. Different gate. Different interface.

---

## 1. Core rules

> Workspace surfaces require an authenticated employee identity and are always
> server-scoped to that employee.
>
> Workforce surfaces require either an applicable Team relationship for the
> requested resource, or an explicit `workforce.*` Org permission.
>
> Navigation visibility never replaces server-side resource authorisation.

| Tier | Meaning | Correct authority |
| --- | --- | --- |
| **Self** | my own records | authenticated employee identity |
| **Team** | my direct or delegated reports | organisation relationships |
| **Org** | organisation-wide administration | explicit permission keys |

```
Self  != permission
Team  != role
Org   == permission
```

### 1.1 Scope is composite, and employee is nullable

A caller is frequently in several tiers at once. A People Ops lead is Self, Team
and Org simultaneously.

Equally, an Org-only administrator may have **no employee row at all**. An owner
short-circuits to the full permission set in `getCallerPermissions()` before any
employee lookup happens, so requiring `employee` would lock a legitimate
administrator out of their own scope object.

```ts
type ScopeTier = 'self' | 'team' | 'org'

type CallerScope = {
  employee: SelfEmployee | null      // null for Org-only administrators
  workspaceAccess: WorkspaceAccess | null  // null when employee is null
  team: TeamScope
  permissions: Set<PermissionKey>    // Org tier; empty for a plain employee
  tiers: Set<ScopeTier>
}
```

Rules:

- `'self'` is in `tiers` only when `employee !== null`.
- Workspace requires `employee !== null`.
- Team scope requires `employee !== null`. No employee row means no org chart
  position, so no reports.
- Org access works with `employee === null`.

```ts
type TeamScope = {
  directReportIds: string[]
  // The three below are reserved for delegation, matrix management and acting
  // cover. Phase 0 ALWAYS returns them empty. Do not treat them as
  // authoritative until the phase that populates them ships.
  descendantReportIds: string[]   // reserved, always [] in Phase 0
  delegatedEmployeeIds: string[]  // reserved, always [] in Phase 0
  actingForManagerIds: string[]   // reserved, always [] in Phase 0
}
```

Management scope, approval authority and data visibility are related but not
identical. A line manager may see attendance for their reports while delegating
leave approval to a peer during their own absence. The delegate approves without
becoming anyone's manager.

**Team membership, Phase 0.** Positive allow-list, never a `!=` exclusion, so a
future status cannot silently join the team:

```ts
const TEAM_MEMBER_STATUSES = ['Active', 'On Leave', 'Onboarding'] as const
```

---

## 2. Identity resolution

### 2.1 The problem

Eleven call sites re-resolve "who am I" by email. Eight skip `escapeLike()`, so
an address such as `john_doe@x.com` pattern-matches other rows:

```
workforce/my-tasks/page.tsx:41          workforce/employees/actions.ts:277
workforce/my-tasks/actions.ts:36        workforce/employees/[id]/record-actions.ts:56
workforce/_lib/queries.ts:772           support/actions.ts:27
_dashboard/queries.ts:185               lib/contribute/profile.ts:36
```

`lib/admin-auth.ts:172` already documents this hazard.

### 2.2 Identity success is separate from access policy

Finding a resigned employee is a **successful** resolution. The person is
identified; their available actions are restricted. Conflating the two makes the
resolver harder to reason about.

```ts
type SelfIdentityResult =
  | { ok: true; employee: SelfEmployee; access: WorkspaceAccess }
  | { ok: false; error: 'UNAUTHENTICATED' | 'EMPLOYEE_NOT_LINKED' | 'AMBIGUOUS_IDENTITY' }
```

`EMPLOYEE_INACTIVE` is removed. It reappears only if a future status denies
access outright while still resolving an identity, and even then `denied` in
`WorkspaceAccess` expresses it better.

Two questions, two answers:

- **Identity:** who is this?
- **Access:** what Workspace experience do they get?

Copy for each failure, so nobody sees a stack trace or a bare 403:

| Error | Message |
| --- | --- |
| `UNAUTHENTICATED` | redirect to sign in |
| `EMPLOYEE_NOT_LINKED`, caller has Org keys | "Your account has dashboard administration access but is not linked to an employee profile. Workspace features are unavailable." |
| `EMPLOYEE_NOT_LINKED`, no Org keys | "Your employee profile has not been activated. Contact your administrator." |
| `AMBIGUOUS_IDENTITY` | "We found more than one employee profile for your account. Contact People Ops." Fails closed, writes an audit event. |

### 2.3 Email matching needs a schema fix first

The review asked for normalised exact equality instead of `ILIKE`. Correct, but
it cannot be done as written today.

`workforce_employees.email` is `text NOT NULL UNIQUE`
(`20260512000004_workforce_module.sql:84`). That is a **case-sensitive** unique
constraint, so `alice@x.com` and `Alice@x.com` can both exist as separate rows.
That is exactly why the existing code reaches for `ILIKE`, and it is also a
live source of `AMBIGUOUS_IDENTITY`.

`workforce_invitations` already models the fix correctly, with a unique index on
`lower(email)` at `20260514213347_workforce_dashboard_access.sql:87`.

Phase 0, in order:

1. **Blocking preflight audit** for case-variant duplicates, before anything is
   written.
2. Normalise `email` to lowercase on `workforce_employees`.
3. Add `UNIQUE` on `lower(email)`.
4. Switch every lookup to exact equality on the normalised value.

**The preflight is blocking, not advisory.** Steps 2 and 3 do not run while any
case-insensitive duplicate exists. No automatic merge, no lowercasing of
conflicting rows, no guessed correction. The migration must never assume the
lowercase spelling belongs to the currently active employee.

Audit output, one row per conflict pair:

```
employee_id, full_name, email, status, dashboard_access, clerk_user_id,
conflict_employee_id, conflict_full_name, conflict_email,
conflict_status, conflict_dashboard_access, conflict_clerk_user_id
```

Case variants must also be checked in the surrounding tables, since a conflict
resolved only in `workforce_employees` can leave an orphaned login or a stale
grant behind:

- `workforce_invitations` (pending invitations)
- `workforce_employees.dashboard_access` and `clerk_user_id` (Clerk-linked logins)
- `workforce_role_members` (role assignments)
- `admin_whitelist` (legacy rows still cleaned by the trigger at
  `20260514213347:162`)

Migration behaviour:

| Conflicts found | Behaviour |
| --- | --- |
| 0 | normalise, add the `lower(email)` unique index, continue |
| 1 or more | **stop**, emit the remediation report, require a People Ops decision |

People Ops decides which record is canonical and whether the pair is merged,
corrected or unlinked. That decision cannot be delegated to the migration.

`escapeLike()` remains available and is still required anywhere the query
interface forces pattern matching. The intended rule is:

> Normalised exact email match. Never semantic or partial matching.

### 2.4 Identity repair, concurrency safe

`clerk_user_id` is already `text UNIQUE`
(`20260514213347_workforce_dashboard_access.sql:33`), so it is a safe primary
identity key.

1. Look up by `clerk_user_id`. Done if found.
2. Fall back to normalised exact email.
3. If exactly one match with a **linkable** status, persist `clerk_user_id`.
4. All later lookups use the stable identifier.

Two concurrent requests can both reach step 3 before either writes. The unique
constraint prevents corruption, but the application must handle the race
cleanly, so the write is conditional and its result is checked:

```sql
UPDATE workforce_employees
   SET clerk_user_id = :clerkUserId
 WHERE id = :employeeId
   AND clerk_user_id IS NULL;
```

Zero rows affected means someone else won. Re-resolve by `clerk_user_id` and
proceed. If that lookup also fails, return `AMBIGUOUS_IDENTITY` rather than
guessing.

**Linkable statuses.** Positive allow-list, matching `TEAM_MEMBER_STATUSES`:

```ts
const LINKABLE_STATUSES = ['Active', 'On Leave', 'Onboarding'] as const
```

`Resigned` is never auto-linked. Do not auto-link when there are multiple
matches or when the Clerk email is unverified.

Every successful repair writes an audit event
(`workforce.identity_linked`, source `verified_email_fallback`).

### 2.5 Workspace access states

```ts
type WorkspaceAccess = 'full' | 'read_only' | 'documents_only' | 'denied'
```

The `status` CHECK constraint (`20260512000004_workforce_module.sql:95`) allows
exactly four values today:

| `status` | Access | Rationale |
| --- | --- | --- |
| `Active` | `full` | normal case |
| `On Leave` | `full` | must still see own leave, payslips, documents |
| `Onboarding` | `full` | needs tasks and documents before day one |
| `Resigned` | `documents_only` | payslips and letters stay reachable; no clock in, no new requests |

`read_only` and `denied` have no status mapping in Phase 0. They exist so that
suspension and termination, when People Ops needs them, are a new `status` value
plus a row here rather than a redesign. The resolver is written against
`WorkspaceAccess`, never against `status`.

### 2.6 Navigation by access state

A `documents_only` employee must not see the full Workspace tree and then hit
blocked pages. Navigation is built from access state:

| Access | Visible Workspace items |
| --- | --- |
| `full` | all items |
| `read_only` | Home, My Reports (history), Calendar, Documents |
| `documents_only` | Home, Documents |
| `denied` | no Workspace navigation |

The server enforces the same policy independently. Navigation is a convenience,
never the gate.

### 2.7 The IDOR invariant

> **No public Workspace query or mutation accepts an `employee_id`.**

```ts
// correct
export async function getMyLeaveRequests() {
  const employee = await requireSelfEmployee()
  return db.leaveRequests.findMany({ where: { employeeId: employee.id } })
}

// forbidden at a route boundary, even when the UI always passes the right id
export async function getMyLeaveRequests(employeeId: string) { ... }
```

Internal helpers below the boundary may take an `employeeId`. The boundary may
not. Applies to server actions, route handlers, file downloads, document
previews, export endpoints, attendance corrections, leave cancellation, report
create/edit/delete, and tracker writes.

### 2.8 Query parameters never grant authority

> `?scope=team` is a **presentation preference only**.

The server derives `directReportIds` independently and ignores any
client-supplied scope. The same holds for `?employeeId=`, `?managerId=` and
`?departmentId=`: they may **narrow** an already-authorised result set. They can
never widen it.

---

## 3. Permission catalogue

### 3.1 The problem being fixed

One key, `workforce.read`, gates Employees, Tasks, Schedule, Reports,
Performance, Leave, Timesheets and the Daily Tracker. There is no way to express
"approves leave but cannot see salaries".

Worse, two seeded roles do not hold it:

| Role | Departments mapped to it | Has `workforce.read`? |
| --- | --- | --- |
| `content-editor` | Marketing & Partnership, Content/Brand/Social, UI & UX Design | no |
| `vendor-success` | Operations, Studio | no |

Both sit behind `workforce/layout.tsx:13`, which redirects without
`workforce.read`. Since `My Tasks` and `Daily Tracker` live under
`/workforce/*`, every Designer, Marketing, Content, Operations and Studio
employee is locked out of their own task list and tracker today. Five of nine
departments.

### 3.2 Granular keys

Added to `PERMISSIONS` in `workforce/_lib/types.ts` and `ALL_PERMISSION_KEYS` in
`lib/admin-auth.ts` (duplicated on purpose to avoid an import cycle; must stay
in sync).

**People**

| Key | Grants |
| --- | --- |
| `workforce.employees.read` | Directory and profile basics |
| `workforce.employees.write` | Create and edit employee profile basics |
| `workforce.employee_records.read` | Resume, skills, certifications, badges |
| `workforce.employee_records.write` | Edit the above |
| `workforce.employee_documents.read` | Documents, subject to sensitivity class |
| `workforce.employee_documents.write` | Upload, review, approve documents |
| `workforce.employee_documents.legal` | Additionally unlocks `legal_confidential` |

**Roles**

| Key | Grants |
| --- | --- |
| `workforce.roles.read` | Inspect roles, members and the permission matrix |
| `workforce.roles.write` | Create, duplicate, edit, archive role definitions |
| `workforce.roles.assign` | Assign and revoke roles for members |

**Time**

| Key | Grants |
| --- | --- |
| `workforce.leave.read` | Org-wide leave register and calendar |
| `workforce.leave.approve` | Approve or reject any request, org wide |
| `workforce.leave.admin` | Policies, balances, manual adjustments |
| `workforce.attendance.read` | Org-wide attendance and exceptions |
| `workforce.attendance.approve` | Approve corrections and missing punches |
| `workforce.attendance.admin` | Attendance policy configuration |
| `workforce.scheduling.read` | Rosters, shift plans, holiday calendars |
| `workforce.scheduling.write` | Publish rosters, edit shifts, availability |
| `workforce.timesheets.read` | Org-wide timesheets |
| `workforce.timesheets.approve` | Sign off submitted timesheets |

**Work**

| Key | Grants |
| --- | --- |
| `workforce.tasks.read` | Org-wide task assignments |
| `workforce.tasks.assign` | Create, edit, reassign, cancel, reopen org-scoped assignments |
| `workforce.report_templates.write` | Maintain report form templates |
| `workforce.reports.read` | Turnover, headcount, attendance analytics |

**Talent**

| Key | Grants |
| --- | --- |
| `workforce.performance.read` | Reviews, objectives, KPIs |
| `workforce.performance.write` | Create review cycles, edit objectives |
| `workforce.recruitment.read` | Jobs and candidate pipelines |
| `workforce.recruitment.write` | Post jobs, move candidates, make offers |

`workforce.payroll` is unchanged. Splitting it into `.read` / `.write` /
`.export` is deferred.

### 3.3 Task semantics

`workforce.tasks.assign` covers create, edit, reassign, cancel and reopen for
**organisation-scoped** assignments.

- Completing your own task is Self-scoped and requires **no** key.
- Completing a task **on behalf of** another employee requires
  `workforce.tasks.assign`, and is audited.

Managers receive Team-scoped task authority over **direct reports only**.
Existing department-wide behaviour in `workforce/_lib/task-scope.ts` must be
reviewed and narrowed where it exceeds `directReportIds`. Organisation-wide or
department-wide task management requires `workforce.tasks.assign`.

| Authority | Scope |
| --- | --- |
| Self | complete and update own tasks |
| Team | manage tasks for direct reports |
| Org | manage organisation-wide tasks, via `workforce.tasks.assign` |

Within Team scope a manager may create, edit, reassign, reopen, cancel and view
progress on tasks for direct reports. They may not touch other employees in the
same department.

**This narrows live behaviour.** `getCallerScope()` in `task-scope.ts:42`
returns `{ canAssignAll: false, department }` to anyone with at least one
non-Resigned direct report, and `tasks/page.tsx:30-38` then scopes the
assignable-employee list to that whole department.
Any lead who assigns across their department today will lose that reach unless
granted `workforce.tasks.assign`. PR A must list affected managers from
production so People Ops can grant the key where it is genuinely needed, rather
than discovering the loss after deploy. If department reach turns out to be
operationally necessary for particular leads, model it later as explicit
delegated or department authority, never as an implicit side effect of having
one report.

`Team Tasks` appears in the manager navigation (revision 2 omitted it, which was
an error).

### 3.4 Document sensitivity classes

`workforce_employee_documents.doc_type` already exists. Phase 0 adds a
`sensitivity` column. Access is a two-factor decision: the permission key says
*whether* you can read documents, the class says *which*.

Renamed from revision 2, because "employee_visible" wrongly implies "employee
only" when the manager and People Ops can also see it:

| Class | Who can read |
| --- | --- |
| `shared_with_employee` | the employee, their direct manager, `employee_documents.read` |
| `manager_confidential` | direct manager (Team scope), `employee_documents.read` |
| `people_ops_confidential` | `workforce.employee_documents.read` |
| `payroll_confidential` | `workforce.payroll` |
| `legal_confidential` | `workforce.employee_documents.read` **and** `workforce.employee_documents.legal` |
| `restricted` | owner only. Mandatory reason. Mandatory audit event. |

Existing rows default to `people_ops_confidential`, so the migration cannot
widen access. Reclassification is a deliberate People Ops action, audited.

`restricted` is enforced by an explicit rule in one place, never by an
`if (role === 'owner')` scattered through document code. A
`workforce.employee_documents.restricted` key is **deferred**: today the only
intended reader is the owner, and adding an unused key invites it being granted
casually. It arrives when compliance genuinely needs a non-owner reader.

Workspace Documents (Phase 6) reads exactly the `shared_with_employee` slice.

### 3.5 Reviewed legacy expansion

`workforce.read` and `workforce.write` are kept and expand automatically, so no
existing role breaks. The expansion is a **reviewed table**, not "every key",
derived by enumerating every existing gate: 51 references to the legacy keys, of
which 49 are live gates (45 on `workforce.write`, 4 on `workforce.read`) and 2
are comments. Compatibility must prevent loss of access without granting new
authority.

`workforce.read` expands to:

```
employees.read, employee_records.read, leave.read, attendance.read,
scheduling.read, timesheets.read, tasks.read, performance.read,
recruitment.read, reports.read, roles.read
```

`workforce.write` expands to everything in `workforce.read` plus:

```
employees.write, employee_records.write, employee_documents.read,
employee_documents.write, leave.approve, leave.admin, attendance.approve,
attendance.admin, scheduling.write, timesheets.approve, tasks.assign,
performance.write, recruitment.write, report_templates.write
```

Deliberately **excluded**:

| Key | Why |
| --- | --- |
| `workforce.roles.write` | Roles actions never gated on `workforce.write`. See 3.6. |
| `workforce.roles.assign` | Same. |
| `workforce.employee_documents.legal` | New authority. Never granted implicitly. |
| `workforce.payroll` | Already independent; unchanged. |

`roles.read` **is** included: the sidebar already shows the Roles link to
`workforce.write` holders, so read-level inspection preserves today's visibility
while the write and assign gates tighten.

Evidence for inclusions: `requirePermission('workforce.write')` currently guards
`employees/actions.ts`, `employees/[id]/record-actions.ts` (20 call sites,
covering records and documents), `leave/actions.ts`, `schedule/actions.ts`,
`timesheets/actions.ts`, `recruitment/actions.ts` and
`report-templates/actions.ts`.

Expansion happens in TypeScript, in a pure `expandLegacyPermissions(keys)`
applied inside `getCallerPermissions()` after the RPC returns. Deliberately not
inside `workforce_permissions_for_employee`, so no migration is needed for
compatibility and the Roles matrix keeps rendering
`workforce_roles.permission_keys` verbatim.

### 3.6 The Roles authorisation leak

Roles is the one place where the sidebar gate and the action gate disagree.

The sidebar gates the link on `workforce.write`. The actions do not:

```
roles/actions.ts:43   requireAdminRole(['owner', 'admin'])
roles/actions.ts:145  requireAdminRole(['owner'])
roles/actions.ts:262  requirePermission('platform.admin')
```

`people-ops` can edit roles today, and the authority comes from
`legacyRoleBucket` promoting them to `admin` because they hold
`workforce.payroll`. The legacy bucket is a live authorisation mechanism.

**Production data escalates this from a design flaw to a live vulnerability.**

`legacyRoleBucket` maps *every* seeded role in use to `owner` or `admin`,
because `WRITE_KEYS` catches them all:

| Role | Members | Key that trips `WRITE_KEYS` | Bucket |
| --- | --- | --- | --- |
| `owner` | 1 | slug match | `owner` |
| `admin` | 3 | slug match | `admin` |
| `content-editor` | 3 | `cms.write`, `cms.publish` | **`admin`** |
| `vendor-success` | 1 | `vendor.moderate` | **`admin`** |
| `finance` | 1 | `workforce.payroll` | **`admin`** |
| `people-ops` | 1 | `workforce.payroll` | **`admin`** |

All 10 employees holding a dashboard role bucket to `owner` or `admin`. Every
role-mutating server action gates only on that bucket:

```
roles/actions.ts:43   createRole              requireAdminRole(['owner','admin'])
roles/actions.ts:74   updateRolePermissions   requireAdminRole(['owner','admin'])
roles/actions.ts:101  duplicateRole           requireAdminRole(['owner','admin'])
roles/actions.ts:165  setRoleMembers          requireAdminRole(['owner','admin'])
```

Server actions are POST endpoints. The `workforce.read` redirect in
`workforce/layout.tsx:13` protects the *page render*, not the *action
invocation*. A Content Editor cannot open `/workforce/roles`, but nothing stops
them invoking `updateRolePermissions` directly with an action id lifted from the
route's JavaScript chunk, which is served without permission checks.

So four users whose roles grant **zero** workforce permissions can currently
grant themselves `platform.admin`. This is pre-existing and unrelated to the
Workspace split; the split merely surfaced it.

**Recommendation: fix this as a standalone hotfix before PR A**, rather than
letting it wait behind a large refactor. See section 13.

Phase 0 fixes both halves:

1. `roles.write` and `roles.assign` are excluded from the legacy expansion.
2. Roles actions migrate onto `requirePermission('workforce.roles.*')`, gated by
   operation: page load needs `roles.read`, editing a permission bundle needs
   `roles.write`, assigning a member needs `roles.assign`. Destructive
   operations keep `requireAdminRole(['owner'])` as belt and braces.

Splitting write from assign matters because People Ops may reasonably assign
an approved role without being able to change what that role contains.

> Permission keys authorise actions. Legacy role buckets only support old shell
> and routing behaviour, never authorisation.

### 3.7 `legacyRoleBucket` must learn the new keys

`lib/admin-auth.ts:70` buckets custom roles via a `WRITE_KEYS` set. Without an
update, a role holding only `workforce.leave.approve` buckets to `viewer`. Add:

```
workforce.employees.write, workforce.employee_records.write,
workforce.employee_documents.write, workforce.employee_documents.legal,
workforce.leave.approve, workforce.leave.admin,
workforce.attendance.approve, workforce.attendance.admin,
workforce.scheduling.write, workforce.timesheets.approve,
workforce.tasks.assign, workforce.performance.write,
workforce.recruitment.write, workforce.report_templates.write,
workforce.roles.write, workforce.roles.assign
```

### 3.8 Role assignment must not become an escalation path

Splitting `roles.assign` from `roles.write` opens a hole if assignment is
unconstrained: People Ops cannot grant `platform.admin` directly, but could
assign a role that already contains it. The indirect path has to be closed
explicitly.

A pure containment rule is the obvious fix and it is wrong here:

```ts
// too restrictive: assignment is precisely People Ops' job
canAssign = isOwner || role.permissionKeys.every((k) => caller.permissions.has(k))
```

People Ops legitimately assigns roles granting things they do not personally
hold. So the control is role metadata, plus a hard rule that stops the metadata
being used to smuggle escalation.

**Role metadata.** One new column on `workforce_roles`:

```sql
assignment_tier text NOT NULL DEFAULT 'admin_or_owner'
  CHECK (assignment_tier IN ('owner_only', 'admin_or_owner', 'delegated'))
```

The default is deliberately the restrictive middle value, so a role created
without thought is not assignable by People Ops.

| Who | May assign |
| --- | --- |
| Owner | any role |
| Admin with `roles.assign` | `admin_or_owner` and `delegated`. Never `owner_only`. |
| `roles.assign` holder, e.g. People Ops | `delegated` only |

Seeded roles:

| Role | `assignment_tier` |
| --- | --- |
| `owner` | `owner_only` |
| `admin` | `owner_only` |
| `people-ops` | `admin_or_owner` |
| `finance` | `admin_or_owner` |
| `content-editor` | `admin_or_owner` |
| `vendor-success` | `admin_or_owner` |
| `viewer` | `delegated` |
| `employee` | `delegated` |

**The hard rule.** Metadata alone is not enough, because someone with
`roles.write` could mark a dangerous custom role `delegated`. So a role
containing any escalation-sensitive key can never be `delegated`, enforced in
the database rather than in application code:

```
platform.admin
workforce.roles.write
workforce.roles.assign
workforce.payroll
workforce.employee_documents.legal
finance.write
opuspass.couples.delete
```

A trigger on `workforce_roles` raises the tier to `admin_or_owner` whenever one
of these keys is added, and rejects a direct downgrade to `delegated` while one
is present. Editing a role's permissions can therefore change who may assign it,
which is the correct coupling.

**Two further rules:**

- Nobody may assign a role at a tier above their own, including to themselves.
- Every assignment and revocation writes `workforce.role_member_assigned` or
  `workforce.role_member_removed`.

> `roles.assign` grants the authority to place people into **approved** roles.
> It never grants the authority to widen what a role means, directly or
> indirectly.

### 3.9 New seeded role: `employee`

```
slug            employee
name            Employee
description     Baseline dashboard eligibility. Personal Workspace only.
                No organisation-wide Workforce access.
permission_keys []
is_system       true
```

Zero **Workforce** keys. It establishes baseline dashboard eligibility; it does
not prohibit stacking. An employee may additionally hold `support.read`,
`commissions.design`, `growth.write` or anything else via
`workforce_role_members`. The role means "no org-wide people management", not
"sees nothing else".

Buckets to `viewer` (no write keys), which is in `ADMIN_DASHBOARD_ROLES`, so the
shell loads and `/workspace/*` is reachable.

---

## 4. The Workforce shell

```
Workforce shell opens when:  hasAnyWorkforcePermission || hasTeamScope
```

Managers enter and see only manager-relevant navigation, scoped to their
reports. Organisation-wide pages stay hidden without an explicit Org permission.

Team scope is resource-scoped: it authorises actions on your own reports and
nobody else, enforced server side against `directReportIds`, never against a
route param.

**Landing behaviour at `/workforce`:**

| Caller | Behaviour |
| --- | --- |
| Team scope only | redirect to `/workforce/team` |
| Org permission | organisation Workforce Overview |
| Team and Org | organisation Overview, with My Team shortcuts |

This avoids one page carrying two unrelated information architectures.

### 4.1 Segregation of duties

A record-level rule that overrides Org permission:

```ts
if (request.employeeId === caller.employee?.id) rejectSelfApproval()
```

Nobody approves their own leave, their own attendance correction or their own
timesheet, **even holding an org-wide approval key**. Any owner override, if one
is ever added, requires a reason and an audit event.

---

## 5. Navigation

`[exists]` ships already. `[move]` relocates. `[new]` is net new.

### 5.1 Plain employee, access `full`

```
Dashboard
Workspace
    Home                                         [new]     /workspace
    Time Clock                                   [move]    /workspace/time-clock
    My Leave                                     [new]     /workspace/leave
    My Tasks                                     [move]    /workspace/tasks
    My Reports                                   [move]    /workspace/reports
    My Tracker                                   [move]    /workspace/tracker
    Calendar                                     [new]     /workspace/calendar
    Documents                                    [new]     /workspace/documents
```

No Workforce section. The `My` prefixes stay: the app has organisation-wide
Reports, Tracker and Leave elsewhere, so dropping them would make two different
things share a label. Reduced trees for other access states are in 2.6.

### 5.2 Manager, Team scope only, no Org keys

```
Workspace                                        (as above)
Workforce
    My Team                                      [new]     /workforce/team
    Leave Approvals                              [new]     /workforce/leave?scope=team
    Team Attendance                                        /workforce/leave (attendance tab)
    Team Timesheets                                        /workforce/timesheets
    Team Tasks                                             /workforce/tasks
    Team Performance                                       /workforce/performance
```

No Overview, no Employees, no Scheduling, no Recruitment, no Roles. The tree is
built **from** scope, not filtered after the fact, so there are no
access-denied screens. `?scope=team` is presentation only (2.8).

### 5.3 Org, for example People Ops

```
Workspace                                        (as above)
Workforce
    Overview                     any workforce.* [new]     /workforce
    My Team                      team | employees.read [new] /workforce/team
    Employees                    employees.read  [exists]  /workforce/employees
    Leave & Attendance           leave.read      [exists]  /workforce/leave
    Scheduling                   scheduling.read [exists]  /workforce/schedule
    Timesheets                   timesheets.read [exists]  /workforce/timesheets
    Tasks                        tasks.read      [exists]  /workforce/tasks
    Performance                  performance.read[exists]  /workforce/performance
    Tracker Dashboard            md_tracker.review [split] /workforce/tracker
    Recruitment                  recruitment.read[exists]  /workforce/recruitment
    Reports                      reports.read    [exists]  /workforce/reports
    Report Templates             report_templates.write [exists] /workforce/report-templates
    Roles                        roles.read      [exists]  /workforce/roles
```

`My Team` shows direct reports with attendance status, upcoming leave,
outstanding reports, timesheets awaiting approval, performance actions, contract
alerts and profile links.

Nested sidebar grouping (People / Time / Work / Talent) is **deferred to Phase
4**. The sidebar already supports one nesting level via `CMS_GROUP`
(`Sidebar.tsx:286`); the list is not long enough yet.

`/workforce/leave` keeps its short URL with Attendance as an internal tab.

### 5.4 Route moves and redirects

| From | To |
| --- | --- |
| `/me/timeclock` | `/workspace/time-clock` |
| `/me/reports` | `/workspace/reports` |
| `/workforce/my-tasks` | `/workspace/tasks` |
| `/workforce/daily-tracker` | `/workspace/tracker` |

308 permanent, **preserving query strings**:

```
/me/reports?type=monthly            -> /workspace/reports?type=monthly
/workforce/daily-tracker?week=...   -> /workspace/tracker?week=...
```

Hash fragments survive client side; query strings do not unless forwarded
explicitly. Phase 2 audits server actions and form targets hardcoding old paths.
Known: `me/timeclock/actions.ts` calls `revalidatePath('/me/timeclock')` and
`revalidatePath('/workforce/timesheets')`.

Also flagged for Phase 2: `me/reports/actions.ts:104` and `me/reports/page.tsx:90`
call `hasPermission('workforce.write')` from a personal page to decide whether
the caller may write reports for others. Same entanglement in miniature; becomes
an explicit scope check.

### 5.5 The Tracker split

- `/workspace/tracker` writes your own engine's entries.
- `/workforce/tracker` is the cross-engine review board, `md_tracker.review`.

**Permission is capability; engine assignment is resource scope. Both are
required.** `md_tracker.<engine>.write` says the caller may write tracker
entries, not which engine's. Every write additionally verifies:

- the caller is assigned to that engine (`md_employee_ids` or
  `acting_md_employee_id`)
- the entry falls in the correct reporting period
- the entry is not locked by review sign-off unless explicitly reopened
- the engine id comes from the resolved assignment, never from the client

---

## 6. Role matrix

Workspace omitted: every row gets it, subject to 2.5.

| Role | Employees | Records | Documents | Leave | Attendance | Sched | Timesheets | Tasks | Perf | Recruit | Payroll | Roles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `owner` | write | write | write + legal | admin | admin | write | approve | assign | write | write | yes | read/write/assign |
| `admin` | write | write | write | admin | admin | write | approve | assign | write | write | yes | read/write/assign |
| `people-ops` | write | write | write | admin | admin | write | approve | assign | write | write | yes | read + assign (`delegated` tier only) |
| `finance` | read | none | none | read | read | none | read | none | none | none | no | none |
| `content-editor` | none | none | none | none | none | none | none | none | none | none | no | none |
| `vendor-success` | none | none | none | none | none | none | none | none | none | none | no | none |
| `viewer` | read | read | none | read | read | read | read | read | read | read | no | read |
| `employee` (new) | none | none | none | none | none | none | none | none | none | none | no | none |
| *manager (derived)* | own reports | own reports | shared + manager_confidential, own reports | approve own reports | own reports | none | approve own reports | own reports | own reports | none | no | none |

The manager row is not a role. It is Team tier layering on the person's existing
role.

`people-ops` gains `roles.assign` but loses `roles.write`: they may put people
into approved roles without redefining what those roles grant. Compared with
today's accidental full access via `legacyRoleBucket`, this is a deliberate
reduction.

---

## 7. Seeded role migration

The migration backfills seeded roles so the Roles matrix reflects reality. It
must ship with this preview table filled in and reviewed:

Live `workforce_roles` as at 2026-07-31, read from production. Note that the
stored keys have **drifted from the seed migration**: `admin` and `owner` have
gained the growth, tracker and OpusPass keys, and `finance` has gained
`workforce.payroll` and `growth.write`, none of which are in
`20260512000004`. The backfill must be written against these values, not
against the migration source.

| Role | Members | Legacy workforce keys stored today | After backfill | Effective access changed? |
| --- | --- | --- | --- | --- |
| `owner` | 1 | `read`, `write`, `payroll` | granular, plus `roles.*` | no |
| `admin` | 3 | `read`, `write`, `payroll` | granular, plus `roles.*` | no |
| `people-ops` | 1 | `read`, `write`, `payroll` | granular, `roles.read` + `roles.assign` | **yes: loses `roles.write`** |
| `finance` | 1 | `read`, `payroll` | `*.read`, `payroll` | no |
| `content-editor` | 3 | none | none | no |
| `vendor-success` | 1 | none | none | no |
| `viewer` | 0 | `read` | `*.read` | no |
| `editor` | 0 | none | none | no |
| `author` | 0 | none | none | no |
| `employee` | n/a, new | n/a | `[]` | n/a |

`workforce_role_members` holds 4 additional grants (2 × `finance`, 2 × `admin`)
which the backfill must not disturb.

Two roles are redundant: `editor` and `content-editor` carry identical keys and
both have zero members via `dashboard_role_id`. Consolidating them is out of
scope here but worth a follow-up.

Three distinct things, not to be conflated:

- **Compatibility expansion** protects old roles at runtime.
- **Backfilling seeded roles** makes the stored keys match the UI.
- **Custom roles are never silently rewritten.** They keep their legacy keys and
  continue working through expansion until People Ops migrates them by hand.

---

## 8. Audit events

Phase 0 records:

```
workforce.identity_linked                 info
workforce.identity_link_failed            warn
workforce.ambiguous_identity_detected     critical
workforce.role_created                    info
workforce.role_updated                    warn
workforce.role_permission_added           warn
workforce.role_permission_removed         warn
workforce.role_member_assigned            warn
workforce.role_member_removed             warn
workforce.restricted_document_viewed      critical
workforce.document_sensitivity_changed    warn
workforce.owner_destructive_role_action   critical
workforce.self_approval_rejected          warn
```

`recordAuditEvent({ eventType, severity, ... })` in `lib/audit-log.ts` already
takes a free-form dotted `eventType`, so these need no schema change.

`legacy_permission_expansion_applied` is deliberately **not** an audit event. It
would fire on essentially every request and flood the table. Instead:

- expose it in structured authorisation diagnostics (the existing
  `console.error` path in `requirePermission`)
- show legacy-derived permissions distinctly in the Roles UI
- audit only when an administrator migrates or modifies the stored role

---

## 9. Test matrix, by delivery boundary

Every row is a test. Split by PR, because several rows depend on routes and
navigation that do not exist until PR B and PR C.

### 9.0 Test strategy, and a constraint the codebase imposes

The admin app runs `tsx --test` over `src/**/*.test.ts`
(`apps/opus_admin/package.json:10`). There is no Vitest, no local Supabase stack
(`supabase/config.toml` does not exist), and no integration harness. All twelve
existing test files are pure unit tests over `src/lib`.

So a test matrix written as "manager cannot see peers" is not directly runnable
today: it needs a database, and there is nowhere to stand one up.

**This is a design constraint, not just a tooling gap, and the fix improves the
code.** Authorisation decisions must be written as pure functions over injected
data, with thin adapters doing the fetching. That makes the great majority of
9.1 runnable under the existing runner with no new infrastructure:

```ts
resolveWorkspaceAccess(status): WorkspaceAccess
expandLegacyPermissions(keys): Set<PermissionKey>
legacyRoleBucket(slug, keys): AdminAccessRole
deriveTeamScope(rows): TeamScope
canAssignRole(caller, role): boolean
isEscalationSensitive(keys): boolean
visibleDocuments(docs, viewer): Document[]
isSelfApproval(record, caller): boolean
canManageTask(task, scope): boolean
```

Each takes plain data and returns a decision. The Supabase call sites become
dumb fetchers with no policy in them, which is where the policy should not have
been in the first place.

Rows that genuinely need a database, chiefly the preflight audit, the
normalisation migration and the `assignment_tier` trigger, are marked
**[db]** below. They run against a Supabase branch, not the developer's machine,
and they gate PR A rather than blocking its authorship.

### 9.1 PR A, authorisation foundation

No routes, no navigation. Everything here is resolver, permission and data
layer, testable without the Workspace shell.

**Identity resolution**

- employee sees only their own records
- a mutation receiving another employee's id is rejected at the boundary
- admin with no employee profile gets `EMPLOYEE_NOT_LINKED`, admin copy
- admin with no employee profile still receives a valid Org-only `CallerScope`
- normal user with no employee profile gets `EMPLOYEE_NOT_LINKED`, plain copy
- `Resigned` resolves `ok: true` with `documents_only`, cannot clock in, cannot request leave
- `On Leave` and `Onboarding` resolve `full`
- `'self'` is absent from `tiers` when `employee` is null

**Email normalisation and identity repair**

- an email containing `_` or `%` resolves to exactly the right row
- **[db]** the preflight audit detects case-variant duplicates across all four tables in 2.3
- **[db]** the normalisation migration refuses to run while any duplicate exists
- case-variant duplicate at runtime returns `AMBIGUOUS_IDENTITY` and fails closed
- `clerk_user_id` match takes priority over email match
- successful email fallback persists `clerk_user_id` and audits it
- concurrent fallback: the loser re-resolves cleanly, no exception
- `Resigned` is never auto-linked

**Team scope**

- manager sees direct reports in `TEAM_MEMBER_STATUSES`
- manager cannot see peers
- manager cannot see another manager's reports
- `Resigned` direct reports are excluded
- clearing `manager_id` removes Team access immediately
- an approval targeting an employee outside `directReportIds` is rejected
- `?scope=team` with no actual reports grants nothing
- `?employeeId=` cannot widen a result set

**Manager task scope**

- manager may create, edit, reassign, reopen and cancel tasks for direct reports
- manager cannot assign a task to a department peer who is not a direct report
- department-wide assignment requires `workforce.tasks.assign`
- completing your own task requires no key
- completing another employee's task requires `workforce.tasks.assign` and audits

**Segregation of duties**

- manager cannot approve their own leave
- employee cannot approve their own attendance correction
- employee cannot approve their own timesheet
- the above hold even when the caller has org-wide approval keys

**Org permissions**

- read keys do not permit mutations
- `leave.approve` does not permit policy changes
- `attendance.admin` does not expose payroll
- `workforce.read` expands to exactly the 3.5 read list
- `workforce.write` expands to exactly the 3.5 write list
- `workforce.write` yields neither `roles.write` nor `roles.assign`
- `workforce.write` does not yield `employee_documents.legal`
- `roles.assign` cannot edit a role's permission bundle
- `roles.write` cannot assign members
- `legacyRoleBucket` with only `workforce.leave.approve`
- `legacyRoleBucket` with only `workforce.roles.assign`
- `legacyRoleBucket` with only `workforce.timesheets.approve`
- `legacyRoleBucket` with only `workforce.employees.read`
- `legacyRoleBucket` with no permissions
- `legacyRoleBucket` with legacy `workforce.read`, then `workforce.write`

**Documents**

- employee sees only their own `shared_with_employee` documents
- employee cannot see `manager_confidential`
- manager sees `shared_with_employee` and `manager_confidential`, direct reports only
- manager cannot see documents for peers or out-of-scope employees
- `employee_documents.read` sees `people_ops_confidential`, not `payroll_confidential`
- `workforce.payroll` sees `payroll_confidential`, not `legal_confidential` or `restricted`
- `legal_confidential` requires both `employee_documents.read` and `.legal`
- `restricted` requires owner, a reason, and produces an audit record
- migrated rows default to `people_ops_confidential`
- reclassification changes visibility immediately and audits

**Role assignment escalation (3.8)**

- `people-ops` cannot assign `owner` or `admin`
- `people-ops` cannot assign a role whose tier is `owner_only` or `admin_or_owner`
- `people-ops` can assign `viewer` and `employee`
- **[db]** a custom role containing an escalation-sensitive key cannot be saved as `delegated`
- **[db]** adding an escalation-sensitive key to an existing `delegated` role raises its tier
- owner can assign every role
- self-assignment of a higher tier is rejected
- every assignment and revocation writes its audit event

**Audit events**

- each of the 13 events in section 8 fires on its trigger with the right severity
- `legacy_permission_expansion_applied` is never written to the audit table

### 9.2 PR B, Workspace and navigation

- Workspace appears for any linked employee
- Workspace does not appear for an Org-only administrator with no employee row
- `documents_only` renders Home and Documents only
- `read_only` renders the 2.6 subset
- Workforce appears for Team scope with zero Org keys
- Workforce does not appear for a plain employee
- each granular key exposes exactly its intended navigation
- a hidden link is still rejected when opened directly
- Team-only caller at `/workforce` lands on `/workforce/team`
- Org caller at `/workforce` gets the Overview
- Workspace-only user at `/` is redirected to `/workspace`
- each `SelfIdentityError` renders its section 2.2 copy, never a stack trace

### 9.3 PR C, route separation

- every redirect in 5.4 preserves its query string
- `/me/reports?type=monthly` lands on `/workspace/reports?type=monthly`
- `/workforce/daily-tracker?week=...` lands on `/workspace/tracker?week=...`
- MD cannot write another engine's entry by changing the engine id
- acting MD can write the engine they cover
- a review-locked entry rejects writes until reopened
- no `revalidatePath` call references a moved path
- `me/reports` no longer consults `workforce.write` for a personal decision

---

## 10. Delivery

Phase 0 is large and security-relevant, so it ships as three PRs rather than
one. Phase numbering is unchanged; only the review surface is split.

**PR A, authorisation foundation.** Resolver with typed failures, composite
scope, email normalisation migration, granular keys, reviewed legacy expansion,
`legacyRoleBucket` update, Roles authorisation fix, role `assignment_tier` and
its escalation trigger, document sensitivity column, narrowed task scope,
`employee` role, seeded-role migration with its preview table, audit events, and
the section 9.1 test matrix. No user-visible navigation change.

**PR B, Workspace and navigation.** Workspace shell, scope-built sidebar, root
redirect for Workspace-only users, access-state navigation, friendly identity
failure states.

**PR C, route separation.** Route moves, query-preserving redirects, Tracker
split with engine assignment enforcement, link and `revalidatePath` audit.

If these are ever collapsed into one PR, the commits must still follow these
boundaries.

---

## 11. Reviewed and rejected

| Proposal | Decision |
| --- | --- |
| Bind every query to `organisation_id` | **Rejected.** No `organisation_id` or `tenant_id` exists in the workforce schema. Single-tenant ERP. Engine scope (5.5) is the real axis. |
| Make `clerk_user_id` unique | **Already done.** `20260514213347:33`. |
| Suspended / notice / terminated states | **Adapted.** Not in the current CHECK. Policy written against `WorkspaceAccess` so new statuses are a one-function change. |
| Drop `My` prefixes | **Rejected.** Org-wide Reports, Tracker and Leave exist elsewhere. |
| Nested Workforce sidebar groups | **Deferred to Phase 4.** |
| Split `workforce.payroll` into read/write/export | **Deferred.** |
| Performance sub-keys (cycles, team, org, calibration) | **Deferred.** `performance.read` must not imply unrestricted access to every review field. |
| `workforce.employee_documents.restricted` key | **Deferred.** Owner-only today; an unused key invites casual granting. |
| `workforce.settings` broad key | **Dropped** in favour of `report_templates.write`. Nothing gates module settings today, so it would be new authority. |

---

## 12. Final decisions

1. **People Ops role authority.**
   Approved: `people-ops` receives `workforce.roles.read` and
   `workforce.roles.assign`, but not `workforce.roles.write`.
   This is a deliberate security correction. People Ops may assign approved
   roles but cannot redefine permission bundles. Current holders must be
   notified before PR A merges.

2. **Case-variant duplicate emails.**
   Approved: the preflight audit is blocking.
   **Preflight run 2026-07-31 against production: CLEAR.** 12 employees, 12
   distinct lowercase emails, 0 rows needing normalisation, 0 conflicts in
   `workforce_invitations`. The normalisation `UPDATE` is a no-op and the
   `lower(email)` unique index can be added directly. The blocking gate stays
   in the migration regardless, so a re-run in another environment still fails
   safely.

3. **Manager task authority.**
   Approved: Team task authority is limited to `directReportIds`.
   **Impact check 2026-07-31: zero users affected.** All four employees with
   direct reports (Boris Massesa, OpusFesta, Ulumbi Samwel Dyamo, Ndigwako
   Mwaisemba) hold `workforce.write`, so `getCallerScope()` already returns
   `canAssignAll: true` for every one of them. The
   `{ canAssignAll: false, department }` branch is dead code in production
   today. Narrowing it costs nothing and no manager needs
   `workforce.tasks.assign` granted to preserve current reach.

4. **Role assignment safeguard.**
   Approved: `roles.assign` is bounded by an `assignment_tier` on
   `workforce_roles`, defaulting to `admin_or_owner`. People Ops may assign
   `delegated` roles only. A role holding any escalation-sensitive key can
   never be `delegated`, enforced by a database trigger rather than
   application code. See 3.8.

### 12.1 Change notice for People Ops

To be sent before PR A merges:

> People Ops access is changing from accidental role-definition authority to
> explicit role-assignment authority. Existing employee access remains
> assignable, but editing permission bundles will require an Administrator or
> Owner.

The decision-3 notice is no longer needed: the impact check found zero managers
relying on department-wide task reach.

Only one person currently holds `people-ops` (Ndigwako Mwaisemba), so the
decision-1 notice is a single conversation rather than a broadcast.

---

## 13. PR 0: role authorisation hotfix

Ships **before** PR A, standalone, small enough to review in one sitting.

Section 3.6 documents a live privilege-escalation path: all 10 employees with a
dashboard role bucket to `owner` or `admin` through `legacyRoleBucket`, and the
four role-mutating server actions gate on nothing else. Four of those users
(3 × `content-editor`, 1 × `vendor-success`) hold no workforce permission at all
and cannot even load the Roles page, yet can invoke the actions directly.

Waiting for the full Workspace refactor to close this is the wrong trade.

**Scope, deliberately minimal:**

1. Add `workforce.roles.read`, `workforce.roles.write`, `workforce.roles.assign`
   to the permission catalogue. Nothing else from section 3.2.
2. Grant all three to the `owner` and `admin` roles; grant `roles.read` and
   `roles.assign` to `people-ops`.
3. Re-gate the four actions by operation:
   `createRole`, `updateRolePermissions`, `duplicateRole` → `roles.write`;
   `setRoleMembers` → `roles.assign`; `deleteRole` keeps
   `requireAdminRole(['owner'])`.
4. Gate `roles/page.tsx` on `roles.read`.
5. Audit events for create, update, permission add/remove, member assign/remove.
6. Unit tests for `legacyRoleBucket` across all six live roles, asserting that
   bucket alone no longer authorises a role mutation.

**Explicitly out of scope:** the other 24 permission keys, the legacy expansion,
`assignment_tier`, document sensitivity, the resolver. Those stay in PR A.

`assignment_tier` (3.8) lands in PR A rather than here. PR 0 reduces the blast
radius from ten users to three; the tier system then bounds what those three can
do. Splitting it this way keeps PR 0 reviewable in one sitting.
