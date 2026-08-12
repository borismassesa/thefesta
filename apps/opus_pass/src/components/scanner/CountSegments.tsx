'use client'

import { Fragment } from 'react'
import { Check, ChevronDown, Clock, Users, UsersRound, type LucideIcon } from 'lucide-react'

export interface CountSegment {
  key: string
  icon: 'time' | 'check' | 'people'
  /** Full screen-reader label ("Still to arrive"). */
  label: string
  /** One word printed under the count ("waiting"). Attendants are one-shift
   *  workers: a bare icon bar asks them to already know the iconography, and
   *  at the start of a night two of the three counts are the same number. */
  caption: string
  count: number
}

const SEGMENT_ICONS: Record<CountSegment['icon'], LucideIcon> = {
  time: Clock,
  check: Check,
  people: Users,
}

interface CountSegmentsProps {
  segments: CountSegment[]
  /** Highlighted segment. Omit on screens where the bar only navigates. */
  activeKey?: string | null
  onSelect: (key: string) => void
  /** `camera` renders in translucent white for use over a live camera feed. */
  tone?: 'camera' | 'surface'
}

/**
 * Icon-and-count bar: the whole state of the door in one glance.
 *
 * Numbers rather than words because an attendant reads this between guests,
 * often at arm's length, and because the three counts answer the only
 * questions asked at a door all night — how many are still to come, how many
 * are in, how many were invited. Every segment is a target, so the count is
 * also the way into the matching list.
 *
 * Ported from apps/opus_pass_mobile/src/components/scanner/CountSegments.tsx.
 */
export function CountSegments({ segments, activeKey, onSelect, tone = 'surface' }: CountSegmentsProps) {
  const onCamera = tone === 'camera'

  // On light surfaces the track is a real card — white surface with the same
  // hairline border every other card on these screens wears — not a grey
  // slab, which read as a filler block rather than part of the card family.
  // The camera keeps its translucent track; over a live feed the counts need
  // something to sit on.
  const trackColor = onCamera ? 'rgba(255,255,255,0.14)' : '#FFFFFF'
  const activeColor = onCamera ? 'rgba(255,255,255,0.20)' : '#F4EFF8'
  const activeBorder = onCamera ? 'rgba(255,255,255,0.9)' : '#1A1A1A'
  const textColor = onCamera ? '#FFFFFF' : '#1A1A1A'
  const idleColor = onCamera ? 'rgba(255,255,255,0.72)' : 'rgba(26,26,26,0.6)'
  // On light surfaces a darker separator than the card border: a near-match
  // grey disappears into the track. Same reason the camera value is well
  // above the track's 0.14 white.
  const separatorColor = onCamera ? 'rgba(255,255,255,0.45)' : 'rgba(26,26,26,0.28)'

  return (
    <div
      className="flex items-center rounded-2xl p-1"
      style={{
        backgroundColor: trackColor,
        borderWidth: onCamera ? 0 : 1,
        borderColor: onCamera ? 'transparent' : 'rgba(26,26,26,0.1)',
      }}
    >
      {segments.map((segment, index) => {
        const active = activeKey === segment.key
        const color = active ? textColor : idleColor
        const Icon = SEGMENT_ICONS[segment.icon]
        // Inset divider: shorter than the segment so it floats between the
        // counts instead of slicing the track into boxes.
        return (
          <Fragment key={segment.key}>
            {index > 0 ? (
              <div
                style={{
                  width: 1,
                  height: 22,
                  backgroundColor: separatorColor,
                }}
              />
            ) : null}
            <button
              type="button"
              aria-label={`${segment.label}: ${segment.count}`}
              aria-pressed={active}
              onClick={() => onSelect(segment.key)}
              className="flex h-13 flex-1 flex-col items-center justify-center rounded-xl transition-colors"
              style={{
                backgroundColor: active ? activeColor : 'transparent',
                borderWidth: active ? 1.5 : 0,
                borderColor: active ? activeBorder : 'transparent',
              }}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Icon size={15} color={color} />
                <span className="text-sm font-semibold" style={{ color }}>
                  {segment.count}
                </span>
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.5px]" style={{ color: idleColor, marginTop: 1 }}>
                {segment.caption}
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

interface GroupChipProps {
  /** Null means no group filter is applied. */
  activeTag: string | null
  onPress: () => void
  tone?: 'camera' | 'surface'
}

/** Companion to the bar: which slice of the roster the counts are describing. */
export function GroupChip({ activeTag, onPress, tone = 'surface' }: GroupChipProps) {
  const onCamera = tone === 'camera'
  const filtered = Boolean(activeTag)

  // Card treatment to match the count bar it sits beside; a heavier border
  // is what says a group filter is applied.
  const background = onCamera ? (filtered ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.14)') : '#FFFFFF'
  const color = onCamera ? '#FFFFFF' : '#1A1A1A'

  return (
    <button
      type="button"
      aria-label={activeTag ? `Filtering by ${activeTag}. Change group` : 'Filter by group'}
      onClick={onPress}
      className="flex h-13 max-w-37.5 shrink-0 items-center gap-1.5 rounded-2xl px-3.5"
      style={{
        backgroundColor: background,
        borderWidth: onCamera ? (filtered ? 1.5 : 0) : filtered ? 1.5 : 1,
        borderColor: onCamera
          ? filtered
            ? 'rgba(255,255,255,0.9)'
            : 'transparent'
          : filtered
            ? '#1A1A1A'
            : 'rgba(26,26,26,0.1)',
        color,
      }}
    >
      <UsersRound size={19} color={color} />
      {activeTag ? <span className="truncate text-xs font-semibold">{activeTag}</span> : null}
      <ChevronDown size={14} color={color} />
    </button>
  )
}
