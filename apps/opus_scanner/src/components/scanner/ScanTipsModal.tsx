'use client'

import { Lightbulb, PenLine, QrCode, ScanLine, X } from 'lucide-react'
import { Sheet } from './Sheet'

/** Side of the square the corner brackets frame. */
const RETICLE_SIZE = 132

/**
 * The camera's own reticle, drawn at rest.
 *
 * A picture of the thing the tips are describing, rather than decoration: the
 * attendant meets these exact brackets a second later on the live feed, so the
 * screen teaches the target it is about to hand them.
 */
function ScanReticle() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: RETICLE_SIZE, height: RETICLE_SIZE }}>
      {(
        [
          { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 14 },
          { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5, borderTopRightRadius: 14 },
          { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5, borderBottomLeftRadius: 14 },
          { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5, borderBottomRightRadius: 14 },
        ] as const
      ).map((corner, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 34,
            height: 34,
            borderColor: 'rgba(26,26,26,0.35)',
            ...corner,
          }}
        />
      ))}
      <QrCode size={56} color="#1A1A1A" />
    </div>
  )
}

const TIPS = [
  {
    icon: QrCode,
    text: "Point the camera at the QR on the guest's ticket and hold the phone still",
  },
  {
    icon: ScanLine,
    text: 'Keep the whole code inside the brackets, about a hand-span away',
  },
  {
    icon: PenLine,
    text: "If the QR won't scan, type the 6-character ticket code or find the guest by name",
  },
] as const

interface ScanTipsModalProps {
  visible: boolean
  onClose: () => void
}

/**
 * The one piece of training a door attendant gets.
 *
 * Shown unprompted the first time the scan screen opens, because the moment
 * they need it — a guest in front of them, a queue behind — is the moment
 * they will not go looking for help.
 */
export function ScanTipsModal({ visible, onClose }: ScanTipsModalProps) {
  return (
    <Sheet open={visible} onClose={onClose} label="Tips for scanning passes">
      <div className="flex px-4 pt-4">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5"
        >
          <X size={20} color="#1A1A1A" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex items-center justify-center py-7">
          <ScanReticle />
        </div>

        <h2 className="text-2xl font-bold leading-9 text-[#1A1A1A]">Scan the pass to check a guest in</h2>

        <div className="mt-7">
          {TIPS.map((tip) => (
            <div key={tip.text} className="mb-5 flex items-start gap-4">
              {/* Soft circles, not filled ones: three solid discs down the
                  left read as buttons and drag the eye off the words they
                  are labelling. */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5">
                <tip.icon size={20} color="#1A1A1A" />
              </span>
              <p className="mt-2 flex-1 text-sm leading-6 text-[#1A1A1A]">{tip.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-black/8 px-4 pb-6 pt-3">
        {/* The scanner's primary CTA colour, matching "Continue scanning" on
            the entry screen: this is the button that starts the shift's real
            work, so it should look like the one that resumes it. */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#C9A0DC]"
        >
          <span className="text-sm font-bold uppercase tracking-[1px] text-[#1A1A1A]">Got it</span>
        </button>
      </div>
    </Sheet>
  )
}

interface ScanTipsBannerProps {
  onOpen: () => void
  onDismiss: () => void
}

/** Persistent way back to the tips, dismissible once the shift finds its feet. */
export function ScanTipsBanner({ onOpen, onDismiss }: ScanTipsBannerProps) {
  return (
    <div className="mx-4 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}>
      <Lightbulb size={19} color="#FFFFFF" />
      <span className="flex-1 truncate text-xs text-white">Tips for scanning passes</span>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-full px-3 py-1 text-xs font-semibold text-white"
        style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
      >
        See tips
      </button>
      <button type="button" aria-label="Dismiss scanning tips" onClick={onDismiss}>
        <X size={17} color="rgba(255,255,255,0.75)" />
      </button>
    </div>
  )
}
