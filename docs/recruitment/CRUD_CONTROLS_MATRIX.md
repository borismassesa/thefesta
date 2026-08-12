# Recruitment CRUD controls matrix

This matrix defines the correct action vocabulary for each Recruitment page. “No hard delete” is deliberate wherever the record is evidence of a hiring, privacy, compensation, or employment decision.

| Page           | Create                                          | Read                     | Update controls                                 | End-of-life control                             | Hard delete rule                                 |
| -------------- | ----------------------------------------------- | ------------------------ | ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Workforce plan | Plan, position                                  | Plan cards               | Edit/Save draft plan and positions              | Submit, Approve, Lock, Archive                  | Empty draft plan or unused planned position only |
| Requisitions   | New requisition                                 | List/detail/history      | Save revised draft                              | Changes, Reject, Publish, retain history        | No hard delete                                   |
| Jobs           | From approved requisition                       | List/detail/preview      | Save content, translation, questions, channels  | Pause, Close, Archive, revision                 | Never after publication                          |
| Applications   | Public/candidate submission                     | Pipeline/detail          | Stage, assignment, notes, checks                | Withdraw, Reject, Hire, retention/anonymisation | No ordinary hard delete                          |
| Candidates     | Created from application/import                 | Profile/history          | Notes, preferences, controlled merge            | Do not contact, anonymise under policy          | No ordinary hard delete                          |
| Talent pools   | Pool                                            | Pools/members            | Edit/Save pool, add/remove member               | Archive/Restore                                 | No hard delete; retain consent history           |
| Interviews     | From application                                | Schedule/detail          | Reschedule, participants, scorecard             | Cancel, no-show, complete                       | No hard delete                                   |
| Assessments    | From application                                | List/submission          | Save draft review                               | Submit and lock, cancel/expire assignment       | No hard delete                                   |
| Offers         | From selected application                       | Offer/version history    | Revise as new governed version                  | Withdraw, decline, expire, supersede            | No hard delete                                   |
| Referrals      | Employee submission                             | Referral/reward state    | Private notes, governed status                  | Reject/close and retain reward trail            | No hard delete                                   |
| Agencies       | Agency/submission/contact                       | Agency activity          | Terms, contacts, assignments, submission status | Suspend/terminate/archive                       | No hard delete after activity                    |
| Career content | Page, block, reference content                  | List/detail/preview      | Edit/Save metadata, blocks, and references      | Publish, Archive, Restore where supported       | Never-published/unused draft only                |
| Templates      | Template/version                                | Template/version history | Save new version                                | Activate, Archive                               | Unused draft only                                |
| Reports        | N/A                                             | Filters/export           | Filter configuration                            | N/A                                             | N/A                                              |
| Settings       | Pipeline, scorecard, automation, source, policy | Configuration lists      | Version/configuration changes                   | Activate/deactivate/archive/release             | Unused draft configuration only                  |

## Button hierarchy

- Lavender primary: one main next step, such as Create, Save, Submit, Approve, Publish, or Schedule.
- Pale-lavender secondary: supporting workflow action.
- Neutral: Edit, Preview, Add comment, Restore, or non-destructive utility.
- Amber warning: request changes, pause, defer, or a caution state.
- Rose danger: Archive, Reject, Remove, Withdraw, Cancel, or permitted Delete.

All buttons use the shared Opus button sizes and pill geometry. A red/rose visual does not by itself make an operation safe; the server action still enforces permission, current status, ownership/scope, dependency checks, and confirmation.
