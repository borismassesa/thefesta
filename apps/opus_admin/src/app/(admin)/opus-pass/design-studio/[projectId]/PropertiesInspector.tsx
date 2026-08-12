'use client'

import { useEffect, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ChevronDown,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  Link2,
  Link2Off,
  Minus,
  Plus,
  Rows3,
  Columns3,
  WrapText,
} from 'lucide-react'

import {
  EFFECT_STYLE_PRESETS,
  LAYOUT_GUIDE_PRESETS,
  createDropShadowEffect,
  inventoryFields,
  type AlignMode,
  type ArtboardPreset,
  type AutoLayout,
  type DesignEffect,
  type DesignElement,
  type DesignPage,
  type LayerViewMode,
  type LayoutGuide,
  type TextElement,
} from '@opusfesta/design-engine'

import { ColorPickerPopover } from './ColorPickerPopover'
import { FramePresetMenu } from './FramePresetMenu'
import {
  StudioLayersPanel,
  type LayerReorderAction,
} from './StudioLayersPanel'
import {
  StudioPopover,
  StudioPopoverBody,
  StudioPopoverHeader,
  StudioPopoverItem,
  StudioPopoverSection,
} from './StudioPopover'

type Props = {
  element: DesignElement | null
  page?: DesignPage | null
  artboardName?: string
  swatches?: Array<{ id: string; name: string; hex: string }>
  artboardPresetKey?: string | null
  /** Content layers in the current selection (excludes frame). */
  selectionCount?: number
  /** What alignment will target — drives tooltips. */
  alignTarget?: 'frame' | 'selection' | 'artboard'
  selectedIds?: string[]
  onChange: (patch: Partial<DesignElement> & Record<string, unknown>) => void
  onChangePage?: (patch: Partial<DesignPage>) => void
  onApplyAutoLayout?: () => void
  onArtboardPresetChange?: (preset: ArtboardPreset) => void
  onExport?: (opts: { scale: number; format: 'png' | 'svg' }) => void
  onRename: (name: string) => void
  onAlign: (mode: AlignMode) => void
  onToggleLock: () => void
  onToggleVisible: () => void
  onDelete: () => void
  onReorder: (dir: 'up' | 'down') => void
  onSelectLayer?: (id: string) => void
  onToggleLayerVisible?: (id: string, visible: boolean) => void
  onToggleLayerLock?: (id: string, locked: boolean) => void
  onReorderLayer?: (id: string, action: LayerReorderAction) => void
  onMoveLayerToIndex?: (id: string, toIndex: number) => void
  onRenameLayer?: (id: string, name: string) => void
  onUngroupLayer?: (id: string) => void
  layerView?: LayerViewMode
  onToggleHideArtwork?: () => void
  onSoloLayer?: (id: string | null) => void
}

const ALIGN_LABELS: Record<AlignMode, string> = {
  left: 'Align left',
  center: 'Align horizontal centers',
  right: 'Align right',
  top: 'Align top',
  middle: 'Align vertical centers',
  bottom: 'Align bottom',
}

const ALIGN_BUTTONS = [
  ['left', AlignLeft],
  ['center', AlignCenter],
  ['right', AlignRight],
  ['top', AlignVerticalJustifyStart],
  ['middle', AlignVerticalJustifyCenter],
  ['bottom', AlignVerticalJustifyEnd],
] as const

function alignScopeLabel(
  alignTarget: 'frame' | 'selection' | 'artboard',
  selectionCount: number,
): string {
  if (alignTarget === 'selection') return `to selection · ${selectionCount}`
  if (alignTarget === 'frame') return 'all layers to frame'
  return 'to frame'
}

function Field({
  label,
  value,
  onChange,
  suffix,
  min,
}: {
  label: string
  value: number | string
  onChange: (v: number) => void
  suffix?: string
  min?: number
}) {
  return (
    <label className="flex min-w-0 items-center gap-1.5 rounded-md bg-[#F5F5F5] px-2 py-1">
      <span className="w-3 shrink-0 text-[11px] text-gray-500">{label}</span>
      <input
        type="number"
        min={min}
        value={typeof value === 'number' ? Math.round(value * 100) / 100 : value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-900 outline-none"
      />
      {suffix ? <span className="text-[10px] text-gray-400">{suffix}</span> : null}
    </label>
  )
}

function Section({
  title,
  action,
  children,
  defaultOpen = true,
}: {
  title: string
  action?: React.ReactNode
  children?: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-gray-100">
      <div className="flex items-center justify-between px-3 py-2">
        <button
          type="button"
          className="text-[11px] font-semibold text-gray-800"
          onClick={() => setOpen((v) => !v)}
        >
          {title}
        </button>
        <div className="flex items-center gap-1">{action}</div>
      </div>
      {open ? <div className="space-y-2 px-3 pb-3">{children}</div> : null}
    </section>
  )
}

function StyleLibButton({
  active,
  onClick,
  title,
}: {
  active?: boolean
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-0.5 ${active ? 'bg-[#E5F4FF] text-[#0B99FF]' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      <Grid3x3 className="h-3.5 w-3.5" />
    </button>
  )
}

function normalizeHex(value: string) {
  if (!value) return '#FFFFFF'
  if (value.startsWith('#')) {
    if (value.length === 4) {
      const r = value[1]
      const g = value[2]
      const b = value[3]
      return `#${r}${r}${g}${g}${b}${b}`
    }
    return value.slice(0, 7)
  }
  return '#FFFFFF'
}

function hasVisualStyle(
  el: DesignElement,
): el is DesignElement & {
  effects?: DesignEffect[]
  strokeAlign?: 'inside' | 'center' | 'outside'
  cornerRadius?: number
  cornerRadii?: { tl: number; tr: number; br: number; bl: number }
  stroke?: string | null
  strokeWidth?: number
  fill?: string | null
} {
  return (
    el.type === 'shape' ||
    el.type === 'image' ||
    el.type === 'artboard_background' ||
    el.type === 'icon'
  )
}

/** Layers that accept a solid fill / text colour from the Design panel. */
function hasFillControl(el: DesignElement): boolean {
  return (
    el.type === 'text' ||
    el.type === 'group' ||
    el.type === 'svg_graphic' ||
    hasVisualStyle(el)
  )
}

function hasStrokeControl(el: DesignElement): boolean {
  return (
    el.type === 'svg_graphic' ||
    el.type === 'shape' ||
    el.type === 'icon' ||
    el.type === 'artboard_background'
  )
}

export function PropertiesInspector({
  element,
  page,
  artboardName,
  swatches,
  artboardPresetKey,
  selectionCount = 0,
  alignTarget = 'artboard',
  selectedIds = [],
  onChange,
  onChangePage,
  onApplyAutoLayout,
  onArtboardPresetChange,
  onExport,
  onRename,
  onAlign,
  onToggleLock,
  onToggleVisible,
  onDelete,
  onReorder,
  onSelectLayer,
  onToggleLayerVisible,
  onToggleLayerLock,
  onReorderLayer,
  onMoveLayerToIndex,
  onRenameLayer,
  onUngroupLayer,
  layerView,
  onToggleHideArtwork,
  onSoloLayer,
}: Props) {
  const [tab, setTab] = useState<'design' | 'layers'>('design')
  const [lockAspect, setLockAspect] = useState(false)
  const [independentCorners, setIndependentCorners] = useState(false)
  const [colorTarget, setColorTarget] = useState<'fill' | 'stroke' | 'effect' | null>(null)
  const [fillHexDraft, setFillHexDraft] = useState<string | null>(null)
  const [effectLibOpen, setEffectLibOpen] = useState(false)
  const [guideLibOpen, setGuideLibOpen] = useState(false)
  const [frameMenuOpen, setFrameMenuOpen] = useState(false)
  const [exportScale, setExportScale] = useState(1)
  const [exportFormat, setExportFormat] = useState<'png' | 'svg'>('png')
  const [effectEditId, setEffectEditId] = useState<string | null>(null)

  useEffect(() => {
    setFillHexDraft(null)
    setColorTarget(null)
  }, [element?.id])

  const layersPanel =
    page && onSelectLayer && onToggleLayerVisible && onToggleLayerLock && onReorderLayer ? (
      <StudioLayersPanel
        compact
        elements={page.elements}
        selectedIds={selectedIds}
        artboardName={artboardName}
        pageWidth={page.width}
        pageHeight={page.height}
        viewMode={layerView}
        onSelect={onSelectLayer}
        onToggleVisible={onToggleLayerVisible}
        onToggleLock={onToggleLayerLock}
        onReorder={onReorderLayer}
        onMoveToIndex={onMoveLayerToIndex}
        onRename={onRenameLayer}
        onUngroup={onUngroupLayer}
        onToggleHideArtwork={onToggleHideArtwork}
        onSoloLayer={onSoloLayer}
      />
    ) : (
      <p className="p-4 text-[11px] text-gray-500">Layers unavailable</p>
    )

  if (!element) {
    return (
      <aside className="flex h-full min-h-0 w-75 shrink-0 flex-col border-l border-gray-200 bg-white">
        <div className="flex border-b border-gray-100">
          <button
            type="button"
            onClick={() => setTab('design')}
            className={`flex-1 py-2.5 text-[12px] font-semibold ${
              tab === 'design' ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400'
            }`}
          >
            Design
          </button>
          <button
            type="button"
            onClick={() => setTab('layers')}
            className={`flex-1 py-2.5 text-[12px] font-semibold ${
              tab === 'layers' ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400'
            }`}
          >
            Layers
          </button>
        </div>
        {tab === 'layers' ? (
          <div className="flex min-h-0 flex-1 flex-col">{layersPanel}</div>
        ) : (
          <p className="p-4 text-[11px] leading-relaxed text-gray-500">
            Click a frame or layer to edit position, fill, stroke, effects, and export — or open
            Layers to manage the artboard stack.
          </p>
        )}
      </aside>
    )
  }

  const isFrame = element.type === 'artboard_background'
  const t = element.transform
  const fill =
    element.type === 'text'
      ? element.typography.color
      : element.type === 'svg_graphic'
        ? element.fill ?? '#1a1a1a'
        : element.type === 'group'
          ? '#1a1a1a'
          : hasVisualStyle(element)
            ? element.fill ?? '#FFFFFF'
            : '#FFFFFF'
  const fillOpacity =
    element.type === 'text' ? element.typography.opacity : element.opacity

  const effects = hasVisualStyle(element) ? element.effects ?? [] : []
  const strokeAlign =
    hasVisualStyle(element) && 'strokeAlign' in element
      ? element.strokeAlign ?? 'inside'
      : 'inside'
  const strokeWidth =
    hasStrokeControl(element) && 'strokeWidth' in element && typeof element.strokeWidth === 'number'
      ? element.strokeWidth
      : 0
  const stroke =
    hasStrokeControl(element) && 'stroke' in element && element.stroke ? element.stroke : null
  const cornerRadius =
    hasVisualStyle(element) && typeof element.cornerRadius === 'number'
      ? element.cornerRadius
      : 0
  const cornerRadii =
    hasVisualStyle(element) && element.cornerRadii
      ? element.cornerRadii
      : { tl: cornerRadius, tr: cornerRadius, br: cornerRadius, bl: cornerRadius }

  const autoLayout: AutoLayout = page?.autoLayout ?? {
    enabled: false,
    direction: 'vertical',
    gap: 10,
    paddingX: 10,
    paddingY: 10,
    align: 'start',
    clipContent: false,
  }
  const layoutGuide: LayoutGuide = page?.layoutGuide ?? {
    enabled: false,
    columns: 12,
    gutter: 20,
    margin: 40,
    rows: 0,
  }

  const setFill = (hex: string, opacity?: number) => {
    if (!hasFillControl(element)) return
    const clean = normalizeHex(hex)
    setFillHexDraft(null)
    if (element.type === 'text') {
      onChange({
        typography: {
          ...element.typography,
          color: clean,
          ...(opacity != null ? { opacity } : {}),
        },
      })
      return
    }
    // Groups + shapes + svg_graphic + artboard — editor recolors markup / descendants
    onChange({
      fill: clean,
      ...(opacity != null ? { opacity } : {}),
    })
  }

  const fillHexDisplay =
    fillHexDraft ?? normalizeHex(fill ?? '#FFFFFF').replace('#', '').toUpperCase()

  const setEffects = (next: DesignEffect[]) => {
    if (!hasVisualStyle(element)) return
    onChange({ effects: next })
  }

  const minSize = isFrame ? 320 : 8
  const alignScope = alignScopeLabel(alignTarget, selectionCount)
  const unlockableLayers =
    page?.elements.filter(
      (el) => el.type !== 'artboard_background' && el.visible && !el.locked,
    ).length ?? 0
  const alignDisabled = element.locked || (alignTarget === 'frame' && unlockableLayers === 0)

  return (
    <aside className="relative flex h-full min-h-0 w-75 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="flex border-b border-gray-100">
        <button
          type="button"
          onClick={() => setTab('design')}
          className={`flex-1 py-2.5 text-[12px] font-semibold ${
            tab === 'design' ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400'
          }`}
        >
          Design
        </button>
        <button
          type="button"
          onClick={() => setTab('layers')}
          className={`flex-1 py-2.5 text-[12px] font-semibold ${
            tab === 'layers' ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400'
          }`}
        >
          Layers
        </button>
      </div>

      {tab === 'layers' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{layersPanel}</div>
      ) : (
        <>
      <div className="relative space-y-1.5 border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-end justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {isFrame ? 'Artboard name' : 'Layer name'}
          </span>
          {isFrame ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Frame
            </span>
          ) : (
            <span className="text-[10px] uppercase text-gray-400">{element.type}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={isFrame ? artboardName || element.name || 'Artboard' : element.name}
            onChange={(e) => onRename(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder={isFrame ? 'Artboard name' : 'Layer name'}
            title="Rename"
            className="min-w-0 flex-1 rounded-md bg-[#F5F5F5] px-2.5 py-1.5 text-[12px] font-semibold text-gray-900 outline-none ring-[#0B99FF] focus:ring-1"
          />
          {isFrame && onArtboardPresetChange ? (
            <div className="relative shrink-0">
              <button
                type="button"
                title={
                  page
                    ? `Frame size presets · ${Math.round(page.width)} × ${Math.round(page.height)}`
                    : 'Frame size presets'
                }
                aria-label="Frame size presets"
                aria-expanded={frameMenuOpen}
                className={`rounded-md bg-[#F5F5F5] p-1.5 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900 ${
                  frameMenuOpen ? 'ring-1 ring-[#0B99FF]' : ''
                }`}
                onClick={() => setFrameMenuOpen((v) => !v)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <FramePresetMenu
                open={frameMenuOpen}
                currentKey={artboardPresetKey}
                currentWidth={page?.width}
                currentHeight={page?.height}
                onClose={() => setFrameMenuOpen(false)}
                onSelect={onArtboardPresetChange}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {/* Alignment — Figma/Canva: selection box vs frame safe area */}
          <div className="flex items-center justify-between gap-0.5 border-b border-gray-100 px-2 py-2">
            {ALIGN_BUTTONS.map(([mode, Icon]) => (
              <button
                key={mode}
                type="button"
                disabled={alignDisabled}
                title={`${ALIGN_LABELS[mode]} (${alignScope})`}
                onClick={() => onAlign(mode)}
                className="rounded p-1.5 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <Section title="Position">
            <div className="grid grid-cols-2 gap-1.5">
              {isFrame ? (
                <>
                  <Field
                    label="X"
                    value={page?.frameX ?? 0}
                    onChange={(v) => onChangePage?.({ frameX: v })}
                  />
                  <Field
                    label="Y"
                    value={page?.frameY ?? 0}
                    onChange={(v) => onChangePage?.({ frameY: v })}
                  />
                </>
              ) : (
                <>
                  <Field label="X" value={t.x} onChange={(v) => onChange({ transform: { ...t, x: v } })} />
                  <Field label="Y" value={t.y} onChange={(v) => onChange({ transform: { ...t, y: v } })} />
                </>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Field
                label="↻"
                value={t.rotation}
                suffix="°"
                onChange={(v) => onChange({ transform: { ...t, rotation: v } })}
              />
              {!isFrame ? (
                <>
                  <button
                    type="button"
                    title="Flip horizontal"
                    className="rounded-md bg-[#F5F5F5] p-1.5 text-gray-600 hover:bg-gray-200"
                    onClick={() => onChange({ transform: { ...t, scaleX: (t.scaleX || 1) * -1 } })}
                  >
                    <FlipHorizontal2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Flip vertical"
                    className="rounded-md bg-[#F5F5F5] p-1.5 text-gray-600 hover:bg-gray-200"
                    onClick={() => onChange({ transform: { ...t, scaleY: (t.scaleY || 1) * -1 } })}
                  >
                    <FlipVertical2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : null}
            </div>
          </Section>

          <Section title="Layout">
            <div className="flex items-center gap-1.5">
              <Field
                label="W"
                min={minSize}
                value={t.width}
                onChange={(v) => {
                  const width = Math.max(minSize, v)
                  if (lockAspect && t.width > 0) {
                    const ratio = t.height / t.width
                    onChange({
                      transform: {
                        ...t,
                        x: isFrame ? 0 : t.x,
                        y: isFrame ? 0 : t.y,
                        width,
                        height: Math.max(minSize, width * ratio),
                      },
                    })
                  } else {
                    onChange({
                      transform: { ...t, x: isFrame ? 0 : t.x, y: isFrame ? 0 : t.y, width },
                    })
                  }
                }}
              />
              <button
                type="button"
                title="Constrain proportions"
                onClick={() => setLockAspect((v) => !v)}
                className={`rounded p-1 ${lockAspect ? 'text-gray-900' : 'text-gray-400'}`}
              >
                {lockAspect ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
              </button>
              <Field
                label="H"
                min={minSize}
                value={t.height}
                onChange={(v) => {
                  const height = Math.max(minSize, v)
                  if (lockAspect && t.height > 0) {
                    const ratio = t.width / t.height
                    onChange({
                      transform: {
                        ...t,
                        x: isFrame ? 0 : t.x,
                        y: isFrame ? 0 : t.y,
                        height,
                        width: Math.max(minSize, height * ratio),
                      },
                    })
                  } else {
                    onChange({
                      transform: { ...t, x: isFrame ? 0 : t.x, y: isFrame ? 0 : t.y, height },
                    })
                  }
                }}
              />
            </div>
          </Section>

          {isFrame && onChangePage ? (
            <Section title="Auto layout" defaultOpen={autoLayout.enabled}>
              <div className="flex items-center gap-1">
                {(
                  [
                    ['vertical', Rows3, 'Vertical'],
                    ['horizontal', Columns3, 'Horizontal'],
                    ['wrap', WrapText, 'Wrap'],
                  ] as const
                ).map(([dir, Icon, label]) => (
                  <button
                    key={dir}
                    type="button"
                    title={label}
                    className={`rounded-md p-1.5 ${
                      autoLayout.direction === dir && autoLayout.enabled
                        ? 'bg-[#E5F4FF] text-[#0B99FF]'
                        : 'bg-[#F5F5F5] text-gray-600'
                    }`}
                    onClick={() => {
                      onChangePage({
                        autoLayout: { ...autoLayout, enabled: true, direction: dir },
                      })
                      onApplyAutoLayout?.()
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-auto rounded-md px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100"
                  onClick={() =>
                    onChangePage({ autoLayout: { ...autoLayout, enabled: !autoLayout.enabled } })
                  }
                >
                  {autoLayout.enabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <Field
                  label="Gap"
                  value={autoLayout.gap}
                  onChange={(v) => {
                    onChangePage({ autoLayout: { ...autoLayout, enabled: true, gap: v } })
                    onApplyAutoLayout?.()
                  }}
                />
                <Field
                  label="Pad"
                  value={autoLayout.paddingX}
                  onChange={(v) => {
                    onChangePage({
                      autoLayout: {
                        ...autoLayout,
                        enabled: true,
                        paddingX: v,
                        paddingY: v,
                      },
                    })
                    onApplyAutoLayout?.()
                  }}
                />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-gray-600">
                <input
                  type="checkbox"
                  checked={autoLayout.clipContent}
                  onChange={(e) =>
                    onChangePage({
                      autoLayout: { ...autoLayout, clipContent: e.target.checked },
                    })
                  }
                />
                Clip content
              </label>
            </Section>
          ) : null}

          <Section title="Appearance">
            <div className="grid grid-cols-2 gap-1.5">
              <Field
                label="%"
                value={Math.round(element.opacity * 100)}
                onChange={(v) => onChange({ opacity: Math.min(100, Math.max(0, v)) / 100 })}
              />
              {(element.type === 'shape' ||
                element.type === 'image' ||
                element.type === 'artboard_background') && (
                <div className="flex items-center gap-1">
                  <Field
                    label="R"
                    value={cornerRadius}
                    onChange={(v) => {
                      onChange({
                        cornerRadius: v,
                        cornerRadii: independentCorners
                          ? cornerRadii
                          : { tl: v, tr: v, br: v, bl: v },
                      })
                    }}
                  />
                  <button
                    type="button"
                    title="Independent corners"
                    className={`rounded p-1 ${independentCorners ? 'text-[#0B99FF]' : 'text-gray-400'}`}
                    onClick={() => setIndependentCorners((v) => !v)}
                  >
                    <Grid3x3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            {independentCorners &&
            (element.type === 'shape' ||
              element.type === 'image' ||
              element.type === 'artboard_background') ? (
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['tl', 'TL'],
                    ['tr', 'TR'],
                    ['bl', 'BL'],
                    ['br', 'BR'],
                  ] as const
                ).map(([key, label]) => (
                  <Field
                    key={key}
                    label={label}
                    value={cornerRadii[key]}
                    onChange={(v) =>
                      onChange({
                        cornerRadii: { ...cornerRadii, [key]: v },
                        cornerRadius: Math.max(
                          key === 'tl' ? v : cornerRadii.tl,
                          key === 'tr' ? v : cornerRadii.tr,
                          key === 'br' ? v : cornerRadii.br,
                          key === 'bl' ? v : cornerRadii.bl,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            title="Fill"
            action={
              hasFillControl(element) ? (
                <div className="relative flex items-center gap-0.5">
                  <StyleLibButton
                    title="Color styles"
                    active={colorTarget === 'fill'}
                    onClick={() => setColorTarget(colorTarget === 'fill' ? null : 'fill')}
                  />
                  <button
                    type="button"
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                    title="Open colour picker"
                    onClick={() => setColorTarget(colorTarget === 'fill' ? null : 'fill')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null
            }
          >
            {hasFillControl(element) ? (
              <>
                <div className="relative flex items-center gap-1.5 rounded-md bg-[#F5F5F5] px-2 py-1">
                  <label
                    className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded border border-gray-200"
                    title="Pick colour"
                    style={{ background: normalizeHex(fill ?? '#FFFFFF') }}
                  >
                    <input
                      type="color"
                      aria-label="Fill colour"
                      value={normalizeHex(fill ?? '#FFFFFF')}
                      onChange={(e) => setFill(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                  <input
                    value={fillHexDisplay}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
                      setFillHexDraft(raw.toUpperCase())
                      if (raw.length === 6) setFill(`#${raw}`)
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '')
                      if (raw.length === 3) {
                        setFill(`#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`)
                      } else if (raw.length === 6) {
                        setFill(`#${raw}`)
                      } else {
                        setFillHexDraft(null)
                      }
                    }}
                    onFocus={() => setColorTarget('fill')}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] uppercase outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    title="Opacity %"
                    value={Math.round((fillOpacity ?? 1) * 100)}
                    onChange={(e) => {
                      const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                      setFill(normalizeHex(fill ?? '#FFFFFF'), pct / 100)
                    }}
                    className="w-10 bg-transparent text-right text-[11px] text-gray-600 outline-none"
                  />
                  {!isFrame ? (
                    <button type="button" onClick={onToggleVisible} className="text-gray-500">
                      {element.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ) : null}
                  {colorTarget === 'fill' ? (
                    <ColorPickerPopover
                      open
                      hex={normalizeHex(fill ?? '#FFFFFF')}
                      opacity={fillOpacity ?? 1}
                      swatches={swatches}
                      onClose={() => setColorTarget(null)}
                      onChange={(hex, opacity) => setFill(hex, opacity)}
                    />
                  ) : null}
                </div>
                {element.type === 'group' ? (
                  <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
                    Applies to all paths and shapes inside this group.
                  </p>
                ) : element.type === 'svg_graphic' ? (
                  <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
                    Recolours solid fills in this layer (gradients stay).
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-[10px] text-gray-400">No fill on this layer type</p>
            )}
          </Section>

          <Section
            title="Stroke"
            defaultOpen={strokeWidth > 0}
            action={
              <button
                type="button"
                className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                onClick={() => {
                  if (!hasStrokeControl(element)) return
                  onChange({
                    stroke: stroke ?? '#000000',
                    strokeWidth: strokeWidth || 1,
                    ...(hasVisualStyle(element)
                      ? { strokeAlign: strokeAlign || 'inside' }
                      : {}),
                  })
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          >
            {hasStrokeControl(element) && strokeWidth > 0 ? (
              <div className="relative space-y-1.5">
                <div className="flex items-center gap-1.5 rounded-md bg-[#F5F5F5] px-2 py-1">
                  <button
                    type="button"
                    className="h-5 w-5 rounded border border-gray-200"
                    style={{ background: normalizeHex(stroke ?? '#000000') }}
                    onClick={() => setColorTarget(colorTarget === 'stroke' ? null : 'stroke')}
                  />
                  <input
                    value={normalizeHex(stroke ?? '#000000').replace('#', '').toUpperCase()}
                    onChange={(e) => onChange({ stroke: `#${e.target.value.replace('#', '')}` })}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] uppercase outline-none"
                  />
                  <button
                    type="button"
                    className="text-gray-400"
                    onClick={() => onChange({ stroke: null, strokeWidth: 0 })}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {colorTarget === 'stroke' ? (
                  <ColorPickerPopover
                    open
                    hex={normalizeHex(stroke ?? '#000000')}
                    opacity={1}
                    swatches={swatches}
                    onClose={() => setColorTarget(null)}
                    onChange={(hex) => onChange({ stroke: hex })}
                  />
                ) : null}
                <div className="grid grid-cols-2 gap-1.5">
                  {hasVisualStyle(element) ? (
                    <label className="flex items-center gap-1 rounded-md bg-[#F5F5F5] px-2 py-1">
                      <span className="text-[10px] text-gray-500">Pos</span>
                      <select
                        value={strokeAlign}
                        onChange={(e) =>
                          onChange({
                            strokeAlign: e.target.value as 'inside' | 'center' | 'outside',
                          })
                        }
                        className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                      >
                        <option value="inside">Inside</option>
                        <option value="center">Center</option>
                        <option value="outside">Outside</option>
                      </select>
                    </label>
                  ) : (
                    <span />
                  )}
                  <Field
                    label="W"
                    value={strokeWidth}
                    onChange={(v) => onChange({ strokeWidth: Math.max(0, v) })}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-gray-400">
                {hasStrokeControl(element) ? 'No stroke · click + to add' : 'Stroke not available for this layer'}
              </p>
            )}
          </Section>

          <Section
            title="Effects"
            defaultOpen={effects.length > 0}
            action={
              <div className="relative flex items-center gap-0.5">
                <StyleLibButton
                  title="Effect styles"
                  active={effectLibOpen}
                  onClick={() => {
                    setEffectLibOpen((v) => !v)
                    setGuideLibOpen(false)
                  }}
                />
                <button
                  type="button"
                  className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                  onClick={() => {
                    if (!hasVisualStyle(element)) return
                    setEffects([...effects, createDropShadowEffect()])
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {effectLibOpen ? (
                  <StudioPopover
                    widthClass="w-70"
                    align="right"
                    onClose={() => setEffectLibOpen(false)}
                  >
                    <StudioPopoverHeader title="Effect styles" onClose={() => setEffectLibOpen(false)} />
                    <StudioPopoverBody>
                      <StudioPopoverSection label="Elevation">
                        {EFFECT_STYLE_PRESETS.map((preset) => (
                          <StudioPopoverItem
                            key={preset.id}
                            label={preset.name}
                            leading={
                              <span className="block h-5 w-5 rounded-md bg-white shadow-[0_3px_8px_rgba(0,0,0,0.22)] ring-1 ring-black/5" />
                            }
                            onClick={() => {
                              setEffects([createDropShadowEffect({ ...preset.effect })])
                              setEffectLibOpen(false)
                            }}
                          />
                        ))}
                      </StudioPopoverSection>
                    </StudioPopoverBody>
                  </StudioPopover>
                ) : null}
              </div>
            }
          >
            {effects.length === 0 ? (
              <p className="text-[10px] text-gray-400">No effects · click + or styles</p>
            ) : (
              <div className="space-y-2">
                {effects.map((fx) => (
                  <div key={fx.id} className="space-y-1.5 rounded-md bg-[#F5F5F5] p-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="h-5 w-5 rounded border border-gray-200"
                        style={{ background: fx.color, opacity: fx.opacity }}
                        onClick={() => {
                          setEffectEditId(fx.id)
                          setColorTarget('effect')
                        }}
                      />
                      <span className="flex-1 text-[11px] capitalize text-gray-700">
                        {fx.type.replace('_', ' ')}
                      </span>
                      <button
                        type="button"
                        className="text-gray-500"
                        onClick={() =>
                          setEffects(
                            effects.map((e) =>
                              e.id === fx.id ? { ...e, visible: !e.visible } : e,
                            ),
                          )
                        }
                      >
                        {fx.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        className="text-gray-400"
                        onClick={() => setEffects(effects.filter((e) => e.id !== fx.id))}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {fx.type !== 'layer_blur' ? (
                      <div className="grid grid-cols-2 gap-1">
                        <Field
                          label="X"
                          value={fx.offsetX}
                          onChange={(v) =>
                            setEffects(
                              effects.map((e) => (e.id === fx.id ? { ...e, offsetX: v } : e)),
                            )
                          }
                        />
                        <Field
                          label="Y"
                          value={fx.offsetY}
                          onChange={(v) =>
                            setEffects(
                              effects.map((e) => (e.id === fx.id ? { ...e, offsetY: v } : e)),
                            )
                          }
                        />
                        <Field
                          label="Blur"
                          value={fx.blur}
                          onChange={(v) =>
                            setEffects(
                              effects.map((e) => (e.id === fx.id ? { ...e, blur: v } : e)),
                            )
                          }
                        />
                        <Field
                          label="%"
                          value={Math.round(fx.opacity * 100)}
                          onChange={(v) =>
                            setEffects(
                              effects.map((e) =>
                                e.id === fx.id
                                  ? { ...e, opacity: Math.min(100, Math.max(0, v)) / 100 }
                                  : e,
                              ),
                            )
                          }
                        />
                      </div>
                    ) : (
                      <Field
                        label="Blur"
                        value={fx.blur}
                        onChange={(v) =>
                          setEffects(
                            effects.map((e) => (e.id === fx.id ? { ...e, blur: v } : e)),
                          )
                        }
                      />
                    )}
                    {colorTarget === 'effect' && effectEditId === fx.id ? (
                      <ColorPickerPopover
                        open
                        hex={normalizeHex(fx.color)}
                        opacity={fx.opacity}
                        swatches={swatches}
                        onClose={() => {
                          setColorTarget(null)
                          setEffectEditId(null)
                        }}
                        onChange={(hex, opacity) =>
                          setEffects(
                            effects.map((e) =>
                              e.id === fx.id ? { ...e, color: hex, opacity } : e,
                            ),
                          )
                        }
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {isFrame && onChangePage ? (
            <Section
              title="Layout guide"
              defaultOpen={layoutGuide.enabled}
              action={
                <div className="relative flex items-center gap-0.5">
                  <StyleLibButton
                    title="Layout guide styles"
                    active={guideLibOpen}
                    onClick={() => {
                      setGuideLibOpen((v) => !v)
                      setEffectLibOpen(false)
                    }}
                  />
                  <button
                    type="button"
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-100"
                    onClick={() =>
                      onChangePage({
                        layoutGuide: { ...layoutGuide, enabled: true },
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  {guideLibOpen ? (
                    <StudioPopover
                      widthClass="w-70"
                      align="right"
                      onClose={() => setGuideLibOpen(false)}
                    >
                      <StudioPopoverHeader
                        title="Layout guide styles"
                        onClose={() => setGuideLibOpen(false)}
                      />
                      <StudioPopoverBody>
                        <StudioPopoverSection label="Presets">
                          {LAYOUT_GUIDE_PRESETS.map((preset) => (
                            <StudioPopoverItem
                              key={preset.id}
                              label={preset.name}
                              meta={preset.group}
                              leading={<Grid3x3 className="h-4 w-4 text-gray-400" />}
                              onClick={() => {
                                onChangePage({ layoutGuide: preset.guide })
                                setGuideLibOpen(false)
                              }}
                            />
                          ))}
                        </StudioPopoverSection>
                      </StudioPopoverBody>
                    </StudioPopover>
                  ) : null}
                </div>
              }
            >
              {layoutGuide.enabled ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Field
                      label="Col"
                      value={layoutGuide.columns}
                      onChange={(v) =>
                        onChangePage({
                          layoutGuide: {
                            ...layoutGuide,
                            columns: Math.max(1, Math.round(v)),
                          },
                        })
                      }
                    />
                    <Field
                      label="Row"
                      value={layoutGuide.rows}
                      onChange={(v) =>
                        onChangePage({
                          layoutGuide: { ...layoutGuide, rows: Math.max(0, Math.round(v)) },
                        })
                      }
                    />
                    <Field
                      label="Gut"
                      value={layoutGuide.gutter}
                      onChange={(v) =>
                        onChangePage({ layoutGuide: { ...layoutGuide, gutter: v } })
                      }
                    />
                    <Field
                      label="Mar"
                      value={layoutGuide.margin}
                      onChange={(v) =>
                        onChangePage({ layoutGuide: { ...layoutGuide, margin: v } })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="text-[10px] text-gray-500 hover:text-gray-800"
                    onClick={() =>
                      onChangePage({ layoutGuide: { ...layoutGuide, enabled: false } })
                    }
                  >
                    Remove guide
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-gray-400">No guide · click + or styles</p>
              )}
            </Section>
          ) : null}

          {element.type === 'text' ? (
            <>
            <Section title="Typography">
              <textarea
                value={element.content}
                onChange={(e) => onChange({ content: e.target.value })}
                rows={2}
                className="w-full rounded-md bg-[#F5F5F5] px-2 py-1.5 text-[11px] outline-none"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Field
                  label="S"
                  value={element.typography.fontSize}
                  onChange={(v) =>
                    onChange({ typography: { ...element.typography, fontSize: v } })
                  }
                />
                <label className="flex items-center gap-1 rounded-md bg-[#F5F5F5] px-2 py-1">
                  <span className="text-[11px] text-gray-500">W</span>
                  <select
                    value={element.typography.fontWeight}
                    onChange={(e) =>
                      onChange({
                        typography: {
                          ...element.typography,
                          fontWeight: Number(e.target.value),
                        },
                      })
                    }
                    className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                  >
                    {[300, 400, 500, 600, 700].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {element.binding?.type === 'variable' ? (
                <div className="rounded-md bg-[#E5F4FF] px-2 py-1.5 text-[10px] text-[#0B99FF]">
                  Bound · {element.binding.path}
                </div>
              ) : null}
              <label className="block text-[10px] text-gray-500">
                Fit
                <select
                  value={element.layout.fit}
                  onChange={(e) =>
                    onChange({
                      layout: {
                        ...element.layout,
                        fit: e.target.value as TextElement['layout']['fit'],
                      },
                    })
                  }
                  className="mt-0.5 w-full rounded-md bg-[#F5F5F5] px-2 py-1 text-[11px] outline-none"
                >
                  <option value="shrink_wrap">Shrink + wrap</option>
                  <option value="shrink">Shrink</option>
                  <option value="wrap">Wrap</option>
                  <option value="truncate">Truncate</option>
                  <option value="block">Block</option>
                  <option value="none">None</option>
                </select>
              </label>
            </Section>

            <Section title="Data" defaultOpen>
              <p className="text-[10px] leading-snug text-gray-400">
                Bind this layer to a semantic field key — same roles used for guest send.
              </p>
              <label className="mt-2 block text-[10px] text-gray-500">
                Field key
                <select
                  value={
                    element.binding?.type === 'variable' ? element.binding.path ?? '' : ''
                  }
                  onChange={(e) => {
                    const path = e.target.value
                    if (!path) {
                      onChange({
                        binding: { type: 'none' },
                      })
                      return
                    }
                    const field = inventoryFields({ cardType: 'all', eventType: 'all' }).find(
                      (f) => f.path === path || f.key === path,
                    )
                    onChange({
                      content: `{{${path}}}`,
                      binding: {
                        type: 'variable',
                        path,
                        role: field?.role ?? field?.key ?? path,
                        fallback: field?.sample ?? element.binding?.fallback ?? '…',
                      },
                    })
                  }}
                  className="mt-0.5 w-full rounded-md bg-[#F5F5F5] px-2 py-1.5 font-mono text-[11px] outline-none"
                >
                  <option value="">Unbound (static text)</option>
                  {inventoryFields({ cardType: 'all', eventType: 'all' }).map((f) => (
                    <option key={f.key} value={f.path}>
                      {f.key} — {f.label}
                    </option>
                  ))}
                </select>
              </label>
              {element.binding?.type === 'variable' ? (
                <label className="mt-1.5 block text-[10px] text-gray-500">
                  Fallback
                  <input
                    value={element.binding.fallback ?? ''}
                    onChange={(e) =>
                      onChange({
                        binding: {
                          ...element.binding!,
                          type: 'variable',
                          fallback: e.target.value,
                        },
                      })
                    }
                    className="mt-0.5 w-full rounded-md bg-[#F5F5F5] px-2 py-1.5 text-[11px] outline-none"
                    placeholder="Shown when empty"
                  />
                </label>
              ) : null}
            </Section>
            </>
          ) : null}

          <Section title="Export" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="flex items-center gap-1 rounded-md bg-[#F5F5F5] px-2 py-1">
                <span className="text-[10px] text-gray-500">Scale</span>
                <select
                  value={exportScale}
                  onChange={(e) => setExportScale(Number(e.target.value))}
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                >
                  {[1, 2, 3].map((s) => (
                    <option key={s} value={s}>
                      {s}x
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 rounded-md bg-[#F5F5F5] px-2 py-1">
                <span className="text-[10px] text-gray-500">Fmt</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'png' | 'svg')}
                  className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
                >
                  <option value="png">PNG</option>
                  <option value="svg">SVG</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="w-full rounded-md bg-gray-900 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-gray-800"
              onClick={() => onExport?.({ scale: exportScale, format: exportFormat })}
            >
              Export {isFrame ? artboardName || 'frame' : element.name}
            </button>
          </Section>

          {!isFrame ? (
            <div className="flex flex-wrap gap-1 p-3">
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2 py-1 text-[10px]"
                onClick={onToggleLock}
              >
                {element.locked ? 'Unlock' : 'Lock'}
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2 py-1 text-[10px]"
                onClick={() => onReorder('up')}
              >
                Forward
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2 py-1 text-[10px]"
                onClick={() => onReorder('down')}
              >
                Backward
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700"
                onClick={onDelete}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
        </>
      )}
    </aside>
  )
}
