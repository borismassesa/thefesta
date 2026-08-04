'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ClipboardCheck,
  Clock,
  FileText,
  Home,
  Inbox,
  ListTodo,
  Plane,
  ShieldCheck,
  Target,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceAccessState, WorkspaceCapability } from '@/lib/workspace/access'
import { accessStateLabel } from '@/lib/workspace/access'

// Workspace's own tab strip. Items whose capability the current access state
// does not grant are dropped.
//
// This is a courtesy, not a control. Every destination re-checks the same
// capability on the server before it reads or writes anything, so removing an
// item here changes what is convenient, never what is permitted.

type Item = {
  label: string
  href: string
  icon: typeof Home
  requires: WorkspaceCapability
  exact?: boolean
}

const ITEMS: Item[] = [
  { label: 'Home', href: '/workspace', icon: Home, requires: 'workspace.read', exact: true },
  { label: 'Time Clock', href: '/workspace/timeclock', icon: Clock, requires: 'tools.use' },
  { label: 'Daily Tracker', href: '/workspace/tracker', icon: ClipboardCheck, requires: 'tools.use' },
  { label: 'My Work', href: '/workspace/work', icon: ListTodo, requires: 'tools.use' },
  { label: 'My Reports', href: '/workspace/reports', icon: FileText, requires: 'tools.use' },
  { label: 'Goals', href: '/workspace/performance', icon: Target, requires: 'tools.use' },
  { label: 'My Leave', href: '/workspace/leave', icon: Plane, requires: 'tools.use' },
  { label: 'My Requests', href: '/approvals', icon: Inbox, requires: 'tools.use' },
  { label: 'Referrals', href: '/workspace/referrals', icon: UserPlus, requires: 'workspace.read' },
  {
    label: 'My Documents',
    href: '/workspace/documents',
    icon: ShieldCheck,
    requires: 'documents.read',
  },
]

export default function WorkspaceNav({
  access,
  capabilities,
}: {
  access: WorkspaceAccessState
  capabilities: readonly WorkspaceCapability[]
}) {
  const pathname = usePathname()
  const visible = ITEMS.filter((item) => capabilities.includes(item.requires))
  if (visible.length === 0) return null

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
      <nav className="flex flex-wrap items-center gap-1">
        {visible.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          )
        })}
      </nav>
      {access !== 'full' && (
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          {accessStateLabel(access)}
        </span>
      )}
    </div>
  )
}
