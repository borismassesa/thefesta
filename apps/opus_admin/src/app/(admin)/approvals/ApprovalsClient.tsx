'use client'

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSetPageHeading } from '@/components/PageHeading'
import {
  BarChart3,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Plus,
  Search,
  Star,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APPROVER_ROSTER, CATEGORY_GROUPS, findGroup } from './data'
import { categoriesInGroup, categoryLabel, findCategory } from './catalog'
import { formatFieldValue } from './datetime'
import { isOwnedBy, isRelevantTo, isWaitingOn } from './scoping'
import { categoryStats, type CategoryStats } from './stats'
import type { ApprovalAnalytics } from './queries'
import { useFavourites } from './useFavourites'
import OverviewView from './OverviewView'
import {
  addApprovalNote,
  createApprovalRequest,
  saveApprovalRequest,
  transitionApprovalRequest,
} from './actions'
import {
  removeApprovalAttachment,
  uploadApprovalAttachment,
} from './attachment-actions'
import type {
  ApprovalActor,
  ApprovalCategory,
  ApprovalCategoryKey,
  ApprovalRequest,
  ApprovalStatus,
} from './types'
import RequestFormView, {
  type DecisionKind,
  type RequestFormDraft,
} from './RequestFormView'
import MyRequestsView from './MyRequestsView'
import PendingApprovalsView from './PendingApprovalsView'
import AnalyticsView from './AnalyticsView'
import RequestTypesView from './RequestTypesView'
import { EmptyState, ICONS, StatusPill, currentApproverLabel } from './ui'

// `overview` lands first on purpose. The catalog of request types answers
// "what can I create", which is a question you only ask once you've
// already decided to create something. The question people actually
// arrive with is "what needs me", so that gets the first screen and the
// catalog moves one tab right.
const TABS = ['overview', 'create', 'my-requests', 'pending', 'request-types', 'analytics'] as const
export type ApprovalTab = (typeof TABS)[number]

const TAB_META: Record<ApprovalTab, { label: string; icon: typeof LayoutGrid }> = {
  overview: { label: 'Overview', icon: LayoutDashboard },
  create: { label: 'Create', icon: LayoutGrid },
  'my-requests': { label: 'My Requests', icon: ListChecks },
  pending: { label: 'Pending Approvals', icon: Inbox },
  'request-types': { label: 'Request Types', icon: Wrench },
  analytics: { label: 'Analytics', icon: BarChart3 },
}

function parseTab(value: string | null): ApprovalTab {
  return TABS.includes(value as ApprovalTab) ? (value as ApprovalTab) : 'overview'
}

// Drill-down state *within* the Create tab. Kept as client state rather
// than routes because the request form and the category list share
// `/approvals` and the form owns unsaved draft state that a navigation
// would drop.
type View =
  | { kind: 'dashboard' }
  | { kind: 'list'; category: ApprovalCategoryKey }
  | { kind: 'request'; requestId: string }
  | { kind: 'new'; category: ApprovalCategoryKey }

export default function ApprovalsClient({
  actor,
  initialRequests,
  canViewAnalytics,
  categories,
  canManageCategories,
  manageableCategories,
  analytics,
  renderedAt,
}: {
  actor: ApprovalActor
  initialRequests: ApprovalRequest[]
  canViewAnalytics: boolean
  // The request-type catalog, read from approval_categories. Passed rather than
  // imported so an admin-created type appears without a deploy.
  categories: ApprovalCategory[]
  // Owner/admin may author the catalog.
  canManageCategories: boolean
  // Includes retired types; empty unless canManageCategories.
  manageableCategories: ApprovalCategory[]
  // Server-computed org-wide aggregate. Null when this account may not see it.
  // Deliberately not derived from `initialRequests`, which only ever holds this
  // person's own requests now.
  analytics: ApprovalAnalytics | null
  renderedAt: number
}) {
  const [requests, setRequests] = useState<ApprovalRequest[]>(initialRequests)
  const [view, setView] = useState<View>({ kind: 'dashboard' })
  // Held locally so the management list updates without a full reload.
  const [manageable, setManageable] = useState<ApprovalCategory[]>(manageableCategories)

  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  const actorEmail = actor.email.trim().toLowerCase()
  const { favourites, toggle: toggleFavourite } = useFavourites(actorEmail)

  const mine = useMemo(
    () => requests.filter((r) => isOwnedBy(r, actorEmail)),
    [requests, actorEmail],
  )

  // "Waiting for me" is strictly Submitted requests I'm named on. Drafts
  // sitting with their owner are not my problem, and decided requests are
  // history.
  //
  // Own requests are excluded unconditionally. Nothing stops someone
  // adding themselves as an approver on the picker today, and self-approval
  // is not a decision — it's a control failure. Filtering here keeps it out
  // of the queue, the Overview list and the tab badge in one move. This is
  // a guard, not the enforcement: the server should refuse the transition
  // too once approval_steps lands.
  const waitingOnMe = useMemo(
    () => requests.filter((r) => isWaitingOn(r, actorEmail)),
    [requests, actorEmail],
  )

  // The Overview activity feed is scoped to this caller: requests they
  // raised, or requests routed to them. An admin's org-wide view belongs
  // on the Analytics tab, which is permission-gated; the landing page must
  // not become an ambient feed of everyone's payment and contract traffic.
  const myRelevantRequests = useMemo(
    () => requests.filter((r) => isRelevantTo(r, actorEmail)),
    [requests, actorEmail],
  )

  // The Pending tab is only meaningful for people who actually approve
  // things. Roster membership counts on its own so a newly-added approver
  // still gets the tab before their first request lands.
  const isApprover = useMemo(
    () =>
      APPROVER_ROSTER.some((a) => a.email.trim().toLowerCase() === actorEmail) ||
      requests.some((r) => r.approvers.some((a) => a.email.trim().toLowerCase() === actorEmail)),
    [requests, actorEmail],
  )

  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => {
        if (t === 'pending') return isApprover
        if (t === 'request-types') return canManageCategories
        if (t === 'analytics') return canViewAnalytics
        return true
      }),
    [isApprover, canViewAnalytics, canManageCategories],
  )

  // A stale bookmark or a link shared by someone with wider permissions can
  // name a tab this account can't see. Fall back to the landing tab rather
  // than rendering a tab bar with nothing selected.
  const activeTab: ApprovalTab = visibleTabs.includes(tab) ? tab : 'overview'

  // Every navigation rebuilds the query from scratch rather than merging
  // into the existing one — carrying a stale `status` from My Requests
  // into another tab would silently filter a list the user never filtered.
  // `extra` lands in the URL so a filtered view survives refresh, bookmark
  // and paste-to-a-colleague.
  const selectTab = useCallback(
    (next: ApprovalTab, extra?: Record<string, string>) => {
      setView({ kind: 'dashboard' })
      const params = new URLSearchParams()
      // Overview is the default, so it owns the bare `/approvals` URL.
      if (next !== 'overview') params.set('tab', next)
      for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [router, pathname],
  )

  // My Requests filters live in the URL, so the view is controlled from
  // here rather than owning its own state.
  const setRequestFilters = useCallback(
    (next: { status?: string; period?: string }) => {
      const params = new URLSearchParams()
      params.set('tab', 'my-requests')
      if (next.status && next.status !== 'All') params.set('status', next.status)
      if (next.period) params.set('period', next.period)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname],
  )

  // Stable identity matters here — useSetPageHeading puts the onClick
  // into a useEffect dep list, so an unstable function would tear the
  // heading down and rebuild it every render.
  const backToDashboard = useCallback(() => {
    setView({ kind: 'dashboard' })
  }, [])

  // Page heading is view-dependent — the tabbed shell shows the "Approvals"
  // title + subtitle, while the request form collapses to a back-link in
  // the admin header ("← Business Trip"). The back action is
  // `onClick: backToDashboard` (not a Next.js href) because the shell and
  // the form live on the same `/approvals` URL — an href would be a no-op.
  const heading = useMemo(() => {
    if (view.kind === 'dashboard') {
      return {
        title: 'Approvals',
        subtitle: 'Raise it, track it, decide on it. One authorization desk for the whole company.',
      }
    }
    const category =
      view.kind === 'request'
        ? requests.find((r) => r.id === view.requestId)?.category
        : view.category
    const label = category ? categoryLabel(categories, category) : 'Approvals'
    return {
      title: 'Approvals',
      back: { onClick: backToDashboard, label },
    }
  }, [view, requests, categories, backToDashboard])
  useSetPageHeading(heading)

  function startNew(category: ApprovalCategoryKey) {
    setView({ kind: 'new', category })
  }

  function openRequest(id: string) {
    setView({ kind: 'request', requestId: id })
  }

  function openCategoryList(category: ApprovalCategoryKey) {
    setView({ kind: 'list', category })
  }

  // Persist a draft: update when editing an existing request, otherwise
  // create. Returns the canonical row from the server so the form can swap
  // in the real id + activity. Throws on failure so the form surfaces it.
  async function saveDraft(draft: RequestFormDraft): Promise<ApprovalRequest> {
    const editingId = view.kind === 'request' ? view.requestId : null

    if (editingId) {
      const res = await saveApprovalRequest(editingId, {
        subject: draft.subject,
        fields: draft.fields,
        approvers: draft.approvers,
      })
      if (!res.ok) throw new Error(res.error)
      setRequests((prev) => prev.map((r) => (r.id === editingId ? res.request : r)))
      return res.request
    }

    const res = await createApprovalRequest({
      category: draft.category,
      subject: draft.subject,
      fields: draft.fields,
      approvers: draft.approvers,
    })
    if (!res.ok) throw new Error(res.error)
    setRequests((prev) => [res.request, ...prev])
    setView({ kind: 'request', requestId: res.request.id })
    return res.request
  }

  async function transition(
    id: string,
    next: ApprovalStatus,
    decision?: { kind: DecisionKind; note?: string },
  ) {
    const res = await transitionApprovalRequest(id, next, decision)
    if (!res.ok) throw new Error(res.error)
    setRequests((prev) => prev.map((r) => (r.id === id ? res.request : r)))
    // The notification summary rides along so the form can report what the
    // server actually dispatched, rather than sending anything itself.
    return { request: res.request, notification: res.notification }
  }

  async function uploadAttachment(id: string, file: File): Promise<void> {
    // FormData because the file crosses to a server action as a stream; the
    // action re-checks participation and sniffs the content before storing it.
    const fd = new FormData()
    fd.set('requestId', id)
    fd.set('file', file)
    const res = await uploadApprovalAttachment(fd)
    if (!res.ok) throw new Error(res.error)
    setRequests((prev) => prev.map((r) => (r.id === id ? res.request : r)))
  }

  async function removeAttachment(attachmentId: string): Promise<void> {
    const res = await removeApprovalAttachment(attachmentId)
    if (!res.ok) throw new Error(res.error)
    setRequests((prev) => prev.map((r) => (r.id === res.request.id ? res.request : r)))
  }

  async function appendNote(id: string, body: string): Promise<void> {
    const res = await addApprovalNote(id, body)
    if (!res.ok) throw new Error(res.error)
    setRequests((prev) => prev.map((r) => (r.id === id ? res.request : r)))
  }

  function discardCurrent() {
    // No persisted edits to discard since `save` is what writes — just
    // return the user to whichever tab they came from.
    backToDashboard()
  }

  if (view.kind === 'new') {
    const cat = findCategory(categories, view.category)
    if (!cat) {
      // The type was retired or deleted between rendering the catalog and
      // clicking it. Bail to the shell rather than crash.
      backToDashboard()
      return null
    }
    return (
      <RequestFormView
        actor={actor}
        category={cat}
        request={null}
        isNew
        onSave={saveDraft}
        onDiscard={discardCurrent}
        onTransition={transition}
        onAppendNote={appendNote}
        onUploadAttachment={uploadAttachment}
        onRemoveAttachment={removeAttachment}
      />
    )
  }

  if (view.kind === 'request') {
    const r = requests.find((x) => x.id === view.requestId)
    if (!r) {
      // Shouldn't happen, but bail back to the shell rather than crash.
      backToDashboard()
      return null
    }
    const cat = findCategory(categories, r.category)
    if (!cat) {
      backToDashboard()
      return null
    }
    return (
      <RequestFormView
        actor={actor}
        category={cat}
        request={r}
        isNew={false}
        onSave={saveDraft}
        onDiscard={discardCurrent}
        onTransition={transition}
        onAppendNote={appendNote}
        onUploadAttachment={uploadAttachment}
        onRemoveAttachment={removeAttachment}
      />
    )
  }

  if (view.kind === 'list') {
    const cat = findCategory(categories, view.category)
    if (!cat) {
      backToDashboard()
      return null
    }
    return (
      <CategoryListView
        category={cat}
        requests={requests.filter((r) => r.category === view.category)}
        onOpen={openRequest}
        onNew={() => startNew(view.category)}
        onBack={backToDashboard}
      />
    )
  }

  return (
    <div className="space-y-5">
      <TabBar
        tabs={visibleTabs}
        active={activeTab}
        onSelect={selectTab}
        badges={{ 'my-requests': mine.length, pending: waitingOnMe.length }}
      />

      {activeTab === 'overview' && (
        <OverviewView
          waitingOnMe={waitingOnMe}
          mine={mine}
          relevantRequests={myRelevantRequests}
          favourites={favourites}
          categories={categories}
          actorEmail={actorEmail}
          now={renderedAt}
          onOpen={openRequest}
          onNew={startNew}
          onGoTo={selectTab}
        />
      )}
      {activeTab === 'create' && (
        <CreateCatalog
          requests={requests}
          categories={categories}
          actorEmail={actorEmail}
          now={renderedAt}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
          onPickCategory={openCategoryList}
          onNew={startNew}
        />
      )}
      {activeTab === 'my-requests' && (
        <MyRequestsView
          requests={mine}
          onOpen={openRequest}
          status={searchParams.get('status')}
          period={searchParams.get('period')}
          onFilter={setRequestFilters}
          now={renderedAt}
          categories={categories}
        />
      )}
      {activeTab === 'pending' && (
        <PendingApprovalsView
          requests={waitingOnMe}
          onOpen={openRequest}
          now={renderedAt}
          categories={categories}
        />
      )}
      {activeTab === 'request-types' && (
        <RequestTypesView categories={manageable} onChanged={setManageable} />
      )}
      {activeTab === 'analytics' && analytics && (
        <AnalyticsView analytics={analytics} now={renderedAt} categories={categories} />
      )}
    </div>
  )
}

// ----- Tab bar ---------------------------------------------------------------

function TabBar({
  tabs,
  active,
  onSelect,
  badges,
}: {
  tabs: readonly ApprovalTab[]
  active: ApprovalTab
  onSelect: (t: ApprovalTab) => void
  badges: Partial<Record<ApprovalTab, number>>
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => {
        const { label, icon: Icon } = TAB_META[t]
        const badge = badges[t]
        const isActive = active === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
              isActive
                ? 'border-[#7E5896] text-[#5B2D8E]'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {badge !== undefined && badge > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  isActive ? 'bg-[#F0DFF6] text-[#5B2D8E]' : 'bg-gray-100 text-gray-600',
                )}
              >
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ----- Create tab ------------------------------------------------------------

function CreateCatalog({
  requests,
  categories,
  actorEmail,
  now,
  favourites,
  onToggleFavourite,
  onPickCategory,
  onNew,
}: {
  requests: ApprovalRequest[]
  categories: ApprovalCategory[]
  actorEmail: string
  now: number
  favourites: ApprovalCategoryKey[]
  onToggleFavourite: (k: ApprovalCategoryKey) => void
  onPickCategory: (k: ApprovalCategoryKey) => void
  onNew: (k: ApprovalCategoryKey) => void
}) {
  const [search, setSearch] = useState('')
  const stats = useMemo(
    () => categoryStats(requests, actorEmail, now),
    [requests, actorEmail, now],
  )

  const query = search.trim().toLowerCase()
  const matches = (c: ApprovalCategory) =>
    !query ||
    c.label.toLowerCase().includes(query) ||
    c.blurb.toLowerCase().includes(query) ||
    findGroup(c.group).label.toLowerCase().includes(query)

  const starred = categories.filter((c) => favourites.includes(c.key) && matches(c))
  const visibleGroups = CATEGORY_GROUPS.map((group) => ({
    group,
    items: categoriesInGroup(categories, group.key).filter(matches),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // The placeholder is the only visible naming, and a placeholder is
          // not an accessible name: it is announced inconsistently and is gone
          // as soon as the field has content.
          aria-label="Search request types"
          placeholder="Search request types…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
        />
      </div>

      {visibleGroups.length === 0 && starred.length === 0 ? (
        <EmptyState
          title={`Nothing matches “${search.trim()}”.`}
          hint="Try the business function instead — travel, finance, legal."
        />
      ) : (
        <>
          {starred.length > 0 && (
            <CatalogSection
              accent="#B45309"
              tint="#FEF3C7"
              label="Favourites"
              blurb="Pinned by you. Starred types also appear under Quick create."
              items={starred}
              stats={stats}
              favourites={favourites}
              onToggleFavourite={onToggleFavourite}
              onPickCategory={onPickCategory}
              onNew={onNew}
            />
          )}
          {visibleGroups.map(({ group, items }) => (
            <CatalogSection
              key={group.key}
              accent={group.accent}
              tint={group.tint}
              label={group.label}
              blurb={group.blurb}
              items={items}
              stats={stats}
              favourites={favourites}
              onToggleFavourite={onToggleFavourite}
              onPickCategory={onPickCategory}
              onNew={onNew}
            />
          ))}
        </>
      )}
    </div>
  )
}

function CatalogSection({
  accent,
  tint,
  label,
  blurb,
  items,
  stats,
  favourites,
  onToggleFavourite,
  onPickCategory,
  onNew,
}: {
  accent: string
  tint: string
  label: string
  blurb: string
  items: ApprovalCategory[]
  stats: Map<ApprovalCategoryKey, CategoryStats>
  favourites: ApprovalCategoryKey[]
  onToggleFavourite: (k: ApprovalCategoryKey) => void
  onPickCategory: (k: ApprovalCategoryKey) => void
  onNew: (k: ApprovalCategoryKey) => void
}) {
  return (
    <section className="space-y-3">
      {/* A colour swatch, not an icon. The group and its cards were both
          pulling from the same icon set, so Travel sat above Business Trip
          with two identical planes. Colour plus a larger label identifies
          the family without competing with the cards below it. */}
      <div className="flex items-center gap-3">
        <span
          className="h-8 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: accent }}>
            {label}
          </h2>
          <p className="truncate text-xs text-gray-500">{blurb}</p>
        </div>
        <span className="ml-3 h-px flex-1" style={{ backgroundColor: tint }} aria-hidden />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((c) => (
          <CategoryTile
            key={c.key}
            category={c}
            stats={stats.get(c.key)}
            favourite={favourites.includes(c.key)}
            onToggleFavourite={() => onToggleFavourite(c.key)}
            onOpen={() => onPickCategory(c.key)}
            onNew={() => onNew(c.key)}
          />
        ))}
      </div>
    </section>
  )
}

function CategoryTile({
  category,
  stats,
  favourite,
  onToggleFavourite,
  onOpen,
  onNew,
}: {
  category: ApprovalCategory
  // Undefined when nobody has ever raised this type. The card then shows
  // no metrics at all rather than a row of zeroes pretending to be data.
  stats: CategoryStats | undefined
  favourite: boolean
  onToggleFavourite: () => void
  onOpen: () => void
  onNew: () => void
}) {
  const Icon = ICONS[category.iconKey]
  const [statsCollapsed, setStatsCollapsed] = useState(false)
  const statsId = `category-stats-${category.key}`

  return (
    // The whole card is the hit area for "show me these requests", but the
    // card itself is not a button — the title's ::after is stretched over
    // it instead. A role="button" wrapper around a star and a CTA would be
    // nested interactive content, which is invalid and hides both inner
    // controls from assistive tech. The green CTA stays reserved for the
    // one action that creates something; previously every card shouted it.
    <div className="group relative rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.2)] focus-within:border-gray-200">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
          style={{ backgroundColor: category.tint, color: category.accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${category.label} requests`}
            className="block max-w-full truncate rounded text-sm font-semibold text-gray-900 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-[#7E5896] focus-visible:ring-offset-2"
          >
            {category.label}
          </button>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{category.blurb}</p>
        </div>
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={favourite}
          aria-label={
            favourite
              ? `Remove ${category.label} from favourites`
              : `Add ${category.label} to favourites`
          }
          className={cn(
            'relative z-10 shrink-0 rounded-md p-1.5 transition',
            favourite
              ? 'text-amber-500'
              : 'text-gray-300 opacity-0 hover:text-amber-500 focus-visible:opacity-100 group-hover:opacity-100',
          )}
        >
          <Star className={cn('h-4 w-4', favourite && 'fill-amber-400')} />
        </button>
      </div>

      {stats && stats.total > 0 && !statsCollapsed && (
        <dl
          id={statsId}
          className="mt-3 grid gap-2 rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 text-[11px] sm:grid-cols-2"
        >
          <div>
            <dt className="font-bold uppercase tracking-wider text-gray-400">Raised</dt>
            <dd className="mt-0.5 font-semibold text-gray-800">
              {stats.thisYear} this year
            </dd>
          </div>
          {stats.avgDecisionDays !== null && (
            <div>
              <dt className="font-bold uppercase tracking-wider text-gray-400">Decision</dt>
              <dd className="mt-0.5 font-semibold text-gray-800">
                {stats.avgDecisionDays < 1
                  ? `${Math.max(1, Math.round(stats.avgDecisionDays * 24))}h average`
                  : `${stats.avgDecisionDays.toFixed(1)}d average`}
              </dd>
            </div>
          )}
          {stats.typicalApprovers.length > 0 && (
            <div className="min-w-0 sm:col-span-2">
              <dt className="font-bold uppercase tracking-wider text-gray-400">Typical reviewer</dt>
              <dd className="mt-0.5 truncate font-semibold text-gray-800">
                {stats.typicalApprovers.join(' · ')}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[11px] font-medium text-gray-500">
            {stats && stats.total > 0 ? formatRequestCount(stats.total) : 'No requests yet'}
          </span>
          {stats && stats.total > 0 && (
            <button
              type="button"
              onClick={() => setStatsCollapsed((collapsed) => !collapsed)}
              aria-expanded={!statsCollapsed}
              aria-controls={statsId}
              aria-label={
                statsCollapsed
                  ? `Show ${category.label} request stats`
                  : `Collapse ${category.label} request stats`
              }
              className="relative z-10 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7E5896] focus-visible:ring-offset-2"
            >
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', !statsCollapsed && 'rotate-180')}
              />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onNew}
          aria-label={`New ${category.label} request`}
          className="relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[11px] font-bold uppercase tracking-wider text-white shadow-[0_8px_18px_-12px_rgba(5,150,105,0.9)] transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-3 w-3" />
          Start
        </button>
      </div>
    </div>
  )
}

function formatRequestCount(total: number): string {
  return `${total} request${total === 1 ? '' : 's'}`
}

// ----- Category list view ----------------------------------------------------

function CategoryListView({
  category,
  requests,
  onOpen,
  onNew,
  onBack,
}: {
  category: ApprovalCategory
  requests: ApprovalRequest[]
  onOpen: (id: string) => void
  onNew: () => void
  onBack: () => void
}) {
  const Icon = ICONS[category.iconKey]
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'All'>('All')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (!q) return true
      return r.subject.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q)
    })
  }, [requests, statusFilter, search])

  return (
    <div className="space-y-4">
      {/* Back arrow + category breadcrumb live in the admin Header. The
          per-category metadata card below carries the icon, blurb,
          search and status filters; "New Request" sits as the primary
          CTA on the right of that card. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: category.tint, color: category.accent }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">{category.label}</p>
          <p className="text-xs text-gray-500">{category.blurb}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject or owner…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
            />
          </div>
          <div className="flex gap-1.5">
            {(['All', 'To Submit', 'Submitted', 'Approved', 'Refused'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  statusFilter === s
                    ? 'bg-[#F0DFF6] text-[#5B2D8E]'
                    : 'text-gray-500 hover:bg-gray-50',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New Request
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gray-700">
            No {category.label.toLowerCase()} requests
            {statusFilter !== 'All' ? ` in ${statusFilter.toLowerCase()}` : ''} yet.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Click <span className="font-semibold text-[#5B2D8E]">New Request</span> to start one.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-xs font-semibold text-gray-500 hover:text-gray-800"
          >
            Back to all categories
          </button>
        </div>
      ) : (
        <div className="no-scrollbar overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
          <div className="grid min-w-[760px] grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_120px] items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
            <span>Subject</span>
            <span>Owner</span>
            <span>Current approver</span>
            <span>Status</span>
          </div>
          {visible.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              className="grid w-full min-w-[760px] grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_120px] items-center gap-3 border-b border-gray-100 px-5 py-3 text-left last:border-b-0 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{r.subject}</p>
                <p className="truncate text-xs text-gray-500">{summariseFields(r, category)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#F0DFF6] text-[10px] font-bold text-[#5B2D8E]">
                  {r.ownerInitials}
                </span>
                <span className="truncate text-sm text-gray-700">{r.owner}</span>
              </div>
              <div className="min-w-0 truncate text-xs text-gray-600">
                {currentApproverLabel(r)}
              </div>
              <StatusPill status={r.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ----- Helpers ---------------------------------------------------------------

function summariseFields(r: ApprovalRequest, cat: ApprovalCategory): string {
  const parts: string[] = []
  for (const f of cat.fields) {
    if (f.id === 'subject' || f.id === 'description') continue
    const v = r.fields[f.id]
    if (!v) continue
    // Dates and periods are stored ISO-ish ("2026-08-01T14:30/…"); the
    // summary line shows them the way a person reads them.
    parts.push(formatFieldValue(f.kind, v).split('\n')[0])
    if (parts.length === 2) break
  }
  if (parts.length === 0 && r.fields.description) parts.push(r.fields.description)
  return parts.join(' · ')
}
