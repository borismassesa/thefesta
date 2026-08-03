import { NextResponse } from 'next/server'
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
  _req: Request,
  { params }: { params: Promise<{ token: string; provider: string }> }
) {
  const { token, provider } = await params

  if (!PROVIDERS.has(provider as WalletProviderId)) {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404, headers: NO_REFERRER })
  }

  const outcome = await issueWalletPassForToken(token, provider as WalletProviderId)

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
