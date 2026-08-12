'use client'

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'

const GAP = 8
const VIEW_PAD = 8

type Align = 'left' | 'right' | 'center'
type Side = 'bottom' | 'left'

type FixedPos = {
  top: number
  left: number
  maxHeight: number
  placement: 'down' | 'up'
}

function measureFixedPosition(
  anchor: DOMRect,
  panel: { width: number; height: number },
  opts: { align: Align; side: Side },
): FixedPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = panel.width || 280
  const height = panel.height || 280

  if (opts.side === 'left') {
    let left = anchor.left - width - GAP
    if (left < VIEW_PAD) left = Math.min(anchor.right + GAP, vw - width - VIEW_PAD)

    const spaceBelow = vh - anchor.top - VIEW_PAD
    const spaceAbove = anchor.bottom - VIEW_PAD
    const preferUp = spaceBelow < height && spaceAbove > spaceBelow
    let top = preferUp ? anchor.bottom - height : anchor.top
    top = Math.max(VIEW_PAD, Math.min(top, vh - VIEW_PAD - Math.min(height, vh - VIEW_PAD * 2)))
    const maxHeight = Math.max(160, vh - top - VIEW_PAD)
    return { top, left: Math.max(VIEW_PAD, left), maxHeight, placement: preferUp ? 'up' : 'down' }
  }

  // side === 'bottom' (default dropdown)
  let left =
    opts.align === 'right'
      ? anchor.right - width
      : opts.align === 'center'
        ? anchor.left + anchor.width / 2 - width / 2
        : anchor.left
  left = Math.max(VIEW_PAD, Math.min(left, vw - width - VIEW_PAD))

  const spaceBelow = vh - anchor.bottom - GAP - VIEW_PAD
  const spaceAbove = anchor.top - GAP - VIEW_PAD
  const preferUp = spaceBelow < Math.min(height, 320) && spaceAbove > spaceBelow

  if (preferUp) {
    const maxHeight = Math.max(160, spaceAbove)
    const usedHeight = Math.min(height, maxHeight)
    return {
      top: Math.max(VIEW_PAD, anchor.top - GAP - usedHeight),
      left,
      maxHeight,
      placement: 'up',
    }
  }

  const maxHeight = Math.max(160, spaceBelow)
  return {
    top: anchor.bottom + GAP,
    left,
    maxHeight,
    placement: 'down',
  }
}

function useAnchoredFixedPosition(
  markerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  opts: { align: Align; side: Side; open?: boolean },
) {
  const [pos, setPos] = useState<FixedPos | null>(null)

  useLayoutEffect(() => {
    if (opts.open === false) return
    const marker = markerRef.current
    const panel = panelRef.current
    if (!marker || !panel) return

    const anchorEl = marker.parentElement
    if (!anchorEl) return

    const update = () => {
      const anchor = anchorEl.getBoundingClientRect()
      const next = measureFixedPosition(
        anchor,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { align: opts.align, side: opts.side },
      )
      setPos(next)
    }

    update()
    const raf = requestAnimationFrame(update)
    const ro = new ResizeObserver(update)
    ro.observe(panel)
    ro.observe(anchorEl)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [markerRef, panelRef, opts.align, opts.side, opts.open])

  return pos
}

/** Shared quiet popover — portaled to body so canvas/inspector overflow never clips it. */
export function StudioPopover({
  children,
  className = '',
  widthClass = 'w-[300px]',
  align = 'left',
  side = 'bottom',
  onClose,
}: {
  children: ReactNode
  className?: string
  widthClass?: string
  align?: Align
  side?: Side
  onClose?: () => void
}) {
  const markerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  // Only measure after the portal is in the DOM — otherwise panelRef is null and
  // the panel stays stuck at the off-screen placeholder forever.
  const pos = useAnchoredFixedPosition(markerRef, panelRef, {
    align,
    side,
    open: mounted,
  })

  useLayoutEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!onClose || !mounted) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (markerRef.current?.parentElement?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // Defer so the opening click doesn't instantly close.
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, mounted])

  const style: CSSProperties | undefined = pos
    ? {
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        maxHeight: pos.maxHeight,
        zIndex: 80,
      }
    : {
        position: 'fixed',
        top: -9999,
        left: -9999,
        visibility: 'hidden',
        zIndex: 80,
      }

  const panel = (
    <div
      ref={panelRef}
      style={style}
      className={`flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white text-gray-900 shadow-[0_16px_48px_rgba(15,23,42,0.18)] ring-1 ring-black/5 ${widthClass} ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )

  return (
    <>
      <span ref={markerRef} className="pointer-events-none absolute h-0 w-0" aria-hidden />
      {mounted ? createPortal(panel, document.body) : null}
    </>
  )
}

export function StudioPopoverHeader({
  title,
  onClose,
  search,
  onSearchChange,
  searchPlaceholder = 'Search',
}: {
  title?: string
  onClose: () => void
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
}) {
  return (
    <div className="shrink-0 border-b border-gray-100 bg-[#FAFAFA]">
      {title ? (
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3.5">
          <p className="text-[13px] font-semibold tracking-tight text-gray-900">{title}</p>
          <button
            type="button"
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {onSearchChange != null ? (
        <div className={`flex items-center gap-2.5 px-4 ${title ? 'pb-3 pt-1' : 'py-3'}`}>
          {!title ? (
            <button
              type="button"
              aria-label="Close"
              className="order-last rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-gray-700"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              autoFocus
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
      ) : !title ? (
        <div className="flex justify-end px-3 py-2">
          <button
            type="button"
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function StudioPopoverSection({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="px-2 pb-2 pt-1">
      <div className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function StudioPopoverItem({
  label,
  meta,
  leading,
  active,
  onClick,
}: {
  label: string
  meta?: string
  leading?: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
        active
          ? 'bg-[#E8F4FF] text-[#0B6BCB]'
          : 'text-gray-800 hover:bg-gray-50'
      }`}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{label}</span>
      {meta ? (
        <span
          className={`shrink-0 tabular-nums text-[11px] ${
            active ? 'text-[#0B6BCB]/70' : 'text-gray-400'
          }`}
        >
          {meta}
        </span>
      ) : null}
      <span className="flex w-4 shrink-0 justify-end">
        {active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[#0B99FF]" aria-hidden />
        ) : null}
      </span>
    </button>
  )
}

export function StudioPopoverBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`no-scrollbar min-h-0 flex-1 overflow-y-auto py-1.5 ${className}`}>
      {children}
    </div>
  )
}

/** @deprecated use StudioPopover portal positioning */
export function useFlipVertical(_open = true) {
  const ref = useRef<HTMLDivElement>(null)
  return { ref, placement: 'down' as const }
}
