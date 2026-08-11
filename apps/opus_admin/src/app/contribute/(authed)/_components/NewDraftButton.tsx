'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function NewDraftButton({ className }: { className?: string }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function createDraft() {
    if (creating) return
    setCreating(true)
    try {
      const response = await fetch('/api/contribute/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = (await response.json()) as { id?: string; error?: string }
      if (!response.ok || !payload.id) throw new Error(payload.error || 'Could not create draft.')
      router.push(`/contribute/drafts/${payload.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <button data-opus-button="control"
      type="button"
      onClick={createDraft}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg bg-[#5B2D8E] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4D247A] disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      disabled={creating}
    >
      <Plus className="h-4 w-4" />
      {creating ? 'Creating...' : 'New draft'}
    </button>
  )
}
