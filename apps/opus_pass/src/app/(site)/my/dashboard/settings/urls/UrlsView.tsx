'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/dashboard/controls'

export default function UrlsView({ url, enabled }: { url: string | null; enabled: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-[#1A1A1A]">URLs</h2>
      <p className="mt-1 text-sm text-[#1A1A1A]/55">Your event&apos;s public invite link — share it anywhere.</p>
      <div className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm sm:p-6">
        {url ? (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                className="w-full rounded-xl border border-black/[0.12] bg-black/[0.02] px-3.5 py-2.5 text-sm text-[#1A1A1A] outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="secondary" onClick={copy} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            {!enabled ? (
              <p className="mt-3 text-sm text-amber-700">
                This link is currently off, so it won’t work for guests. Turn it back on in{' '}
                <Link href="/my/dashboard/rsvps" className="font-medium underline underline-offset-2">
                  RSVP setup
                </Link>
                .
              </p>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#7E5896] hover:text-[#5f4171]"
              >
                Open link <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-[#1A1A1A]/65">You haven’t created an invite link yet.</p>
            <p className="mt-3">
              <Link
                href="/my/dashboard/rsvps"
                className="text-sm font-medium text-[#7E5896] underline underline-offset-2 hover:text-[#5f4171]"
              >
                Set up RSVPs
              </Link>{' '}
              to generate one.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
