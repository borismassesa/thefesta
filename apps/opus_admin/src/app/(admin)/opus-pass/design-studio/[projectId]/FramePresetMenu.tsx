'use client'

import { useMemo, useState } from 'react'

import {
  ARTBOARD_PRESET_CATEGORIES,
  ARTBOARD_PRESETS,
  type ArtboardPreset,
} from '@opusfesta/design-engine'

import {
  StudioPopover,
  StudioPopoverBody,
  StudioPopoverHeader,
  StudioPopoverItem,
  StudioPopoverSection,
} from './StudioPopover'

type Props = {
  open: boolean
  currentKey?: string | null
  currentWidth?: number
  currentHeight?: number
  onClose: () => void
  onSelect: (preset: ArtboardPreset) => void
}

export function FramePresetMenu({
  open,
  currentKey,
  currentWidth,
  currentHeight,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ARTBOARD_PRESET_CATEGORIES.map((cat) => ({
      ...cat,
      items: ARTBOARD_PRESETS.filter(
        (p) =>
          p.category === cat.key &&
          (!q ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            `${p.width}`.includes(q) ||
            `${p.height}`.includes(q)),
      ),
    })).filter((g) => g.items.length > 0)
  }, [query])

  if (!open) return null

  return (
    <StudioPopover widthClass="w-[320px]" align="right" onClose={onClose}>
      <StudioPopoverHeader
        title="Frame size"
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search frames"
        onClose={onClose}
      />
      <StudioPopoverBody>
        {grouped.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-gray-400">No frames match</p>
        ) : (
          grouped.map((group) => (
            <StudioPopoverSection key={group.key} label={group.label}>
              {group.items.map((p) => {
                const active =
                  p.key === currentKey ||
                  (p.width === currentWidth && p.height === currentHeight)
                return (
                  <StudioPopoverItem
                    key={p.key}
                    label={p.name}
                    meta={`${p.width} × ${p.height}`}
                    active={active}
                    onClick={() => {
                      onSelect(p)
                      onClose()
                    }}
                  />
                )
              })}
            </StudioPopoverSection>
          ))
        )}
      </StudioPopoverBody>
    </StudioPopover>
  )
}
