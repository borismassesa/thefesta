'use client'

import { useEffect, useMemo, useState } from 'react'
import { Heart, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { assetPath } from '@/lib/asset-path'
import { InvitationVisual, COUPLE_DEFAULT, type Treatment } from '@/components/guests/InvitationVisual'

// Product detail carousel. Two kinds of slide, each shown at its own ratio:
//   • hero    — the portrait card cover (3:4), also used on the catalog/landing
//   • designs — landscape "mockup" views authored at 800×600 (4:3)
// The main frame adapts to the active slide's orientation so neither is cropped
// or distorted (object-cover fills exactly because the artwork matches the
// frame ratio). Falls back to the built-in CSS `treatment` when nothing is set.
type Slide = { url: string; portrait: boolean }

// OpusPass ticket mockups appended to every card's carousel — they show the
// physical/digital ticket each guest receives, across the three finishes.
const TICKET_MOCKUPS: Slide[] = [
  { url: '/assets/tickets-mockups/light_ticket_mockup_8k.jpg', portrait: false },
  { url: '/assets/tickets-mockups/classic_ticket_mockup_8k.jpg', portrait: false },
  { url: '/assets/tickets-mockups/signature_ticket_mockup_8k.jpg', portrait: false },
]

export function DesignCarousel({
  hero,
  designs,
  treatment,
  favourited = false,
  onFavourite,
}: {
  hero?: string
  designs: string[]
  treatment: Treatment
  favourited?: boolean
  onFavourite?: () => void
}) {
  const slides: Slide[] = [
    ...(hero ? [{ url: hero, portrait: true }] : []),
    ...designs.filter(Boolean).map((url) => ({ url, portrait: false })),
    ...TICKET_MOCKUPS,
  ]
  const [active, setActive] = useState(0)
  const activeIndex = Math.min(active, Math.max(0, slides.length - 1))
  const activeSlide = slides[activeIndex]
  const isPortrait = activeSlide?.portrait ?? false

  // Measure each slide's true aspect ratio so the frame matches the real artwork
  // — some "design" views are portrait, not the assumed 800×600 landscape.
  const [ratios, setRatios] = useState<Record<number, number>>({})

  // Preload every slide up front: this measures all ratios before the user
  // switches (so a switch animates straight to the correct size in ONE move,
  // never a default→measured snap) and warms the cache for an instant crossfade.
  const slideKey = useMemo(() => slides.map((s) => s.url).join('|'), [slides])
  useEffect(() => {
    if (typeof window === 'undefined') return
    slides.forEach((slide, i) => {
      const img = new window.Image()
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight)
          setRatios((prev) => (prev[i] ? prev : { ...prev, [i]: img.naturalWidth / img.naturalHeight }))
      }
      img.src = assetPath(slide.url)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKey])

  const activeRatio = ratios[activeIndex] ?? (isPortrait ? 3 / 4 : 4 / 3)
  // Landscape fills up to 800px wide (→ 600px tall at 4:3); portrait is bounded
  // by height (~640px) so tall cards don't dominate. Clamp to a sane width.
  const maxWidthPx =
    activeRatio >= 1 ? 800 : Math.min(800, Math.max(320, Math.round(640 * activeRatio)))

  // Crossfade the artwork on switch so the resize reads as one smooth, intentional
  // motion rather than a hard cut. We fade out, then fade the new slide back in.
  const [shown, setShown] = useState(true)
  useEffect(() => {
    setShown(false)
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [activeIndex])

  return (
    <div
      className="mx-auto w-full transition-[max-width] duration-300 ease-out"
      style={{ maxWidth: maxWidthPx }}
    >
      {/* Main view — the frame matches the active design's real aspect ratio, so
          neither portrait nor landscape artwork is cropped or distorted. The size
          eases and the image crossfades so switching slides feels smooth. */}
      {/* op-protected (globals.css) drops pointer events on the artwork itself,
          so it cannot be dragged out or right-clicked into "Save image as"
          while the favourite button layered above it keeps working. */}
      <div
        className="op-protected relative w-full bg-white rounded-md shadow-md overflow-hidden transition-[aspect-ratio] duration-300 ease-out"
        style={{ aspectRatio: String(activeRatio) }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {activeSlide ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetPath(activeSlide.url)}
            alt={isPortrait ? 'Card design' : `Card view ${activeIndex + 1}`}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget
              if (w && h)
                setRatios((prev) => (prev[activeIndex] ? prev : { ...prev, [activeIndex]: w / h }))
            }}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out',
              shown ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : (
          <InvitationVisual treatment={treatment} couple={COUPLE_DEFAULT} />
        )}

        {onFavourite && (
          <button
            type="button"
            onClick={onFavourite}
            aria-label={favourited ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={favourited}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/95 shadow-sm hover:bg-white transition z-10"
          >
            <Heart className={cn('h-4 w-4', favourited ? 'fill-red-500 text-red-500' : 'text-[#1A1A1A]')} />
          </button>
        )}
      </div>

      {/* Thumbnail strip — uniform squares kept on a single row; scrolls
          horizontally rather than wrapping when there are many slides. */}
      {slides.length > 1 && (
        <div
          className="op-protected mt-8 flex gap-2 overflow-x-auto pt-1.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          {slides.map((slide, i) => {
            const thumbActive = i === activeIndex
            return (
              <button
                key={`${slide.url}-${i}`}
                type="button"
                aria-label={slide.portrait ? 'View card design' : `View card view ${i + 1}`}
                aria-pressed={thumbActive}
                onClick={() => setActive(i)}
                className={cn(
                  'relative h-16 w-16 shrink-0 rounded-sm border-2 bg-white p-1 transition-all duration-150',
                  thumbActive
                    ? 'border-[#B98FD6] shadow-lg z-10'
                    : 'border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-400',
                )}
              >
                <span className="absolute inset-1 block overflow-hidden rounded-[2px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetPath(slide.url)}
                    alt=""
                    className="h-full w-full object-cover object-top"
                  />
                </span>
                {thumbActive && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#B98FD6] shadow ring-2 ring-white">
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
