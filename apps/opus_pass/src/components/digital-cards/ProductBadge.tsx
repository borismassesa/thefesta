import { BADGE_META, type ProductBadge } from '@/data/digital-cards-products'
import { cn } from '@/lib/utils'

/**
 * Promotional status pill ("🟡 Most Popular", "✨ Premium Template",
 * "🔥 Trending This Week") shown above invitation cards. Admin-set per design.
 */
export default function ProductBadgePill({
  badge,
  className,
}: {
  badge: ProductBadge
  className?: string
}) {
  const meta = BADGE_META[badge]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ring-1 shadow-sm whitespace-nowrap',
        meta.className,
        className,
      )}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  )
}
