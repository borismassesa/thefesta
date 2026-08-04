import Link from 'next/link'
import { ArrowUpRight, Inbox } from 'lucide-react'
import WorkforceHeading from '../../_components/PageHeading'
import type { RecruitmentCollectionRow } from '../_lib/collections'

export default function CollectionPage({
  title,
  subtitle,
  rows,
  emptyMessage,
  action,
}: {
  title: string
  subtitle: string
  rows: RecruitmentCollectionRow[]
  emptyMessage: string
  action?: { href: string; label: string }
}) {
  return (
    <>
      <WorkforceHeading title={title} subtitle={subtitle} />
      {action && <div className="flex justify-end"><Link href={action.href} className="rounded-xl bg-[#5B2D8E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#492270] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896] focus-visible:ring-offset-2">{action.label}</Link></div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center">
            <span className="rounded-2xl bg-gray-100 p-3 text-gray-500"><Inbox className="h-6 w-6" aria-hidden="true" /></span>
            <h2 className="mt-4 text-base font-semibold text-gray-950">Nothing here yet</h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">{emptyMessage}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((row) => {
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-gray-950">{row.title}</h2>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-gray-700">{row.status.replaceAll('_', ' ')}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{row.subtitle}</p>
                  </div>
                  <p className="hidden max-w-sm text-right text-xs text-gray-500 md:block">{row.detail}</p>
                  {row.href && <ArrowUpRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />}
                </>
              )
              return (
                <li key={row.id}>
                  {row.href ? (
                    <Link href={row.href} className="flex min-h-20 items-center gap-4 px-5 py-4 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7E5896]">{content}</Link>
                  ) : (
                    <div className="flex min-h-20 items-center gap-4 px-5 py-4">{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
