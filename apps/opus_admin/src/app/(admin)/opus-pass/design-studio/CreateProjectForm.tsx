'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'

import { ARTBOARD_PRESETS } from '@opusfesta/design-engine'

import { createDesignProject } from '@/lib/design-studio/actions'

export function CreateProjectForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('Wedding Invitation')
  const [presetKey, setPresetKey] = useState('digital_1080_1350')
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
          const result = await createDesignProject({ name, presetKey, mode: 'blank' })
          if (!result.ok) {
            setError(result.error)
            return
          }
          router.push(`/opus-pass/design-studio/${result.projectId}`)
        })
      }}
    >
      <label className="flex min-w-50 flex-1 flex-col gap-1.5 text-xs font-medium text-gray-600">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
        />
      </label>
      <label className="flex min-w-55 flex-1 flex-col gap-1.5 text-xs font-medium text-gray-600">
        Artboard preset
        <select
          value={presetKey}
          onChange={(e) => setPresetKey(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
        >
          {ARTBOARD_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} — {p.width}×{p.height}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {pending ? 'Creating…' : 'Start blank'}
      </button>
      {error ? <p className="w-full text-sm text-red-600">{error}</p> : null}
    </form>
  )
}
