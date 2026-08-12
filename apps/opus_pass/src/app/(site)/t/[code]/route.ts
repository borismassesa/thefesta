import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { isWalletTokenShape } from '@/lib/checkin/wallet-token-core'
import { buildGoogleSaveLink, loadGoogleWalletConfig } from '@/lib/wallet/google-core'
import { proofPassModel } from '@/lib/wallet/redirect-proof'
import type { IssueWalletPassOutcome } from '@/lib/wallet/issue'

// Signs on every request, and the destination differs each time. Nothing here
// may be cached, at the edge or anywhere else.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * `/t/<code>` — the stable entrance-pass handoff.
 *
 * A wallet-enabled WhatsApp template carries one permanent management token,
 * never a Google save URL. The destination is decided here at tap time: a
 * guest whose current Google object can be provisioned is sent into Google's
 * save flow, and every recoverable failure lands on the Digital Entrance Pass
 * where the scannable ticket remains available.
 *
 * The isolated WALLET_REDIRECT_PROOF_CODE path remains temporarily so the
 * off-domain WhatsApp redirect can be re-tested without touching a guest or
 * database row. It has a deliberately fake admission and stays off by default.
 */

const NO_TRACE = {
  'cache-control': 'private, no-store',
  'referrer-policy': 'no-referrer',
} as const

/**
 * Compare through SHA-256 so neither the code's contents nor its LENGTH leaks
 * through timing. `timingSafeEqual` throws on a length mismatch, so comparing
 * the raw strings would need a length check first, and that check is itself the
 * leak. Digests are always 32 bytes.
 */
function sameCode(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

/** Never persist a raw capability in the rate-limit table. */
export function walletRateLimitFingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

type IssueGooglePass = (token: string, provider: 'google') => Promise<IssueWalletPassOutcome>

/**
 * Resolve a valid guest capability using an injected issuer.
 *
 * Exported as a test seam: unit tests can exercise every redirect outcome
 * without a live Supabase project or a Google service-account key.
 */
export async function resolveGuestHandoff(
  token: string,
  requestUrl: string,
  issue: IssueGooglePass
): Promise<NextResponse> {
  try {
    const outcome = await issue(token, 'google')
    if (outcome.status === 'ok') {
      return NextResponse.redirect(outcome.saveUrl, { status: 302, headers: NO_TRACE })
    }
    if (outcome.status === 'failed') {
      console.error('[wallet:handoff] Google issuance failed; showing the digital pass')
    }
  } catch (err) {
    console.error('[wallet:handoff] issuance threw; showing the digital pass', {
      kind: (err as Error)?.name,
    })
  }

  // Keep the guest on a useful surface for provider outages, missing rollout
  // config, revoked links and past events. /p applies the detailed eligibility
  // checks and never reveals contact information.
  return NextResponse.redirect(
    new URL(`/p/${encodeURIComponent(token)}`, requestUrl),
    { status: 302, headers: NO_TRACE }
  )
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const expected = process.env.WALLET_REDIRECT_PROOF_CODE
  if (expected && sameCode(code, expected)) {
    return proofRedirect()
  }

  if (!isWalletTokenShape(code)) {
    return new NextResponse('Not found', { status: 404, headers: NO_TRACE })
  }

  // The template button is a GET, so it can be followed by link previewers.
  // Provisioning is idempotent, but still costs database and Google calls; use
  // both a broad per-IP budget and a tight per-capability budget. Dynamic
  // imports keep the proof route independent of Supabase configuration.
  const [{ createSupabaseServerClient }, rateLimit, walletIssue] = await Promise.all([
    import('@/lib/supabase'),
    import('@/lib/checkin/rate-limit'),
    import('@/lib/wallet/issue'),
  ])
  const supabase = createSupabaseServerClient()
  const fingerprint = walletRateLimitFingerprint(code)
  const allowedByIp = await rateLimit.withinRateLimit(
    supabase,
    `wallet-handoff-ip:${rateLimit.clientIp(req)}`,
    30,
    60
  )
  const allowedByToken = allowedByIp
    ? await rateLimit.withinRateLimit(supabase, `wallet-handoff:${fingerprint}`, 10, 60)
    : false

  if (!allowedByIp || !allowedByToken) {
    return NextResponse.redirect(
      new URL(`/p/${encodeURIComponent(code)}`, req.url),
      { status: 302, headers: NO_TRACE }
    )
  }

  return resolveGuestHandoff(code, req.url, walletIssue.issueWalletPassForToken)
}

async function proofRedirect(): Promise<NextResponse> {

  const config = loadGoogleWalletConfig(process.env)
  if (!config) {
    // Reachable only by someone who already holds the proof code, so naming the
    // fault costs nothing and saves an operator guessing. loadGoogleWalletConfig
    // has already logged which variable is at fault.
    console.error('[wallet:proof] the proof code matched but Google Wallet is not configured')
    return new NextResponse('Google Wallet is not configured', { status: 503, headers: NO_TRACE })
  }

  // Signed fresh on every tap, never stored. This is the property the real
  // resolver keeps: the link is generated at tap time against whatever object
  // is current, rather than minted once and carried in a message forever.
  let saveUrl: string
  try {
    saveUrl = buildGoogleSaveLink(config, proofPassModel()).saveUrl
  } catch (err) {
    // The private key is the only thing here that can throw, and its failure
    // message can echo key material, so only the kind is logged.
    console.error('[wallet:proof] could not sign the save link', { kind: (err as Error)?.name })
    return new NextResponse('Could not build a save link', { status: 500, headers: NO_TRACE })
  }

  // 302 rather than 307/308: the destination is regenerated per request, so it
  // is temporary in the strict sense, and a permanent redirect is exactly the
  // thing an intermediary would be entitled to cache.
  return NextResponse.redirect(saveUrl, { status: 302, headers: NO_TRACE })
}
