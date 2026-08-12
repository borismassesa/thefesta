import { cn } from '@/lib/utils'
import type { Motif, TemplateDecor } from '@/lib/builder/types'

// ─────────────────────────────────────────────────────────────────────────────
//  Motifs — per-template ornaments. Each template's `decor.motif` selects one
//  family; these marks are drawn at section tops, the hero flourish and the
//  footer so a template reads as a complete design, not just a recolour. All
//  pure SVG (deterministic, SSR-safe).
// ─────────────────────────────────────────────────────────────────────────────

/** A small horizontal ornament (~120×28) tinted with the template accent. */
export function MotifMark({
  motif,
  color,
  className,
}: {
  motif: Motif
  color: string
  className?: string
}) {
  if (motif === 'minimal') return null
  const cls = cn('h-7 w-[128px]', className)
  switch (motif) {
    case 'watercolor':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden fill="none">
          <line x1="0" y1="14" x2="44" y2="14" stroke={color} strokeWidth="1" opacity="0.45" />
          <line x1="84" y1="14" x2="128" y2="14" stroke={color} strokeWidth="1" opacity="0.45" />
          <g fill={color}>
            <ellipse cx="56" cy="14" rx="9" ry="6" opacity="0.22" />
            <ellipse cx="64" cy="13" rx="8" ry="6" opacity="0.34" />
            <ellipse cx="72" cy="14" rx="7" ry="5" opacity="0.22" />
          </g>
        </svg>
      )
    case 'greenery':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden>
          <line x1="0" y1="14" x2="40" y2="14" stroke={color} strokeWidth="1" opacity="0.4" />
          <line x1="88" y1="14" x2="128" y2="14" stroke={color} strokeWidth="1" opacity="0.4" />
          <g stroke={color} strokeWidth="1.4" fill="none" opacity="0.9">
            <path d="M64 4 L64 24" />
          </g>
          {[-1, 1].map((s) =>
            [6, 12, 18].map((dy, i) => (
              <ellipse
                key={`${s}-${i}`}
                cx={64 + s * (5 + i)}
                cy={6 + dy}
                rx="4.5"
                ry="2.4"
                fill={color}
                opacity="0.8"
                transform={`rotate(${s * 35} ${64 + s * (5 + i)} ${6 + dy})`}
              />
            )),
          )}
        </svg>
      )
    case 'deco':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden fill="none" stroke={color}>
          <line x1="4" y1="11" x2="50" y2="11" strokeWidth="1" />
          <line x1="4" y1="17" x2="50" y2="17" strokeWidth="0.6" opacity="0.6" />
          <line x1="78" y1="11" x2="124" y2="11" strokeWidth="1" />
          <line x1="78" y1="17" x2="124" y2="17" strokeWidth="0.6" opacity="0.6" />
          <rect x="58" y="8" width="12" height="12" transform="rotate(45 64 14)" strokeWidth="1.2" />
          <rect x="61.5" y="11.5" width="5" height="5" transform="rotate(45 64 14)" fill={color} stroke="none" />
        </svg>
      )
    case 'floral':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden>
          <line x1="0" y1="14" x2="46" y2="14" stroke={color} strokeWidth="1" opacity="0.4" />
          <line x1="82" y1="14" x2="128" y2="14" stroke={color} strokeWidth="1" opacity="0.4" />
          <g fill={color}>
            {Array.from({ length: 6 }).map((_, i) => (
              <ellipse
                key={i}
                cx="64"
                cy="8"
                rx="2.6"
                ry="5"
                opacity="0.85"
                transform={`rotate(${(360 / 6) * i} 64 14)`}
              />
            ))}
            <circle cx="64" cy="14" r="2.4" />
            <ellipse cx="50" cy="14" rx="4" ry="2" opacity="0.6" transform="rotate(20 50 14)" />
            <ellipse cx="78" cy="14" rx="4" ry="2" opacity="0.6" transform="rotate(-20 78 14)" />
          </g>
        </svg>
      )
    case 'crest':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden fill="none" stroke={color}>
          <path d="M44 22 Q54 22 58 14 Q54 8 46 9" strokeWidth="1.2" />
          <path d="M84 22 Q74 22 70 14 Q74 8 82 9" strokeWidth="1.2" />
          <rect x="59" y="9" width="10" height="10" transform="rotate(45 64 14)" strokeWidth="1.1" />
          <circle cx="64" cy="14" r="1.6" fill={color} stroke="none" />
        </svg>
      )
    case 'kanga':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden>
          <g fill={color}>
            {Array.from({ length: 11 }).map((_, i) => (
              <path key={i} d={`M${8 + i * 11} 18 L${13.5 + i * 11} 9 L${19 + i * 11} 18 Z`} opacity={i % 2 ? 0.55 : 0.9} />
            ))}
          </g>
        </svg>
      )
    case 'sunrise':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden stroke={color}>
          <line x1="0" y1="22" x2="40" y2="22" strokeWidth="1" opacity="0.4" />
          <line x1="88" y1="22" x2="128" y2="22" strokeWidth="1" opacity="0.4" />
          <path d="M52 22 A12 12 0 0 1 76 22" fill="none" strokeWidth="1.4" />
          {Array.from({ length: 7 }).map((_, i) => {
            const a = Math.PI - (i * Math.PI) / 6
            return (
              <line
                key={i}
                x1={64 + Math.cos(a) * 14}
                y1={22 - Math.sin(a) * 14}
                x2={64 + Math.cos(a) * 19}
                y2={22 - Math.sin(a) * 19}
                strokeWidth="1.1"
                opacity="0.8"
              />
            )
          })}
        </svg>
      )
    case 'heart':
      return (
        <svg viewBox="0 0 128 28" className={cls} aria-hidden fill="none" stroke={color}>
          <line x1="0" y1="14" x2="48" y2="14" strokeWidth="1" opacity="0.4" />
          <line x1="80" y1="14" x2="128" y2="14" strokeWidth="1" opacity="0.4" />
          <path
            d="M64 21 C64 21 55 15 55 8.5 C55 5.5 57.3 3.5 60 3.5 C62 3.5 64 5 64 7.5 C64 5 66 3.5 68 3.5 C70.7 3.5 73 5.5 73 8.5 C73 15 64 21 64 21 Z"
            fill={color}
            stroke="none"
            opacity="0.85"
          />
        </svg>
      )
    default:
      return null
  }
}

/** Section-top divider: ornament, thin rule, or nothing per the template. */
export function SectionDivider({ decor, color }: { decor?: TemplateDecor; color: string }) {
  if (!decor || decor.divider === 'none') return null
  if (decor.divider === 'rule') {
    return <div className="mx-auto mb-6 h-px w-14" style={{ backgroundColor: color, opacity: 0.45 }} />
  }
  return (
    <div className="mb-5 flex justify-center">
      <MotifMark motif={decor.motif} color={color} />
    </div>
  )
}

/** Decoration classes for a widget/card surface (bg is applied by the caller). */
export function cardSurfaceClass(card?: TemplateDecor['card']): string {
  switch (card) {
    case 'bordered':
      return 'rounded-xl border border-black/15'
    case 'flat':
      return 'rounded-xl ring-1 ring-black/5'
    case 'filled':
      return 'rounded-2xl shadow-sm ring-1 ring-black/5'
    case 'soft':
    default:
      return 'rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)]'
  }
}
