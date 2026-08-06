import { NextResponse, type NextRequest } from 'next/server'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { getSmsProvider, getSmsProviderDiagnostics } from '@/lib/sms'
import { envFlag } from '@/lib/sms/config'
import { checkTanzanianPhone, maskPhone } from '@/lib/sms/phone'
import { analyzeSmsLength } from '@/lib/sms/segments'

/**
 * One SMS, to one number the caller states is their own.
 *
 * Its purpose is to capture Beem's real send response before any persistence,
 * delivery-state or bulk sending is designed — so it is deliberately incapable
 * of doing anything else:
 *
 *  - the phone number must be supplied explicitly in the request body
 *  - the message text must be supplied explicitly; no template is applied
 *  - the tester must assert the number is theirs (`confirmOwnNumber: true`)
 *  - exactly one recipient; an array is rejected rather than taking [0]
 *  - no guest, roster or event data is read, so production contacts cannot be
 *    reached through here even by mistake, and no answer it gives reveals
 *    whether a number exists in the guest database
 *
 * AUTHORIZATION. This route takes a destination and an arbitrary body, so
 * whoever holds its credential can send any text to any Tanzanian number at
 * our expense and under our approved sender name. That is a materially
 * different power from cache revalidation, so it does NOT reuse
 * `OPUS_PASS_REVALIDATE_SECRET`; it has its own secret, its own kill switch,
 * and a rate limit.
 */
export const runtime = 'nodejs'

/** Beyond ~3 segments a "test" is really a cost experiment; the composer, not
 *  this route, is where long copy belongs. */
const MAX_SEGMENTS = 3
const MAX_MESSAGE_LENGTH = 480

/** Per-hour ceiling. Generous for validation, useless for abuse. */
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

interface TestSendBody {
  phone?: unknown
  message?: unknown
  confirmOwnNumber?: unknown
}

/**
 * Fixed-window limiter, reusing the Postgres RPC added for check-in
 * (migration 20260722000004) — it is a generic keyed counter, and needing no
 * new table keeps this route inside the agreed scope.
 *
 * Unlike the check-in caller this fails CLOSED. A jammed door is worse than a
 * refused check-in; an unbounded send endpoint is worse than a refused test.
 */
async function withinRateLimit(key: string): Promise<boolean> {
  try {
    const { data, error } = await createDashboardClient().rpc('checkin_rate_limit', {
      p_key: key,
      p_max: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })
    if (error) {
      console.error('[sms:test-send] rate-limit check failed, refusing', error.message)
      return false
    }
    return data !== false
  } catch (e) {
    console.error('[sms:test-send] rate-limit check threw, refusing', e instanceof Error ? e.message : e)
    return false
  }
}

export async function POST(req: NextRequest) {
  // Kill switch, checked before authentication so a leaked secret is inert
  // while the switch is off. Enabling it is a deliberate act during validation.
  if (!envFlag(process.env.SMS_BEEM_TEST_SEND_ENABLED)) {
    return NextResponse.json({ error: 'test_send_disabled' }, { status: 404 })
  }

  const secret = process.env.OPUS_PASS_SMS_TEST_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Who is asking. Recorded with every outcome so a surprise on the bill has a
  // name against it; required, because "someone with the secret" is not an
  // actor. Never used to look anything up.
  //
  // TEMPORARY LIMITATION: this value is caller-supplied, so a holder of the
  // secret can rotate actor strings and walk past the per-actor rate limit. It
  // is tolerable only because the route is disabled by default, needs its own
  // secret, and exists for controlled testing rather than production use. When
  // this moves behind Clerk, derive the actor from the authenticated session
  // and stop trusting the header.
  const actor = req.headers.get('x-opus-actor')?.trim()
  if (!actor) {
    return NextResponse.json({ error: 'actor_header_required' }, { status: 400 })
  }

  let body: TestSendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // A single string, never an array: silently sending to the first of a list
  // is exactly the bulk behaviour this route must not have.
  if (typeof body.phone !== 'string' || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'phone_and_message_required' }, { status: 400 })
  }
  if (body.confirmOwnNumber !== true) {
    return NextResponse.json({ error: 'confirm_own_number_required' }, { status: 400 })
  }

  const message = body.message.trim()
  if (!message) {
    return NextResponse.json({ error: 'message_empty' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'message_too_long', maxLength: MAX_MESSAGE_LENGTH }, { status: 400 })
  }

  // Nothing dynamic: a test body is literal text. A URL here would mean either
  // a guest token in a log or a link the tester did not compose.
  if (/https?:\/\/|\{\{|\}\}/.test(message)) {
    return NextResponse.json({ error: 'message_must_be_literal_text' }, { status: 400 })
  }

  // Segments, not characters, are what we pay for.
  const analysis = analyzeSmsLength(message)
  if (analysis.segments > MAX_SEGMENTS) {
    return NextResponse.json(
      { error: 'too_many_segments', segments: analysis.segments, maxSegments: MAX_SEGMENTS },
      { status: 400 },
    )
  }

  const phone = checkTanzanianPhone(body.phone)
  if (!phone.sendable) {
    return NextResponse.json(
      { error: phone.rejection === 'unsupported_prefix' ? 'unsupported_prefix' : 'invalid_phone' },
      { status: 400 },
    )
  }
  const destination = phone.canonical!

  if (!(await withinRateLimit(`sms-test-send:${actor}`))) {
    return NextResponse.json({ error: 'rate_limited', maxPerHour: RATE_LIMIT_MAX }, { status: 429 })
  }

  // 'invitation' is the purpose being brought live first, so a test send runs
  // the same gate the real surface will.
  const provider = getSmsProvider('invitation')
  const result = await provider.sendText(destination, message)
  const dryRun = Boolean(result.dryRun)

  console.warn('[sms:test-send]', {
    actor,
    destination: maskPhone(destination),
    segments: analysis.segments,
    encoding: analysis.encoding,
    mode: dryRun ? 'dry_run' : 'live',
    ok: result.ok,
    provider: result.provider ?? null,
    requestId: result.requestId ?? null,
    httpStatus: result.httpStatus ?? null,
    error: result.error ?? null,
  })

  // `ok: true, dryRun: true` read as "sent" to anything skimming the response,
  // which is how a validation pass ends with everyone believing an SMS went out
  // that never did. `mode` is unambiguous, and the explanation names the switch
  // that is off. Diagnostics ride along so the fix needs no second request.
  return NextResponse.json({
    ok: result.ok,
    mode: dryRun ? 'dry_run' : 'live',
    message: dryRun
      ? 'No SMS was sent. Invitation SMS is not enabled for this environment.'
      : 'Handed to the gateway. Acceptance is not delivery: confirm on the handset.',
    provider: result.provider ?? null,
    requestId: result.requestId ?? null,
    providerCode: result.providerCode ?? null,
    httpStatus: result.httpStatus ?? null,
    segments: analysis.segments,
    encoding: analysis.encoding,
    error: result.error ?? null,
    diagnostics: dryRun ? getSmsProviderDiagnostics('invitation') : undefined,
  })
}
