import 'server-only'

/**
 * Invoice PDFs are rendered in opus_pass, next to the order data and the PDF
 * toolchain. Its /api/invoice route has a server-to-server mode: send the
 * shared revalidate secret as a bearer token plus `{ ref }` and it renders the
 * persisted order. Admin has three callers (the two customer emails and the
 * download link on Order Fulfilment), so the fetch lives here once.
 */

function invoiceBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_OPUS_PASS_URL
  return base ? base.replace(/\/$/, '') : null
}

/** False when the env is not wired — callers should not render an invoice link. */
export function isInvoiceProxyConfigured(): boolean {
  return Boolean(invoiceBaseUrl() && process.env.OPUS_PASS_REVALIDATE_SECRET)
}

export type InvoiceResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; reason: string }

/** Status-aware fetch, for the download route that has to pick a response code. */
export async function requestInvoicePdf(ref: string): Promise<InvoiceResult> {
  const base = invoiceBaseUrl()
  const secret = process.env.OPUS_PASS_REVALIDATE_SECRET
  if (!base || !secret) return { ok: false, status: 503, reason: 'not-configured' }

  try {
    const res = await fetch(`${base}/api/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ref }),
      cache: 'no-store',
    })
    if (!res.ok) {
      // A 400 almost always means the two apps hold different secrets: opus_pass
      // falls through to its open mode and then rejects a bare `{ ref }` as an
      // invalid order payload. Worth calling out by name — it reads like a bad
      // reference otherwise.
      const reason = res.status === 400 ? 'secret-mismatch-or-bad-ref' : `upstream-${res.status}`
      console.error('[invoice] fetch failed', { ref, status: res.status, reason })
      return { ok: false, status: res.status, reason }
    }
    return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) }
  } catch (error) {
    console.error('[invoice] fetch error', { ref, error })
    return { ok: false, status: 502, reason: 'network' }
  }
}

/** Best-effort attachment for the customer emails — never blocks a send. */
export async function fetchInvoiceAttachment(
  ref: string,
): Promise<{ filename: string; content: Buffer } | null> {
  const result = await requestInvoicePdf(ref)
  return result.ok
    ? { filename: `OpusFesta-Invoice-${ref}.pdf`, content: Buffer.from(result.bytes) }
    : null
}
