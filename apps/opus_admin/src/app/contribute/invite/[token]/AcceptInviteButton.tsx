'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { acceptContributorInvitation } from '@/lib/advice-submission-actions'

export default function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div>
      <button data-opus-button="primary" data-opus-button-size="large"
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            try {
              const { id } = await acceptContributorInvitation(token)
              router.push(`/contribute/drafts/${id}`)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not accept invite.')
            }
          })
        }
        className="inline-flex items-center rounded-lg bg-[#C9A0DC] px-5 py-3 text-sm font-semibold text-white hover:bg-[#b97fd0] disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          'Accept and start writing'
        )}
      </button>
      {error && <p className="mt-4 max-w-xl text-sm text-rose-700">{error}</p>}
    </div>
  )
}
