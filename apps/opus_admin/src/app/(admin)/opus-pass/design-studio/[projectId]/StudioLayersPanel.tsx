'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  Frame,
  GripVertical,
  Image as ImageIcon,
  Lock,
  PenLine,
  QrCode,
  Shapes,
  Type,
  Unlock,
  Ungroup,
} from 'lucide-react'

import type { DesignElement } from '@opusfesta/design-engine'
import {
  artworkLayerIds,
  isArtworkRoot,
  isLayerVisibleInView,
  type LayerViewMode,
} from '@opusfesta/design-engine'

export type LayerReorderAction = 'forward' | 'backward' | 'front' | 'back'

type Props = {
  elements: DesignElement[]
  selectedIds: string[]
  artboardName?: string
  pageWidth?: number
  pageHeight?: number
  viewMode?: LayerViewMode
  onSelect: (id: string) => void
  onToggleVisible: (id: string, visible: boolean) => void
  onToggleLock: (id: string, locked: boolean) => void
  onReorder: (id: string, action: LayerReorderAction) => void
  /** Move layer so it sits at document index `toIndex` (artboard stays at 0). */
  onMoveToIndex?: (id: string, toIndex: number) => void
  onRename?: (id: string, name: string) => void
  /** Expand a grouped svg_graphic into child layers. */
  onUngroup?: (id: string) => void
  onToggleHideArtwork?: () => void
  /** Solo this layer (pass null to clear). Alt/⌥-click eye also solos. */
  onSoloLayer?: (id: string | null) => void
  /** Compact mode for embedding in the right inspector. */
  compact?: boolean
}

type TreeNode = {
  el: DesignElement
  depth: number
  /** Sibling index among visible tree peers (0 = front / top of list). */
  siblingIndex: number
  siblingCount: number
}

function layerIcon(el: DesignElement) {
  switch (el.type) {
    case 'artboard_background':
      return Frame
    case 'text':
      return Type
    case 'image':
      return ImageIcon
    case 'qr':
      return QrCode
    case 'group':
      return Folder
    case 'svg_graphic':
      return el.kind === 'group' ? Folder : PenLine
    case 'shape':
    case 'icon':
      return Shapes
    default:
      return Shapes
  }
}

function typeLabel(el: DesignElement) {
  if (el.type === 'artboard_background') return 'Artboard'
  if (el.type === 'text') {
    if (el.binding?.type === 'variable') {
      const key = el.binding.role || el.binding.path?.split('.').pop() || 'field'
      return `Text · ${key}`
    }
    return 'Text'
  }
  if (el.type === 'shape') return 'Shape'
  if (el.type === 'image') return el.photoRole ? `Image · ${el.photoRole}` : 'Image'
  if (el.type === 'icon') return 'Icon'
  if (el.type === 'qr') return 'QR'
  if (el.type === 'group') return 'Group'
  if (el.type === 'svg_graphic') {
    if (el.kind === 'path') return 'Path'
    if (el.kind === 'group') return 'Group'
    if (el.kind === 'shape') return 'Shape'
    if (el.kind === 'image') return 'Graphic'
    return 'Graphic'
  }
  return 'Layer'
}

function isFolder(el: DesignElement) {
  return el.type === 'group' || (el.type === 'svg_graphic' && el.kind === 'group')
}

/**
 * Outlined Illustrator glyphs explode into dozens of Path N leaves.
 * Keep them in the document for paint/hit-test, but don’t list them in Layers —
 * named groups + text/images are what authors actually manage.
 */
function isInkPathLayer(el: DesignElement): boolean {
  return (
    el.type === 'svg_graphic' &&
    (el.kind === 'path' || el.kind === 'shape' || el.kind === 'fragment')
  )
}

/**
 * Children of a parent. Prefer explicit parentId; fall back to group.children.
 * Returned in document order (back → front); UI reverses for Illustrator front-on-top.
 */
function childrenOf(
  elements: DesignElement[],
  parentId: string | null,
  groupChildren?: string[],
): DesignElement[] {
  if (groupChildren && groupChildren.length > 0) {
    const byId = new Map(elements.map((e) => [e.id, e]))
    return groupChildren.map((id) => byId.get(id)).filter((e): e is DesignElement => Boolean(e))
  }
  return elements.filter((el) => {
    if (el.type === 'artboard_background') return false
    const pid = el.parentId ?? null
    return pid === parentId
  })
}

/** Layers-panel children: skip ink paths (see isInkPathLayer). */
function visibleChildrenOf(
  elements: DesignElement[],
  parentId: string | null,
  groupChildren?: string[],
): DesignElement[] {
  return childrenOf(elements, parentId, groupChildren).filter((el) => !isInkPathLayer(el))
}

/** When a hidden path is selected on-canvas, highlight its nearest visible group. */
function layersHighlightId(
  elements: DesignElement[],
  selectedId: string | undefined,
): string | null {
  if (!selectedId) return null
  const byId = new Map(elements.map((e) => [e.id, e]))
  let el = byId.get(selectedId)
  while (el) {
    if (!isInkPathLayer(el)) return el.id
    el = el.parentId ? byId.get(el.parentId) : undefined
  }
  return null
}

/** Flatten tree depth-first; within each level, frontmost sibling first (Illustrator). */
function flattenTree(
  elements: DesignElement[],
  parentId: string | null,
  depth: number,
  groupChildren?: string[],
): TreeNode[] {
  const kids = visibleChildrenOf(elements, parentId, groupChildren)
  // Illustrator: top of panel = front of stack = last in document order
  const frontFirst = [...kids].reverse()
  const rows: TreeNode[] = []
  frontFirst.forEach((el, siblingIndex) => {
    rows.push({ el, depth, siblingIndex, siblingCount: frontFirst.length })
    if (el.type === 'group') {
      rows.push(...flattenTree(elements, el.id, depth + 1, el.children))
    }
  })
  return rows
}

/**
 * Illustrator-style layer tree.
 * Root artboard at the top; groups nest children; top of each list = front of stack.
 */
export function StudioLayersPanel({
  elements,
  selectedIds,
  artboardName,
  pageWidth = 1080,
  pageHeight = 1350,
  viewMode = { hideArtwork: false, soloId: null },
  onSelect,
  onToggleVisible,
  onToggleLock,
  onReorder,
  onMoveToIndex,
  onRename,
  onUngroup,
  onToggleHideArtwork,
  onSoloLayer,
  compact = false,
}: Props) {
  const [rootOpen, setRootOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  const frame = elements.find((el) => el.type === 'artboard_background') ?? null
  const content = elements.filter((el) => el.type !== 'artboard_background')
  const artIds = useMemo(
    () => artworkLayerIds(elements, pageWidth, pageHeight),
    [elements, pageWidth, pageHeight],
  )
  const hasArtwork = artIds.size > 0
  const highlightId = layersHighlightId(elements, selectedIds[0])

  const treeRows = useMemo(() => {
    if (!rootOpen) return [] as TreeNode[]
    const all = flattenTree(elements, null, 1)
    // Hide descendants of collapsed folders
    const hidden = new Set<string>()
    for (const row of all) {
      if (hidden.has(row.el.id)) continue
      if (isFolder(row.el) && collapsedGroups[row.el.id]) {
        const mark = (id: string) => {
          const group = elements.find((e) => e.id === id && e.type === 'group')
          for (const child of visibleChildrenOf(
            elements,
            id,
            group?.type === 'group' ? group.children : undefined,
          )) {
            hidden.add(child.id)
            mark(child.id)
          }
        }
        mark(row.el.id)
      }
    }
    return all.filter((row) => !hidden.has(row.el.id))
  }, [elements, rootOpen, collapsedGroups])

  const beginRename = (el: DesignElement) => {
    if (!onRename || el.type === 'artboard_background') return
    setEditingId(el.id)
    setDraft(el.name)
  }

  const commitRename = (id: string) => {
    if (!onRename) {
      setEditingId(null)
      return
    }
    const next = draft.trim()
    if (next) onRename(id, next)
    setEditingId(null)
  }

  const onDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    if (!onMoveToIndex) {
      setDragId(null)
      return
    }
    const to = elements.findIndex((e) => e.id === targetId)
    if (to < 0) {
      setDragId(null)
      return
    }
    onMoveToIndex(dragId, to)
    setDragId(null)
  }

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const contentCount = content.filter((el) => !isInkPathLayer(el) && el.type !== 'group').length

  return (
    <div className={compact ? 'flex h-full min-h-0 flex-col' : 'space-y-2'}>
      <div
        className={
          compact
            ? 'space-y-2 border-b border-gray-100 px-3 py-2'
            : 'space-y-2'
        }
      >
        <p className="text-[10px] leading-snug text-gray-400">
          Hide artwork to edit text &amp; groups cleanly. ⌥/Alt-click an eye to solo a layer.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {onToggleHideArtwork && hasArtwork ? (
            <button
              type="button"
              onClick={onToggleHideArtwork}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${
                viewMode.hideArtwork
                  ? 'border-[#0B99FF]/40 bg-[#E8F4FF] text-[#0B6BCB]'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
              title="Hide Illustrator background / artwork plate"
            >
              {viewMode.hideArtwork ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              {viewMode.hideArtwork ? 'Artwork hidden' : 'Hide artwork'}
            </button>
          ) : null}
          {viewMode.soloId && onSoloLayer ? (
            <button
              type="button"
              onClick={() => onSoloLayer(null)}
              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
              title="Exit solo mode"
            >
              Exit solo
            </button>
          ) : null}
        </div>
      </div>

      <div className={compact ? 'no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2' : ''}>
        {elements.length === 0 ? (
          <p className="rounded-lg bg-[#F5F5F5] px-3 py-6 text-center text-[12px] text-gray-400">
            No layers yet — add text, shapes, or uploads
          </p>
        ) : (
          <div className="space-y-0.5">
            {/* Artboard root — top of the panel */}
            {frame ? (
              <div
                className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 ${
                  selectedIds.includes(frame.id)
                    ? 'border-[#0B99FF]/40 bg-[#E8F4FF]'
                    : 'border-gray-200 bg-[#F5F5F5]'
                }`}
              >
                <button
                  type="button"
                  className="rounded p-1 text-gray-500 hover:bg-white"
                  title={rootOpen ? 'Collapse artboard' : 'Expand artboard'}
                  onClick={() => setRootOpen((v) => !v)}
                >
                  {rootOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
                  onClick={() => onSelect(frame.id)}
                >
                  <Frame className="h-3.5 w-3.5 shrink-0 text-[#0B99FF]" />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-900">
                    {artboardName || frame.name || 'Artboard'}
                  </span>
                  <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                    Root · {contentCount}
                  </span>
                </button>
              </div>
            ) : null}

            {rootOpen && treeRows.length === 0 ? (
              <p className="mt-1 pl-6 text-[10px] text-gray-400">
                Empty artboard — add text, shapes, or uploads
              </p>
            ) : null}

            {rootOpen
              ? treeRows.map((row) => {
                  const { el, depth, siblingIndex, siblingCount } = row
                  const active = highlightId === el.id || selectedIds.includes(el.id)
                  const Icon = layerIcon(el)
                  const folder = isFolder(el)
                  const nestedVisible =
                    el.type === 'group'
                      ? visibleChildrenOf(elements, el.id, el.children)
                      : []
                  const canExpand = folder && nestedVisible.length > 0
                  const open = canExpand ? !collapsedGroups[el.id] : false
                  const isFront = siblingIndex === 0
                  const isBack = siblingIndex === siblingCount - 1
                  const padLeft = 8 + depth * 14

                  const isArt = artIds.has(el.id) || isArtworkRoot(el, pageWidth, pageHeight)
                  const viewHidden =
                    el.visible &&
                    !isLayerVisibleInView(el, elements, pageWidth, pageHeight, viewMode)
                  const soloActive = viewMode.soloId === el.id

                  return (
                    <div
                      key={el.id}
                      draggable={!el.locked && el.type !== 'group'}
                      onDragStart={() => setDragId(el.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDropOn(el.id)}
                      className={`group flex items-center gap-0.5 rounded-lg border pr-1 ${
                        active
                          ? 'border-[#0B99FF]/40 bg-[#E8F4FF]'
                          : soloActive
                            ? 'border-amber-200 bg-amber-50/80'
                            : 'border-transparent hover:border-gray-200 hover:bg-[#F7F7F8]'
                      } ${!el.visible || viewHidden ? 'opacity-45' : ''} ${
                        dragId === el.id ? 'opacity-60' : ''
                      }`}
                      style={{ paddingLeft: padLeft }}
                    >
                      {canExpand ? (
                        <button
                          type="button"
                          className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700"
                          title={open ? 'Collapse group' : 'Expand group'}
                          onClick={() => toggleGroup(el.id)}
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : folder ? (
                        <span className="w-5.5 shrink-0" aria-hidden />
                      ) : (
                        <span
                          className="cursor-grab text-gray-300 active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                        onClick={() => onSelect(el.id)}
                        onDoubleClick={() => beginRename(el)}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                        {editingId === el.id ? (
                          <input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitRename(el.id)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitRename(el.id)
                              }
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            className="min-w-0 flex-1 rounded border border-[#0B99FF] bg-white px-1 py-0.5 text-[12px] font-medium outline-none"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-900">
                            {el.name || typeLabel(el)}
                            {isArt ? (
                              <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                                art
                              </span>
                            ) : null}
                          </span>
                        )}
                        {el.type === 'group' && nestedVisible.length > 0 ? (
                          <span className="shrink-0 text-[9px] font-medium text-gray-400">
                            {nestedVisible.length}
                          </span>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 items-center opacity-70 group-hover:opacity-100">
                        {onUngroup &&
                        el.type === 'svg_graphic' &&
                        (el.kind === 'group' || (el.markup?.includes('<g') ?? false)) ? (
                          <button
                            type="button"
                            title="Ungroup"
                            disabled={el.locked}
                            className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-800 disabled:opacity-20"
                            onClick={() => onUngroup(el.id)}
                          >
                            <Ungroup className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Bring forward"
                          disabled={isFront || el.locked}
                          className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-800 disabled:opacity-20"
                          onClick={() => onReorder(el.id, 'forward')}
                        >
                          <span className="block text-[10px] font-bold leading-none">↑</span>
                        </button>
                        <button
                          type="button"
                          title="Send backward"
                          disabled={isBack || el.locked}
                          className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-800 disabled:opacity-20"
                          onClick={() => onReorder(el.id, 'backward')}
                        >
                          <span className="block text-[10px] font-bold leading-none">↓</span>
                        </button>
                        <button
                          type="button"
                          title={
                            onSoloLayer
                              ? el.visible
                                ? 'Hide · ⌥/Alt-click to solo'
                                : 'Show · ⌥/Alt-click to solo'
                              : el.visible
                                ? 'Hide'
                                : 'Show'
                          }
                          className={`rounded p-1 hover:bg-white hover:text-gray-800 ${
                            soloActive ? 'text-amber-700' : 'text-gray-500'
                          }`}
                          onClick={(e) => {
                            if (onSoloLayer && (e.altKey || e.metaKey)) {
                              e.preventDefault()
                              onSoloLayer(viewMode.soloId === el.id ? null : el.id)
                              return
                            }
                            onToggleVisible(el.id, !el.visible)
                          }}
                        >
                          {el.visible && !viewHidden ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title={el.locked ? 'Unlock' : 'Lock'}
                          className="rounded p-1 text-gray-500 hover:bg-white hover:text-gray-800"
                          onClick={() => onToggleLock(el.id, !el.locked)}
                        >
                          {el.locked ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                })
              : null}
          </div>
        )}
      </div>

      {selectedIds.length === 1 && content.some((el) => el.id === selectedIds[0]) ? (
        <div
          className={`flex flex-wrap gap-1 border-t border-gray-100 ${
            compact ? 'px-3 py-2' : 'pt-2'
          }`}
        >
          <button
            type="button"
            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => onReorder(selectedIds[0]!, 'front')}
          >
            Bring to front
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => onReorder(selectedIds[0]!, 'back')}
          >
            Send to back
          </button>
        </div>
      ) : null}
    </div>
  )
}
