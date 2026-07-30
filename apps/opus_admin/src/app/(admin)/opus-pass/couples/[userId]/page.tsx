import { notFound, redirect } from 'next/navigation'
import { getAdminAccessRole, hasPermission, isAdminDashboardRole } from '@/lib/admin-auth'
import { getCoupleTier } from '../../pledges/tier'
import {
  getCoupleAccount,
  getCoupleEvents,
  getCoupleNotes,
  getCoupleOrders,
  getCreditUsage,
  getEventGuests,
  getLinkableOrdersForCouple,
} from './queries'
import CoupleConsole from './CoupleConsole'

export const dynamic = 'force-dynamic'

export default async function CoupleAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ event?: string }>
}) {
  const role = await getAdminAccessRole()
  if (!isAdminDashboardRole(role)) redirect('/contribute')
  if (!(await hasPermission('opuspass.couples.read'))) redirect('/')

  const { userId } = await params
  const { event: requestedEventId } = await searchParams

  const [couple, events] = await Promise.all([getCoupleAccount(userId), getCoupleEvents(userId)])
  if (!couple) notFound()

  // An ?event= that does not belong to this couple falls back to their first
  // event rather than leaking another couple's data into the scoped tabs.
  const selectedEvent = events.find((e) => e.id === requestedEventId) ?? events[0] ?? null
  const eventNameById = new Map(events.map((e) => [e.id, e.name]))

  const [orders, linkableOrders, notes, creditUsage, guests, tier, canWrite, canDelete] = await Promise.all([
    getCoupleOrders(userId, eventNameById),
    getLinkableOrdersForCouple(userId),
    getCoupleNotes(userId),
    getCreditUsage(userId, selectedEvent?.id ?? null),
    selectedEvent ? getEventGuests(selectedEvent.id) : Promise.resolve([]),
    getCoupleTier(userId),
    hasPermission('opuspass.couples.write'),
    hasPermission('opuspass.couples.delete'),
  ])

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <CoupleConsole
        couple={couple}
        events={events}
        selectedEventId={selectedEvent?.id ?? null}
        guests={guests}
        orders={orders}
        linkableOrders={linkableOrders}
        creditUsage={creditUsage}
        notes={notes}
        tier={tier}
        canWrite={canWrite}
        canDelete={canDelete}
      />
    </div>
  )
}
