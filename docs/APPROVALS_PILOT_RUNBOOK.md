# Approvals — Pilot Runbook

Three gates stand between the current state and a desktop-only employee pilot.
None of them are engineering. This is the order to do them in and exactly what
to run.

Current verified state (2 August 2026):

- Application code is **deployed** to `admin.opusfesta.com`.
  `/api/notifications/retry` returns 401 (exists, rejecting unauthenticated
  probes) and `/insights/notifications` returns 307 (exists, redirecting to
  sign-in).
- Retry config lives in **Supabase Vault**, not `app.settings.*`. Hosted
  Supabase denies `ALTER DATABASE ... SET` to the dashboard role, so that
  route is not available on this project. Both secrets
  (`opus_admin_base_url`, `notification_retry_secret`) are **stored**.
- pg_cron job `notification-email-retry` — **active**, every 10 minutes,
  command `SELECT public.trigger_notification_retry();` (no credential in
  the schedule).
- Undelivered notifications: 0.

Gate 1 below is therefore **already done** on this project. It is kept as the
procedure for a fresh environment, and because the secret still has to match
what Vercel holds.

---

## Gate 1 — Notification retry configuration

Roughly ten minutes. Do all four steps in one sitting: a half-configured state
is worse than an unconfigured one, because the cron starts receiving 401s that
land nowhere.

### Step 1. Generate the secret

Run locally. **Do not paste the value into a chat, ticket, or commit.**

```bash
openssl rand -hex 32
```

Keep the output on your clipboard for steps 2 and 3. It must be byte-identical
in both places.

### Step 2. Set it on Vercel

Project `opus-admin` (`prj_gt17XFUvx2wKdYIpy4Sk8WJkmbkS`), which serves
`admin.opusfesta.com`.

Dashboard route: Vercel → opus-admin → Settings → Environment Variables → Add.

- Name: `NOTIFICATION_RETRY_CRON_SECRET`
- Value: the string from step 1
- Environment: **Production** only

### Step 3. Redeploy

Environment variables are baked in at build time, so the running deployment
will not see the new value until you redeploy.

```bash
npm run deploy:admin -- --prod
```

### Step 4. Store the config in Vault

Supabase → SQL Editor. Replace `<SECRET>` with the same value from step 1.

Do **not** reach for `ALTER DATABASE postgres SET app.settings.…`. Hosted
Supabase refuses it for the dashboard role (`ERROR: 42501: permission denied
to set parameter`), and the workaround people fall into — inlining the secret
into `cron.job.command` — puts a production credential in plaintext in a table
`anon` and `authenticated` can both read, and in every backup and schema dump.

```sql
SELECT vault.create_secret('https://admin.opusfesta.com', 'opus_admin_base_url');
SELECT vault.create_secret('<SECRET>', 'notification_retry_secret');
```

To rotate rather than create, use `vault.update_secret(<uuid>, '<SECRET>')`
with the id from `vault.secrets`. `trigger_notification_retry()` reads Vault on
every run, so a rotation takes effect on the next tick with no redeploy.

### Step 5. Verify

Confirm both secrets landed and the schedule carries no credential:

```sql
SELECT
  (SELECT count(*) FROM vault.decrypted_secrets WHERE name='opus_admin_base_url')       AS base_url,
  (SELECT count(*) FROM vault.decrypted_secrets WHERE name='notification_retry_secret') AS secret,
  (SELECT command FROM cron.job WHERE jobname='notification-email-retry')               AS cron_command,
  (SELECT count(*) FROM cron.job WHERE jobname='notification-email-retry' AND active)   AS cron_active;
```

Both counts must be `1`, and `cron_command` must be exactly
`SELECT public.trigger_notification_retry();` — anything longer means a secret
is sitting in the schedule.

Fire the trigger manually rather than waiting ten minutes:

```sql
SELECT public.trigger_notification_retry();
```

Then read what the cron actually received. **This is the check that matters**,
because a secret mismatch is otherwise completely silent:

```sql
SELECT status_code, content::text, created
FROM net._http_response
ORDER BY created DESC
LIMIT 3;
```

- `200` — working. The body reports `claimed`/`sent`/`failed`/`abandoned`.
- `401` — the Vercel secret and the database secret do not match, or step 3
  was skipped so the deployment has not picked up the variable.
- No rows — the trigger no-opped, meaning neither Vault nor `app.settings.*`
  yielded a base URL and secret. Re-run step 5.

Finally, from the repo:

```bash
NOTIFICATION_RETRY_CRON_SECRET='<SECRET>' NEXT_PUBLIC_ADMIN_URL='https://admin.opusfesta.com' \
  npx tsx apps/opus_admin/scripts/verify-notification-retry.ts --probe
```

This asserts the endpoint rejects a wrong secret **and** accepts the real one.

### Step 6. Acceptance test

1. Unset `RESEND_API_KEY` on Vercel (or use a deliberately invalid key) and
   redeploy.
2. Submit an approval request routed to a real approver.
3. Confirm `/insights/notifications` shows a queued or failed message.
4. Restore `RESEND_API_KEY`, redeploy.
5. Run `SELECT public.trigger_notification_retry();`.
6. Confirm the message is delivered and `/insights/notifications` returns to
   healthy.
7. **Confirm the approval decision was not repeated** and the recipient got
   exactly one message.

Steps 6 and 7 are the ones people skip. They are the reason the test exists.

---

## Gate 2 — Multi-role browser QA

### Read this first: the approver roster is hardcoded

`APPROVER_ROSTER` in `apps/opus_admin/src/app/(admin)/approvals/data.ts` is a
static list of three people:

| id | name | email |
|---|---|---|
| `app_owner` | OpusFesta Owner | `admin@opusfesta.com` |
| `app_ulumbi` | Ulumbi Samwel Dyamo | `udyamo@gmail.com` |
| `app_timothy` | Timothy Mwamoto | `timothymwamoto8@gmail.com` |

`resolveApprovers()` validates every submitted approver against this list and
**silently drops anything else**. A request cannot be routed to a person who is
not in it.

So the nine-identity matrix cannot be run as written. Pick one:

- **Option A (no code change):** use these three real accounts as the
  approver-side identities. Test accounts cover only the requester and
  no-access cases. Fastest, and sufficient to prove scoping.
- **Option B (code change):** add test approvers to `APPROVER_ROSTER`, deploy,
  and remove them afterwards. Fuller matrix, but it means shipping test
  fixtures to production code.

Option A is recommended for the pilot. Note the limitation in the results.

### How an identity is created

Two halves, both required:

1. **Clerk user** on the production Clerk instance backing
   `admin.opusfesta.com`. Confirm you are on the right instance before
   creating anything: pointing admin at the wrong Clerk instance has caused an
   outage here before.
2. **`workforce_employees` row** with the *same email*, `dashboard_access`
   enabled, and a `dashboard_role_id` pointing at the intended role. Create it
   through Workforce → Employees in the admin UI rather than by hand.

The email must match exactly. Approvals resolves identity by email
(`getCallerEmail()` → `isRelevantTo`), so a Clerk user with no matching
employee row can sign in but will see nothing and be attributable to nothing.

### The role matrix, mapped to real roles

Approvals opens for `finance.read OR workforce.read`. Checked against the live
`workforce_roles` table, that is what each role actually does:

| Test identity | Use role | Can open Approvals? | What it proves |
|---|---|---|---|
| Requesting employee | `viewer` | Yes | Ordinary raise-and-submit |
| Unrelated employee | `viewer` (2nd account) | Yes | Cannot see requests they are not on |
| Assigned approver | roster member | Yes | Decide, and only when named |
| Unrelated manager | roster member not on the request | Yes | Named-approver scoping |
| Finance approver | `finance` | Yes | Also sees Analytics (`finance.write`) |
| People Ops approver | `people-ops` | Yes | No Analytics (no `finance.write`) |
| **Custom elevated role** | `content-editor` **or** `vendor-success` | **No** | Holding `cms.write` / `vendor.moderate` grants no approvals access at all |
| Administrator | `admin` | Yes | Analytics + Request Types management |
| Revoked employee | any, then disable `dashboard_access` | No | Access ends immediately |

The `content-editor` / `vendor-success` row is the highest-value negative test:
neither holds `finance.read` or `workforce.read`, so both should be refused at
the module boundary, not merely shown an empty list.

### Scenarios to run

For each identity, in a real browser:

1. Open `/approvals`. Confirm the request list contains only requests they
   raised or are named on.
2. Paste a request ID belonging to someone else directly into the URL. Confirm
   "Request not found" and no leaked subject, amount, or requester.
3. As the requester, try to approve your own request. Confirm refusal.
4. As a named approver, approve. Confirm the audit entry and the notification.
5. As a second approver, decide the same request simultaneously. Confirm the
   loser sees "changed while you were viewing it".
6. Revoke `dashboard_access` while a session is open, then act. Confirm the
   server refuses, not just the UI.
7. Confirm Analytics appears only for `finance` / `admin` / `owner`.
8. Confirm Request Types management appears only for `admin` / `owner`.

Record pass/fail per identity per scenario with a screenshot or query result.

---

## Gate 3 — Operational ownership

Fill this in and paste it into `docs/APPROVALS_RELEASE_RECORD.md` before the
pilot starts. A gate with no name against it is not closed.

| Responsibility | Owner | Backup | Contact route |
|---|---|---|---|
| Monitoring and alerts | | | |
| Approval support requests | | | |
| Notification retry failures | | | |
| Authorization incidents | | | |
| Rollback execution | | | |
| Database migration incidents | | | |
| Pilot feedback and defect triage | | | |

### Monitoring

`/insights/notifications` is the surface. Whoever owns notification retry
failures should check it daily during the pilot and act on:

- **Abandoned > 0** — someone was not told something. Terminal; will never
  retry on its own.
- **Oldest queued > 1h** — the worker is not running or cannot authenticate.
  Check the secret match first.
- **Awaiting provider > 0** — `RESEND_API_KEY` is missing.

### Rollback

The approvals feature has no feature flag. Rolling back means redeploying the
previous Vercel deployment (Vercel → opus-admin → Deployments → Promote).

The database migrations are **additive and safe to leave in place**: new
columns are nullable, the new tables are unused by older code, and the new
functions are only called by the new code. Do not attempt to reverse them
during an incident.

The one exception is `trg_approval_activity_append_only`, which blocks deletes
on `approval_request_activity` and therefore on cascaded deletes of
`approval_requests`. If an older code path needs to delete a request, use the
governed purge instead:

```sql
SELECT public.approval_request_purge('<request-id>', '<reason, min 8 chars>', '<actor email>');
```

Remove any attachment files through the Storage API **before** purging.
Supabase blocks direct `DELETE` on `storage.objects`, so the purge cannot clean
them and they would be orphaned.

### Pilot communication

Pilot participants must be told:

- The admin dashboard is **desktop-only** this release. A notice appears on
  narrow screens.
- Until gate 1 is verified, a decision made during an email outage may not be
  communicated.
- Where to report a problem, and who owns it.
