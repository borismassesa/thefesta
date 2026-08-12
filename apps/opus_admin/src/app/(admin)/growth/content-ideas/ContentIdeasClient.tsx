'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import { addContentIdea, deleteContentIdea, updateContentIdea } from './actions'

export type ContentIdeaKind = 'tiktok_challenge' | 'office_challenge' | 'content_series' | 'hashtag'

export type ContentIdea = {
  id: string
  kind: ContentIdeaKind
  title: string
  description: string
  details: Record<string, string>
  sortOrder: number
}

const TABS: { kind: ContentIdeaKind; label: string; fields: { key: string; label: string }[] }[] = [
  {
    kind: 'tiktok_challenge',
    label: 'TikTok / Reels Challenges',
    fields: [
      { key: 'channel', label: 'Channel' },
      { key: 'best_for', label: 'Best For' },
      { key: 'difficulty', label: 'Difficulty' },
    ],
  },
  {
    kind: 'office_challenge',
    label: 'Internal Office Challenges',
    fields: [
      { key: 'frequency', label: 'Frequency' },
      { key: 'content_output', label: 'Content Output' },
      { key: 'reward', label: 'Reward' },
    ],
  },
  {
    kind: 'content_series',
    label: 'Recurring Content Series',
    fields: [
      { key: 'cadence', label: 'Cadence' },
      { key: 'channel', label: 'Channel' },
      { key: 'owner', label: 'Owner' },
    ],
  },
  {
    kind: 'hashtag',
    label: 'Hashtag Library',
    fields: [
      { key: 'hashtags', label: 'Hashtags' },
      { key: 'notes', label: 'Notes' },
    ],
  },
]

function emptyDraft(fields: { key: string }[]): { title: string; description: string; details: Record<string, string> } {
  return {
    title: '',
    description: '',
    details: Object.fromEntries(fields.map((f) => [f.key, ''])),
  }
}

export default function ContentIdeasClient({ ideas, canAdmin }: { ideas: ContentIdea[]; canAdmin: boolean }) {
  const [activeKind, setActiveKind] = useState<ContentIdeaKind>('tiktok_challenge')
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const activeTab = TABS.find((t) => t.kind === activeKind)!
  const [draft, setDraft] = useState(() => emptyDraft(activeTab.fields))
  const [error, setError] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<ContentIdeaKind, ContentIdea[]>()
    for (const idea of ideas) {
      const list = map.get(idea.kind) ?? []
      list.push(idea)
      map.set(idea.kind, list)
    }
    return map
  }, [ideas])

  function switchTab(kind: ContentIdeaKind) {
    setActiveKind(kind)
    setAdding(false)
    setError(null)
    const tab = TABS.find((t) => t.kind === kind)!
    setDraft(emptyDraft(tab.fields))
  }

  function submitAdd() {
    startTransition(async () => {
      const rows = grouped.get(activeKind) ?? []
      const res = await addContentIdea({
        kind: activeKind,
        title: draft.title,
        description: draft.description,
        details: draft.details,
        sortOrder: rows.length + 1,
      })
      if (res.ok) {
        setAdding(false)
        setDraft(emptyDraft(activeTab.fields))
        setError(null)
      } else {
        setError(res.error)
      }
    })
  }

  function updateField(id: string, patch: Partial<{ title: string; description: string; details: Record<string, string> }>) {
    startTransition(async () => {
      const res = await updateContentIdea(id, patch)
      if (!res.ok) setError(res.error)
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteContentIdea(id)
      if (!res.ok) setError(res.error)
    })
  }

  const rows = grouped.get(activeKind) ?? []

  return (
    <div className="space-y-6 pb-16">
      <SetGrowthHeading
        title="Content Ideas"
        subtitle="Reference library — TikTok challenges, office challenges, content series, hashtags."
        back={{ href: '/growth', label: 'Growth Tracker' }}
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button data-opus-button="control"
            key={tab.kind}
            type="button"
            onClick={() => switchTab(tab.kind)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12px] font-medium',
              activeKind === tab.kind ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="text-[12px] font-semibold tracking-wide text-gray-900">{activeTab.label.toUpperCase()}</div>
          {canAdmin && (
            <button data-opus-button="control"
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>

        {error && !adding && (
          <div className="border-b border-gray-100 px-4 py-2 text-[11px] text-red-600">{error}</div>
        )}

        {adding && canAdmin && (
          <div className="space-y-2 border-b border-gray-100 p-4">
            <input
              className="w-full rounded-lg border border-gray-200 p-2 text-[13px]"
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            />
            {activeKind !== 'hashtag' && (
              <textarea
                className="min-h-[60px] w-full rounded-lg border border-gray-200 p-2 text-[13px]"
                placeholder="Description"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {activeTab.fields.map((f) => (
                <input
                  key={f.key}
                  className="rounded-lg border border-gray-200 p-2 text-[13px]"
                  placeholder={f.label}
                  value={draft.details[f.key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, details: { ...d.details, [f.key]: e.target.value } }))}
                />
              ))}
            </div>
            {error && <div className="text-[11px] text-red-600">{error}</div>}
            <button data-opus-button="primary" data-opus-button-size="small"
              type="button"
              onClick={submitAdd}
              disabled={isPending}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="opus-table w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2 font-medium">Title</th>
                {activeKind !== 'hashtag' && <th className="px-3 py-2 font-medium">Description</th>}
                {activeTab.fields.map((f) => (
                  <th key={f.key} className="px-3 py-2 font-medium">{f.label}</th>
                ))}
                {canAdmin && <th className="px-3 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((idea) => (
                <tr key={idea.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {canAdmin ? (
                      <input
                        className="w-full rounded-md border border-transparent p-1 text-[12px] hover:border-gray-200 focus:border-gray-200"
                        defaultValue={idea.title}
                        onBlur={(e) => e.target.value !== idea.title && updateField(idea.id, { title: e.target.value })}
                      />
                    ) : (
                      idea.title
                    )}
                  </td>
                  {activeKind !== 'hashtag' && (
                    <td className="px-3 py-2 text-gray-600">
                      {canAdmin ? (
                        <input
                          className="w-full rounded-md border border-transparent p-1 text-[12px] hover:border-gray-200 focus:border-gray-200"
                          defaultValue={idea.description}
                          onBlur={(e) => e.target.value !== idea.description && updateField(idea.id, { description: e.target.value })}
                        />
                      ) : (
                        idea.description
                      )}
                    </td>
                  )}
                  {activeTab.fields.map((f) => (
                    <td key={f.key} className="px-3 py-2 text-gray-600">
                      {canAdmin ? (
                        <input
                          className="w-full rounded-md border border-transparent p-1 text-[12px] hover:border-gray-200 focus:border-gray-200"
                          defaultValue={idea.details[f.key] ?? ''}
                          onBlur={(e) =>
                            e.target.value !== (idea.details[f.key] ?? '') &&
                            updateField(idea.id, { details: { ...idea.details, [f.key]: e.target.value } })
                          }
                        />
                      ) : (
                        idea.details[f.key] ?? ''
                      )}
                    </td>
                  ))}
                  {canAdmin && (
                    <td className="px-3 py-2">
                      <button data-opus-button="control"
                        type="button"
                        onClick={() => remove(idea.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
