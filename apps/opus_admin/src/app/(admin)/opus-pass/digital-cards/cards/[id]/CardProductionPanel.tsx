import Link from 'next/link'
import { PenTool } from 'lucide-react'
import { DESIGN_STATUS_LABELS, type DesignStatus } from '../../designer/types'
import type { CardProductionJob } from '../../designer/queries'

/**
 * Who is currently mid-flight on this card.
 *
 * Editing a catalogue card is not a self-contained act. A released card is
 * frozen against the artwork and bindings as they stood at release, and a job
 * still in design will be frozen against whatever they are when it IS released
 * — so re-exporting artwork, re-mapping a layer or unpublishing while somebody
 * is working changes what a specific couple receives. Before this there was no
 * way to know from the card, in either direction.
 *
 * Read-only on purpose. This answers "who should I talk to", not "reassign it
 * from here"; the job page owns that, next to the history that records it.
 */
export default function CardProductionPanel({ jobs }: { jobs: CardProductionJob[] }) {
  // A card nobody has ordered is the common case across a catalogue of
  // hundreds. An empty panel on every one of them would be noise, and its
  // absence already means "nothing in production".
  if (jobs.length === 0) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900">In production</h3>
        <span className="text-xs text-gray-500">
          {jobs.length} job{jobs.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-gray-500">
        Couples are having this card personalised right now. Changing the artwork or the field
        mapping affects any job not yet released.
      </p>

      <ul className="divide-y divide-gray-100">
        {jobs.map((job) => (
          <li key={job.designId}>
            <Link
              href={`/opus-pass/digital-cards/designer/${job.designId}`}
              className="group flex items-center gap-3 py-2.5"
            >
              <PenTool className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-[#7E5896]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900 group-hover:text-[#7E5896]">
                  {job.coupleName ?? 'Unnamed couple'}
                </span>
                <span className="block truncate text-[11px] text-gray-400">
                  <span className="font-mono">{job.orderRef || 'no reference'}</span>
                  {job.assigneeName ? ` · ${job.assigneeName}` : ' · unassigned'}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                {DESIGN_STATUS_LABELS[job.status as DesignStatus] ?? job.status.replace(/_/g, ' ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
