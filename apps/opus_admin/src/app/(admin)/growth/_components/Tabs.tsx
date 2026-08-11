'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TabDef = {
  key: string
  label: string
  content: ReactNode
}

export default function Tabs({
  tabs,
  defaultKey,
  onChange,
}: {
  tabs: TabDef[]
  defaultKey?: string
  // Notified whenever the active tab changes — lets a parent page keep its
  // heading (title/subtitle) in sync with whichever tab is showing.
  onChange?: (key: string) => void
}) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key)
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0]

  function selectTab(key: string) {
    setActive(key)
    onChange?.(key)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 border-b border-gray-100 pb-px">
        {tabs.map((tab) => (
          <button data-opus-button="control"
            key={tab.key}
            type="button"
            onClick={() => selectTab(tab.key)}
            className={cn(
              'rounded-t-lg px-3.5 py-2 text-[13px] font-medium transition-colors',
              tab.key === activeTab?.key
                ? 'border-b-2 border-[#7E5896] text-gray-900'
                : 'border-b-2 border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab?.content}
    </div>
  )
}
