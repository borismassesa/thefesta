# Recruitment implementation matrix

Source of truth: the 43-section “OpusFesta Careers & Recruitment System Design” brief attached to the Codex task.

Status meanings:

- `Implemented`: code and migration exist and have been verified.
- `Foundation`: canonical schema or shared infrastructure exists; the end-user workflow is not complete yet.
- `Pending`: no complete production workflow yet.

This file is deliberately strict. A database table alone does not make an end-user requirement complete.

| Brief section | Outcome required | Status | Implementation / acceptance evidence |
|---|---|---:|---|
| 1. Product vision | Plan → requisition → approval → posting → application → hiring → employee | Foundation | Normalized domain and legacy sync in `20260802090711_recruitment_platform_domain.sql`; operational services and UI remain in progress. |
| 2. Public careers | Editorial careers home, role filters, benefits, talent community, FAQ | Foundation | Public home, role listing, mission, culture, locations, recruitment process, and talent-community form implemented. CMS-driven content, save-job, full filters, and FAQ remain. |
| 3. Job detail | Complete role details, process, policies, configurable form | Foundation | Dynamic job detail exists. Additional structured milestones, competencies, policy templates, and job-configured questions remain. |
| 4. Application | Structured, accessible, recoverable application with documents and consent | Foundation | Structured public form, private CV upload, signature/MIME/size validation, rollback, consent, and reference implemented. Draft recovery, extra documents, configurable questions, and confirmation delivery remain. |
| 5. Candidate portal | Applications, tasks, documents, availability, interviews, offers, privacy | Pending | Candidate-facing status model and portal data schema exist; authenticated portal UI/actions remain. |
| 6. Admin modules | Modular recruitment navigation and workspaces | Pending | Existing single-page Kanban remains; module routes are next. |
| 7. Workforce planning | Annual headcount, positions, budgets, forecast | Foundation | Plans and positions schema exists; planning UI, variance calculations, and approvals remain. |
| 8. Requisitions | Full request, conditional approval, comments, versions | Foundation | Requisitions, approval steps, comments, versions, transition trigger, and scope schema exist; admin workflow remains. |
| 9. Job posting | Multiple postings, channels, localisation, review, versioning | Foundation | Posting, version, channel, location, and question schema exists; management UI/publishing service remains. |
| 10. Application pipeline | Configurable Kanban/table and terminal dispositions | Foundation | Canonical application and append-only stage history exist; configurable pipeline templates and complete transitions remain. |
| 11. Candidate review | Consolidated profile, guarded reviewer actions | Foundation | Candidate CRM tables exist; profile workspace and safeguards remain. |
| 12. Scorecards | Weighted structured criteria with sealed peer feedback | Foundation | Templates, sections, criteria, scorecards and ratings exist; sealed-feedback policy/actions and UI remain. |
| 13. Interviews | Scheduling, availability, rooms, kits, reminders | Foundation | Plans, stages, interviews, participants, availability, and scorecards exist; calendar/conflict/reminder UI remains. |
| 14. Assessments | Internal/external assessment assignment and review | Foundation | Assessment record exists; template/submission/review split and workflow UI remain. |
| 15. Communications | Multichannel, bilingual, scheduled, versioned templates | Foundation | Messages, templates, recipients and delivery events exist; queues/providers/approval/versioning UI remain. |
| 16. Rejection | Structured reasons, approvals, scheduling, batch handling | Foundation | Application disposition fields and terminal states exist; policy, approvals, batch actions and delayed delivery remain. |
| 17. Talent CRM | Pools, consent expiry, campaigns, recommended jobs | Foundation | Candidate CRM, pools, members and nurture campaigns exist; operations UI and recommendation logic remain. |
| 18. Referrals | Employee submission, privacy-safe tracking, rewards | Foundation | Programs, referrals and rewards schema exists; `/workspace/referrals` remains. |
| 19. Offers | Versioned compensation, approvals, send, accept/sign | Foundation | Offer, versions, approvals, components and responses schema with transition validation exists; admin and candidate workflows remain. |
| 20. Onboarding conversion | Idempotent candidate-to-employee conversion | Foundation | Hiring conversion record exists; conversion service, pre-hire checks and onboarding integrations remain. |
| 21. Career CMS | Localized, versioned, scheduled careers content | Foundation | Page/version/block/department/location/benefit/FAQ/story schema exists; editorial admin and public data wiring remain. |
| 22. Admin dashboard | KPIs, aging queues, workload charts | Pending | Legacy KPI cards exist but do not satisfy canonical operational queues. |
| 23. Analytics | Funnel, speed, quality, source, workforce-plan metrics | Foundation | Event and daily aggregate schema exists; instrumentation, aggregations, dashboards and exports remain. |
| 24. RBAC | Fine-grained recruitment permission catalogue | Foundation | Recruitment capabilities, roles, service-only grants and admin role catalog added; route-by-route enforcement remains. |
| 25. Team scope | Requisition/job/department/interview resource scope | Foundation | Team assignment schema exists; shared server authorization helper and tests remain. |
| 26–27. Domain model | Distinct lifecycle entities and relationships | Foundation | Additive canonical domain migration exists and preserves legacy tables via atomic sync. Remaining auxiliary entities are tracked below. |
| 28. State machines | Reject invalid server-side transitions | Foundation | Requisition, posting, application, and offer transition triggers implemented and behavior-tested; expanded workflow states remain. |
| 29–30. Architecture/API | Public/private boundaries and mutation invariants | Foundation | Public actions use server-only Supabase service client; private domain grants revoked from browser roles. Candidate/admin service boundaries remain. |
| 31. Documents | Private, validated, quarantined, authorized, logged | Foundation | Private upload, type/size/signature checks, metadata, malware state and access-event schema exist; quarantine scanner, signed-download service and retention worker remain. |
| 32. Privacy/retention | Consent, export/correct/delete, legal hold, anonymize | Foundation | Versioned consent, privacy request and retention policy schema/seeds exist; workflow services and scheduled enforcement remain. |
| 33. Audit | Append-only sensitive-action events | Foundation | Audit table is service-only and mutation-protected; comprehensive action instrumentation remains. |
| 34. Search/duplicates | Cross-field search and reviewed merge | Foundation | Normalized-email uniqueness and full-text candidate index exist; phone/LinkedIn normalization, duplicate-review UI and merge service remain. |
| 35. Automation | Logged, retryable rules without opaque auto-rejection | Foundation | Rule/run schema exists; worker, retry/dead-letter handling and UI remain. |
| 36. Collaboration/reviews | Content, requisition, candidate, offer, post-hire review | Foundation | Domain approval/scorecard/history structures exist; coordinated review workspaces remain. |
| 37. Source tracking | Immutable original source, UTM/referral/agency attribution | Foundation | Application source and analytics properties exist; public UTM capture and immutable enforcement remain. |
| 38. Agencies | Limited agency workflow, ownership, fees, performance | Foundation | Agency and submission schema exists; limited portal and performance UI remain. |
| 39. Accessibility | WCAG-quality public/admin/candidate workflows | Foundation | Public Phase 1 passed responsive visual checks and uses semantic form controls; full keyboard/screen-reader/high-contrast audit remains. |
| 41. Delivery phases | All four phases delivered | Pending | Phase 1 public slice and broad domain foundation are complete; operational phases remain. |
| 42. Production gates | Authz, integrity, privacy, reliability, accessibility | Pending | Migration lint/behavior tests pass; full gate suite remains. |
| 43. Navigation | Public, admin, candidate, employee referral information architecture | Pending | Public root and one admin route exist; full navigation remains. |

## Verified backend evidence

- The careers foundation and canonical recruitment migration apply successfully to a clean Supabase PostgreSQL fixture.
- Supabase `db lint` reports no schema errors for `public`.
- Behavioral SQL verifies global candidate deduplication, multiple applications per candidate, legacy-to-canonical sync, document/consent projection, application and offer transition rejection, append-only audit records, private browser grants, RLS coverage, retention seeds, and recruitment role seeds.
- The repository-wide fresh migration chain currently stops at the pre-existing `044_add_purpose_to_verification_codes.sql` because `verification_codes` is absent; that baseline defect predates this recruitment work and is not counted as recruitment completion.
