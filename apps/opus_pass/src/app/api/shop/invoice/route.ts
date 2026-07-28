import { NextResponse, type NextRequest } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ReactElement } from 'react'
import { InvoicePdf } from '@/lib/invoice-pdf'
import { orderRowToStoredOrder } from '@/lib/payments/orders'
import { getShopOrderForBuyer } from '@/lib/shop/order-access'

export const runtime = 'nodejs'

// Guest invoice download — same email-gated ownership check as order tracking.
// (The /api/invoice route is admin-secret or full-payload only; a guest has
// neither the secret nor the reconstructed StoredOrder, so this reads the
// persisted order after proving the buyer's email.)
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { ref?: unknown; email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const ref = typeof body.ref === 'string' ? body.ref : ''
  const email = typeof body.email === 'string' ? body.email : ''
  if (!ref || !email) return NextResponse.json({ error: 'Missing order number or email.' }, { status: 400 })

  const order = await getShopOrderForBuyer(ref, email)
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  try {
    const pdf = await renderToBuffer(
      createElement(InvoicePdf, { order: orderRowToStoredOrder(order) }) as ReactElement<DocumentProps>,
    )
    const safeRef = order.ref.replace(/[^A-Za-z0-9_-]/g, '') || 'order'
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="OpusFesta-Invoice-${safeRef}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[api/shop/invoice] PDF render failed', err)
    return NextResponse.json({ error: 'Could not generate the invoice.' }, { status: 500 })
  }
}
