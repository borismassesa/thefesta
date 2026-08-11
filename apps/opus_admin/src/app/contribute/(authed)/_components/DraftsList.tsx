'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { ContributorDraft } from '@/lib/contribute/types'
import DraftRow from './DraftRow'

type Section = {
  id: 'drafts' | 'pending' | 'published'
  title: string
  drafts: ContributorDraft[]
}

export default function DraftsList({ sections }: { sections: Section[] }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return sections
    return sections
      .map((section) => ({
        ...section,
        drafts: section.drafts.filter((draft) =>
          [draft.title, draft.summary, draft.category].join(' ').toLowerCase().includes(needle)
        ),
      }))
      .filter((section) => section.drafts.length > 0)
  }, [sections, search])

  return (
    <div>
      <label className="relative block w-full max-w-[260px]">
        <span className="sr-only">Search drafts</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search drafts"
          className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-[#5B2D8E]"
        />
      </label>
      <div className="mt-6 space-y-8">
        {filtered.map((section) => (
          <section key={section.id}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-gray-500">
              {section.title}
            </h2>
            <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
              {section.drafts.map((draft) => (
                <DraftRow key={draft.id} draft={draft} section={section.id} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
