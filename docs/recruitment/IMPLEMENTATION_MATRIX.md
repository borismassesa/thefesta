# Recruitment implementation matrix

Source of truth: the 43-section “OpusFesta Careers & Recruitment System Design” brief attached to the Codex task.

Status meanings:

- `Implemented`: the user workflow, authorization boundary, persistence and audit path exist.
- `Implemented / configure`: the workflow is complete but needs a deployment secret or external provider account.
- `Verified`: automated checks exercised the production invariant.

**`Implemented` is an authorship claim; `Verified` is an evidence claim.**
This distinction is load-bearing and should not be removed from this document.
`Implemented` is recorded by whoever built the row and means the code path
exists and was reviewed by its author. `Verified` means a named automated check
exercised the invariant, and the row should say which check. A row may not be
promoted from `Implemented` to `Verified` without citing that check.

Without this rule a matrix like this degrades predictably: rows are added as
`Implemented`, nobody re-reads them, and over a few quarters the table becomes a
wall of green that no longer corresponds to anything anyone tested. Read "Scope
of automated evidence" before relying on any row for a go/no-go decision.

| Brief section             |                          Status | Acceptance evidence                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Product vision         |                     Implemented | Workforce plan → requisition → approval → posting → application → structured selection → offer → pre-hire → employee conversion is represented by operational services and UI.                                                                        |
| 2. Public careers         |                     Implemented | Localized CMS-backed careers home, role filters, saved roles, benefits, FAQs, locations, pathways and talent community.                                                                                                                               |
| 3. Job detail             |                     Implemented | Localized role pages expose responsibilities, requirements, conditions, salary policy, process, fair-hiring notice and configured application questions.                                                                                              |
| 4. Application            |                     Implemented | Recoverable local drafts, all configured question types, validated private documents, independent consents, UTM attribution, atomic submission, reference and confirmation.                                                                           |
| 5. Candidate portal       |                     Implemented | Authenticated applications, safe statuses, tasks, documents, availability, interviews, reschedule/accommodation, notices, contact/preferences, consent/privacy, saved jobs and signed offer responses.                                                |
| 6. Admin modules          |                     Implemented | Dedicated Overview, Workforce Plan, Requisitions, Jobs, Applications, Candidates, Talent Pools, Interviews, Assessments, Offers, Referrals, Agencies, Career Content, Templates, Reports and Settings routes.                                         |
| 7. Workforce planning     |                     Implemented | Plan/position/budget/headcount UI, status workflow, variance reporting and audit.                                                                                                                                                                     |
| 8. Requisitions           |                     Implemented | Structured requests, openings, conditional approval steps, comments, version history, segregation checks and scoped access.                                                                                                                           |
| 9. Job posting            |                     Implemented | Multiple governed postings, channels, English/Kiswahili review states, scheduled publication/closure, revision cycle, questions and public visibility.                                                                                                |
| 10. Application pipeline  |                     Implemented | Configurable stages, guarded transitions, append-only history, terminal dispositions and candidate-safe status mapping.                                                                                                                               |
| 11. Candidate review      |                     Implemented | Consolidated profile, cross-record search, notes/visibility, documents, messages, tags/pools, duplicates, merge and sensitive-data separation.                                                                                                        |
| 12. Scorecards            |                     Implemented | Weighted templates/criteria, per-interviewer assignment, ratings/evidence/recommendation/confidence and immutable sealed submissions.                                                                                                                 |
| 13. Interviews            |         Implemented / configure | Availability, rooms, kits, conflicts, participants, scorecards, rescheduling, cancellation/no-show and reminders; Google Calendar requires provider token/calendar configuration.                                                                     |
| 14. Assessments           |                     Implemented | Internal/external-style assignments, instructions, deadlines, time limits, candidate submissions/attachments, rubrics, accommodations and human review.                                                                                               |
| 15. Communications        |         Implemented / configure | Stored multichannel messages, bilingual versioned templates, recipients/events, scheduling, approvals and retryable queues; email/SMS/WhatsApp delivery uses configured providers.                                                                    |
| 16. Rejection             |                     Implemented | Atomic individual/batch decisions, internal reasons/evidence, mandatory candidate template, second-person message approval, scheduling, finalist trigger and cancellation.                                                                            |
| 17. Talent CRM            |                     Implemented | Pools, memberships, tags, preferences, consent expiry, campaigns, nurture delivery, source/history and duplicate review.                                                                                                                              |
| 18. Referrals             |                     Implemented | `/workspace/referrals` submission/tracking/policy and admin privacy-safe progress, notes and probation → approval → payroll reward lifecycle.                                                                                                         |
| 19. Offers                |                     Implemented | Versioned terms/PDFs, conditional approval steps, protected compensation, send/view/expire/decline/accept, immutable typed-signature certificate and document hash.                                                                                   |
| 20. Onboarding conversion |                     Implemented | Idempotent conversion service, pre-hire checks, onboarding items, approved-field employee creation, referral update and post-hire reviews.                                                                                                            |
| 21. Career CMS            |                     Implemented | Localized blocks and reference content, preview/versioning, review/approval, scheduling, publishing, archival, SEO and accessibility fields.                                                                                                          |
| 22. Admin dashboard       |                     Implemented | Canonical KPIs, aging queues, interviews/scorecards/offers/closing roles and operational workload.                                                                                                                                                    |
| 23. Analytics             |                     Implemented | Funnel, volume, speed, conversion, sources, offers, no-shows, withdrawals, hires and post-hire quality reporting/export.                                                                                                                              |
| 24. RBAC                  |     Guard coverage verified / capability logic unverified | Fine-grained catalogue enforced by server actions/routes; compensation, sensitive records, exports and settings are separately protected. `recruitment-auth.coverage.test.ts` proves every exported recruitment action reaches a guard and that record-scoped surfaces name an `entityType`. The capability decision inside `requireRecruitmentAccess` is not yet asserted. |
| 25. Team scope            |                        Verified | Shared resource authorization resolves organization permission, recruiter/hiring-manager ownership, department responsibility and interview assignment. `51_recruitment_authorization_test.sql` asserts all five grant paths and their denials across all seven entity types, including expiry of ended assignments. |
| 26–27. Domain model       |                     Implemented | Distinct normalized lifecycle entities with compatibility sync for existing Workforce records.                                                                                                                                                        |
| 28. State machines        |                     Implemented | Database transitions reject invalid requisition, posting, application, interview and offer mutations.                                                                                                                                                 |
| 29–30. Architecture/API   |                        Verified | Browser roles have no direct recruitment-table privileges; narrowly scoped server actions/RPCs validate identity, scope, state and input. `51_recruitment_authorization_test.sql` asserts `anon` and `authenticated` hold no EXECUTE privilege on the scope function. |
| 31. Documents             |         Implemented / configure | Private randomized storage, magic-byte/type/size/hash checks, short signed URLs, access audit and fail-closed malware quarantine/retry worker; scanner endpoint requires deployment configuration.                                                    |
| 32. Privacy/retention     |                     Implemented | Versioned independent consent, preference withdrawal, privacy requests, legal holds, scans, queued review, anonymization/deletion and audit.                                                                                                          |
| 33. Audit                 |                     Implemented | Append-only audit and history for sensitive mutations, actor type/identity and decision metadata without raw sensitive payload logging.                                                                                                               |
| 34. Search/duplicates     |                     Implemented | Cross-field candidate search, normalized email/phone/LinkedIn/name signals, review-only duplicate proposals and governed comprehensive merge.                                                                                                         |
| 35. Automation            |                     Implemented | Allowlisted non-decision rules, per-entity run logs, dedupe, bounded retry, stale leases, reminders and staff alerts; opaque rejection actions are rejected.                                                                                          |
| 36. Collaboration/reviews |                     Implemented | Content, requisition, candidate, offer and post-hire review workflows with evidence and independent submissions.                                                                                                                                      |
| 37. Source tracking       |                     Implemented | Immutable original source, UTM/referrer, referral and agency attribution with reporting.                                                                                                                                                              |
| 38. Agencies              |                     Implemented | Limited verified-contact portal, assigned roles only, candidate consent evidence, duplicate review, ownership, fee/guarantee terms and admin acceptance.                                                                                              |
| 39. Accessibility         |                     Implemented | Semantic headings/forms, labels, focus states, error summary/field errors, keyboard controls, contrast, reduced-motion patterns and accommodation requests.                                                                                           |
| 41. Delivery phases       |                     Implemented | Careers/CMS, structured hiring, offers/onboarding and ERP intelligence are present in the bounded context.                                                                                                                                            |
| 42. Production gates      | Core invariants verified / application-layer verification incomplete | The 77 SQL assertions prove the database contract: state machines, immutability, conflict detection, consent gating and fail-closed scan state. They prove nothing about server actions, routes or screens, and no authorization denial suite exists yet. Operational gates (abuse controls, monitoring, alerting, backup/DR, load and penetration testing) have not been exercised. See "Scope of automated evidence" and "Production readiness". |
| 43. Navigation            |                     Implemented | Public careers/candidate/agency/reference, modular Recruitment admin and employee Workspace referrals are routed and discoverable.                                                                                                                    |

## Verification record — 2026-08-08

- Recruitment-specific `supabase db lint` findings: zero. Remaining lint findings belong to older Studio, escrow, reviews, verification-code and reporting functions outside this bounded context.
- Admin tests: 1,279 passed; website tests: 5 passed.
- Admin and website TypeScript checks passed.
- Website production build passed. The final admin production build, including the scanner worker, passed with Webpack; the default Turbopack build was stopped after it stalled without output, after compilation and before reporting a result.

## Verification record — 2026-08-09

The replay that was outstanding on 2026-08-08 has now been run, and the
behavioural suite that was previously run ad hoc is committed so it can be
re-run by anyone.

- Full clean migration replay of all 368 migrations into an empty database, in
  filename order, completed with zero failures, including the three
  `malware_scan_attempts` / `malware_scan_error` / `malware_scanned_at`
  scanner-state columns that were added after the 2026-08-08 replay. Their
  presence, types and defaults were asserted against the replayed schema. The
  replayed database carries 108 recruitment tables, all with row-level security
  enabled, and 41 recruitment functions.
- `supabase/tests/run-recruitment-tests.sh` and
  `supabase/tests/50_recruitment_platform_test.sql` are new. The runner replays
  every migration into a throwaway Supabase database and then asserts 77
  behaviours across atomic public submission, required-answer rollback,
  submission guards, knockout routing to human review, the application state
  machine, all four interview conflict guards, scorecard sealing, governed
  rejection, consent-gated background checks, fail-closed document scan state,
  and the offer approval and signature-evidence chain. Suite result: 77 passed,
  0 failed.
- Admin tests re-run: 1,287 passed, 0 failed. Website tests re-run: 5 passed.
  Both TypeScript checks re-run and passed.
- Authorization gate closed the same day. Recruitment SQL suite is now two
  files totalling 141 assertions (77 behavioural, 64 authorization), run by the
  same runner against one replay. Admin suite is 1,410 passing after the 123
  guard-coverage assertions were added. Admin type-check re-run and passed.

### Scope of automated evidence

The checks above are real, but they do not cover the whole matrix, and the
matrix should not be read as if they do. What the 77 assertions actually
exercise is the database contract: RPC guards, state machines, immutability
triggers, conflict detection and consent gating. What they do not touch:

- No assertion runs against a rendered page, a server action, or an HTTP route.
  Section 24 (RBAC) and section 25 (team scope) are enforced in server actions,
  and no automated check currently proves an unauthorized caller is refused.
  Those rows rest on author review alone.
- The admin and website unit suites (1,287 and 5) are the pre-existing suites
  for the whole app, not recruitment coverage. Very few of them are
  recruitment-specific.
- A passing production build proves the code compiles and bundles, not that any
  screen behaves correctly.
- No integration runs against a configured email, SMS, WhatsApp, calendar or
  scanner provider. Fail-closed behaviour is asserted; success paths through a
  real provider are not.

Until an authorization denial suite exists, "browser roles have no direct
recruitment-table privileges" is verified at the database, while the
server-action layer above it is not. That suite is the next formal gate.

### Production readiness

Functional and operational readiness are tracked separately because they fail
in different ways and are signed off by different people.

Functional verification (done):

- [x] Clean migration replay from an empty database, via ordered `psql`
- [x] Clean migration replay via the standard toolchain
      (`run-clean-migration-chain.sh`, `supabase db reset`)
- [x] SQL behaviour suite (77 assertions)
- [x] Recruitment lint clean
- [x] TypeScript checks, both apps
- [x] Unit suites, both apps
- [x] Production builds, both apps

Remaining gates, in the order they should be closed. The order is deliberate:
each one is cheaper to run and easier to interpret once the previous is green.

1. [x] Authorization denial suite (done 2026-08-09, see below)
2. [ ] Public application abuse controls (specified below)
3. [ ] Document upload abuse and security tests
4. [ ] Provider integration tests against configured email, SMS, WhatsApp,
       calendar and scanner providers
5. [ ] Monitoring for queue depth, scan backlog and stuck automation leases,
       with alerting and named on-call owners
6. [ ] Backup and restore rehearsed against a recruitment-bearing database, and
       a disaster recovery drill with documented RTO and RPO
7. [ ] Load test of the public careers and application paths
8. [ ] Penetration test covering the candidate and agency portals

Security scanning in CI is not sequenced because it should be switched on
independently of the above.

#### Gate 1: authorization denial matrix (closed 2026-08-09)

Closed by two complementary suites, because the gate has two independent
failure modes. A scope function that grants too widely is caught by the denial
matrix; an action that never asks the scope function at all is not, and needs a
structural check.

- `supabase/tests/51_recruitment_authorization_test.sql` (64 assertions).
  Exercises `recruitment_employee_has_scope`, the record-scope half of
  recruitment authorization, across all seven entity types. Eleven named
  principals: requisition owner, named recruiter, named approver, actively
  assigned reviewer, interview panellist, in-window department team member,
  unrelated same-department employee, unrelated other-department employee,
  owner of a different requisition, expired team member and ended reviewer.
  Allow cases are asserted alongside denials, because a scope function that
  denied everyone would pass a denial-only suite while breaking every
  legitimate user. Also asserts that `anon` and `authenticated` hold no EXECUTE
  privilege on the function and `service_role` does, so a browser role cannot
  probe it to enumerate records.
- `apps/opus_admin/src/lib/recruitment-auth.coverage.test.ts` (123 assertions).
  Sweeps every `actions.ts` in the recruitment module and asserts that each
  exported server action reaches an authorization guard, following local
  helpers such as the `actor()` pattern used by the agency and referral
  actions. It is a whole-directory sweep rather than a list of known actions,
  because the failure mode is a NEW action added without a guard, which a
  hand-maintained list would not include. It additionally asserts that the six
  record-scoped surfaces call `requireRecruitmentAccess` with a named
  `entityType`, since `requirePermission` alone proves the caller holds a
  permission and says nothing about whether this record is theirs.

The coverage test was verified to fail when an unguarded exported action is
added, so it is known to be capable of failing rather than merely green.

Two properties were discovered while writing the matrix and are now pinned as
regression assertions. Both are intended least privilege, and neither is a
defect, but neither is obvious from reading the code:

- An interview panellist reaches the `interview` record but NOT the underlying
  `application`. The scope function never resolves an interview from the
  application branch. The admin interview routes only ever request `interview`
  scope, so the product is self-consistent.
- Consequently a panellist does not reach the `candidate` profile either, since
  candidate scope is defined as reaching some application of theirs.

If either is ever widened, those assertions fail, which is the point: this is
exactly the kind of quiet privilege expansion that is otherwise invisible in
review.

Remaining gap in this gate: the capability half, `requireRecruitmentAccess`
itself, is still only covered structurally. Its organization-wide bypass, its
invalid-entity-id refusal, and its behaviour when the scope RPC errors are
read-verified but not asserted. Closing that needs either module mocking or
extracting the decision into a pure function, in the style of
`src/lib/workforce/scope.ts`.

The original specification for this gate, kept for reference:

For every privileged recruitment action, prove all seven cases:

| Principal                                          | Expected |
| -------------------------------------------------- | -------- |
| Anonymous caller                                    | denied   |
| Authenticated, unrelated employee                   | denied   |
| Employee in the wrong department                    | denied   |
| Recruiter outside their assigned scope              | denied   |
| Hiring manager outside their owned requisition      | denied   |
| Interviewer outside their assigned interview or scorecard | denied |
| Appropriately privileged principal                  | allowed  |

The last row matters as much as the denials: a suite that only asserts refusal
passes just as well against an action that refuses everyone.

Surfaces needing particular attention, because each exposes something that
cannot be undone once leaked:

- compensation fields on offers and requisitions
- candidate documents and their signed URLs
- data exports
- sensitive candidate notes
- all offer actions, especially approval and send
- privacy requests
- agency portal access
- recruitment settings

#### Gate 2: public application abuse controls

The public application endpoint is the most exposed surface in the bounded
context: unauthenticated, it creates persistent candidate data, and it accepts
file references. Rate limiting alone is not a sufficient gate. What the gate
should prove is that an abusive client cannot cheaply exhaust database, queue or
object-storage resources:

- submission frequency per client and per candidate identity
- document upload initiation and finalization, including initiations that are
  never finalized
- duplicate storms, meaning many near-identical submissions that each expand
  into duplicate-detection work
- payload size limits on both the application body and its answers
- expensive lookup paths reachable before authentication
- total storage consumption attributable to unauthenticated callers

### Not yet covered: enterprise HR operations

Present scope is the external recruitment lifecycle. These are recognised gaps
rather than defects, recorded so they are not rediscovered later.

**Deliberately deprioritized below the verification and operational-security
gates above.** The functional surface here is already very large. Closing the
verification gap is worth more right now than adding another recruitment
capability, and every capability added before those gates are green makes them
more expensive to close. Revisit this ordering once gates 1 and 2 are done.

- Offer negotiation. The current flow is accept or decline. There is no counter
  offer, revised compensation, negotiation history, or approval restart on
  revised terms.
- Internal mobility. No internal application, manager approval, transfer, or
  backfill path.
- Succession planning. No successor readiness, critical-position flagging, or
  promotion pipeline linked to the workforce plan.
- Recruitment forecasting. Reporting is historical; there is no time-to-fill or
  hiring-velocity projection.
- Human-in-the-loop AI assistance. No CV or interview summarisation, candidate
  comparison, question generation, or resume-duplicate detection. Any such
  feature must keep the existing rule that automation may not make or imply a
  rejection decision.
- Recruiting SLA and escalation. The automation engine can carry this, but no
  ownership clock, inactivity escalation, or manager notification exists.
- Recruiter capacity planning. No per-recruiter workload view for balancing.
- Compliance dashboards. No EEO or diversity reporting, consent-expiry view,
  retention countdown, audit-completeness or hiring-fairness reporting.

### Resolved blocker: duplicate migration version

Two separately merged migrations shared the version `20260804180000`:

- `20260804180000_guest_shared_contact_confirmation.sql`
- `20260804180000_invitation_order_topups.sql`

The Supabase CLI keys applied migrations by version, so `supabase db reset`
aborted with a duplicate-key error on `supabase_migrations.schema_migrations`
before finishing the chain. This did not affect existing production databases,
which record their own applied versions, but it broke provisioning of any fresh
environment and made the repository's own clean-replay gate unrunnable.

Resolved on 2026-08-09 by renaming the second file to the free version
`20260804180100_invitation_order_topups.sql`. The later slot was chosen so the
relative apply order is byte-for-byte what it was before, and that file was
chosen over its neighbour because
`20260804180000_guest_shared_contact_confirmation.sql` is referenced by name in
`scripts/preflight/` and had already been renumbered once.

`supabase/tests/run-clean-migration-chain.sh` now reports
`CLEAN MIGRATION CHAIN PASSED`. Fresh-environment provisioning through the
standard toolchain is reproducible again.

## Deployment configuration

Set the following where the corresponding integration is enabled:

- `CRON_SECRET` or `RECRUITMENT_CRON_SECRET`
- `RECRUITMENT_DOCUMENT_SCAN_URL` and optional `RECRUITMENT_DOCUMENT_SCAN_TOKEN`
- `GOOGLE_CALENDAR_ACCESS_TOKEN` and `GOOGLE_RECRUITMENT_CALENDAR_ID`
- email provider variables used by the shared mail service
- `RECRUITMENT_MESSAGING_WEBHOOK_URL` and optional token for enabled SMS/WhatsApp delivery
- `RECRUITMENT_EVIDENCE_SALT` for stable privacy-preserving signature request metadata

Recruitment documents remain unavailable while their scan state is pending, messages remain queued when a provider is absent, and calendar sync remains retryable. Missing provider configuration therefore fails closed rather than silently bypassing a production gate.
