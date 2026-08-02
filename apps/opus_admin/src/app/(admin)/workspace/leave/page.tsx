import { getSelfIdentity } from '@/lib/workforce/identity'
import { workspaceNavFor } from '@/lib/workforce/scope'
import { LEAVE_TYPES } from './_lib/leave-calculation'
import { getMyLeaveBalance, getMyLeaveRequests } from './_lib/queries'
import LeaveClient from './LeaveClient'
import {
  createMyLeaveRequest,
  updateMyLeaveRequest,
  withdrawMyLeaveRequest,
} from './actions'

export const dynamic = 'force-dynamic'

const TZ = 'Africa/Dar_es_Salaam'

function todayInTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// My Leave. Personal surface: everything here is the caller's own, resolved
// server-side. The queries take no employee id, so there is nothing on this
// page a client could repoint at somebody else.
export default async function MyLeavePage() {
  const identity = await getSelfIdentity()
  // Layouts and pages render in PARALLEL in the App Router — the layout's
  // identity guard does not stop this component executing. Without this bail,
  // requireSelfEmployee inside the queries throws on every request from an
  // unlinked caller, logging a stack trace behind a card the user is already
  // being shown correctly. Returning null lets the layout own the message.
  if (!identity.ok) return null
  const access = identity.access

  // A resigned employee keeps documents_only, so they can still see their
  // history but must not be able to raise anything new. The layout already
  // gates entry; this decides whether the compose affordances render, and the
  // actions re-check independently.
  const canRequest = access === 'full'

  const [balance, requests] = await Promise.all([
    getMyLeaveBalance(),
    getMyLeaveRequests(),
  ])

  return (
    <LeaveClient
      balance={balance}
      requests={requests}
      leaveTypes={[...LEAVE_TYPES]}
      today={todayInTz()}
      canRequest={canRequest}
      readOnlyNote={
        canRequest
          ? null
          : 'Your record is closed, so new requests cannot be raised. Your history stays available.'
      }
      actions={{
        create: createMyLeaveRequest,
        update: updateMyLeaveRequest,
        withdraw: withdrawMyLeaveRequest,
      }}
      // Suppresses the nav-consistency warning if a future access state hides
      // Leave entirely while this page is still reachable by direct URL.
      navIncludesLeave={workspaceNavFor(access).includes('leave')}
    />
  )
}
