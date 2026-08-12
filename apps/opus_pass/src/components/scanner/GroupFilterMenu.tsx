'use client'

import { useEffect, useId, useRef } from 'react'
import { Check, Users } from 'lucide-react'
import { GuestAvatar } from './GuestAvatar'
import { countLabel, expectedHeads, type RosterGroup } from '@/lib/scanner/roster'
import { useScannerT } from '@/hooks/useScannerT'
import type { RosterEntry } from '@/types/scanner-checkin'

interface GroupFilterMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roster: RosterEntry[]
  groups: RosterGroup[]
  /** Null = no filter, showing everyone. */
  activeTag: string | null
  onSelect: (tag: string | null) => void
  /** Trigger button — menu anchors to its right edge. */
  children: React.ReactNode
}

/**
 * Compact group picker for the guest list — a dropdown next to search, not a
 * full-screen sheet. Weddings arrive in blocks; filtering by the couple's
 * group tags keeps the door list to a workable size.
 */
export function GroupFilterMenu({
  open,
  onOpenChange,
  roster,
  groups,
  activeTag,
  onSelect,
  children,
}: GroupFilterMenuProps) {
  const t = useScannerT()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('mousedown', onPointer)
    document.addEventListener('touchstart', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('touchstart', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  const choose = (tag: string | null) => {
    onSelect(tag)
    onOpenChange(false)
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      {children}

      {open ? (
        <div
          id={menuId}
          role="listbox"
          aria-label={t('select_group')}
          className="absolute top-[calc(100%+0.4rem)] right-0 z-40 w-[min(18.5rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/10 bg-white py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]"
        >
          <div className="max-h-[min(20rem,50dvh)] overflow-y-auto overscroll-contain">
            <button
              type="button"
              role="option"
              aria-selected={activeTag === null}
              onClick={() => choose(null)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/4 ${
                activeTag === null ? 'bg-black/3' : ''
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/5">
                <Users size={18} className="text-[#1A1A1A]/60" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#1A1A1A]">{t('all_guests')}</span>
                <span className="mt-0.5 block text-xs text-[#1A1A1A]/55">
                  {t('total_count', { label: countLabel(roster.length, expectedHeads(roster)) })}
                </span>
              </span>
              {activeTag === null ? <Check size={16} className="shrink-0 text-[#1A1A1A]" /> : null}
            </button>

            {groups.length === 0 ? (
              <p className="px-3 py-3 text-xs text-[#1A1A1A]/50">{t('empty_all')}</p>
            ) : (
              groups.map((group) => {
                const selected = activeTag === group.tag
                return (
                  <button
                    key={group.tag}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(group.tag)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-black/4 ${
                      selected ? 'bg-black/3' : ''
                    }`}
                  >
                    <GuestAvatar fullName={group.tag} colorKey={group.tag} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#1A1A1A]">{group.tag}</span>
                      <span className="mt-0.5 block text-xs text-[#1A1A1A]/55">
                        {t('group_in_count', {
                          label: countLabel(group.guests.length, group.heads),
                          n: group.arrivedCount,
                        })}
                      </span>
                    </span>
                    {selected ? <Check size={16} className="shrink-0 text-[#1A1A1A]" /> : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
