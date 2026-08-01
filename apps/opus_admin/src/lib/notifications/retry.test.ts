import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MAX_ATTEMPTS, backoffMs, classifyFailure } from './retry'

// These decide whether a notification is eventually delivered or silently
// dropped. The queue was designed so nothing is lost, but for a long time
// nothing drained it: claim_notification_emails() existed and had no caller,
// so every obligation recorded "for the retry worker" sat forever. The worker
// now exists; this is the policy it runs on.

const NOW = 1_754_000_000_000 // fixed clock, injected

describe('backoff grows and is capped', () => {
  it('starts at a minute and doubles', () => {
    assert.equal(backoffMs(1), 60_000)
    assert.equal(backoffMs(2), 120_000)
    assert.equal(backoffMs(3), 240_000)
  })

  it('never exceeds an hour', () => {
    for (const attempt of [10, 50, 1000]) {
      assert.equal(backoffMs(attempt), 3_600_000, `attempt ${attempt} exceeded the cap`)
    }
  })

  it('treats a zero or negative attempt as the first', () => {
    // attempt_count is incremented by the claim, so it should never be < 1.
    // If it ever is, the exponent must not go negative and produce a delay
    // shorter than the base, which would hammer a failing provider.
    assert.equal(backoffMs(0), 60_000)
    assert.equal(backoffMs(-5), 60_000)
  })
})

describe('a failed send is retried until the attempt ceiling', () => {
  it('stays retryable below the ceiling, with a future next attempt', () => {
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const out = classifyFailure(attempt, NOW)
      assert.equal(out.status, 'failed', `attempt ${attempt} should stay retryable`)
      assert.ok(out.nextAttemptAt, `attempt ${attempt} has no next attempt`)
      assert.ok(
        new Date(out.nextAttemptAt!).getTime() > NOW,
        `attempt ${attempt} scheduled its retry in the past`,
      )
    }
  })

  it('retires the row at the ceiling instead of leaving it looking retryable', () => {
    // claim_notification_emails only takes rows with
    // attempt_count < p_max_attempts. A row at the ceiling written back as
    // 'failed' would never be claimed again but would still appear in the
    // "pending/failed" health count as though delivery were coming.
    const out = classifyFailure(MAX_ATTEMPTS, NOW)
    assert.equal(out.status, 'abandoned')
    assert.equal(out.nextAttemptAt, null, 'a retired row must not advertise a next attempt')
  })

  it('stays retired past the ceiling', () => {
    assert.equal(classifyFailure(MAX_ATTEMPTS + 3, NOW).status, 'abandoned')
  })

  it('honours an injected ceiling', () => {
    assert.equal(classifyFailure(2, NOW, 3).status, 'failed')
    assert.equal(classifyFailure(3, NOW, 3).status, 'abandoned')
  })
})

describe('the worker route is safe to expose and safe to run twice', () => {
  const src = readFileSync(new URL('../../app/api/notifications/retry/route.ts', import.meta.url), 'utf8')

  it('requires the shared secret before doing anything', () => {
    const guard = src.indexOf('return NextResponse.json({ error: \'Unauthorized\' }, { status: 401 })')
    const work = src.indexOf('createSupabaseAdminClient()')
    assert.ok(guard > 0 && work > 0, 'expected an auth guard and a client')
    assert.ok(guard < work, 'the worker touches the database before authenticating')
  })

  it('does not claim rows when there is no provider to send with', () => {
    // Claiming increments attempt_count. Doing that with no provider burns the
    // five-attempt budget without a single real send being tried.
    const check = src.indexOf('isEmailConfigured()')
    const claim = src.indexOf("rpc('claim_notification_emails'")
    assert.ok(check > 0 && claim > 0)
    assert.ok(check < claim, 'rows are claimed before the provider is checked')
  })

  it('claims through the locking function rather than selecting directly', () => {
    // A plain SELECT + UPDATE would let two overlapping cron ticks send the
    // same message twice.
    assert.match(src, /rpc\('claim_notification_emails'/)
    assert.ok(
      !/\.from\('staff_notifications'\)\s*\.\s*select/.test(src),
      'the worker selects the queue directly, bypassing SKIP LOCKED',
    )
  })

  it('every terminal path writes a delivery status back', () => {
    // A row left in 'sending' is claimed forever and never retried.
    const updates = src.match(/delivery_status:/g)
    assert.ok(
      (updates?.length ?? 0) >= 4,
      `expected sent/failed/abandoned write-backs, found ${updates?.length ?? 0}`,
    )
    assert.match(src, /catch \(err\)/, 'a throw mid-batch would strand rows in sending')
  })

  it('leaks no recipient or content in its response', () => {
    const body = src.slice(src.lastIndexOf('return NextResponse.json'))
    for (const leak of ['email', 'title', 'subject', 'employee']) {
      assert.ok(!body.includes(leak), `the cron response exposes ${leak}`)
    }
  })

  it('masks the address when it logs a failure', () => {
    assert.match(src, /maskEmail\(employee\.email\)/)
  })
})
