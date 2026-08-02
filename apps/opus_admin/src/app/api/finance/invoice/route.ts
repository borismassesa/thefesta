import { NextResponse, type NextRequest } from 'next/server'
import { hasPermission } from '@/lib/admin-auth'
import { requestInvoicePdf } from '@/lib/opus-pass-invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Order refs are generated server-side (e.g. OF-2M4K9X); anything outside this
// alphabet is not a ref we issued.
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Streams an order's invoice PDF out of opus_pass so Order Fulfilment can offer
 * a plain <a> download with no client JavaScript. Clerk already gates every
 * /api route via src/proxy.ts; finance.read is the second gate, matching the
 * permission the page that renders the link requires.
 */
export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref') ?? ''
  if (!REF_PATTERN.test(ref)) {
    return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 })
  }
  if (!(await hasPermission('finance.read'))) {
    return NextResponse.json({ error: 'You do not have access to invoices.' }, { status: 403 })
  }

  const result = await requestInvoicePdf(ref)
  if (!result.ok) {
    const status = result.status === 404 ? 404 : result.reason === 'not-configured' ? 503 : 502
    return NextResponse.json({ error: 'Could not fetch the invoice.' }, { status })
  }

  const body = result.bytes.buffer.slice(
    result.bytes.byteOffset,
    result.bytes.byteOffset + result.bytes.byteLength,
  ) as ArrayBuffer

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="OpusFesta-Invoice-${ref}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
