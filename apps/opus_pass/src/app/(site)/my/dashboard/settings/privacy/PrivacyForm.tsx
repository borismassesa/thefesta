'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Toggle } from '@/components/dashboard/controls'
import { enablePublicSharing, setPublicSharing } from '@/lib/dashboard/actions'

export default function PrivacyForm({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    setEnabled(next)
    startTransition(async () => {
      try {
        if (next) {
          await enablePublicSharing()
        } else {
          await setPublicSharing(false)
        }
        toast.success(next ? 'Public link enabled' : 'Public link disabled')
      } catch (err) {
        setEnabled(!next)
        toast.error(err instanceof Error ? err.message : 'Could not save')
      }
    })
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-[#1A1A1A]">Privacy</h2>
      <p className="mt-1 text-sm text-[#1A1A1A]/55">
        Control whether your public invite hub, gift registry, and guestbook are reachable by link.
      </p>
      <div className="mt-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">Public sharing</p>
            <p className="mt-1 text-sm text-[#1A1A1A]/55">
              When on, anyone with your link can view your invite hub, RSVP, sign the guestbook, and see your
              gift registry. Turn this off at any time to take your pages offline.
            </p>
          </div>
          <Toggle checked={enabled} onChange={toggle} disabled={pending} label="Public sharing" />
        </div>
      </div>
    </div>
  )
}
