import { NextResponse } from 'next/server'
import { finalizeProductOrder } from '@/lib/payments/product-orders'

// Called by opus_admin after a Lipa Namba product order is approved (which
// writes status='paid' directly, bypassing transitionOrder). Runs the paid
// product order's app-side side effects — the finalize RPC (idempotent) plus
// couple notification and guest/couple receipts. Bearer-gated with the same
// shared secret the admin invoice/revalidate calls already use.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.OPUS_PASS_REVALIDATE_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let ref: string | undefined
  try {
    ref = ((await req.json()) as { ref?: string }).ref
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
  }
  if (!ref) return NextResponse.json({ ok: false, error: 'Missing ref' }, { status: 400 })

  await finalizeProductOrder(ref)
  return NextResponse.json({ ok: true })
}
