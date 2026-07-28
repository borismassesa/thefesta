import { NextResponse, type NextRequest } from 'next/server'
import { getShopOrderForBuyer, orderRowToShopDetail } from '@/lib/shop/order-access'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Guest order tracking. The buyer proves ownership with the email used at
// checkout (see getShopOrderForBuyer) — a wrong/absent email returns the same
// generic 404 as an unknown ref so orders can't be enumerated.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { ref?: unknown; email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const ref = typeof body.ref === 'string' ? body.ref : ''
  const email = typeof body.email === 'string' ? body.email : ''
  if (!ref || !email) return NextResponse.json({ error: 'Enter your order number and email.' }, { status: 400 })

  const order = await getShopOrderForBuyer(ref, email)
  if (!order) return NextResponse.json({ error: "We couldn't find an order matching that number and email." }, { status: 404 })

  return NextResponse.json(orderRowToShopDetail(order))
}
