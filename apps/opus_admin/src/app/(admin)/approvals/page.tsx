import { Suspense } from 'react'
import { getAdminAccessRole, hasAnyPermission } from '@/lib/admin-auth'
import { resolveApprovalActor } from './actor'
import ApprovalsClient from './ApprovalsClient'
import { approvalAnalytics, listApprovalCategories, listApprovalRequests } from './queries'
import type { ApprovalActor } from './types'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  // The SAME resolver the server actions use. This used to read Clerk
  // directly, which meant the page and the actions could disagree about who
  // the caller is: getCallerEmail() honours the local auth bypass, while
  // currentUser() returns null under it, so in dev the actions attributed a
  // request to dev@opusfesta.com while the page thought the viewer had no
  // address at all. Every ownership-dependent control (remove attachment,
  // approver editing) then rendered against the wrong identity, and the
  // request list scoped itself to '' and came back empty.
  //
  // One resolver, so the identity the UI reasons about is the identity the
  // server will enforce against.
  const resolved = await resolveApprovalActor()
  const primaryEmail = resolved.email
  const actor: ApprovalActor = {
    name: resolved.name,
    email: resolved.email,
    initials: resolved.initials,
    color: resolved.color,
  }

  // Request rows are ALWAYS scoped to this person — there is no override for
  // finance.write, platform.admin or the owner. Oversight comes from the
  // aggregate below, which carries counts and never request detail.
  //
  // ANALYTICS AUDIENCE: finance.write OR platform.admin. Owner, the three
  // admins, and the Finance Manager.
  //
  // This was briefly narrowed to platform.admin alone and DELIBERATELY REVERTED
  // by Boris on 2026-08-01. It is a decision, not an oversight — do not
  // "tighten" it in a later audit without asking.
  //
  // The tradeoff being accepted: aggregation is not a real privacy control at
  // ~12 staff. "Travel: 1 pending" + "bottleneck: OpusFesta Owner, oldest 9h"
  // + "longest waiting: Bolt Service, 9h" reconstructs one identifiable
  // person's one request. So these five can, in effect, infer request-level
  // facts they cannot open directly. That is judged acceptable for this group;
  // it would not be if the audience grew.
  //
  // If more people need this view, add an explicit `approvals.analytics` key
  // rather than widening further on a functional permission.
  const canViewAnalytics = await hasAnyPermission(['finance.write', 'platform.admin'])
  // The catalog is loaded first: analytics needs it to resolve group labels,
  // and the client needs it to render the Create tab. Only ACTIVE types reach
  // the employee-facing catalog, so a retired type stops being offered while
  // requests that already reference it keep resolving their label.
  const categories = await listApprovalCategories()
  // Owner/admin author the catalog. The management view needs retired types
  // too, so it gets its own list rather than the employee-facing one.
  const role = await getAdminAccessRole()
  const canManageCategories = role === 'owner' || role === 'admin'
  const manageableCategories = canManageCategories
    ? await listApprovalCategories(true)
    : []
  const [snapshot, analytics] = await Promise.all([
    listApprovalRequests({ viewerEmail: primaryEmail }),
    canViewAnalytics ? approvalAnalytics(categories) : Promise.resolve(null),
  ])

  // The Approvals page heading is driven by ApprovalsClient (it knows
  // whether we're on the tabbed shell, a category list, or a single
  // request) so the header can render "← Business Trip" etc. when
  // appropriate. No <WorkforceHeading> here — having two heading
  // setters would race.
  //
  // The Suspense boundary is required because ApprovalsClient reads the
  // active tab from useSearchParams().
  return (
    <Suspense fallback={null}>
      <ApprovalsClient
        actor={actor}
        initialRequests={snapshot.requests}
        canViewAnalytics={canViewAnalytics}
        categories={categories}
        canManageCategories={canManageCategories}
        manageableCategories={manageableCategories}
        analytics={analytics}
        // "Now" for every ageing calculation, stamped by the query itself.
        renderedAt={snapshot.fetchedAt}
      />
    </Suspense>
  )
}
