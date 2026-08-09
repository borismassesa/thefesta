import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { buildGoogleSaveLink, loadGoogleWalletConfig } from '@/lib/wallet/google-core'
import { proofPassModel } from '@/lib/wallet/redirect-proof'

// Signs on every request, and the destination differs each time. Nothing here
// may be cached, at the edge or anywhere else.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * `/t/<code>` — the redirect resolver, in its milestone-1 proof form.
 *
 * WHAT THIS EVENTUALLY BECOMES. One permanent, stable WhatsApp action per
 * guest. The message carries this URL and nothing else, and the destination is
 * decided here at tap time: a guest whose Google Wallet object is ready is sent
 * straight into Google's save flow, and everyone else lands on the Digital
 * Entrance Pass. That indirection is the whole point. A signed Google save URL
 * baked into a WhatsApp message would be frozen at send time, and a WhatsApp
 * message cannot be recalled, so a later credential rotation would leave the
 * guest tapping through to a pass the door has already stopped accepting.
 *
 * WHY IT IS A STUB TODAY. The architecture above depends on an undocumented
 * fact: that WhatsApp follows a template URL button through a 302 to
 * pay.google.com. Meta documents URL buttons and dynamic parameters, but says
 * nothing about where a redirect may land, and the button's base URL is frozen
 * when the template is approved. So this route exists first, in the smallest
 * form that can answer that question, and the resolver replaces its body once
 * the answer is in.
 *
 * WHY IT DOES NOT GO THROUGH THE PAUSED ADAPTER. `GOOGLE_WALLET_PAUSED` stops
 * Google Wallet reaching a guest, and it stays on. This route serves no guest:
 * it knows exactly one hardcoded test admission and cannot be pointed at a real
 * one, because it never reads a token, a database or a request body. Routing it
 * through `providers.ts` would only mean unpausing the thing the pause exists
 * to hold shut.
 *
 * WHY IT IS OFF BY DEFAULT. `WALLET_REDIRECT_PROOF_CODE` is unset everywhere
 * until someone sets it for a test, so the route 404s in every environment
 * including production. There is nothing to switch off afterwards beyond
 * clearing the variable.
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

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const expected = process.env.WALLET_REDIRECT_PROOF_CODE
  // Unset means the proof is not running. Indistinguishable from a wrong code
  // on purpose: this is a public URL, and the shape of a 404 should not tell a
  // stranger whether a test is in progress.
  if (!expected || !sameCode(code, expected)) {
    return new NextResponse('Not found', { status: 404, headers: NO_TRACE })
  }

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
