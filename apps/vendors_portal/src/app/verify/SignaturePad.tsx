'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { usePortalT } from '@/components/providers/PortalUIStringsProvider'

type Props = {
  /**
   * Called whenever the signature changes. Receives the canvas as a PNG
   * data URL when there's ink, or `null` when empty (cleared / never drawn).
   * Parent persists this value and includes it on submit.
   */
  onChange: (dataUrl: string | null) => void
  /** Disabled while the parent is submitting. */
  disabled?: boolean
}

/**
 * Minimal HTML5-canvas signature pad. Mouse + touch + pointer events, plus
 * a Clear button. No external dependency.
 *
 * Implementation notes:
 *   - Canvas is sized via `devicePixelRatio` so strokes stay crisp on retina.
 *   - We track the previous point and draw straight segments between samples;
 *     CSS `touch-action: none` on the canvas prevents page-scroll during a
 *     touch drag on mobile.
 *   - The `onChange` callback fires on stroke end (pointerup), not on every
 *     pixel — keeps React renders cheap.
 */
export function SignaturePad({ onChange, disabled }: Props) {
  const t = usePortalT('verify')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const dirtyRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // Resize canvas to its CSS dimensions × devicePixelRatio so the stroke
  // doesn't blur on retina displays. Re-runs on mount and viewport change.
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const prev = canvas.toDataURL()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    // If we had ink before resize, restore the previous bitmap.
    if (dirtyRef.current && prev) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = prev
    }
  }, [])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = getPoint(e)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    const last = lastPointRef.current
    if (!ctx || !last) return
    const next = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    lastPointRef.current = next
    dirtyRef.current = true
    if (!hasInk) setHasInk(true)
  }

  const onPointerUp = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastPointRef.current = null
    if (canvasRef.current && dirtyRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const onClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirtyRef.current = false
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
      <div className="rounded-xl border border-gray-200 bg-white relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="block w-full h-32 touch-none cursor-crosshair"
          aria-label={t('signature_aria_label')}
        />
        {!hasInk && (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400 italic"
            aria-hidden
          >
            {t('signature_placeholder')}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-gray-500">
          {t('signature_hint')}
        </p>
        <button data-opus-button="control"
          type="button"
          onClick={onClear}
          disabled={disabled || !hasInk}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:hover:text-gray-600"
        >
          <Eraser className="w-3 h-3" />
          {t('signature_clear')}
        </button>
      </div>
    </div>
  )
}
