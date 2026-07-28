'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Downloads the email-gated invoice PDF for a shop order. Both the buyer's own
// email and the order ref are required server-side, so this only works for the
// person who checked out.
export default function InvoiceButton({
  orderRef,
  email,
  className,
}: {
  orderRef: string
  email: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/shop/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: orderRef, email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not download the invoice.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `OpusFesta-Invoice-${orderRef}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the invoice.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full border border-[#1A1A1A]/15 bg-white px-5 py-2.5 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-black/[0.03] disabled:opacity-60',
          className,
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Download invoice
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
