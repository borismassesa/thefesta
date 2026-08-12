'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  Gauge,
  ListChecks,
  Settings2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Recruitment navigation, grouped.
 *
 * This was seventeen tabs in one strip, which overflowed on any normal screen
 * and gave a nine-line filter ("My requisitions") the same weight as the
 * two-thousand-line Applications module. They are not peers, and the domain
 * already groups them: plan a role, open it, attract people, select one, close.
 *
 * ROUTES ARE UNCHANGED. Grouping is presentational — every href is where it
 * always was, so links, bookmarks and deep links keep working. Moving pages to
 * match the groups would need redirects on every one of them, which is a
 * separate decision from fixing the navigation.
 */
type NavItem = {
  href: string
  label: string
  /** Overview only: every other route is a prefix match so detail pages stay lit. */
  exact?: boolean
  permissions: string[]
}

type NavGroup = {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    icon: Gauge,
    items: [
      { href: '/workforce/recruitment', label: 'Overview', exact: true, permissions: ['workforce.recruitment.read'] },
    ],
  },
  {
    // Authorisation to hire, before anyone is contacted.
    label: 'Planning',
    icon: ListChecks,
    items: [
      { href: '/workforce/recruitment/workforce-plan', label: 'Workforce plan', permissions: ['recruitment.plan.manage', 'workforce.recruitment_reports.read'] },
      { href: '/workforce/recruitment/requisitions', label: 'Requisitions', permissions: ['workforce.requisitions.read'] },
    ],
  },
  {
    // Career content is the public face of a job, so it belongs beside them
    // rather than in Settings with the message templates.
    label: 'Jobs',
    icon: BriefcaseBusiness,
    items: [
      { href: '/workforce/recruitment/jobs', label: 'Jobs', permissions: ['workforce.jobs.read'] },
      { href: '/workforce/recruitment/career-content', label: 'Career content', permissions: ['workforce.careers_content.read'] },
    ],
  },
  {
    // Everything here hangs off an application. They keep standalone lists
    // because "what interviews are today" is a real question that no single
    // candidate record answers.
    label: 'Pipeline',
    icon: ClipboardCheck,
    items: [
      { href: '/workforce/recruitment/applications', label: 'Applications', permissions: ['workforce.applications.read'] },
      { href: '/workforce/recruitment/interviews', label: 'Interviews', permissions: ['workforce.interviews.read'] },
      { href: '/workforce/recruitment/assessments', label: 'Assessments', permissions: ['workforce.assessments.read'] },
      { href: '/workforce/recruitment/offers', label: 'Offers', permissions: ['workforce.offers.read'] },
    ],
  },
  {
    // People, and the channels they arrive through. Pools are a saved segment
    // of candidates; referrals and agencies are sources of them.
    label: 'Talent',
    icon: UsersRound,
    items: [
      { href: '/workforce/recruitment/candidates', label: 'Candidates', permissions: ['workforce.candidates.read'] },
      { href: '/workforce/recruitment/talent-pools', label: 'Talent pools', permissions: ['workforce.talent_pool.read'] },
      { href: '/workforce/recruitment/referrals', label: 'Referrals', permissions: ['workforce.referrals.read'] },
      { href: '/workforce/recruitment/agencies', label: 'Agencies', permissions: ['workforce.recruitment_settings.write'] },
    ],
  },
  {
    label: 'Reports',
    icon: BarChart3,
    items: [
      { href: '/workforce/recruitment/reports', label: 'Reports', permissions: ['workforce.recruitment_reports.read'] },
    ],
  },
  {
    label: 'Settings',
    icon: Settings2,
    items: [
      { href: '/workforce/recruitment/settings', label: 'Settings', permissions: ['workforce.recruitment_settings.write'] },
      { href: '/workforce/recruitment/templates', label: 'Templates', permissions: ['workforce.recruitment_settings.write', 'workforce.jobs.write', 'workforce.assessments.write'] },
    ],
  },
]

function matches(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

export default function RecruitmentNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname()
  const granted = new Set(permissions)

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.permissions.some((permission) => granted.has(permission))),
  })).filter((group) => group.items.length > 0)

  // Longest match wins, so /requisitions/new lights Requisitions rather than
  // whichever shorter prefix happened to be declared first.
  let active: { group: (typeof groups)[number]; item: NavItem } | null = null
  for (const group of groups) {
    for (const item of group.items) {
      if (!matches(item, pathname)) continue
      if (!active || item.href.length > active.item.href.length) active = { group, item }
    }
  }

  return (
    <div className="space-y-2">
      <nav
        aria-label="Recruitment sections"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] no-scrollbar"
      >
        {groups.map((group) => {
          const isActive = active?.group.label === group.label
          const Icon = group.icon
          return (
            <Link
              key={group.label}
              // A group is a label, not a page: it opens its first permitted
              // child, which is also what keeps a permission-trimmed nav from
              // pointing somewhere the user cannot load.
              href={group.items[0].href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC]',
                isActive ? 'bg-[#F8EDFF] text-[#5B2D8E] shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {group.label}
            </Link>
          )
        })}
      </nav>

      {/* Only when the group has somewhere else to go. A single-page group
          showing a one-item second row is just a louder heading. */}
      {active && active.group.items.length > 1 && (
        <nav
          aria-label={`${active.group.label} pages`}
          className="flex gap-1 overflow-x-auto px-1 no-scrollbar"
        >
          {active.group.items.map((item) => {
            const isActive = item.href === active.item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A0DC]',
                  isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
