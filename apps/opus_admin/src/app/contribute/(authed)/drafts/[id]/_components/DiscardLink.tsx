'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DiscardLink({
  draftId,
  draftTitle,
}: {
  draftId: string
  draftTitle: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function discard() {
    setDiscarding(true)
    setError(null)
    try {
      const response = await fetch(`/api/contribute/drafts/${draftId}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Could not discard draft.')
      }
      router.push('/contribute')
      router.refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not discard draft.')
      setDiscarding(false)
    }
  }

  return (
    <>
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto mt-7 block text-[11px] font-semibold text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
      >
        Discard draft
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-950">Discard this draft?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              You&rsquo;ll lose the title, summary, body, and cover image for{' '}
              <span className="font-semibold text-gray-950">
                &ldquo;{draftTitle.trim() || 'Untitled draft'}&rdquo;
              </span>
              . This can&rsquo;t be undone.
            </p>
            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button data-opus-button="control"
                type="button"
                onClick={() => {
                  setOpen(false)
                  setError(null)
                }}
                disabled={discarding}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button data-opus-button="danger" data-opus-button-size="medium"
                type="button"
                onClick={discard}
                disabled={discarding}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {discarding ? 'Discarding…' : error ? 'Retry' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
