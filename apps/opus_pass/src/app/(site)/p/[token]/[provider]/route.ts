import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { clientIp, RATE_LIMITED_RESPONSE, withinRateLimit } from '@/lib/checkin/rate-limit'
import { issueWalletPassForToken } from '@/lib/wallet/issue'
import type { WalletProviderId } from '@/lib/wallet/types'

// Per-guest and capability-gated; never cached.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PROVIDERS = new Set<WalletProviderId>(['google', 'apple'])

const NO_REFERRER = { 'referrer-policy': 'no-referrer', 'cache-control': 'private, no-store' }

/**
 * Mint a save link for one guest's pass.
 *
 * POST, not GET, on purpose. Issuing writes a bookkeeping row and mints a
 * signed credential-bearing link, and a GET would be prefetched by browsers,
 * link previewers and WhatsApp's own crawler — every one of which would
 * generate a pass nobody asked for and put the link in a history entry.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; provider: string }> }
) {
  const { token, provider } = await params

  if (!PROVIDERS.has(provider as WalletProviderId)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404, headers: NO_REFERRER })
  }

  // Unauthenticated, and every accepted request costs a database lookup, a
  // credential write and an RSA signature. Every other credential-adjacent
  // route in this app is rate limited; this one is public and mutating, so it
  // gets both a per-IP budget and a much tighter per-token one — a forwarded
  // link should not be able to inflate pass_version without bound.
  const supabase = createSupabaseServerClient()
  if (!(await withinRateLimit(supabase, `wallet-issue-ip:${clientIp(req)}`, 30, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429, headers: NO_REFERRER })
  }
  if (!(await withinRateLimit(supabase, `wallet-issue:${token.slice(0, 40)}`, 10, 60))) {
    return NextResponse.json(RATE_LIMITED_RESPONSE, { status: 429, headers: NO_REFERRER })
  }

  // Issuance reaches code that THROWS rather than degrades: the credential
  // keyring and the Supabase client both do on missing configuration. Without
  // this the route answers with a non-JSON 500 page, and the client's parse
  // failure erases even that.
  let outcome
  try {
    outcome = await issueWalletPassForToken(token, provider as WalletProviderId)
  } catch (err) {
    console.error('[wallet] issuance threw', {
      provider,
      kind: (err as Error)?.name,
      message: (err as Error)?.message,
    })
    return NextResponse.json({ error: 'issue_failed' }, { status: 500, headers: NO_REFERRER })
  }

  switch (outcome.status) {
    case 'ok':
      return NextResponse.json({ saveUrl: outcome.saveUrl }, { headers: NO_REFERRER })
    case 'not_configured':
      // The button should not have been shown. Answer honestly rather than
      // pretending the guest's pass is the problem.
      return NextResponse.json({ error: 'not_configured' }, { status: 503, headers: NO_REFERRER })
    case 'unavailable':
      // Same 404 as every other unavailable state on this surface: unknown,
      // revoked, not yet confirmed and past-event are indistinguishable.
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_REFERRER })
    default:
      return NextResponse.json({ error: 'issue_failed' }, { status: 500, headers: NO_REFERRER })
  }
}
