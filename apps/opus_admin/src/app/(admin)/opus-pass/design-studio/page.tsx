import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Palette, Plus } from 'lucide-react'

import { hasPermission } from '@/lib/admin-auth'
import { listDesignProjects } from '@/lib/design-studio/actions'
import SetDigitalCardsHeading from '@/app/(admin)/opus-pass/digital-cards/SetDigitalCardsHeading'
import DigitalCardsNavTabs from '@/app/(admin)/opus-pass/digital-cards/DigitalCardsNavTabs'

import { CreateProjectForm } from './CreateProjectForm'

export const dynamic = 'force-dynamic'

export default async function DesignStudioIndexPage() {
  const canRead = await hasPermission('digitalcards.read')
  if (!canRead) {
    const cms = await hasPermission('cms.read')
    if (!cms) redirect('/')
  }

  const projects = await listDesignProjects()
  const canWrite = await hasPermission('digitalcards.write')

  return (
    <>
      <SetDigitalCardsHeading />
      <DigitalCardsNavTabs />

      <div className="space-y-6 px-8 pt-6 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Design Studio</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              Author card artwork in-app — blank artboards or uploaded plates, with text,
              icons, swatches, fonts, and couple photos.
            </p>
          </div>
        </div>

        {canWrite ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Plus className="h-3.5 w-3.5 text-[#7E5896]" />
              New design
            </div>
            <CreateProjectForm />
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Projects
            </h3>
          </div>

          {projects.length === 0 ? (
            <div className="p-12 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F0DFF6] text-[#7E5896]">
                <Palette className="h-5 w-5" />
              </div>
              <p className="text-sm text-gray-500">
                No design projects yet. Create a blank invitation or upload artwork to start.
              </p>
              <p className="mt-2 text-xs text-gray-400">
                If create fails, confirm migration{' '}
                <code className="rounded bg-gray-50 px-1 py-0.5 text-gray-600">
                  20260811160000_opus_design_studio.sql
                </code>{' '}
                is applied.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/opus-pass/design-studio/${p.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-gray-50/80"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-[#F0DFF6] px-2 py-0.5 font-semibold text-[#7E5896]">
                          {p.kind}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                          {p.status}
                        </span>
                        <span className="tabular-nums">v{p.currentVersion}</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      Updated {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
