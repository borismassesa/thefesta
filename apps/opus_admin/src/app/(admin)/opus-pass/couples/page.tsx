import { redirect } from 'next/navigation'
import { CalendarHeart, MailCheck, Users, Wallet } from 'lucide-react'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { getCoupleAccounts, getUnlinkedOrders } from './queries'
import CouplesHeading from './CouplesHeading'
import CouplesListClient from './CouplesListClient'
import UnattributedBanner from './UnattributedBanner'

export const dynamic = 'force-dynamic'

function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  caption: string
  icon: typeof Users
  tone?: 'default' | 'money'
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        <Icon className="h-4 w-4 text-[#7E5896]" />
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${tone === 'money' ? 'text-emerald-700' : 'text-gray-900'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-gray-500">{caption}</p>
    </div>
  )
}

export default async function CoupleAccountsPage() {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('opuspass.couples.read'))) redirect('/')

  const [couples, unlinkedOrders, canWrite, canDelete] = await Promise.all([
    getCoupleAccounts(),
    getUnlinkedOrders(),
    hasPermission('opuspass.couples.write'),
    hasPermission('opuspass.couples.delete'),
  ])

  // These four are scale-of-the-platform numbers. The per-segment counts
  // (accounts, active, dormant, onboarded, has events, paying, no sign-in)
  // deliberately live on the filter chips instead, where each one also does
  // something when clicked, rather than being duplicated up here.
  const paying = couples.filter((c) => c.status === 'paying').length
  const lifetimeRevenue = couples.reduce((sum, c) => sum + c.lifetimeSpendTzs, 0)
  const totalEvents = couples.reduce((sum, c) => sum + c.eventCount, 0)
  const couplesWithEvents = couples.filter((c) => c.eventCount > 0).length
  const totalGuests = couples.reduce((sum, c) => sum + c.guestCount, 0)
  const totalInvites = couples.reduce((sum, c) => sum + c.invitationCount, 0)
  const totalAttending = couples.reduce((sum, c) => sum + c.rsvpAttending, 0)
  const totalPending = couples.reduce((sum, c) => sum + c.rsvpPending, 0)
  const responseRate = totalInvites > 0 ? Math.round(((totalInvites - totalPending) / totalInvites) * 100) : 0

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <CouplesHeading />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lifetime revenue"
          value={`TZS ${lifetimeRevenue.toLocaleString('en-US')}`}
          caption={`From ${paying} paying ${paying === 1 ? 'couple' : 'couples'} of ${couples.length} accounts`}
          icon={Wallet}
          tone="money"
        />
        <StatCard
          label="Events created"
          value={totalEvents.toLocaleString('en-US')}
          caption={`Across ${couplesWithEvents} ${couplesWithEvents === 1 ? 'couple' : 'couples'}`}
          icon={CalendarHeart}
        />
        <StatCard
          label="Guests on rosters"
          value={totalGuests.toLocaleString('en-US')}
          caption={`${totalInvites.toLocaleString('en-US')} invitations sent across all events`}
          icon={Users}
        />
        <StatCard
          label="RSVPs confirmed"
          value={totalAttending.toLocaleString('en-US')}
          caption={`${responseRate}% of invitations have had a reply`}
          icon={MailCheck}
        />
      </div>

      {unlinkedOrders.length > 0 ? <UnattributedBanner orders={unlinkedOrders} /> : null}

      <CouplesListClient couples={couples} canWrite={canWrite} canDelete={canDelete} />
    </div>
  )
}
