'use client'

import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Minus, Plus, UploadCloud, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// A small curated set of royalty-free (Unsplash) wedding-registry-appropriate
// photos — the "pick from a gallery instead of uploading" affordance, without
// a real Zola-style stock catalog. Unsplash's CDN sends permissive CORS
// headers, so these can go through the same crop/canvas step as an upload.
const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1478146059778-26028b07395a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1546032996-6098d3054cbc?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1460978812857-470ed1c77af0?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1485700281629-290c5a704409?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1494955870715-979ca4f13bf0?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1502635385003-ee1e6a1a742d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511288702291-e55d6cfbe3b5?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515232389446-a17ce9ca7434?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519307212971-dd9561667ffb?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1521543832500-49e69fb2bea2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522413452208-996ff3f3e740?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1523521803700-b3bcaeab0150?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1524824267900-2fa9cbf7a506?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1525441273400-056e9c7517b3?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529634597503-139d3726fed5?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529634806980-85c3dd6d34ac?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1532712938310-34cb3982ef74?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1532713031318-db2d14e4b3e1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1533120921505-7f40f5237ee1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1542415719-96b33a38d73d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1550368566-f9cc32d7392d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1550784718-990c6de52adf?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1553915632-175f60dd8e36?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1554047310-ab6170fc7b10?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1556381255-0aaad4453d4d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1561593367-66c79c2294e6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1561848355-890d054dc55a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1562249004-1f7289c19c49?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1562826772-be179f321470?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1572495754162-78a92305ea6a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1576694667642-6f289dd54187?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1595407753234-0882f1e77954?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1595467959554-9ffcbf37f10f?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1597427681221-d4beae4f802d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1599142296733-1c1f2073e6de?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1603026198288-6a94fa57e2af?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1605089315599-ca966e96b56a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1605985687770-2e2e82c9b5f1?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1606216794079-73f85bbd57d5?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1606495185824-688328ed7871?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1200&q=80',
]

type Step = 'source' | 'crop'
type Tab = 'upload' | 'gallery'

interface ImagePickerModalProps {
  open: boolean
  onClose: () => void
  /** width / height of the crop frame — 16/9 for a banner, 1 for a circular photo. */
  aspect: number
  title: string
  /** Rounds the crop frame/output into a circle — for the small avatar-style photo. */
  circular?: boolean
  /** Called with the cropped image as a Blob once the couple confirms. */
  onConfirm: (blob: Blob) => Promise<void> | void
}

const FRAME_WIDTH = 480
const MIN_ZOOM = 1
const MAX_ZOOM = 3

export default function ImagePickerModal({ open, onClose, aspect, title, circular, onConfirm }: ImagePickerModalProps) {
  const [tab, setTab] = useState<Tab>('upload')
  const [step, setStep] = useState<Step>('source')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  // Crop state
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragState = useRef<{ startX: number; startY: number; offX: number; offY: number } | null>(null)

  const frameHeight = FRAME_WIDTH / aspect

  function reset() {
    setTab('upload')
    setStep('source')
    setSourceUrl(null)
    setNaturalSize(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setError(null)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  function pickFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be 10MB or smaller')
      return
    }
    setError(null)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setSourceUrl(url)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setStep('crop')
  }

  function pickGalleryImage(url: string) {
    setError(null)
    setSourceUrl(url)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setStep('crop')
  }

  function onImageLoad() {
    const img = imgRef.current
    if (!img) return
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
  }

  // Base scale so the image covers the crop frame at zoom=1, then the zoom
  // slider multiplies on top of that — same "cover" behaviour as CSS
  // object-fit: cover, but draggable/zoomable.
  function baseScale(): number {
    if (!naturalSize) return 1
    return Math.max(FRAME_WIDTH / naturalSize.w, frameHeight / naturalSize.h)
  }

  function effectiveScale(): number {
    return baseScale() * zoom
  }

  function clampOffset(x: number, y: number): { x: number; y: number } {
    if (!naturalSize) return { x: 0, y: 0 }
    const scale = effectiveScale()
    const displayedW = naturalSize.w * scale
    const displayedH = naturalSize.h * scale
    const maxX = Math.max(0, (displayedW - FRAME_WIDTH) / 2)
    const maxY = Math.max(0, (displayedH - frameHeight) / 2)
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) }
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setOffset(clampOffset(dragState.current.offX + dx, dragState.current.offY + dy))
  }
  function onPointerUp() {
    dragState.current = null
  }

  function onZoomChange(next: number) {
    setZoom(next)
    // Re-clamp the existing offset against the new scale so the image never
    // reveals an edge when zooming back out.
    setOffset((prev) => clampOffset(prev.x, prev.y))
  }

  async function confirmCrop() {
    const img = imgRef.current
    if (!img || !naturalSize) return
    setSaving(true)
    setError(null)
    try {
      const outW = 1200
      const outH = Math.round(outW / aspect)
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not prepare image')

      const scale = effectiveScale()
      const srcW = FRAME_WIDTH / scale
      const srcH = frameHeight / scale
      const srcX = naturalSize.w / 2 - srcW / 2 - offset.x / scale
      const srcY = naturalSize.h / 2 - srcH / 2 - offset.y / scale

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH)

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9))
      if (!blob) throw new Error('Could not process image — try uploading instead')
      await onConfirm(blob)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Left rail */}
        <div className="w-44 shrink-0 border-r border-black/[0.08] bg-[#FBFAF8] px-3 py-6 sm:w-52">
          <button data-opus-button="control"
            type="button"
            onClick={() => setTab('upload')}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
              tab === 'upload' && step === 'source' ? 'bg-black/[0.06] text-[#1A1A1A]' : 'text-[#1A1A1A]/55 hover:bg-black/[0.04]',
            )}
          >
            <UploadCloud className="h-4 w-4 shrink-0" /> Upload
          </button>
          <button data-opus-button="control"
            type="button"
            onClick={() => setTab('gallery')}
            className={cn(
              'mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
              tab === 'gallery' && step === 'source' ? 'bg-black/[0.06] text-[#1A1A1A]' : 'text-[#1A1A1A]/55 hover:bg-black/[0.04]',
            )}
          >
            <ImageIcon className="h-4 w-4 shrink-0" /> Gallery
          </button>
        </div>

        {/* Right pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-6 py-4">
            <h3 className="text-base font-semibold text-[#1A1A1A]">{step === 'crop' ? 'Adjust photo' : title}</h3>
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/[0.05]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'source' && tab === 'upload' ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  const file = e.dataTransfer.files?.[0]
                  if (file) pickFile(file)
                }}
                className={cn(
                  'flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center transition-colors',
                  dragOver ? 'border-[#C9A0DC] bg-[#C9A0DC]/10' : 'border-black/[0.15] bg-black/[0.02]',
                )}
              >
                <UploadCloud className="h-8 w-8 text-[#1A1A1A]/35" />
                <p className="text-sm text-[#1A1A1A]/60">Drag a photo here, or</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) pickFile(file)
                    e.target.value = ''
                  }}
                />
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full bg-[#C9A0DC] px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-[#b97fd0]"
                >
                  Choose a file
                </button>
              </div>
            ) : null}

            {step === 'source' && tab === 'gallery' ? (
              <div className="grid grid-cols-3 gap-3">
                {GALLERY_IMAGES.map((url) => (
                  <button data-opus-button="primary" data-opus-button-size="medium"
                    key={url}
                    type="button"
                    onClick={() => pickGalleryImage(url)}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-black/[0.05] ring-1 ring-black/[0.06] hover:ring-[#C9A0DC]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  </button>
                ))}
              </div>
            ) : null}

            {step === 'crop' && sourceUrl ? (
              <div className="flex flex-col items-center gap-4">
                <div
                  className={cn('relative touch-none select-none overflow-hidden bg-black/5', circular && 'rounded-full')}
                  style={{ width: FRAME_WIDTH, height: frameHeight }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={imgRef}
                    src={sourceUrl}
                    alt=""
                    crossOrigin="anonymous"
                    onLoad={onImageLoad}
                    draggable={false}
                    className="pointer-events-none absolute left-1/2 top-1/2"
                    style={{
                      width: naturalSize ? naturalSize.w * effectiveScale() : undefined,
                      height: naturalSize ? naturalSize.h * effectiveScale() : undefined,
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                    }}
                  />
                </div>

                <div className="flex w-full max-w-xs items-center gap-3">
                  <Minus className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
                  <input
                    type="range"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="w-full accent-[#C9A0DC]"
                  />
                  <Plus className="h-4 w-4 shrink-0 text-[#1A1A1A]/40" />
                </div>
                <p className="text-xs text-[#1A1A1A]/45">Drag to reposition, use the slider to zoom</p>
              </div>
            ) : null}

            {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-black/[0.06] px-6 py-4">
            {step === 'crop' ? (
              <>
                <button data-opus-button="neutral" data-opus-button-size="medium"
                  type="button"
                  onClick={() => setStep('source')}
                  className="rounded-full border border-black/[0.18] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
                >
                  Cancel
                </button>
                <button data-opus-button="primary" data-opus-button-size="medium"
                  type="button"
                  onClick={confirmCrop}
                  disabled={saving || !naturalSize}
                  className="rounded-full bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                >
                  {saving ? 'Adding…' : 'Add'}
                </button>
              </>
            ) : (
              <button data-opus-button="neutral" data-opus-button-size="medium"
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/[0.18] bg-white px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-black/[0.03]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
