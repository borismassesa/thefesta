# OpusFesta recruitment lifecycle guide

This is the operating guide for moving a role from workforce planning through a new employee's first day. It also explains which controls are safe at each stage and why some records are archived, cancelled, withdrawn, or superseded instead of deleted.

## Roles used in the workflow

- **People/HR:** owns recruitment settings, process quality, candidate records, offers, checks, and employee conversion.
- **Hiring manager:** requests headcount, defines the role, reviews candidates, interviews, and makes a selection recommendation.
- **Recruiter:** prepares the posting, manages the pipeline, coordinates interviews and communications, and maintains the audit trail.
- **Approver:** approves budget, headcount, requisitions, and offers according to the configured workflow.
- **Interviewer:** completes an assigned scorecard independently.
- **Payroll/IT/Facilities:** completes controlled pre-hire and joining tasks after offer acceptance.

## End-to-end procedure

### 1. Confirm the workforce plan

1. Open **HR & People → Recruitment → Workforce plan**.
2. Create the annual or departmental plan.
3. Add each planned position with title, department, location, employment type, headcount, target date, and salary band.
4. Use **Edit plan** or **Edit position** while the plan is a draft.
5. Submit the plan, obtain approval, and lock it when final.

Do not delete an approved or locked plan. Archive it to preserve the planning and budget record.

### 2. Create the requisition

1. Open **Requisitions** and select **New requisition**.
2. Link the planned position when applicable.
3. Complete the business reason, department, location, headcount, employment type, responsibilities, requirements, salary range, hiring manager, and recruiter.
4. Save the draft and review all fields.
5. Use **Save revised draft** for corrections before approval.

### 3. Submit and approve the requisition

1. Select **Submit for approval**.
2. Each configured approver chooses **Approve**, **Changes**, or **Reject** and adds a decision note when required.
3. If changes are requested, the owner edits and resubmits the requisition.
4. Continue only when every required step is approved.

The approval history must remain intact; rejected or superseded requisitions are retained rather than hard-deleted.

### 4. Create the job posting

1. From the approved requisition, select **Publish job** to create the governed job/posting records.
2. Open **Jobs**, then open the new posting.
3. Complete the public title, summary, full description, reporting line, equal-opportunity statement, SEO fields, and visibility.
4. Save the posting content.
5. Add candidate-facing application questions. Use review flags only to route a response for human review; never configure automatic rejection from a knockout answer.

### 5. Prepare languages and channels

1. Create or update English and Kiswahili translations where required.
2. Move each translation through review and approval.
3. Configure publication channels and their external URLs or job IDs.
4. Preview the page and verify headings, formatting, links, alternative text, mobile layout, and application questions.

### 6. Publish the role

1. Submit the posting for review.
2. Approve it after content, legal, accessibility, and salary-display checks.
3. Select **Publish now**, or set a future publication date and select **Schedule**.
4. Confirm the role appears in **Open roles** using a signed-out browser window.

#### If a role does not appear in Open roles

The careers site includes a role only when all of these conditions are true:

- the recruitment posting status is `published`;
- visibility is `public` for the Open roles list (`unlisted` roles work only through their direct link);
- `publish_at` is empty or is in the past;
- `unpublish_at` is empty or is still in the future;
- the linked Workforce job status is `Open`;
- the Workforce job closing date is empty or has not passed.

Check those fields in **Recruitment → Jobs → [posting]**. A requisition being approved is not enough by itself; approval creates permission to publish, but the posting still has its own review/publication lifecycle.

### 7. Receive and review applications

1. Monitor **Applications** for new submissions.
2. Confirm consent, required answers, and document scan status.
3. Assign the recruiter, hiring manager, or reviewer as needed.
4. Add internal notes using the correct visibility level.
5. Move qualified applications through configured stages; record a governed disposition for rejection or withdrawal.

Applications are employment-decision records. Use status transitions, dispositions, retention policies, and anonymisation—not an ordinary Delete button.

### 8. Manage candidate profiles

1. Open **Candidates** to review consolidated history, documents, applications, notes, sources, and pool membership.
2. Review duplicate suggestions.
3. Merge profiles only after confirming they are the same person; merging is irreversible and requires a reason.
4. Honour contact preferences, privacy requests, and do-not-contact status.

### 9. Schedule structured interviews

1. Create the interview from the application.
2. Set format, date/time, timezone, location or meeting link, duration, and candidate accommodations.
3. Add participants and assign a scorecard.
4. Resolve calendar conflicts before scheduling.
5. Send the candidate communication and reminders.
6. Reschedule or cancel through the interview status controls so the history remains visible.

### 10. Collect scorecards and feedback

1. Each interviewer completes their assigned scorecard independently.
2. Save a draft while working.
3. Select **Submit and lock** when the evidence and recommendation are complete.
4. Do not edit a sealed scorecard; use a documented follow-up review if additional evidence is needed.

### 11. Run assessments and checks

1. Create the assessment from the application.
2. Set instructions, deadline, time limit, rubric, accommodation, and submission method.
3. Review the submission and attachment scan status.
4. Save the review draft, then submit and lock the final review.
5. Request references or background checks only with the required candidate consent.

### 12. Make the selection decision

1. Review application evidence, completed scorecards, assessments, checks, and structured notes.
2. Record the final recommendation and decision.
3. Move unsuccessful candidates through the governed disposition and approved communication workflow.
4. Confirm the selected candidate before creating an offer.

### 13. Create and approve the offer

1. Create the offer from the selected application.
2. Complete title, department, location, employment type, start date, salary, pay frequency, conditions, probation, manager, and expiry.
3. Add offer components and review the generated document.
4. Submit for approval.
5. Approvers approve or reject according to segregation-of-duties rules.
6. If commercial terms change, create a revised/superseding version; do not overwrite accepted or historical terms.

### 14. Send and track the offer

1. Send only an approved offer.
2. Monitor sent, viewed, accepted, declined, expired, or withdrawn status.
3. Record candidate questions and negotiations in the appropriate private notes.
4. If a revised offer is needed, restart the approval path for the revised terms.

### 15. Complete pre-hire requirements

After acceptance:

1. Confirm identity/right-to-work or other lawful checks required for the role.
2. Complete references/background checks under the applicable consent and access controls.
3. Confirm start date, manager, department, work location, payroll details, and equipment needs.
4. Mark each pre-hire item complete with evidence where required.

### 16. Convert the candidate to an employee

1. Open the accepted offer.
2. Verify all mandatory pre-hire checks are complete.
3. Select **Convert to employee** once.
4. Confirm the employee record was created with the approved offer fields and linked back to the application/offer.
5. Resolve any duplicate employee warning before retrying.

The conversion is idempotent: retrying must not create a second employee.

### 17. Prepare joining and onboarding

1. Assign onboarding tasks to HR, the manager, IT, Payroll, and Facilities.
2. Prepare contract and policy acknowledgements.
3. Create system accounts and least-privilege access.
4. Prepare equipment, workspace, induction schedule, and first-week meetings.
5. Send the joining instructions and first-day contact details.

### 18. Employee joins the company

1. Confirm attendance and identity on the agreed start date.
2. Complete payroll, benefits, policy, safety, and data-protection onboarding.
3. Issue equipment and access; record acknowledgement where required.
4. Introduce the employee to their manager, team, role objectives, and probation expectations.
5. Complete outstanding onboarding tasks and close the recruitment opening as filled.

### 19. Complete post-hire review

1. Record manager satisfaction, performance outcome, retention status, and source-quality notes at the configured review point.
2. Use aggregate reporting to improve sources, process time, interviews, offers, and quality of hire.
3. Keep access to individual recruitment history limited and follow the configured retention policy.

## Control rules used throughout Recruitment

- **Create:** shown in an empty state or at the top of the relevant collection.
- **Edit / Save:** available for drafts or an explicit revision state.
- **Publish / Approve / Submit:** advances a governed workflow and may require a different permission from editing.
- **Archive / Cancel / Withdraw / Supersede:** used for records with business, audit, or candidate history.
- **Delete:** available only for safe, unused drafts; always confirmed on the client and rechecked on the server.
- **Restore:** available where the data model supports a reversible archive.

Every mutation must be permission-checked, filtered to the intended record, validated against its current lifecycle state, audited when it affects governed recruitment history, and followed by a refreshed page state.
