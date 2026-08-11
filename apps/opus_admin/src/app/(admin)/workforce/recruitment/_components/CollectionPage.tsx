import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import WorkforceHeading from '../../_components/PageHeading'
import type { RecruitmentCollectionRow } from '../_lib/collections'
import { buttonStyles, EmptyState, PANEL, ROW, StatusPill, TABLE_HEADER } from './ui'

// Column widths match the Approvals list: a wide primary column, a fixed
// status column, and a right-hand detail column. min-w keeps the grid honest
// on narrow screens instead of crushing the primary cell — the panel scrolls
// horizontally, exactly as MyRequestsView does.
// 210px for status: recruitment statuses are phrases, not the single words
// Approvals fits into 120px.
const GRID =
  'grid min-w-[820px] grid-cols-[minmax(0,2.2fr)_210px_minmax(0,1.5fr)_16px] items-center gap-3'

export default function CollectionPage({
  title,
  subtitle,
  rows,
  emptyMessage,
  action,
  filters,
  columns = ['Item', 'Status', 'Details'],
}: {
  title: string
  subtitle: string
  rows: RecruitmentCollectionRow[]
  emptyMessage: string
  action?: { href: string; label: string }
  /** Page-level list controls rendered in the collection toolbar. */
  filters?: React.ReactNode
  /** Header labels for the three data columns, left to right. */
  columns?: [string, string, string]
}) {
  return (
    <>
      <WorkforceHeading title={title} subtitle={subtitle} />
      {(filters || action) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {filters}
            {filters && (
              <span className="text-xs text-gray-400" aria-live="polite">
                {rows.length} {rows.length === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
          {action && (
            <Link
              href={action.href}
              className={buttonStyles()}
            >
              {action.label}
            </Link>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState title="Nothing here yet" hint={emptyMessage} />
      ) : (
        <div className={`no-scrollbar overflow-x-auto ${PANEL}`}>
          <div className={`${GRID} ${TABLE_HEADER}`}>
            <span>{columns[0]}</span>
            <span>{columns[1]}</span>
            <span>{columns[2]}</span>
            <span className="sr-only">Open</span>
          </div>
          {rows.map((row) => {
            const content = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{row.title}</p>
                  <p className="truncate text-xs text-gray-500">{row.subtitle}</p>
                </div>
                <StatusPill status={row.status} />
                <span className="truncate text-xs text-gray-600">{row.detail}</span>
                {row.href ? (
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" />
                )}
              </>
            )
            return row.href ? (
              <Link key={row.id} href={row.href} className={`${GRID} ${ROW}`}>
                {content}
              </Link>
            ) : (
              <div key={row.id} className={`${GRID} border-b border-gray-100 px-5 py-3 last:border-b-0`}>
                {content}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
