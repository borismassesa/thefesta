'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { User, Lock, ShieldCheck, Link2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type NavRow =
  | { kind: 'link'; href: string; label: string; icon: LucideIcon; exact?: boolean }
  | { kind: 'action'; label: string; icon: LucideIcon; onClick: () => void }

type NavGroup = { title: string; rows: NavRow[] }

function useSettingsGroups(): NavGroup[] {
  const { openUserProfile } = useClerk()
  return [
    {
      title: 'Your account',
      rows: [
        { kind: 'link', href: '/my/dashboard/settings', label: 'Information', icon: User, exact: true },
        { kind: 'action', label: 'Password and security', icon: Lock, onClick: () => openUserProfile() },
      ],
    },
    {
      title: 'Your settings',
      rows: [
        { kind: 'link', href: '/my/dashboard/settings/urls', label: 'URLs', icon: Link2 },
        { kind: 'link', href: '/my/dashboard/settings/privacy', label: 'Privacy', icon: ShieldCheck },
      ],
    },
  ]
}

function NavRowItem({ row, active }: { row: NavRow; active: boolean }) {
  const Icon = row.icon
  const className = cn(
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
    active ? 'bg-black/[0.06] font-medium text-[#1A1A1A]' : 'text-[#1A1A1A]/65 hover:bg-black/[0.04] hover:text-[#1A1A1A]',
  )
  const inner = (
    <>
      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/40')} />
      <span>{row.label}</span>
    </>
  )
  if (row.kind === 'action') {
    return (
      <button data-opus-button="control" type="button" onClick={row.onClick} className={className}>
        {inner}
      </button>
    )
  }
  return (
    <Link href={row.href} className={className}>
      {inner}
    </Link>
  )
}

export function SettingsNav() {
  const pathname = usePathname()
  const groups = useSettingsGroups()
  return (
    <nav className="w-full shrink-0 lg:w-56">
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/40">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.rows.map((row) => {
                const active = row.kind === 'link' && (row.exact ? pathname === row.href : pathname.startsWith(row.href))
                return <NavRowItem key={row.label} row={row} active={active} />
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="pb-16">
      <h1 className="dash-header-safe text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">Account settings</h1>
      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start">
        <SettingsNav />
        <div className="min-w-0 flex-1 max-w-2xl">{children}</div>
      </div>
    </div>
  )
}
