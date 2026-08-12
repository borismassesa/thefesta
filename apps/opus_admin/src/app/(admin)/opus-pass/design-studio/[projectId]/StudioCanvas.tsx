'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import {
  Grid3x3,
  Magnet,
  Maximize2,
  Minus,
  Move,
  PanelBottom,
  Plus,
  RotateCw,
  X,
} from 'lucide-react'

import {
  ARTBOARD_PRESETS,
  getIcon,
  iconSvgMarkup,
  isLayerVisibleInView,
  roundedRectPath,
  sanitizeSvgFragment,
  shapePathInBox,
  strokeWidthForAlign,
  type DesignDocument,
  type DesignEffect,
  type DesignElement,
  type DesignPage,
  type LayerViewMode,
  type TextElement,
} from '@opusfesta/design-engine'

import type { StudioTool } from './StudioFloatingToolbar'
import { StudioFloatingToolbar } from './StudioFloatingToolbar'
import { StudioTextFormatBar } from './StudioTextFormatBar'

const SNAP = 8
const SAFE_INSET = 48

type Guide = { orientation: 'v' | 'h'; pos: number }
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type Props = {
  document: DesignDocument
  pageIndex?: number
  onPageChange?: (index: number) => void
  onAddPage?: () => void
  onRemovePage?: (index: number) => void
  onMovePage?: (index: number, frameX: number, frameY: number) => void
  onRenamePage?: (index: number, name: string) => void
  selectedIds: string[]
  onSelect: (ids: string[], additive?: boolean) => void
  onChangeElement: (id: string, patch: Partial<DesignElement> & Record<string, unknown>) => void
  resolveText?: (el: DesignElement) => string
  showSafeArea?: boolean
  emptyHint?: ReactNode
  tool: StudioTool
  onToolChange: (tool: StudioTool) => void
  onDrawCreate: (input: {
    kind: 'rect' | 'ellipse' | 'text' | 'frame'
    x: number
    y: number
    width: number
    height: number
  }) => void
  onOpenAssets?: () => void
  artboardPresetKey?: string | null
  onArtboardPresetChange?: (presetKey: string) => void
  fonts?: Array<{ id: string; familyName: string | null }>
  swatches?: Array<{ id: string; name: string; hex: string }>
  layerView?: LayerViewMode
  onToggleHideArtwork?: () => void
  onClearSolo?: () => void
  onDuplicateElement?: (id: string) => void
  onDeleteElements?: (ids: string[]) => void
  onReorderElement?: (id: string, dir: 'forward' | 'backward') => void
}

function pageFrame(p: DesignPage) {
  return { x: p.frameX ?? 0, y: p.frameY ?? 0 }
}

function artboardBounds(pages: DesignPage[]) {
  if (pages.length === 0) return { x: 0, y: 0, w: 1080, h: 1350 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pages) {
    const { x, y } = pageFrame(p)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + p.width)
    maxY = Math.max(maxY, y + p.height)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function pageIndexAtWorld(pages: DesignPage[], wx: number, wy: number): number {
  // Topmost artboard wins (later in list preferred, Figma-like stacking by order).
  for (let i = pages.length - 1; i >= 0; i--) {
    const p = pages[i]
    const { x, y } = pageFrame(p)
    if (wx >= x && wx <= x + p.width && wy >= y && wy <= y + p.height) return i
  }
  return -1
}

/**
 * Hit-test content on the pasteboard (outside artboard frames) as well as on-frame.
 * Prefer the active page so parked layers stay editable like Illustrator.
 */
function contentAtWorld(
  pages: DesignPage[],
  wx: number,
  wy: number,
  preferIndex: number,
  layerView?: LayerViewMode,
): { pageIndex: number; el: DesignElement } | null {
  const order = [
    preferIndex,
    ...pages.map((_, i) => i).filter((i) => i !== preferIndex),
  ].filter((i) => i >= 0 && i < pages.length)

  for (const i of order) {
    const p = pages[i]
    const { x: fx, y: fy } = pageFrame(p)
    const hit = elementAtPoint(
      p.elements,
      wx - fx,
      wy - fy,
      p.width,
      p.height,
      layerView,
    )
    if (hit && hit.type !== 'artboard_background') {
      return { pageIndex: i, el: hit }
    }
  }
  return null
}

function snapValue(n: number, enabled: boolean) {
  if (!enabled) return n
  return Math.round(n / SNAP) * SNAP
}

/** Hit-test content first; empty card clicks select the artboard frame. */
function elementContainsPoint(
  el: DesignElement,
  x: number,
  y: number,
): boolean {
  const t = el.transform
  const pad = el.type === 'text' ? 12 : 0
  if (el.type === 'shape' && el.shape === 'ellipse') {
    const cx = t.x + t.width / 2
    const cy = t.y + t.height / 2
    const rx = Math.max(1, t.width / 2)
    const ry = Math.max(1, t.height / 2)
    const dx = (x - cx) / rx
    const dy = (y - cy) / ry
    return dx * dx + dy * dy <= 1
  }
  return (
    x >= t.x - pad &&
    x <= t.x + t.width + pad &&
    y >= t.y - pad &&
    y <= t.y + t.height + pad
  )
}

function isDecorativeHit(el: DesignElement, pageW: number, pageH: number) {
  if (el.type === 'artboard_background') return true
  if (el.type === 'text' || el.type === 'qr' || el.type === 'icon') return false
  if (el.type === 'svg_graphic') {
    const area = el.transform.width * el.transform.height
    // Layered imports often use full-artboard boxes until tighter bounds exist.
    return area > pageW * pageH * 0.4
  }
  if (el.type === 'image') {
    // Huge frames often sit above type — prefer text/icons when overlapping.
    return el.transform.width * el.transform.height > pageW * pageH * 0.55
  }
  if (el.type === 'shape') {
    const area = el.transform.width * el.transform.height
    // Large soft panels / floral blobs — deprioritize vs text
    if (area > pageW * pageH * 0.12) return true
    if ((el.opacity ?? 1) < 0.5) return true
  }
  return false
}

function elementAtPoint(
  pageElements: DesignElement[],
  x: number,
  y: number,
  pageW: number,
  pageH: number,
  layerView?: LayerViewMode,
): DesignElement | null {
  const hits: DesignElement[] = []
  for (let i = pageElements.length - 1; i >= 0; i--) {
    const el = pageElements[i]
    if (el.type === 'artboard_background' || el.type === 'group') continue
    if (
      layerView &&
      !isLayerVisibleInView(el, pageElements, pageW, pageH, layerView)
    ) {
      continue
    }
    if (!el.visible) continue
    if (!elementContainsPoint(el, x, y)) continue
    hits.push(el)
  }

  // Prefer editable content (text, photos, icons) over large decorative shapes.
  // When artwork is hidden, skip decorative deprioritization — every hit is fair game.
  if (!layerView?.hideArtwork) {
    const preferred = hits.find((el) => !isDecorativeHit(el, pageW, pageH))
    if (preferred) return preferred
  }
  if (hits[0]) return hits[0]

  if (x >= 0 && x <= pageW && y >= 0 && y <= pageH) {
    return pageElements.find((el) => el.type === 'artboard_background') ?? null
  }
  return null
}

function collectGuides(
  moving: DesignElement,
  others: DesignElement[],
  pageW: number,
  pageH: number,
): { x: number; y: number; guides: Guide[] } {
  const t = moving.transform
  let x = t.x
  let y = t.y
  const guides: Guide[] = []
  const mx = t.x + t.width / 2
  const my = t.y + t.height / 2
  const candidatesX = [
    0,
    pageW / 2,
    pageW,
    ...others.flatMap((o) => [o.transform.x, o.transform.x + o.transform.width / 2, o.transform.x + o.transform.width]),
  ]
  const candidatesY = [
    0,
    pageH / 2,
    pageH,
    ...others.flatMap((o) => [
      o.transform.y,
      o.transform.y + o.transform.height / 2,
      o.transform.y + o.transform.height,
    ]),
  ]

  for (const cx of candidatesX) {
    if (Math.abs(t.x - cx) < SNAP) {
      x = cx
      guides.push({ orientation: 'v', pos: cx })
    } else if (Math.abs(mx - cx) < SNAP) {
      x = cx - t.width / 2
      guides.push({ orientation: 'v', pos: cx })
    } else if (Math.abs(t.x + t.width - cx) < SNAP) {
      x = cx - t.width
      guides.push({ orientation: 'v', pos: cx })
    }
  }
  for (const cy of candidatesY) {
    if (Math.abs(t.y - cy) < SNAP) {
      y = cy
      guides.push({ orientation: 'h', pos: cy })
    } else if (Math.abs(my - cy) < SNAP) {
      y = cy - t.height / 2
      guides.push({ orientation: 'h', pos: cy })
    } else if (Math.abs(t.y + t.height - cy) < SNAP) {
      y = cy - t.height
      guides.push({ orientation: 'h', pos: cy })
    }
  }
  return { x, y, guides }
}

function applyHandleResize(
  handle: Handle,
  orig: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
) {
  let { x, y, width, height } = orig
  if (handle.includes('e')) width = Math.max(8, orig.width + dx)
  if (handle.includes('s')) height = Math.max(8, orig.height + dy)
  if (handle.includes('w')) {
    width = Math.max(8, orig.width - dx)
    x = orig.x + (orig.width - width)
  }
  if (handle.includes('n')) {
    height = Math.max(8, orig.height - dy)
    y = orig.y + (orig.height - height)
  }
  return { x, y, width, height }
}

const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

export function StudioCanvas({
  document,
  pageIndex = 0,
  onPageChange,
  onAddPage,
  onRemovePage,
  onMovePage,
  onRenamePage,
  selectedIds,
  onSelect,
  onChangeElement,
  resolveText,
  showSafeArea = true,
  emptyHint,
  tool,
  onToolChange,
  onDrawCreate,
  onOpenAssets,
  artboardPresetKey,
  onArtboardPresetChange,
  fonts = [],
  swatches,
  layerView,
  onToggleHideArtwork,
  onClearSolo,
  onDuplicateElement,
  onDeleteElements,
  onReorderElement,
}: Props) {
  const page = document.pages[pageIndex] ?? document.pages[0]
  const viewMode: LayerViewMode = layerView ?? { hideArtwork: false, soloId: null }
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({})
  const renameInputRef = useRef<HTMLInputElement>(null)
  /** Page index for the in-flight gesture (pageIndex can lag one frame after switch). */
  const interactPageRef = useRef(pageIndex)
  const [zoom, setZoom] = useState(0.35)
  const [pan, setPan] = useState({ x: 80, y: 80 })
  const [showGrid, setShowGrid] = useState(true)
  const [snapOn, setSnapOn] = useState(true)
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [renaming, setRenaming] = useState<{ index: number; draft: string } | null>(null)
  const [boardDrag, setBoardDrag] = useState<{
    index: number
    startWX: number
    startWY: number
    origX: number
    origY: number
    armed?: boolean
  } | null>(null)

  useEffect(() => {
    interactPageRef.current = pageIndex
  }, [pageIndex])

  useEffect(() => {
    if (!renaming) return
    const id = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [renaming?.index])

  const commitRename = useCallback(() => {
    if (!renaming || !onRenamePage) {
      setRenaming(null)
      return
    }
    const next = renaming.draft.trim() || `Artboard ${renaming.index + 1}`
    onRenamePage(renaming.index, next)
    setRenaming(null)
  }, [onRenamePage, renaming])

  const beginRename = useCallback(
    (index: number) => {
      if (!onRenamePage) return
      setBoardDrag(null)
      onPageChange?.(index)
      const p = document.pages[index]
      setRenaming({ index, draft: p?.name || `Artboard ${index + 1}` })
    },
    [document.pages, onPageChange, onRenamePage],
  )
  const [guides, setGuides] = useState<Guide[]>([])
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  )
  const [drag, setDrag] = useState<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const [resize, setResize] = useState<{
    id: string
    handle: Handle
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)
  const [rotate, setRotate] = useState<{
    id: string
    cx: number
    cy: number
    startAngle: number
    origRotation: number
  } | null>(null)
  const [textEditId, setTextEditId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  )
  const [draw, setDraw] = useState<{
    kind: 'rect' | 'ellipse' | 'text' | 'frame'
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)

  // Keep gesture objects in refs so window listeners always see the latest start state.
  const dragRef = useRef(drag)
  const resizeRef = useRef(resize)
  const rotateRef = useRef(rotate)
  const snapOnRef = useRef(snapOn)
  const documentRef = useRef(document)
  const onChangeElementRef = useRef(onChangeElement)
  const clientToPageLocalRef = useRef<
    (clientX: number, clientY: number, index?: number) => {
      x: number
      y: number
      pageIndex: number
      world: { x: number; y: number }
    }
  >(() => ({ x: 0, y: 0, pageIndex: 0, world: { x: 0, y: 0 } }))
  dragRef.current = drag
  resizeRef.current = resize
  rotateRef.current = rotate
  snapOnRef.current = snapOn
  documentRef.current = document
  onChangeElementRef.current = onChangeElement

  const applyTransformGestureMove = useCallback((clientX: number, clientY: number) => {
    const interactIndex = interactPageRef.current
    const interactPage = documentRef.current.pages[interactIndex] ?? documentRef.current.pages[0]
    if (!interactPage) return
    const local = clientToPageLocalRef.current(clientX, clientY, interactIndex)
    const { x, y } = local
    const snap = snapOnRef.current
    const change = onChangeElementRef.current

    const rotateState = rotateRef.current
    if (rotateState) {
      const angle =
        (Math.atan2(y - rotateState.cy, x - rotateState.cx) * 180) / Math.PI
      const el = interactPage.elements.find((e2) => e2.id === rotateState.id)
      if (!el) return
      const nextRotation = Math.round(
        rotateState.origRotation + (angle - rotateState.startAngle),
      )
      change(rotateState.id, {
        transform: { ...el.transform, rotation: nextRotation },
      })
      return
    }

    const resizeState = resizeRef.current
    if (resizeState) {
      const dx = x - resizeState.startX
      const dy = y - resizeState.startY
      const el = interactPage.elements.find((e2) => e2.id === resizeState.id)
      if (!el) return
      if (el.type === 'artboard_background') {
        let width = resizeState.origW
        let height = resizeState.origH
        if (resizeState.handle.includes('e')) width = Math.max(320, resizeState.origW + dx)
        if (resizeState.handle.includes('w')) width = Math.max(320, resizeState.origW - dx)
        if (resizeState.handle.includes('s')) height = Math.max(320, resizeState.origH + dy)
        if (resizeState.handle.includes('n')) height = Math.max(320, resizeState.origH - dy)
        change(resizeState.id, {
          transform: {
            ...el.transform,
            x: 0,
            y: 0,
            width: snapValue(width, snap),
            height: snapValue(height, snap),
          },
        })
        return
      }
      const next = applyHandleResize(
        resizeState.handle,
        {
          x: resizeState.origX,
          y: resizeState.origY,
          width: resizeState.origW,
          height: resizeState.origH,
        },
        dx,
        dy,
      )
      change(resizeState.id, {
        transform: {
          ...el.transform,
          x: snapValue(next.x, snap),
          y: snapValue(next.y, snap),
          width: snapValue(next.width, snap),
          height: snapValue(next.height, snap),
        },
      })
      return
    }

    const dragState = dragRef.current
    if (!dragState) return
    const el = interactPage.elements.find((e2) => e2.id === dragState.id)
    if (!el) return
    const dx = x - dragState.startX
    const dy = y - dragState.startY
    let nextX = snapValue(dragState.origX + dx, snap)
    let nextY = snapValue(dragState.origY + dy, snap)
    const trial = { ...el, transform: { ...el.transform, x: nextX, y: nextY } }
    const snapped = collectGuides(
      trial,
      interactPage.elements.filter((o) => o.id !== el.id && o.visible),
      interactPage.width,
      interactPage.height,
    )
    if (snap) {
      nextX = snapped.x
      nextY = snapped.y
      setGuides(snapped.guides)
    } else setGuides([])
    change(dragState.id, {
      transform: { ...el.transform, x: nextX, y: nextY },
    })
  }, [])

  useEffect(() => {
    if (!drag && !resize && !rotate) return
    const onMove = (e: PointerEvent) => {
      applyTransformGestureMove(e.clientX, e.clientY)
    }
    const onUp = () => {
      setDrag(null)
      setResize(null)
      setRotate(null)
      setGuides([])
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, resize, rotate, applyTransformGestureMove])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      if (e.code === 'Space' && !typing) {
        e.preventDefault()
        setSpaceDown(e.type === 'keydown')
      }
      if (e.type !== 'keydown' || typing) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (textEditId) {
          setTextEditId(null)
          return
        }
        setDraw(null)
        setMarquee(null)
        onToolChange('select')
        return
      }
      // Enter renames the active artboard (not while editing text).
      if (e.key === 'Enter') {
        if (textEditId) return
        e.preventDefault()
        beginRename(pageIndex)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'v' || e.key === 'V') onToolChange('select')
      if (e.key === 'h' || e.key === 'H') onToolChange('hand')
      if (e.key === 'r' || e.key === 'R') onToolChange('rect')
      if (e.key === 'o' || e.key === 'O') onToolChange('ellipse')
      if (e.key === 't' || e.key === 'T') onToolChange('text')
      if (e.key === 'f' || e.key === 'F') onToolChange('frame')
      if (e.key === '\\') {
        e.preventDefault()
        setToolbarVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [beginRename, onToolChange, pageIndex, textEditId])

  useEffect(() => {
    if (textEditId && !selectedIds.includes(textEditId)) setTextEditId(null)
  }, [selectedIds, textEditId])

  useEffect(() => {
    if (tool === 'assets') {
      onOpenAssets?.()
      onToolChange('select')
    }
  }, [tool, onOpenAssets, onToolChange])

  const fitZoom = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const bounds = artboardBounds(document.pages)
    const pad = 120
    const zx = (el.clientWidth - pad) / Math.max(bounds.w, 1)
    const zy = (el.clientHeight - pad) / Math.max(bounds.h, 1)
    const z = Math.min(zx, zy, 1)
    setZoom(z)
    setPan({
      x: el.clientWidth / 2 - (bounds.x + bounds.w / 2) * z,
      y: el.clientHeight / 2 - (bounds.y + bounds.h / 2) * z,
    })
  }, [document.pages])

  useEffect(() => {
    fitZoom()
    // Fit when artboard count changes, not on every pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.pages.length])

  /** Screen → world canvas coordinates. */
  const clientToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const vp = viewportRef.current
      if (!vp) return { x: 0, y: 0 }
      const rect = vp.getBoundingClientRect()
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      }
    },
    [pan.x, pan.y, zoom],
  )

  /** Screen → local coords on a page (falls back to active page). */
  const clientToPageLocal = useCallback(
    (clientX: number, clientY: number, index = pageIndex) => {
      const p = document.pages[index] ?? document.pages[0]
      const { x: fx, y: fy } = pageFrame(p)
      const world = clientToWorld(clientX, clientY)
      return { x: world.x - fx, y: world.y - fy, pageIndex: index, world }
    },
    [clientToWorld, document.pages, pageIndex],
  )
  clientToPageLocalRef.current = clientToPageLocal

  const isHand = tool === 'hand' || spaceDown

  const onWheel = (e: ReactWheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.06 : 0.06
      setZoom((z) => Math.min(2.5, Math.max(0.15, z + delta)))
    }
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    // Clicks on floating format bar / handles / rotate-position must not clear selection.
    const raw = e.target
    if (raw instanceof Element && raw.closest('[data-studio-chrome]')) {
      return
    }

    if (e.button === 1 || isHand || e.button === 2) {
      setPanning({ sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y })
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      return
    }
    if (e.button !== 0) return

    // Don't start a competing canvas drag while a transform gesture is live.
    if (dragRef.current || resizeRef.current || rotateRef.current) return

    const world = clientToWorld(e.clientX, e.clientY)
    const hitPage = pageIndexAtWorld(document.pages, world.x, world.y)
    const activeIndex = hitPage >= 0 ? hitPage : pageIndex
    interactPageRef.current = activeIndex
    if (hitPage >= 0 && hitPage !== pageIndex) onPageChange?.(hitPage)
    const activePage = document.pages[activeIndex] ?? page
    const { x: fx, y: fy } = pageFrame(activePage)
    const x = world.x - fx
    const y = world.y - fy

    if (tool === 'rect' || tool === 'ellipse' || tool === 'text' || tool === 'frame') {
      if (hitPage < 0) return
      setDraw({ kind: tool === 'frame' ? 'frame' : tool, x0: x, y0: y, x1: x, y1: y })
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      return
    }

    if (tool === 'inspect' || tool === 'select' || tool === 'comment' || tool === 'pen' || tool === 'assets') {
      // Pasteboard (outside any artboard): still pick content parked off-frame.
      if (hitPage < 0) {
        const parked = contentAtWorld(
          document.pages,
          world.x,
          world.y,
          pageIndex,
          viewMode,
        )
        if (!parked) {
          if (!e.shiftKey) onSelect([])
          return
        }
        interactPageRef.current = parked.pageIndex
        if (parked.pageIndex !== pageIndex) onPageChange?.(parked.pageIndex)
        onSelect([parked.el.id], e.shiftKey)
        if (tool === 'inspect' || parked.el.locked) return
        const p = document.pages[parked.pageIndex] ?? page
        const { x: pfx, y: pfy } = pageFrame(p)
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
        setDrag({
          id: parked.el.id,
          startX: world.x - pfx,
          startY: world.y - pfy,
          origX: parked.el.transform.x,
          origY: parked.el.transform.y,
        })
        return
      }
      const hit = elementAtPoint(
        activePage.elements,
        x,
        y,
        activePage.width,
        activePage.height,
        viewMode,
      )
      // Empty artboard / background → marquee (drag) or select frame (click)
      if (!hit || hit.type === 'artboard_background') {
        setMarquee({ x0: x, y0: y, x1: x, y1: y })
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
        return
      }
      onSelect([hit.id], e.shiftKey)
      if (tool === 'inspect') return
      if (hit.locked) return
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      setDrag({
        id: hit.id,
        startX: x,
        startY: y,
        origX: hit.transform.x,
        origY: hit.transform.y,
      })
    }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (panning) {
      setPan({
        x: panning.ox + (e.clientX - panning.sx),
        y: panning.oy + (e.clientY - panning.sy),
      })
      return
    }

    if (boardDrag && onMovePage) {
      const world = clientToWorld(e.clientX, e.clientY)
      const dx = world.x - boardDrag.startWX
      const dy = world.y - boardDrag.startWY
      // Wait for a small movement so double-click can rename without dragging.
      if (boardDrag.armed && Math.hypot(dx, dy) < 3 / zoom) return
      if (boardDrag.armed) {
        setBoardDrag({ ...boardDrag, armed: false })
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
      }
      onMovePage(
        boardDrag.index,
        snapValue(boardDrag.origX + dx, snapOn),
        snapValue(boardDrag.origY + dy, snapOn),
      )
      return
    }

    const interactIndex = interactPageRef.current
    const interactPage = document.pages[interactIndex] ?? page
    const { x, y } = clientToPageLocal(e.clientX, e.clientY, interactIndex)

    if (draw) {
      let x1 = x
      let y1 = y
      if (e.shiftKey && draw.kind !== 'text') {
        const dx = x - draw.x0
        const dy = y - draw.y0
        const side = Math.max(Math.abs(dx), Math.abs(dy), 1)
        x1 = draw.x0 + (dx < 0 ? -side : side)
        y1 = draw.y0 + (dy < 0 ? -side : side)
      }
      setDraw({ ...draw, x1, y1 })
      return
    }

    if (marquee) {
      setMarquee({ ...marquee, x1: x, y1: y })
      return
    }

    // resize / rotate / drag are handled by window listeners so chrome unmounts can't drop them
  }

  const onPointerUp = () => {
    if (draw) {
      const x = Math.min(draw.x0, draw.x1)
      const y = Math.min(draw.y0, draw.y1)
      let width = Math.abs(draw.x1 - draw.x0)
      let height = Math.abs(draw.y1 - draw.y0)
      const clickDefaults: Record<typeof draw.kind, { w: number; h: number }> = {
        rect: { w: 160, h: 160 },
        ellipse: { w: 160, h: 160 },
        text: { w: 280, h: 48 },
        frame: { w: 280, h: 280 },
      }
      // Click (no drag) → place a default-sized object at the pointer
      if (width <= 4 && height <= 4) {
        const d = clickDefaults[draw.kind]
        width = d.w
        height = d.h
      }
      if (width > 4 || height > 4) {
        onDrawCreate({
          kind: draw.kind,
          x,
          y,
          width: Math.max(width, draw.kind === 'text' ? 120 : 24),
          height: Math.max(height, draw.kind === 'text' ? 36 : 24),
        })
        onToolChange('select')
      }
      setDraw(null)
    }

    if (marquee) {
      const x1 = Math.min(marquee.x0, marquee.x1)
      const y1 = Math.min(marquee.y0, marquee.y1)
      const x2 = Math.max(marquee.x0, marquee.x1)
      const y2 = Math.max(marquee.y0, marquee.y1)
      const w = x2 - x1
      const h = y2 - y1
      const interactPage = document.pages[interactPageRef.current] ?? page
      if (w > 4 && h > 4) {
        const ids = interactPage.elements
          .filter((el) => {
            if (!el.visible || el.locked) return false
            if (el.type === 'artboard_background' || el.type === 'group') return false
            if (
              !isLayerVisibleInView(
                el,
                interactPage.elements,
                interactPage.width,
                interactPage.height,
                viewMode,
              )
            ) {
              return false
            }
            const t = el.transform
            return t.x < x2 && t.x + t.width > x1 && t.y < y2 && t.y + t.height > y1
          })
          .map((el) => el.id)
        onSelect(ids.length ? ids : [])
      } else {
        // Click on empty / artboard background → select the frame
        const frame = interactPage.elements.find((el) => el.type === 'artboard_background')
        onSelect(frame ? [frame.id] : [])
      }
    }
    setDrag(null)
    setResize(null)
    setRotate(null)
    setPanning(null)
    setBoardDrag(null)
    setMarquee(null)
    setGuides([])
  }

  const gridSize = 40
  const renderGrid = (w: number, h: number) => {
    if (!showGrid) return null
    const lines: ReactNode[] = []
    for (let x = 0; x <= w; x += gridSize) {
      lines.push(
        <line key={`vx${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#0B99FF" strokeOpacity={0.05} strokeWidth={1} />,
      )
    }
    for (let y = 0; y <= h; y += gridSize) {
      lines.push(
        <line key={`hy${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#0B99FF" strokeOpacity={0.05} strokeWidth={1} />,
      )
    }
    return lines
  }

  // Keep handle sizes constant on screen (Figma-like), not in artboard units.
  const handleCss = 8 / zoom
  const titleOffset = 22 / zoom

  const beginRotateGesture = (
    el: DesignElement,
    pageIdx: number,
    ev: ReactPointerEvent<HTMLElement>,
  ) => {
    ev.stopPropagation()
    ev.preventDefault()
    ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
    interactPageRef.current = pageIdx
    onPageChange?.(pageIdx)
    const t = el.transform
    const cx = t.x + t.width / 2
    const cy = t.y + t.height / 2
    const local = clientToPageLocal(ev.clientX, ev.clientY, pageIdx)
    const startAngle = (Math.atan2(local.y - cy, local.x - cx) * 180) / Math.PI
    const next = {
      id: el.id,
      cx,
      cy,
      startAngle,
      origRotation: t.rotation ?? 0,
    }
    rotateRef.current = next
    setRotate(next)
  }

  const beginDragGesture = (
    el: DesignElement,
    pageIdx: number,
    ev: ReactPointerEvent<HTMLElement>,
  ) => {
    if (el.locked) return
    ev.stopPropagation()
    ev.preventDefault()
    ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
    interactPageRef.current = pageIdx
    onPageChange?.(pageIdx)
    const local = clientToPageLocal(ev.clientX, ev.clientY, pageIdx)
    const next = {
      id: el.id,
      startX: local.x,
      startY: local.y,
      origX: el.transform.x,
      origY: el.transform.y,
    }
    dragRef.current = next
    setDrag(next)
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {document.pages.map((p, i) => {
            const active = pageIndex === i
            // Always offer remove when wired — last artboard clears to a blank frame.
            const canRemove = Boolean(onRemovePage)
            const isRenaming = renaming?.index === i
            const label = p.name || `Artboard ${i + 1}`
            return (
              <div key={p.id} className="group flex shrink-0 items-center">
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    value={renaming.draft}
                    onChange={(e) => setRenaming({ index: i, draft: e.target.value })}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitRename()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setRenaming(null)
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Name"
                    style={{
                      width: `${Math.min(28, Math.max(8, (renaming.draft || 'Name').length + 2))}ch`,
                    }}
                    className="h-7 rounded-md border border-[#0B99FF] bg-[#F0F7FF] px-2 text-[12px] font-semibold text-gray-900 outline-none"
                  />
                ) : (
                  <div
                    className={`flex h-7 items-center rounded-md ${
                      active
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <button
                      type="button"
                      title="Double-click to rename"
                      onClick={() => onPageChange?.(i)}
                      onDoubleClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        beginRename(i)
                      }}
                      className={`h-full px-2.5 text-[12px] ${
                        canRemove ? 'pr-1' : ''
                      } ${active ? 'font-semibold' : 'font-medium'}`}
                    >
                      {label}
                    </button>
                    {canRemove ? (
                      <button
                        type="button"
                        title={`Remove ${label}`}
                        aria-label={`Remove ${label}`}
                        className={`mr-1 rounded p-0.5 ${
                          active
                            ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'
                            : 'text-gray-400 opacity-0 hover:bg-gray-200 hover:text-gray-800 group-hover:opacity-100'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemovePage?.(i)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
          {onAddPage ? (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[14px] font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              onClick={onAddPage}
            >
              +
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {viewMode.hideArtwork || viewMode.soloId ? (
            <div className="mr-1 flex items-center gap-1">
              {viewMode.hideArtwork ? (
                <button
                  type="button"
                  title="Show artwork again"
                  onClick={onToggleHideArtwork}
                  className="rounded-md border border-[#0B99FF]/30 bg-[#E8F4FF] px-2 py-1 text-[10px] font-semibold text-[#0B6BCB] hover:bg-[#d9ecff]"
                >
                  Artwork hidden
                </button>
              ) : null}
              {viewMode.soloId ? (
                <button
                  type="button"
                  title="Exit solo"
                  onClick={onClearSolo}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                >
                  Solo
                </button>
              ) : null}
            </div>
          ) : null}
          {onArtboardPresetChange ? (
            <select
              title="Card / frame size"
              value={
                ARTBOARD_PRESETS.find(
                  (p) =>
                    p.key === artboardPresetKey ||
                    (p.width === page.width && p.height === page.height),
                )?.key ?? ''
              }
              onChange={(e) => {
                if (e.target.value) onArtboardPresetChange(e.target.value)
              }}
              className="mr-1 max-w-40 truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700"
            >
              <option value="" disabled>
                {page.width}×{page.height}
              </option>
              {ARTBOARD_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name} · {p.width}×{p.height}
                </option>
              ))}
            </select>
          ) : (
            <span className="mr-2 hidden text-[11px] tabular-nums text-gray-400 sm:inline">
              {page.width}×{page.height}
            </span>
          )}
          <button
            type="button"
            title="Zoom out"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            onClick={() => setZoom((z) => Math.max(0.15, z - 0.1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-11 text-center text-[11px] font-medium tabular-nums text-gray-700">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            title="Zoom in"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Fit"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            onClick={fitZoom}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-gray-200" />
          <button
            type="button"
            title="Grid"
            className={`rounded-md p-1.5 ${showGrid ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            onClick={() => setShowGrid((v) => !v)}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Snap"
            className={`rounded-md p-1.5 ${snapOn ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            onClick={() => setSnapOn((v) => !v)}
          >
            <Magnet className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={toolbarVisible ? 'Hide tools (\\)' : 'Show tools (\\)'}
            className={`rounded-md p-1.5 ${toolbarVisible ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
            onClick={() => setToolbarVisible((v) => !v)}
          >
            <PanelBottom className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-[#F5F5F5] ${
          panning
            ? 'cursor-grabbing'
            : isHand
              ? 'cursor-grab'
              : tool === 'text'
                ? 'cursor-text'
                : tool === 'select' || tool === 'inspect' || tool === 'comment' || tool === 'pen'
                  ? 'cursor-default'
                  : 'cursor-crosshair'
        }`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {document.pages.map((p, i) => {
            const { x: fx, y: fy } = pageFrame(p)
            const active = i === pageIndex
            const pFrameEl = p.elements.find((el) => el.type === 'artboard_background') ?? null
            const pPrimary = active
              ? p.elements.find((el) => el.id === selectedIds[0]) ?? null
              : null
            const pFrameSelected = active && pPrimary?.type === 'artboard_background'
            const pContentEmpty =
              active &&
              p.elements.every(
                (el) =>
                  el.type === 'artboard_background' ||
                  !isLayerVisibleInView(el, p.elements, p.width, p.height, viewMode),
              )

            return (
              <div
                key={p.id}
                className="absolute overflow-visible"
                style={{ left: fx, top: fy, width: p.width, height: p.height }}
              >
                {/* Title — drag to move; double-click renames in the top tab (not on-canvas) */}
                <button
                  type="button"
                  title="Double-click to rename · drag to move"
                  className={`absolute left-0 truncate text-left font-medium ${
                    renaming?.index === i || active || pFrameSelected
                      ? 'text-[#0B99FF]'
                      : 'text-gray-500 hover:text-gray-700'
                  } ${boardDrag?.index === i && !boardDrag.armed ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{
                    top: -titleOffset,
                    maxWidth: p.width,
                    fontSize: 11 / zoom,
                    lineHeight: `${14 / zoom}px`,
                  }}
                  onPointerDown={(ev) => {
                    if (ev.button !== 0 || isHand) return
                    ev.stopPropagation()
                    interactPageRef.current = i
                    onPageChange?.(i)
                    if (pFrameEl) onSelect([pFrameEl.id])
                    if (!onMovePage) return
                    const world = clientToWorld(ev.clientX, ev.clientY)
                    setBoardDrag({
                      index: i,
                      startWX: world.x,
                      startWY: world.y,
                      origX: fx,
                      origY: fy,
                      armed: true,
                    })
                  }}
                  onDoubleClick={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    setBoardDrag(null)
                    beginRename(i)
                  }}
                >
                  {renaming?.index === i
                    ? renaming.draft || 'Artboard'
                    : p.name || `Artboard ${i + 1}`}
                </button>

                <div className="relative h-full w-full overflow-visible bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_16px_40px_rgba(0,0,0,0.12)]">
                  {pFrameSelected ? (
                    <div
                      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
                      style={{ boxShadow: `inset 0 0 0 ${1 / zoom}px #0B99FF` }}
                    >
                      {(
                        [
                          ['nw', { left: 0, top: 0 }, 'nwse-resize'],
                          ['n', { left: '50%', top: 0 }, 'ns-resize'],
                          ['ne', { left: '100%', top: 0 }, 'nesw-resize'],
                          ['e', { left: '100%', top: '50%' }, 'ew-resize'],
                          ['se', { left: '100%', top: '100%' }, 'nwse-resize'],
                          ['s', { left: '50%', top: '100%' }, 'ns-resize'],
                          ['sw', { left: 0, top: '100%' }, 'nesw-resize'],
                          ['w', { left: 0, top: '50%' }, 'ew-resize'],
                        ] as const
                      ).map(([handle, pos, cursor]) => (
                        <button
                          key={handle}
                          type="button"
                          aria-label={`Resize ${handle}`}
                          className="pointer-events-auto absolute rounded-[1px] border border-[#0B99FF] bg-white"
                          style={{
                            ...pos,
                            width: handleCss,
                            height: handleCss,
                            cursor,
                            transform: 'translate(-50%, -50%)',
                          }}
                          onPointerDown={(ev) => {
                            if (!pFrameEl) return
                            ev.stopPropagation()
                            ev.preventDefault()
                            interactPageRef.current = i
                            onPageChange?.(i)
                            const local = clientToPageLocal(ev.clientX, ev.clientY, i)
                            ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
                            setResize({
                              id: pFrameEl.id,
                              handle,
                              startX: local.x,
                              startY: local.y,
                              origX: 0,
                              origY: 0,
                              origW: p.width,
                              origH: p.height,
                            })
                          }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <svg
                    ref={(node) => {
                      svgRefs.current[p.id] = node
                    }}
                    width={p.width}
                    height={p.height}
                    viewBox={`0 0 ${p.width} ${p.height}`}
                    overflow="visible"
                    className="block touch-none overflow-visible"
                  >
                    {/* Printable artboard fill only — layers may extend onto the pasteboard */}
                    <rect width={p.width} height={p.height} fill={p.background} />
                    {renderGrid(p.width, p.height)}
                    {p.elements.map((el) => {
                      if (
                        !isLayerVisibleInView(
                          el,
                          p.elements,
                          p.width,
                          p.height,
                          viewMode,
                        )
                      ) {
                        return null
                      }
                      const t = el.transform
                      const cx = t.x + t.width / 2
                      const cy = t.y + t.height / 2
                      const sx = t.scaleX < 0 ? -1 : 1
                      const sy = t.scaleY < 0 ? -1 : 1
                      const canDirectSelect =
                        el.type !== 'artboard_background' &&
                        !isHand &&
                        (tool === 'select' ||
                          tool === 'comment' ||
                          tool === 'inspect' ||
                          tool === 'pen' ||
                          tool === 'assets')
                      return (
                        <g
                          key={el.id}
                          opacity={el.opacity}
                          transform={[
                            t.rotation ? `rotate(${t.rotation} ${cx} ${cy})` : '',
                            sx !== 1 || sy !== 1
                              ? `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            cursor: canDirectSelect
                              ? el.locked
                                ? 'pointer'
                                : 'move'
                              : undefined,
                            pointerEvents: isHand ? 'none' : undefined,
                          }}
                          onPointerDown={(ev) => {
                            if (!canDirectSelect) return
                            ev.stopPropagation()
                            interactPageRef.current = i
                            onPageChange?.(i)
                            onSelect([el.id], ev.shiftKey)
                            if (el.locked) return
                            if (textEditId === el.id) return
                            const local = clientToPageLocal(ev.clientX, ev.clientY, i)
                            const next = {
                              id: el.id,
                              startX: local.x,
                              startY: local.y,
                              origX: t.x,
                              origY: t.y,
                            }
                            dragRef.current = next
                            setDrag(next)
                            ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
                          }}
                          onDoubleClick={(ev) => {
                            if (el.type !== 'text' || el.locked) return
                            ev.stopPropagation()
                            ev.preventDefault()
                            interactPageRef.current = i
                            onPageChange?.(i)
                            onSelect([el.id])
                            setTextEditId(el.id)
                            setDrag(null)
                          }}
                        >
                          {/* Invisible hit box so the whole text frame is clickable, not only glyphs */}
                          {el.type === 'text' ? (
                            <rect
                              x={t.x}
                              y={t.y}
                              width={Math.max(t.width, 24)}
                              height={Math.max(t.height, 24)}
                              fill="transparent"
                              pointerEvents={textEditId === el.id ? 'none' : 'all'}
                            />
                          ) : null}
                          {textEditId === el.id && el.type === 'text'
                            ? null
                            : renderEl(el, resolveText)}
                        </g>
                      )
                    })}

                    {active && showSafeArea ? (
                      <rect
                        x={SAFE_INSET}
                        y={SAFE_INSET}
                        width={p.width - SAFE_INSET * 2}
                        height={p.height - SAFE_INSET * 2}
                        fill="none"
                        stroke="#0B99FF"
                        strokeOpacity={0.25}
                        strokeWidth={1}
                        strokeDasharray="8 6"
                      />
                    ) : null}

                    {p.layoutGuide?.enabled
                      ? renderLayoutGuide(p.width, p.height, p.layoutGuide)
                      : null}

                    {active
                      ? guides.map((g, gi) =>
                          g.orientation === 'v' ? (
                            <line
                              key={`g${gi}`}
                              x1={g.pos}
                              y1={0}
                              x2={g.pos}
                              y2={p.height}
                              stroke="#F24822"
                              strokeWidth={1}
                            />
                          ) : (
                            <line
                              key={`g${gi}`}
                              x1={0}
                              y1={g.pos}
                              x2={p.width}
                              y2={g.pos}
                              stroke="#F24822"
                              strokeWidth={1}
                            />
                          ),
                        )
                      : null}

                    {active && marquee ? (
                      <rect
                        x={Math.min(marquee.x0, marquee.x1)}
                        y={Math.min(marquee.y0, marquee.y1)}
                        width={Math.abs(marquee.x1 - marquee.x0)}
                        height={Math.abs(marquee.y1 - marquee.y0)}
                        fill="rgba(11,153,255,0.08)"
                        stroke="#0B99FF"
                        strokeWidth={1}
                      />
                    ) : null}

                    {active && draw ? (
                      draw.kind === 'ellipse' ? (
                        <ellipse
                          cx={(draw.x0 + draw.x1) / 2}
                          cy={(draw.y0 + draw.y1) / 2}
                          rx={Math.abs(draw.x1 - draw.x0) / 2}
                          ry={Math.abs(draw.y1 - draw.y0) / 2}
                          fill="rgba(11,153,255,0.12)"
                          stroke="#0B99FF"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <rect
                          x={Math.min(draw.x0, draw.x1)}
                          y={Math.min(draw.y0, draw.y1)}
                          width={Math.abs(draw.x1 - draw.x0)}
                          height={Math.abs(draw.y1 - draw.y0)}
                          fill="rgba(11,153,255,0.12)"
                          stroke="#0B99FF"
                          strokeWidth={1.5}
                          rx={draw.kind === 'frame' ? 16 : 0}
                        />
                      )
                    ) : null}
                  </svg>

                  {/* Selection chrome lives outside the SVG so handles aren’t clipped at the card edge */}
                  {active
                    ? p.elements
                        .filter(
                          (el) =>
                            selectedIds.includes(el.id) &&
                            el.type !== 'artboard_background' &&
                            isLayerVisibleInView(
                              el,
                              p.elements,
                              p.width,
                              p.height,
                              viewMode,
                            ),
                        )
                        .map((el) => {
                          const t = el.transform
                          const isText = el.type === 'text'
                          const startResize = (
                            handle: Handle,
                            ev: ReactPointerEvent<HTMLElement>,
                          ) => {
                            if (el.locked) return
                            ev.stopPropagation()
                            ev.preventDefault()
                            ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
                            interactPageRef.current = i
                            onPageChange?.(i)
                            const local = clientToPageLocal(ev.clientX, ev.clientY, i)
                            const next = {
                              id: el.id,
                              handle,
                              startX: local.x,
                              startY: local.y,
                              origX: t.x,
                              origY: t.y,
                              origW: t.width,
                              origH: t.height,
                            }
                            resizeRef.current = next
                            setResize(next)
                          }
                          const cornerHandles = isText
                            ? ([
                                ['nw', { left: 0, top: 0 }],
                                ['ne', { left: '100%', top: 0 }],
                                ['se', { left: '100%', top: '100%' }],
                                ['sw', { left: 0, top: '100%' }],
                              ] as const)
                            : ([
                                ['nw', { left: 0, top: 0 }],
                                ['n', { left: '50%', top: 0 }],
                                ['ne', { left: '100%', top: 0 }],
                                ['e', { left: '100%', top: '50%' }],
                                ['se', { left: '100%', top: '100%' }],
                                ['s', { left: '50%', top: '100%' }],
                                ['sw', { left: 0, top: '100%' }],
                                ['w', { left: 0, top: '50%' }],
                              ] as const)

                          const editingHere = textEditId === el.id && isText
                          const handleSize = isText ? 8 / zoom : handleCss

                          return (
                            <div
                              key={`sel-${el.id}`}
                              data-studio-chrome="selection"
                              className="absolute z-20 overflow-visible"
                              style={{
                                left: t.x,
                                top: t.y,
                                width: Math.max(t.width, 8),
                                height: Math.max(t.height, 8),
                                transform: t.rotation
                                  ? `rotate(${t.rotation}deg)`
                                  : undefined,
                                transformOrigin: 'center center',
                                pointerEvents: editingHere ? 'none' : 'auto',
                              }}
                            >
                              {/* Hit shield + outline */}
                              <div
                                className="absolute inset-0 cursor-move"
                                title={isText ? 'Double-click to edit text' : undefined}
                                style={{
                                  boxShadow: `0 0 0 ${1 / zoom}px #0B99FF`,
                                  borderRadius: 0,
                                }}
                                onPointerDown={(ev) => {
                                  if (editingHere || ev.detail > 1) return
                                  onSelect([el.id], ev.shiftKey)
                                  beginDragGesture(el, i, ev)
                                }}
                                onDoubleClick={(ev) => {
                                  ev.stopPropagation()
                                  ev.preventDefault()
                                  if (!isText || el.locked) return
                                  onSelect([el.id])
                                  setTextEditId(el.id)
                                }}
                              />

                              {cornerHandles.map(([handle, pos]) => (
                                <button
                                  key={handle}
                                  type="button"
                                  aria-label={`Resize ${handle}`}
                                  className="absolute z-10 border border-[#0B99FF] bg-white"
                                  style={{
                                    ...pos,
                                    width: handleSize,
                                    height: handleSize,
                                    borderRadius: isText ? 1 : 1,
                                    cursor: HANDLE_CURSOR[handle],
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                  onPointerDown={(ev) => startResize(handle, ev)}
                                />
                              ))}

                              {!isText ? (
                                <button
                                  type="button"
                                  aria-label="Rotate"
                                  title="Drag to rotate"
                                  className="absolute left-1/2 z-10 rounded-full border border-[#0B99FF] bg-white"
                                  style={{
                                    top: -28 / zoom,
                                    width: 12 / zoom,
                                    height: 12 / zoom,
                                    transform: 'translate(-50%, -50%)',
                                    cursor: 'grab',
                                  }}
                                  onPointerDown={(ev) => beginRotateGesture(el, i, ev)}
                                />
                              ) : null}
                            </div>
                          )
                        })
                    : null}

                  {/* Artboard distance guides for a single selected text layer */}
                  {active &&
                  selectedIds.length === 1 &&
                  pPrimary?.type === 'text' &&
                  !pPrimary.transform.rotation ? (
                    <svg
                      className="pointer-events-none absolute inset-0 z-10 overflow-visible"
                      width={p.width}
                      height={p.height}
                    >
                      {(() => {
                        const t = pPrimary.transform
                        const cx = t.x + t.width / 2
                        const cy = t.y + t.height / 2
                        const left = Math.max(0, Math.round(t.x))
                        const top = Math.max(0, Math.round(t.y))
                        const right = Math.max(0, Math.round(p.width - (t.x + t.width)))
                        const bottom = Math.max(0, Math.round(p.height - (t.y + t.height)))
                        const stroke = '#0B99FF'
                        const labelFs = 10 / zoom
                        return (
                          <g>
                            {/* Top edge guide */}
                            {t.y > 2 ? (
                              <g>
                                <line
                                  x1={cx}
                                  y1={0}
                                  x2={cx}
                                  y2={t.y}
                                  stroke={stroke}
                                  strokeWidth={1 / zoom}
                                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                                  strokeOpacity={0.85}
                                />
                                <rect
                                  x={cx - 14 / zoom}
                                  y={t.y / 2 - 7 / zoom}
                                  width={28 / zoom}
                                  height={14 / zoom}
                                  rx={3 / zoom}
                                  fill={stroke}
                                />
                                <text
                                  x={cx}
                                  y={t.y / 2}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  fill="#fff"
                                  fontSize={labelFs}
                                  fontWeight={600}
                                  fontFamily="ui-sans-serif, system-ui"
                                >
                                  {top}
                                </text>
                              </g>
                            ) : null}
                            {/* Left edge guide */}
                            {t.x > 2 ? (
                              <g>
                                <line
                                  x1={0}
                                  y1={cy}
                                  x2={t.x}
                                  y2={cy}
                                  stroke={stroke}
                                  strokeWidth={1 / zoom}
                                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                                  strokeOpacity={0.85}
                                />
                                <rect
                                  x={t.x / 2 - 14 / zoom}
                                  y={cy - 7 / zoom}
                                  width={28 / zoom}
                                  height={14 / zoom}
                                  rx={3 / zoom}
                                  fill={stroke}
                                />
                                <text
                                  x={t.x / 2}
                                  y={cy}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  fill="#fff"
                                  fontSize={labelFs}
                                  fontWeight={600}
                                  fontFamily="ui-sans-serif, system-ui"
                                >
                                  {left}
                                </text>
                              </g>
                            ) : null}
                            {/* Right / bottom only while resizing or dragging for less clutter */}
                            {(resize || drag) && right > 2 ? (
                              <g>
                                <line
                                  x1={t.x + t.width}
                                  y1={cy}
                                  x2={p.width}
                                  y2={cy}
                                  stroke={stroke}
                                  strokeWidth={1 / zoom}
                                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                                  strokeOpacity={0.7}
                                />
                                <text
                                  x={(t.x + t.width + p.width) / 2}
                                  y={cy - 6 / zoom}
                                  textAnchor="middle"
                                  fill={stroke}
                                  fontSize={labelFs}
                                  fontWeight={600}
                                  fontFamily="ui-sans-serif, system-ui"
                                >
                                  {right}
                                </text>
                              </g>
                            ) : null}
                            {(resize || drag) && bottom > 2 ? (
                              <g>
                                <line
                                  x1={cx}
                                  y1={t.y + t.height}
                                  x2={cx}
                                  y2={p.height}
                                  stroke={stroke}
                                  strokeWidth={1 / zoom}
                                  strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                                  strokeOpacity={0.7}
                                />
                                <text
                                  x={cx + 8 / zoom}
                                  y={(t.y + t.height + p.height) / 2}
                                  textAnchor="start"
                                  dominantBaseline="central"
                                  fill={stroke}
                                  fontSize={labelFs}
                                  fontWeight={600}
                                  fontFamily="ui-sans-serif, system-ui"
                                >
                                  {bottom}
                                </text>
                              </g>
                            ) : null}
                          </g>
                        )
                      })()}
                    </svg>
                  ) : null}

                  {active &&
                  pPrimary &&
                  pPrimary.type === 'text' &&
                  textEditId === pPrimary.id ? (
                    <textarea
                      data-studio-chrome="text-edit"
                      autoFocus
                      value={(pPrimary as TextElement).content}
                      onChange={(e) =>
                        onChangeElement(pPrimary.id, { content: e.target.value })
                      }
                      onBlur={() => setTextEditId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setTextEditId(null)
                        }
                        e.stopPropagation()
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute z-40 resize-none overflow-auto border-2 border-[#0B99FF] bg-white/95 p-1 shadow-lg outline-none"
                      style={{
                        left: pPrimary.transform.x,
                        top: pPrimary.transform.y,
                        width: Math.max(pPrimary.transform.width, 48),
                        height: Math.max(pPrimary.transform.height, 36),
                        transform: pPrimary.transform.rotation
                          ? `rotate(${pPrimary.transform.rotation}deg)`
                          : undefined,
                        transformOrigin: 'center center',
                        fontFamily: (pPrimary as TextElement).typography.fontFamily,
                        fontSize: (pPrimary as TextElement).typography.fontSize,
                        fontWeight: (pPrimary as TextElement).typography.fontWeight,
                        fontStyle: (pPrimary as TextElement).typography.italic
                          ? 'italic'
                          : 'normal',
                        textDecoration: (pPrimary as TextElement).typography.underline
                          ? 'underline'
                          : undefined,
                        color: (pPrimary as TextElement).typography.color,
                        textAlign: (pPrimary as TextElement).typography.textAlign,
                        lineHeight: (pPrimary as TextElement).typography.lineHeight,
                        letterSpacing: (pPrimary as TextElement).typography.letterSpacing,
                        textTransform: (pPrimary as TextElement).typography.uppercase
                          ? 'uppercase'
                          : undefined,
                        opacity: (pPrimary as TextElement).typography.opacity,
                      }}
                    />
                  ) : null}

                  {active && pPrimary && pPrimary.type !== 'artboard_background' ? (
                    <div
                      className="pointer-events-none absolute z-30 rounded-md bg-[#0B99FF] px-1.5 py-0.5 font-semibold tabular-nums text-white shadow-sm"
                      style={{
                        left: pPrimary.transform.x + pPrimary.transform.width / 2,
                        top: pPrimary.transform.y + pPrimary.transform.height + 10 / zoom,
                        transform: 'translateX(-50%)',
                        fontSize: Math.max(9, 11 / zoom),
                        lineHeight: `${Math.max(12, 14 / zoom)}px`,
                      }}
                    >
                      {Math.round(pPrimary.transform.width)} ×{' '}
                      {Math.round(pPrimary.transform.height)}
                    </div>
                  ) : null}

                  {pContentEmpty && emptyHint ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-10">
                      <div className="max-w-sm rounded-2xl bg-white/95 p-6 text-center shadow-lg ring-1 ring-black/5">
                        {emptyHint}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {/* Text format bar in viewport space — always visible when text is selected (incl. edit mode) */}
        {(() => {
          const textEl =
            selectedIds.length === 1
              ? page.elements.find((el) => el.id === selectedIds[0] && el.type === 'text')
              : null
          if (!textEl || textEl.type !== 'text') return null
          const { x: fx, y: fy } = pageFrame(page)
          const t = textEl.transform
          const cx = pan.x + (fx + t.x + t.width / 2) * zoom
          const top = pan.y + (fy + t.y) * zoom
          const bottom = pan.y + (fy + t.y + t.height) * zoom
          const dimmed = Boolean(resize || rotate || drag)
          return (
            <>
              <div
                data-studio-chrome="format-bar"
                className="pointer-events-none absolute z-50"
                style={{
                  left: cx,
                  top: Math.max(8, top - 10),
                  transform: 'translate(-50%, -100%)',
                  opacity: dimmed ? 0.45 : 1,
                }}
              >
                <div
                  className="pointer-events-auto"
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  <StudioTextFormatBar
                    element={textEl}
                    fonts={fonts}
                    swatches={swatches}
                    previewText={resolveText?.(textEl)}
                    onChange={(patch) => {
                      if (
                        patch.typography &&
                        typeof patch.typography.fontSize === 'number' &&
                        patch.typography.fontSize !== textEl.typography.fontSize
                      ) {
                        const fs = patch.typography.fontSize
                        const lh = textEl.typography.lineHeight || 1.2
                        const minH = Math.round(fs * lh + 12)
                        onChangeElement(textEl.id, {
                          ...patch,
                          transform: {
                            ...textEl.transform,
                            height: Math.max(textEl.transform.height, minH),
                          },
                        })
                        return
                      }
                      onChangeElement(textEl.id, patch)
                    }}
                    onDuplicate={() => onDuplicateElement?.(textEl.id)}
                    onDelete={() => onDeleteElements?.([textEl.id])}
                    onUnbind={() =>
                      onChangeElement(textEl.id, {
                        binding: { type: 'none' },
                      })
                    }
                  />
                </div>
              </div>
              <div
                data-studio-chrome="transform-actions"
                className="pointer-events-none absolute z-50"
                style={{
                  left: cx,
                  top: bottom + 36,
                  transform: 'translateX(-50%)',
                  opacity: dimmed ? 0.45 : 1,
                }}
              >
                <div
                  className="pointer-events-auto flex items-center gap-2 rounded-full bg-transparent p-1"
                  onPointerDown={(ev) => ev.stopPropagation()}
                >
                  <button
                    type="button"
                    title="Drag to rotate"
                    className="flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 shadow-md hover:bg-gray-50"
                    onPointerDown={(ev) => beginRotateGesture(textEl, pageIndex, ev)}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Rotate
                  </button>
                  <button
                    type="button"
                    title="Drag to move"
                    className="flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 text-[11px] font-semibold text-gray-700 shadow-md hover:bg-gray-50"
                    onPointerDown={(ev) => beginDragGesture(textEl, pageIndex, ev)}
                  >
                    <Move className="h-3.5 w-3.5" />
                    Position
                  </button>
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* Docked below the canvas so it never covers the card */}
      {toolbarVisible ? (
        <div className="relative z-20 flex h-12 shrink-0 items-center justify-center border-t border-gray-200 bg-white">
          <StudioFloatingToolbar
            tool={tool}
            onChange={onToolChange}
            visible={toolbarVisible}
            onHide={() => setToolbarVisible(false)}
          />
        </div>
      ) : null}
    </div>
  )
}

function renderLayoutGuide(
  width: number,
  height: number,
  guide: NonNullable<DesignPage['layoutGuide']>,
) {
  const { columns, gutter, margin, rows } = guide
  const innerW = width - margin * 2
  const innerH = height - margin * 2
  const colW = (innerW - gutter * (columns - 1)) / columns
  const nodes: ReactNode[] = []
  for (let i = 0; i < columns; i++) {
    const x = margin + i * (colW + gutter)
    nodes.push(
      <rect
        key={`col${i}`}
        x={x}
        y={margin}
        width={colW}
        height={innerH}
        fill="#0B99FF"
        fillOpacity={0.06}
      />,
    )
  }
  if (rows > 0) {
    const rowH = (innerH - gutter * (rows - 1)) / rows
    for (let i = 0; i < rows; i++) {
      const y = margin + i * (rowH + gutter)
      nodes.push(
        <rect
          key={`row${i}`}
          x={margin}
          y={y}
          width={innerW}
          height={rowH}
          fill="none"
          stroke="#0B99FF"
          strokeOpacity={0.15}
          strokeWidth={1}
        />,
      )
    }
  }
  return <g pointerEvents="none">{nodes}</g>
}

function EffectFilterDefs({ id, effects }: { id: string; effects: DesignEffect[] }) {
  const visible = effects.filter((e) => e.visible)
  if (visible.length === 0) return null
  return (
    <defs>
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
        {visible.map((fx, i) => {
          if (fx.type === 'layer_blur') {
            return (
              <feGaussianBlur
                key={fx.id}
                in={i === 0 ? 'SourceGraphic' : `fx${i - 1}`}
                stdDeviation={fx.blur / 2}
                result={`fx${i}`}
              />
            )
          }
          return (
            <feDropShadow
              key={fx.id}
              in={i === 0 ? 'SourceGraphic' : `fx${i - 1}`}
              dx={fx.offsetX}
              dy={fx.offsetY}
              stdDeviation={fx.blur / 2}
              floodColor={fx.color}
              floodOpacity={fx.opacity}
              result={`fx${i}`}
            />
          )
        })}
      </filter>
    </defs>
  )
}

function renderEl(el: DesignElement, resolveText?: (el: DesignElement) => string) {
  const t = el.transform
  const effects =
    el.type === 'shape' || el.type === 'image' || el.type === 'artboard_background'
      ? el.effects ?? []
      : []
  const filterId = `filter_${el.id}`
  const filterUrl = effects.some((e) => e.visible) ? `url(#${filterId})` : undefined
  const filterDefs = <EffectFilterDefs id={filterId} effects={effects} />

  switch (el.type) {
    case 'artboard_background': {
      const radii = el.cornerRadii
      const r = el.cornerRadius ?? 0
      const body = el.src ? (
        <image href={el.src} x={t.x} y={t.y} width={t.width} height={t.height} preserveAspectRatio="xMidYMid slice" />
      ) : radii ? (
        <path d={roundedRectPath(t.x, t.y, t.width, t.height, radii)} fill={el.fill ?? '#ffffff'} />
      ) : (
        <rect
          x={t.x}
          y={t.y}
          width={t.width}
          height={t.height}
          rx={r}
          fill={el.fill ?? '#ffffff'}
          stroke={el.stroke ?? 'none'}
          strokeWidth={strokeWidthForAlign(el.strokeWidth ?? 0, el.strokeAlign)}
        />
      )
      return (
        <g filter={filterUrl}>
          {filterDefs}
          {body}
        </g>
      )
    }
    case 'shape': {
      const sw = strokeWidthForAlign(el.strokeWidth, el.strokeAlign)
      const clip =
        el.strokeAlign === 'inside' && sw > 0 ? (
          <clipPath id={`clip_${el.id}`}>
            <rect x={t.x} y={t.y} width={t.width} height={t.height} />
          </clipPath>
        ) : null
      const common = {
        fill: el.fill,
        stroke: el.stroke ?? 'none',
        strokeWidth: sw,
      }
      let shapeNode: ReactNode
      if (el.shape === 'ellipse') {
        shapeNode = (
          <ellipse
            cx={t.x + t.width / 2}
            cy={t.y + t.height / 2}
            rx={t.width / 2}
            ry={t.height / 2}
            {...common}
          />
        )
      } else if (el.shape === 'line') {
        shapeNode = (
          <line
            x1={t.x}
            y1={t.y + t.height / 2}
            x2={t.x + t.width}
            y2={t.y + t.height / 2}
            stroke={el.stroke ?? el.fill}
            strokeWidth={Math.max(el.strokeWidth, t.height || 2)}
          />
        )
      } else {
        const path = shapePathInBox(el.shape, t.x, t.y, t.width, t.height)
        if (path) {
          shapeNode = <path d={path} {...common} />
        } else if (el.cornerRadii) {
          shapeNode = <path d={roundedRectPath(t.x, t.y, t.width, t.height, el.cornerRadii)} {...common} />
        } else {
          shapeNode = (
            <rect
              x={t.x}
              y={t.y}
              width={t.width}
              height={t.height}
              rx={el.cornerRadius}
              {...common}
            />
          )
        }
      }
      return (
        <g filter={filterUrl} clipPath={clip ? `url(#clip_${el.id})` : undefined}>
          {filterDefs}
          {clip}
          {shapeNode}
        </g>
      )
    }
    case 'text': {
      const content = resolveText ? resolveText(el) : el.content
      const anchor =
        el.typography.textAlign === 'center' ? 'middle' : el.typography.textAlign === 'right' ? 'end' : 'start'
      const tx =
        el.typography.textAlign === 'center'
          ? t.x + t.width / 2
          : el.typography.textAlign === 'right'
            ? t.x + t.width
            : t.x
      return (
        <text
          x={tx}
          y={t.y + el.typography.fontSize}
          fontFamily={el.typography.fontFamily}
          fontSize={el.typography.fontSize}
          fontWeight={el.typography.fontWeight}
          fill={el.typography.color}
          letterSpacing={el.typography.letterSpacing}
          textAnchor={anchor}
          fontStyle={el.typography.italic ? 'italic' : 'normal'}
          textDecoration={el.typography.underline ? 'underline' : undefined}
          opacity={el.typography.opacity}
        >
          {el.typography.uppercase ? content.toUpperCase() : content}
        </text>
      )
    }
    case 'image':
      if (!el.src) {
        return (
          <g>
            <rect
              x={t.x}
              y={t.y}
              width={t.width}
              height={t.height}
              rx={el.cornerRadius}
              fill="#F5F5F5"
              stroke="#0B99FF"
              strokeDasharray="8 6"
            />
            <text
              x={t.x + t.width / 2}
              y={t.y + t.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#0B99FF"
              fontSize={Math.min(22, t.width / 10)}
              fontFamily="ui-sans-serif, system-ui"
            >
              Frame
            </text>
            <text
              x={t.x + t.width / 2}
              y={t.y + t.height / 2 + Math.min(22, t.width / 10)}
              textAnchor="middle"
              dominantBaseline="hanging"
              fill="#94A3B8"
              fontSize={Math.min(12, t.width / 16)}
              fontFamily="ui-sans-serif, system-ui"
            >
              Drop photo
            </text>
          </g>
        )
      }
      return (
        <image href={el.src} x={t.x} y={t.y} width={t.width} height={t.height} preserveAspectRatio="xMidYMid slice" />
      )
    case 'icon': {
      const icon = getIcon(el.iconKey)
      if (!icon) return <rect x={t.x} y={t.y} width={t.width} height={t.height} fill={el.fill} opacity={0.3} />
      const markup = iconSvgMarkup(icon, el.fill)
      const path = markup.match(/d="([^"]+)"/)?.[1]
      return (
        <g transform={`translate(${t.x} ${t.y}) scale(${t.width / 24} ${t.height / 24})`}>
          <path d={path} fill={el.fill} />
        </g>
      )
    }
    case 'qr':
      return (
        <g>
          <rect x={t.x} y={t.y} width={t.width} height={t.height} fill={el.background} stroke={el.foreground} strokeWidth={2} />
          <text
            x={t.x + t.width / 2}
            y={t.y + t.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.min(14, t.width / 8)}
            fill={el.foreground}
          >
            QR
          </text>
        </g>
      )
    case 'svg_graphic': {
      const markup = 'markup' in el ? el.markup : null
      const src = el.src
      if (markup) {
        const viewBox = ('viewBox' in el && el.viewBox) || `0 0 ${t.width} ${t.height}`
        const safe = sanitizeSvgFragment(markup)
        return (
          <g opacity={el.opacity}>
            <svg
              x={t.x}
              y={t.y}
              width={t.width}
              height={t.height}
              viewBox={viewBox}
              overflow="visible"
              dangerouslySetInnerHTML={{ __html: safe }}
            />
          </g>
        )
      }
      if (!src) return null
      return (
        <image href={src} x={t.x} y={t.y} width={t.width} height={t.height} preserveAspectRatio="xMidYMid meet" />
      )
    }
    default:
      return null
  }
}
