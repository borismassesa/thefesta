'use client'

import { Lightbulb, PenLine, QrCode, ScanLine, X } from 'lucide-react'
import { useScannerT } from '@/hooks/useScannerT'
import type { ScannerStringKey } from '@/lib/scanner/i18n'
import { Sheet } from './Sheet'

/** Side of the square the corner brackets frame. */
const RETICLE_SIZE = 120

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
          className="pointer-events-none"
          style={{
            position: 'absolute',
            width: 32,
            height: 32,
            borderColor: 'rgba(26,26,26,0.35)',
            ...corner,
          }}
        />
      ))}
      <QrCode size={52} color="#1A1A1A" strokeWidth={1.75} />
    </div>
  )
}

const TIPS: { icon: typeof QrCode; textKey: ScannerStringKey }[] = [
  { icon: QrCode, textKey: 'tip_hold_still' },
  { icon: ScanLine, textKey: 'tip_inside_brackets' },
  { icon: PenLine, textKey: 'tip_manual_fallback' },
]

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
  const t = useScannerT()

  return (
    <Sheet open={visible} onClose={onClose} label={t('tips_title')} fit="content">
      <div className="relative min-h-0 overflow-y-auto overscroll-contain px-5 pt-5 pb-2 sm:px-6">
        <button
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/8 sm:top-4 sm:right-4"
        >
          <X size={20} color="#1A1A1A" />
        </button>

        <div className="flex flex-col items-center pt-2 pb-5">
          <ScanReticle />
        </div>

        <h2 className="text-center text-xl font-bold leading-snug tracking-tight text-[#1A1A1A] sm:text-2xl sm:leading-8">
          {t('tips_heading')}
        </h2>

        <ul className="mt-6 space-y-4">
          {TIPS.map((tip) => (
            <li key={tip.textKey} className="flex items-start gap-3.5">
              {/* Soft circles, not filled ones: three solid discs down the
                  left read as buttons and drag the eye off the words they
                  are labelling. */}
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5">
                <tip.icon size={20} color="#1A1A1A" />
              </span>
              <p className="min-w-0 flex-1 pt-1.5 text-sm leading-6 text-[#1A1A1A]/80">{t(tip.textKey)}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="shrink-0 border-t border-black/8 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-5">
        {/* The scanner's primary CTA colour, matching "Continue scanning" on
            the entry screen: this is the button that starts the shift's real
            work, so it should look like the one that resumes it. */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-14 w-full items-center justify-center rounded-full bg-[#C9A0DC] transition-colors hover:bg-[#b97fd0]"
        >
          <span className="text-sm font-bold uppercase tracking-[1px] text-[#1A1A1A]">{t('got_it')}</span>
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
  const t = useScannerT()

  return (
    <div
      className="mx-4 flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{ backgroundColor: 'rgba(255,255,255,0.16)' }}
    >
      <Lightbulb size={19} color="#FFFFFF" />
      <span className="flex-1 truncate text-xs text-white">{t('tips_title')}</span>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-full px-3 py-1 text-xs font-semibold text-white"
        style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}
      >
        {t('see_tips')}
      </button>
      <button type="button" aria-label={t('dismiss_tips')} onClick={onDismiss}>
        <X size={17} color="rgba(255,255,255,0.75)" />
      </button>
    </div>
  )
}
