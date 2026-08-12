'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ClipboardCheck,
  Clock,
  FileText,
  Home,
  ListTodo,
  Plane,
  ShieldCheck,
  Target,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkspaceAccessState, WorkspaceCapability } from '@/lib/workspace/access'
import { accessStateLabel } from '@/lib/workspace/access'
import { WS } from './ui'

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
  /** When set, the item is only shown when this flag is true. */
  when?: 'managing_director'
}

const ITEMS: Item[] = [
  { label: 'Home', href: '/workspace', icon: Home, requires: 'workspace.read', exact: true },
  { label: 'My Clock', href: '/workspace/timeclock', icon: Clock, requires: 'tools.use' },
  {
    label: 'Daily Tracker',
    href: '/workspace/tracker',
    icon: ClipboardCheck,
    requires: 'tools.use',
    when: 'managing_director',
  },
  { label: 'My Work', href: '/workspace/work', icon: ListTodo, requires: 'tools.use' },
  { label: 'My Reports', href: '/workspace/reports', icon: FileText, requires: 'tools.use' },
  { label: 'Goals', href: '/workspace/performance', icon: Target, requires: 'tools.use' },
  { label: 'My Leave', href: '/workspace/leave', icon: Plane, requires: 'tools.use' },
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
  isManagingDirector = false,
}: {
  access: WorkspaceAccessState
  capabilities: readonly WorkspaceCapability[]
  isManagingDirector?: boolean
}) {
  const pathname = usePathname()
  const visible = ITEMS.filter((item) => {
    if (!capabilities.includes(item.requires)) return false
    if (item.when === 'managing_director' && !isManagingDirector) return false
    return true
  })
  if (visible.length === 0) return null

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
      <nav className="flex flex-wrap items-center gap-1" aria-label="Workspace sections">
        {visible.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                active ? WS.tabActive : WS.tabIdle,
              )}
            >
              <Icon className="h-4 w-4 stroke-[1.75]" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      {access !== 'full' && (
        <span
          className={cn(
            WS.pill,
            access === 'documents_only' && 'border-amber-200 bg-amber-50 text-amber-800',
          )}
        >
          {accessStateLabel(access)}
        </span>
      )}
    </div>
  )
}
