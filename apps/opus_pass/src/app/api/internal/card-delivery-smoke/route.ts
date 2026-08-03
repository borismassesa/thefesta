import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { deriveAssetToken } from '@/lib/cards/asset-tokens'
import { prepareGuestCardAsset } from '@/lib/cards/prepare-guest-asset'
import { wasmInitCount } from '@/lib/cards/raster'
import { smokeAccessPermitted } from '@/lib/cards/smoke-access'
import { verifyPreparedGuestAsset } from '@/lib/cards/verify-asset'

// Proof that the real rasterisation path survives Next bundling, the Vercel
// runtime, PostgREST and Supabase Storage together.
//
// It exists because nothing else can supply that evidence. Unit tests run
// outside the bundle, the token route only streams bytes somebody else wrote,
// and a green build proves only that the application compiles, not that the
// module under test was included in it at all.
//
// Three properties keep it from becoming an attack surface:
//
//   IT TAKES NOTHING. No SVG, no fonts, no storage path, no guest, no release,
//   no token. The fixture is named by environment variables an operator sets, so
//   there is no input for a caller to poison and no way to point it at a real
//   customer's order from outside.
//
//   IT CANNOT RUN IN PRODUCTION. Excluded by environment before the secret is
//   even considered, so a leaked secret is not sufficient to reach it.
//
//   IT SAYS ALMOST NOTHING. Byte counts and dimensions. No paths, names, hashes,
//   provider messages or stack traces.
//
// Every failure, including a wrong secret, is the same bare 404. A 401 would
// confirm the endpoint exists.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RENDER_VARIANT = 'whatsapp_header_v1'
/** PNG magic number, so "we got an image" is checked rather than assumed. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (!smokeAccessPermitted(request)) return notFound()

  const designReleaseId = process.env.CARD_DELIVERY_SMOKE_RELEASE_ID
  const guestId = process.env.CARD_DELIVERY_SMOKE_GUEST_ID
  // Configured by an operator against a staging fixture, never a real order.
  if (!designReleaseId || !guestId) return notFound()

  const subject = { designReleaseId, guestId, renderVariant: RENDER_VARIANT }
  const supabase = createSupabaseServerClient()
  const initBefore = wasmInitCount()

  // 1. The real preparation service, against the real Supabase client: claim,
  //    private SVG download, font resolution and download, WASM, render, upload,
  //    ready update.
  const first = await prepareGuestCardAsset(subject, supabase)
  if (!first.ok) {
    return NextResponse.json({ ok: false, stage: 'prepare', code: first.code }, { status: 200 })
  }
  const initAfterFirst = wasmInitCount()

  // 2. The object is really there, through the same check the send preflight
  //    will use.
  const presence = await verifyPreparedGuestAsset(supabase, first.assetId)
  if (presence.presence !== 'ready_and_present') {
    return NextResponse.json(
      { ok: false, stage: 'verify', code: presence.presence },
      { status: 200 },
    )
  }

  // 3. Fetch it the way Meta would: unauthenticated, over the public token URL.
  const token = deriveAssetToken(subject)
  if (!token) return NextResponse.json({ ok: false, stage: 'token' }, { status: 200 })

  const origin = new URL(request.url).origin
  const publicResponse = await fetch(`${origin}/invite-card/${token}.png`, { cache: 'no-store' })
  if (!publicResponse.ok) {
    return NextResponse.json(
      { ok: false, stage: 'public_fetch', status: publicResponse.status },
      { status: 200 },
    )
  }
  const bytes = new Uint8Array(await publicResponse.arrayBuffer())
  const signatureOk = PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)

  // 4. Again, to prove the asset is reused rather than rebuilt and that WASM
  //    initialised once for this process rather than once per request.
  const second = await prepareGuestCardAsset(subject, supabase)
  const initAfterSecond = wasmInitCount()

  return NextResponse.json(
    {
      ok: signatureOk && second.ok && second.status === 'reused',
      wasmInitialized: initAfterFirst > initBefore || initBefore > 0,
      // Counted, not timed. A faster second request would prove nothing.
      secondRunReusedInitialization: initAfterSecond === initAfterFirst,
      assetReused: second.ok ? second.status === 'reused' : false,
      sameAsset: second.ok ? second.assetId === first.assetId : false,
      pngSignatureValid: signatureOk,
      pngBytes: bytes.byteLength,
      contentType: publicResponse.headers.get('content-type'),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
