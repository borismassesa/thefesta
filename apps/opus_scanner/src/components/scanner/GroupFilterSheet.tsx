'use client'

import { Users, X } from 'lucide-react'
import { GuestAvatar } from './GuestAvatar'
import { countLabel, expectedHeads, type RosterGroup } from '@/lib/scannerRoster'
import type { RosterEntry } from '@/types/checkin'

interface GroupFilterSheetProps {
  visible: boolean
  onClose: () => void
  roster: RosterEntry[]
  groups: RosterGroup[]
  /** Null = no filter, showing everyone. */
  activeTag: string | null
  onSelect: (tag: string | null) => void
}

/**
 * Group picker for the guest list.
 *
 * Weddings arrive in blocks — a bus of the groom's colleagues, the bride's
 * family all at once — and the couple already records that as a group tag. At
 * the door it turns "find this one name in four hundred" into "find them among
 * the sixty in this group", which is the difference between a queue moving and
 * a queue stopping.
 *
 * Ported from apps/opus_pass_mobile/src/components/scanner/GroupFilterSheet.tsx.
 */
export function GroupFilterSheet({ visible, onClose, roster, groups, activeTag, onSelect }: GroupFilterSheetProps) {
  if (!visible) return null

  const choose = (tag: string | null) => {
    onSelect(tag)
    onClose()
  }

  const Radio = ({ selected }: { selected: boolean }) => (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
      style={{
        borderWidth: 2,
        borderColor: selected ? '#1A1A1A' : 'rgba(26,26,26,0.28)',
      }}
    >
      {selected ? <span className="h-3 w-3 rounded-full bg-[#1A1A1A]" /> : null}
    </span>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Select group">
      {/* Tapping the dimmed area is the fastest way out when the attendant
          opened this by accident mid-queue. */}
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="animate-sheet-up relative flex max-h-[78dvh] w-full max-w-md flex-col rounded-t-3xl bg-white pb-6">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Select group</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={24} color="#1A1A1A" />
          </button>
        </div>

        <div className="overflow-y-auto px-6">
          <button type="button" onClick={() => choose(null)} className="flex w-full items-center gap-3 py-4 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/5">
              <Users size={20} className="text-[#1A1A1A]/60" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#1A1A1A]">All guests</span>
              <span className="mt-0.5 block text-xs text-[#1A1A1A]/60">Total {countLabel(roster.length, expectedHeads(roster))}</span>
            </span>
            <Radio selected={activeTag === null} />
          </button>

          {groups.map((group) => (
            <button
              key={group.tag}
              type="button"
              onClick={() => choose(group.tag)}
              className="flex w-full items-center gap-3 border-t border-black/8 py-4 text-left"
            >
              <GuestAvatar fullName={group.tag} colorKey={group.tag} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-[#1A1A1A]">{group.tag}</span>
                <span className="mt-0.5 block text-xs text-[#1A1A1A]/60">
                  {countLabel(group.guests.length, group.heads)} · {group.arrivedCount} in
                </span>
              </span>
              <Radio selected={activeTag === group.tag} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
