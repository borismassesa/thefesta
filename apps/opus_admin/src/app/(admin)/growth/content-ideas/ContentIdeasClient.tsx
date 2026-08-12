'use client'

import { useMemo, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import SetGrowthHeading from '../_components/SetGrowthHeading'
import { GtCard, GtSectionHeader, GT } from '../_components/ui'
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
      />

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button data-opus-button="control"
            key={tab.kind}
            type="button"
            onClick={() => switchTab(tab.kind)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
              activeKind === tab.kind
                ? 'border-[#7E5896] bg-[#7E5896] text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-[#C9A0DC] hover:bg-[#F0DFF6]/40',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <GtCard>
        <GtSectionHeader
          title={activeTab.label}
          action={
            canAdmin ? (
              <button
                data-opus-button="control"
                type="button"
                onClick={() => setAdding((v) => !v)}
                className={adding ? GT.btnSecondary : GT.btnPrimary}
              >
                <Plus className="h-4 w-4" /> {adding ? 'Cancel' : 'Add idea'}
              </button>
            ) : undefined
          }
        />

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
                className="min-h-15 w-full rounded-lg border border-gray-200 p-2 text-[13px]"
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
              className="rounded-xl bg-[#7E5896] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#6c4884] disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className={`${GT.table} min-w-160`}>
            <thead>
              <tr>
                <th>Title</th>
                {activeKind !== 'hashtag' && <th>Description</th>}
                {activeTab.fields.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                {canAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((idea) => (
                <tr key={idea.id}>
                  <th scope="row" className="opus-table-cell--leading">
                    {canAdmin ? (
                      <input
                        className="w-full rounded-md border border-transparent p-1 text-[12px] hover:border-gray-200 focus:border-gray-200"
                        defaultValue={idea.title}
                        onBlur={(e) => e.target.value !== idea.title && updateField(idea.id, { title: e.target.value })}
                      />
                    ) : (
                      idea.title
                    )}
                  </th>
                  {activeKind !== 'hashtag' && (
                    <td>
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
                    <td key={f.key}>
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
                    <td>
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
      </GtCard>
    </div>
  )
}
