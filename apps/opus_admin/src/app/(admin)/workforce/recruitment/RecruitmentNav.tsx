'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  Handshake,
  LayoutTemplate,
  ListChecks,
  Settings2,
  Sparkles,
  UserRoundSearch,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/workforce/recruitment', label: 'Overview', icon: Gauge, exact: true, permissions: ['workforce.recruitment.read'] },
  { href: '/workforce/recruitment/workforce-plan', label: 'Workforce plan', icon: BarChart3, permissions: ['recruitment.plan.manage', 'workforce.recruitment_reports.read'] },
  { href: '/workforce/recruitment/requisitions', label: 'Requisitions', icon: ListChecks, permissions: ['workforce.requisitions.read'] },
  { href: '/workforce/recruitment/my-requisitions', label: 'My requisitions', icon: ClipboardList, permissions: ['workforce.requisitions.read'] },
  { href: '/workforce/recruitment/jobs', label: 'Jobs', icon: BriefcaseBusiness, permissions: ['workforce.jobs.read'] },
  { href: '/workforce/recruitment/applications', label: 'Applications', icon: ClipboardCheck, permissions: ['workforce.applications.read'] },
  { href: '/workforce/recruitment/candidates', label: 'Candidates', icon: UserRoundSearch, permissions: ['workforce.candidates.read'] },
  { href: '/workforce/recruitment/talent-pools', label: 'Talent pools', icon: UsersRound, permissions: ['workforce.talent_pool.read'] },
  { href: '/workforce/recruitment/interviews', label: 'Interviews', icon: CalendarDays, permissions: ['workforce.interviews.read'] },
  { href: '/workforce/recruitment/assessments', label: 'Assessments', icon: FileText, permissions: ['workforce.assessments.read'] },
  { href: '/workforce/recruitment/offers', label: 'Offers', icon: WalletCards, permissions: ['workforce.offers.read'] },
  { href: '/workforce/recruitment/referrals', label: 'Referrals', icon: Handshake, permissions: ['workforce.referrals.read'] },
  { href: '/workforce/recruitment/agencies', label: 'Agencies', icon: Building2, permissions: ['workforce.recruitment_settings.write'] },
  { href: '/workforce/recruitment/career-content', label: 'Career content', icon: Sparkles, permissions: ['workforce.careers_content.read'] },
  { href: '/workforce/recruitment/templates', label: 'Templates', icon: LayoutTemplate, permissions: ['workforce.recruitment_settings.write', 'workforce.jobs.write', 'workforce.assessments.write'] },
  { href: '/workforce/recruitment/reports', label: 'Reports', icon: BarChart3, permissions: ['workforce.recruitment_reports.read'] },
  { href: '/workforce/recruitment/settings', label: 'Settings', icon: Settings2, permissions: ['workforce.recruitment_settings.write'] },
]

export default function RecruitmentNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname()
  const granted = new Set(permissions)
  return (
    // Same shell as the Approvals tablist: the strip is itself a panel, and the
    // active tab is a soft violet chip rather than a solid block.
    <nav
      aria-label="Recruitment modules"
      className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] no-scrollbar"
    >
      {items.filter((item) => item.permissions.some((permission) => granted.has(permission))).map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC]',
              active
                ? 'bg-[#F8EDFF] text-[#5B2D8E] shadow-sm'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
