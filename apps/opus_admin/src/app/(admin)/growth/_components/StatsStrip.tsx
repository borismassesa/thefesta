import { cn } from '@/lib/utils'
import { GT } from './ui'

export type StatItem = {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'negative'
}

const TONE_CLASS: Record<NonNullable<StatItem['tone']>, string> = {
  default: 'text-gray-900',
  positive: 'text-[#2f5711]',
  negative: 'text-rose-700',
}

export default function StatsStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className={cn(GT.cardPad, 'px-4 py-3')}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{item.label}</div>
          <div
            className={cn('mt-1 text-[18px] font-semibold tabular-nums', TONE_CLASS[item.tone ?? 'default'])}
          >
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
