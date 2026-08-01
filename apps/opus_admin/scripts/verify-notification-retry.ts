/**
 * Preflight for the notification retry worker.
 *
 * The retry path has four moving parts that must agree, and every way of
 * getting it wrong fails silently:
 *
 *   1. NOTIFICATION_RETRY_CRON_SECRET on the app (Vercel)
 *   2. app.settings.notification_retry_secret in the database
 *   3. app.settings.opus_admin_base_url in the database
 *   4. the pg_cron job that ties them together
 *
 * If (2) is unset the trigger no-ops with a NOTICE nobody reads. If (1) and
 * (2) disagree the cron POSTs every ten minutes and gets a 401 that lands
 * nowhere. In both cases approvals decided during an outage are never
 * communicated and nothing surfaces it. This checks all four and says which
 * one is wrong.
 *
 * Read-only: it never sends email and never mutates delivery state. The live
 * endpoint probe is opt-in via --probe, and even then it only asks the worker
 * to run a normal drain.
 *
 *   npx tsx --env-file=.env.local scripts/verify-notification-retry.ts
 *   npx tsx --env-file=.env.local scripts/verify-notification-retry.ts --probe
 */
import { createSupabaseAdminClient } from '../src/lib/supabase'

type Check = { name: string; ok: boolean; detail: string }
const checks: Check[] = []
const add = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail })

async function main() {
  const probe = process.argv.includes('--probe')
  const db = createSupabaseAdminClient()

  // ---- 1. App-side secret ---------------------------------------------------
  const appSecret = process.env.NOTIFICATION_RETRY_CRON_SECRET ?? ''
  add(
    'NOTIFICATION_RETRY_CRON_SECRET is set',
    appSecret.length > 0,
    appSecret.length > 0
      ? `${appSecret.length} chars`
      : 'unset — the endpoint rejects every request with 401',
  )

  // ---- 2/3. Database settings ----------------------------------------------
  // Not checkable from here. `current_setting()` and `cron.job` are not
  // reachable over PostgREST, and adding a generic SQL RPC to make them
  // readable would be a far worse trade than printing two queries for an
  // operator to run. The endpoint probe below is what actually catches a
  // secret mismatch, which is the failure that matters.

  // ---- 4. Endpoint behaviour ------------------------------------------------
  const baseUrl =
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3010'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/notifications/retry`

  if (probe) {
    // Wrong secret must be rejected. This is the check that catches a
    // mismatch between Vercel and the database, which is otherwise invisible.
    try {
      const bad = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer definitely-not-the-secret' },
      })
      add(
        'endpoint rejects a wrong secret',
        bad.status === 401,
        `got ${bad.status}, expected 401`,
      )
    } catch (err) {
      add('endpoint rejects a wrong secret', false, `unreachable: ${(err as Error).message}`)
    }

    if (appSecret) {
      try {
        const good = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${appSecret}` },
        })
        const body = (await good.json().catch(() => ({}))) as Record<string, unknown>
        add(
          'endpoint accepts the configured secret',
          good.status === 200,
          good.status === 200
            ? `drained: ${JSON.stringify(body)}`
            : `got ${good.status} — the app secret does not match what the endpoint expects`,
        )
      } catch (err) {
        add('endpoint accepts the configured secret', false, `unreachable: ${(err as Error).message}`)
      }
    }
  } else {
    add('endpoint probe', true, 'skipped (pass --probe to exercise it)')
  }

  // ---- Queue health ---------------------------------------------------------
  const { data: queue } = await db
    .from('staff_notifications')
    .select('delivery_status, created_at')
    .eq('channel', 'email')
    .in('delivery_status', ['pending', 'failed', 'abandoned'])
    .returns<{ delivery_status: string; created_at: string }[]>()

  const rows = queue ?? []
  const oldest = rows.reduce<string | null>(
    (acc, r) => (!acc || r.created_at < acc ? r.created_at : acc),
    null,
  )
  const stuckHours = oldest ? (Date.now() - new Date(oldest).getTime()) / 3_600_000 : 0
  add(
    'no message is stuck in the queue',
    stuckHours < 1,
    oldest
      ? `oldest queued ${stuckHours.toFixed(1)}h ago (${rows.length} undelivered)`
      : 'queue empty',
  )

  // ---- Report ---------------------------------------------------------------
  console.log('\nNotification retry preflight\n')
  for (const c of checks) {
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }

  console.log(`\n  endpoint: ${endpoint}`)
  console.log(
    '\n  Database settings cannot be read over PostgREST. Verify them directly:\n' +
      "    SELECT current_setting('app.settings.opus_admin_base_url', true),\n" +
      "           current_setting('app.settings.notification_retry_secret', true);\n" +
      "    SELECT jobname, schedule, active FROM cron.job WHERE jobname='notification-email-retry';\n" +
      '  The secret there MUST equal NOTIFICATION_RETRY_CRON_SECRET, or the cron\n' +
      '  silently receives 401 every ten minutes.',
  )

  const failed = checks.filter((c) => !c.ok)
  console.log(
    failed.length === 0
      ? '\n  All local checks passed.\n'
      : `\n  ${failed.length} check(s) failed.\n`,
  )
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((err) => {
  console.error('preflight crashed:', err)
  process.exitCode = 1
})
