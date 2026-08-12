import { cn } from '@/lib/utils'
import { STATUS_LABEL, type GrowthStatus } from '../_lib/status'

// Matches the Excel status colours: Met green, On Track amber, Behind purple.
const TONE: Record<Exclude<GrowthStatus, null>, string> = {
  met: 'border border-[#C6E8B5] bg-[#E8FBDB] text-[#2f5711]',
  on_track: 'border border-[#F0D59A] bg-[#FCE9C2] text-[#8a5b12]',
  behind: 'border border-[#C9A0DC] bg-[#F0DFF6] text-[#5d3a78]',
}

export default function StatusPill({ status }: { status: GrowthStatus }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-semibold text-gray-400">
        —
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
