'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ExternalLink,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { BUDGET_RANGE_OPTIONS, type CoupleEditable } from './editable'
import {
  createCoupleAccount,
  createCoupleSignIn,
  deleteCoupleAccount,
  deleteDormantCoupleAccounts,
  getCoupleDeletionImpact,
  openCoupleDashboard,
  updateCoupleAccount,
  type CoupleAccountInput,
  type CoupleDeletionImpact,
  type DormantSweepResult,
} from './account-actions'

// Client half of couple account management: the create/edit form, the delete
// confirmation, and the row/header action clusters that open them. Shared by
// the list page and the per-couple console so both offer exactly the same
// operations.

const EMPTY_FORM: CoupleAccountInput = {
  partner1Name: '',
  partner2Name: '',
  email: '',
  phone: '',
  whatsappPhone: '',
  city: '',
  region: '',
  weddingDate: '',
  dateUndecided: false,
  budgetRange: '',
  guestCount: '',
  createLogin: true,
}

function formFrom(couple: CoupleEditable): CoupleAccountInput {
  return {
    partner1Name: couple.partner1Name,
    partner2Name: couple.partner2Name,
    email: couple.email,
    phone: couple.phone,
    whatsappPhone: couple.whatsappPhone,
    city: couple.city,
    region: couple.region,
    weddingDate: couple.weddingDate,
    dateUndecided: couple.dateUndecided,
    budgetRange: couple.budgetRange,
    guestCount: couple.guestCount,
  }
}

// ------------------------------------------------------------------- primitives

function Modal({
  title,
  subtitle,
  tone = 'default',
  busy,
  onClose,
  children,
}: {
  title: string
  subtitle?: ReactNode
  tone?: 'default' | 'danger'
  busy: boolean
  onClose: () => void
  children: ReactNode
}) {
  // Escape closes, unless a request is in flight — the same rule as the
  // backdrop click, so there is no way to walk away mid-write by accident.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const danger = tone === 'danger'
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-gray-100 bg-white shadow-xl">
        <header className="flex items-start gap-3 border-b border-gray-100 px-6 pb-4 pt-5">
          {danger ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600">
              <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className={`text-base font-semibold ${danger ? 'text-rose-900' : 'text-gray-900'}`}>{title}</h2>
            {subtitle ? (
              <p className={`mt-1 text-xs leading-relaxed ${danger ? 'text-rose-800/80' : 'text-gray-500'}`}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-gray-400">{hint}</span> : null}
    </label>
  )
}

const INPUT_CLASS =
  'mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#7E5896] focus:outline-none'

// ------------------------------------------------------------- create / edit form

function CoupleFormModal({
  mode,
  couple,
  onClose,
}: {
  mode: 'create' | 'edit'
  couple?: CoupleEditable
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState<CoupleAccountInput>(couple ? formFrom(couple) : EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  // Set when the save landed but something adjacent did not: a login that could
  // not be created, a sign-in email that did not move. The dialog stays open on
  // a "saved, but read this" panel rather than closing quietly, because these
  // are exactly the outcomes staff need to act on.
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof CoupleAccountInput>(key: K, value: CoupleAccountInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createCoupleAccount(form)
          : await updateCoupleAccount(couple!.userId, form)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
      if (result.warning) {
        setNotice(result.warning)
        return
      }
      onClose()
    })
  }

  if (notice) {
    return (
      <Modal
        title={mode === 'create' ? 'Account created, one thing to note' : 'Saved, one thing to note'}
        busy={false}
        onClose={onClose}
      >
        <div className="px-6 py-5">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{notice}</p>
        </div>
        <div className="flex items-center justify-end border-t border-gray-100 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5d3a78]"
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={mode === 'create' ? 'New couple account' : 'Edit couple details'}
      subtitle={
        mode === 'create'
          ? 'For couples who signed up over the phone or in person. This writes the same account and profile the onboarding wizard would.'
          : 'Updates the account and their onboarding profile. Everything they set up themselves (events, invites, website) is untouched.'
      }
      busy={pending}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Partner 1 name">
            <input
              className={INPUT_CLASS}
              value={form.partner1Name}
              onChange={(e) => set('partner1Name', e.target.value)}
              placeholder="Amani"
              autoFocus
            />
          </Field>
          <Field label="Partner 2 name">
            <input
              className={INPUT_CLASS}
              value={form.partner2Name}
              onChange={(e) => set('partner2Name', e.target.value)}
              placeholder="Zawadi"
            />
          </Field>
          <Field label="Email" hint={mode === 'edit' ? 'Their sign-in email stays as it is.' : 'Also their sign-in email.'}>
            <input
              type="email"
              className={INPUT_CLASS}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="couple@example.com"
            />
          </Field>
          <Field label="Phone">
            <input
              className={INPUT_CLASS}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+255 7xx xxx xxx"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className={INPUT_CLASS}
              value={form.whatsappPhone}
              onChange={(e) => set('whatsappPhone', e.target.value)}
              placeholder="+255 7xx xxx xxx"
            />
          </Field>
          <Field label="City">
            <input
              className={INPUT_CLASS}
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Arusha"
            />
          </Field>
          <Field label="Region">
            <input
              className={INPUT_CLASS}
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              placeholder="Arusha"
            />
          </Field>
          <Field label="Wedding date">
            <input
              type="date"
              className={INPUT_CLASS}
              value={form.weddingDate}
              onChange={(e) => set('weddingDate', e.target.value)}
            />
          </Field>
          <Field label="Budget range">
            <select
              className={INPUT_CLASS}
              value={form.budgetRange}
              onChange={(e) => set('budgetRange', e.target.value)}
            >
              {BUDGET_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expected guests">
            <input
              type="number"
              min={0}
              max={5000}
              className={INPUT_CLASS}
              value={form.guestCount}
              onChange={(e) => set('guestCount', e.target.value)}
              placeholder="150"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.dateUndecided}
            disabled={Boolean(form.weddingDate)}
            onChange={(e) => set('dateUndecided', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#7E5896] focus:ring-[#7E5896] disabled:opacity-40"
          />
          They have not decided on a date yet
          {form.weddingDate ? <span className="text-xs text-gray-400">(a date is set)</span> : null}
        </label>

        {mode === 'create' ? (
          <label className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-[#FBF8FD] px-3 py-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={Boolean(form.createLogin)}
              onChange={(e) => set('createLogin', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#7E5896] focus:ring-[#7E5896]"
            />
            <span>
              Create their sign-in as well
              <span className="mt-0.5 block text-xs text-gray-500">
                Without this they cannot reach their own dashboard until they sign up themselves. No password is set: they
                sign in with a one-time code sent to their email, or with Google.
              </span>
            </span>
          </label>
        ) : null}

        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5d3a78] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === 'create' ? 'Create account' : 'Save changes'}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- delete dialog

/** Rows the impact preview shows. Zero-count lines are dropped so the list is
 *  short and every line it does show is a real consequence. */
function impactLines(impact: CoupleDeletionImpact): string[] {
  const lines: [number, string, string][] = [
    [impact.events, 'event', 'events'],
    [impact.guests, 'guest', 'guests'],
    [impact.invitations, 'invitation', 'invitations'],
    [impact.pledges, 'pledge', 'pledges'],
    [impact.registryItems, 'registry item', 'registry items'],
    [impact.guestbookEntries, 'guestbook entry', 'guestbook entries'],
    [impact.websites, 'wedding website', 'wedding websites'],
    [impact.reviews, 'vendor review', 'vendor reviews'],
    [impact.notes, 'staff note', 'staff notes'],
  ]
  return lines
    .filter(([count]) => count > 0)
    .map(([count, singular, plural]) => `${count} ${count === 1 ? singular : plural}`)
}

function DeleteCoupleModal({
  couple,
  onClose,
  onDeleted,
}: {
  couple: CoupleEditable
  onClose: () => void
  onDeleted: () => void
}) {
  const [impact, setImpact] = useState<CoupleDeletionImpact | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** The account is already gone at this point, so this is a calm "done, but
   *  read this" panel rather than an alert that can be dismissed unread. */
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    void getCoupleDeletionImpact(couple.userId).then((result) => {
      if (!active) return
      if (result.ok) setImpact(result.impact)
      else setError(result.error)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [couple.userId])

  // Confirm against the name the server will check, which is derived from the
  // profile — not the list's display name, which can fall back to an event name.
  const expectedName = impact?.coupleName ?? couple.coupleName
  // One login can run a wedding and a storefront at once. Deleting the login
  // would take the storefront with it, so for these the wedding side is removed
  // on its own and the sign-in stays. The wording changes throughout to say so.
  const sharedWithVendor = (impact?.vendors ?? 0) > 0

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await deleteCoupleAccount(couple.userId, confirmName)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.warning) {
        setNotice(result.warning)
        return
      }
      onDeleted()
    })
  }

  if (notice) {
    return (
      <Modal
        title={sharedWithVendor ? 'Wedding side removed, one thing to note' : 'Account deleted, one thing to note'}
        busy={false}
        onClose={onDeleted}
      >
        <div className="px-6 py-5">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{notice}</p>
        </div>
        <div className="flex items-center justify-end border-t border-gray-100 px-6 py-3">
          <button
            type="button"
            onClick={onDeleted}
            autoFocus
            className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5d3a78]"
          >
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title={sharedWithVendor ? 'Remove the wedding side' : 'Delete couple account'}
      tone="danger"
      subtitle={
        sharedWithVendor ? (
          <>
            Permanently removes everything they built on the wedding side: events, guest lists, RSVPs, pledges, gift
            registry, guestbook and their wedding website. Their sign-in and their vendor storefront are kept, because
            the same login runs both. This cannot be undone. Paid orders are kept and returned to the unattributed list
            on this page.
          </>
        ) : (
          <>
            Permanently removes this account and everything they built: events, guest lists, RSVPs, pledges, gift
            registry, guestbook and their wedding website. Their sign-in login is deleted too, so the email is freed up.
            This cannot be undone. Paid orders are kept and returned to the unattributed list on this page.
          </>
        )
      }
      busy={pending}
      onClose={onClose}
    >
      <div className="space-y-4 px-6 py-5">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking what will be removed...
          </p>
        ) : impact ? (
          <>
            <div className="flex flex-wrap gap-2">
              {impactLines(impact).length === 0 ? (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-500">
                  Nothing built yet on this account
                </span>
              ) : (
                impactLines(impact).map((line) => (
                  <span
                    key={line}
                    className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700"
                  >
                    {line}
                  </span>
                ))
              )}
            </div>

            {impact.paidOrders > 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <span className="font-semibold">
                  {impact.paidOrders} paid {impact.paidOrders === 1 ? 'order' : 'orders'} worth TZS{' '}
                  {impact.lifetimeSpendTzs.toLocaleString('en-US')}
                </span>{' '}
                will be detached rather than deleted. They move back to the unattributed banner on this page, where they
                can be linked to another account.
              </p>
            ) : null}

            {sharedWithVendor ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <span className="font-semibold">
                  This login also runs {impact.vendors} vendor {impact.vendors === 1 ? 'storefront' : 'storefronts'}
                </span>
                , so only the wedding side is removed. The sign-in stays live, the storefront and everything on it is
                untouched, and the email is not freed up. Delete the storefront from Operations, Vendors if the whole
                account should go.
              </p>
            ) : null}
          </>
        ) : null}

        <Field label={`Type “${expectedName}” to confirm`}>
          <input
            className={INPUT_CLASS}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={expectedName}
            autoComplete="off"
          />
        </Field>

        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || loading || confirmName.trim() !== expectedName.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {sharedWithVendor ? 'Remove wedding side' : 'Delete permanently'}
        </button>
      </div>
    </Modal>
  )
}

// ------------------------------------------------------------ dormant clean-up

/**
 * Bulk-delete the dormant accounts currently in view. Offered only on the
 * Dormant filter, where every visible row is a signup that never did anything;
 * this is the clean-up that previously meant hand-written SQL.
 *
 * The server re-derives dormancy per account and skips anything that has since
 * become active, so a stale page can never take an account with data with it.
 */
export function DeleteDormantButton({ couples }: { couples: { userId: string; coupleName: string; email: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmCount, setConfirmCount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<DormantSweepResult | null>(null)
  const [pending, startTransition] = useTransition()

  const count = couples.length
  if (count === 0) return null

  function close() {
    setOpen(false)
    setConfirmCount('')
    setError(null)
    setOutcome(null)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await deleteDormantCoupleAccounts(couples.map((c) => c.userId))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOutcome(result.result)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
      >
        <Trash2 className="h-4 w-4" />
        Delete {count} dormant
      </button>

      {open ? (
        <Modal
          title={outcome ? 'Dormant clean-up finished' : `Delete ${count} dormant ${count === 1 ? 'account' : 'accounts'}`}
          tone={outcome ? 'default' : 'danger'}
          subtitle={
            outcome ? undefined : (
              <>
                These accounts signed up and never did anything: no onboarding, no events, no guests, no orders. Each one
                is re-checked as it is deleted, and any that has since become active is skipped and listed. Their sign-in
                logins are removed too, so the emails are freed up.
              </>
            )
          }
          busy={pending}
          onClose={close}
        >
          <div className="space-y-4 px-6 py-5">
            {outcome ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">
                  Deleted {outcome.deleted} {outcome.deleted === 1 ? 'account' : 'accounts'}.
                </p>
                {outcome.skipped.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-amber-900">
                      {outcome.skipped.length} left in place:
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-800">
                      {outcome.skipped.map((skip) => (
                        <li key={`${skip.name}-${skip.reason}`}>
                          {skip.name}: {skip.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <ul className="space-y-1 text-xs text-gray-600">
                    {couples.map((couple) => (
                      <li key={couple.userId} className="truncate">
                        <span className="font-semibold text-gray-800">{couple.coupleName}</span>
                        {couple.email ? ` · ${couple.email}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
                <Field label={`Type ${count} to confirm`} hint="The number of accounts about to be deleted.">
                  <input
                    className={INPUT_CLASS}
                    value={confirmCount}
                    onChange={(e) => setConfirmCount(e.target.value)}
                    placeholder={String(count)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </Field>
              </>
            )}
            {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-3">
            {outcome ? (
              <button
                type="button"
                onClick={close}
                className="rounded-xl bg-[#7E5896] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5d3a78]"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || confirmCount.trim() !== String(count)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete {count} {count === 1 ? 'account' : 'accounts'}
                </button>
              </>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

// --------------------------------------------------------------- shared actions

/** Opens the couple's real OpusPass dashboard in a new tab. The action mints a
 *  short-lived signed link; a failure (missing secret, deleted account) comes
 *  back as a message rather than a dead tab. */
function useOpenDashboard(userId: string) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<Message | null>(null)

  function open() {
    setMessage(null)
    startTransition(async () => {
      const result = await openCoupleDashboard(userId)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error })
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    })
  }

  return { open, pending, message }
}

/** The outcome of an inline action, rendered in the anchored panel below the
 *  control that started it. `info` covers the success detail worth reading, e.g.
 *  how the couple actually signs in now. */
type Message = { tone: 'error' | 'info'; text: string }

function useCreateSignIn(userId: string) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<Message | null>(null)

  function create() {
    setMessage(null)
    startTransition(async () => {
      const result = await createCoupleSignIn(userId)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error })
        return
      }
      router.refresh()
      if (result.warning) setMessage({ tone: 'info', text: result.warning })
    })
  }

  return { create, pending, message }
}

// --------------------------------------------------------------- list-page entry

export function NewCoupleButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[#7E5896] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d3a78]"
      >
        <UserPlus className="h-4 w-4" />
        New couple
      </button>
      {open ? <CoupleFormModal mode="create" onClose={() => setOpen(false)} /> : null}
    </>
  )
}

// ------------------------------------------------------------------ row actions

type Dialog = 'edit' | 'delete' | null

/** Per-row menu in the couples table. Kept in a popover so the table keeps its
 *  one-line-per-couple density. */
const MENU_WIDTH = 224 // matches w-56

export function CoupleRowActions({
  couple,
  canWrite,
  canDelete,
}: {
  couple: CoupleEditable
  canWrite: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  // Anchored to the viewport rather than to the row, because the table lives in
  // an `overflow-x-auto` wrapper: an absolutely-positioned menu is clipped by it
  // (a scrolling axis makes the other axis clip too), which hid the menu's lower
  // items whenever the table was short.
  // `anchor` outlives the menu on purpose: the failure message from an action
  // started in the menu hangs off the same point.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dashboard = useOpenDashboard(couple.userId)
  const signIn = useCreateSignIn(couple.userId)

  function closeMenu() {
    setMenuOpen(false)
  }

  // Rough menu height from the item count: 36px a row, 9px for the divider,
  // 8px of vertical padding. Only used to decide which way to open, so being a
  // few pixels out is harmless.
  const menuItemCount = (canWrite ? 2 + (couple.canSignIn ? 0 : 1) : 0) + (canDelete ? 1 : 0)
  const estimatedMenuHeight = menuItemCount * 36 + (canWrite && canDelete ? 9 : 0) + 8

  function toggleMenu() {
    if (menuOpen) {
      closeMenu()
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    // Open upward when the last rows of a long table would push the menu off
    // the bottom of the window.
    const openUp = rect.bottom + 4 + estimatedMenuHeight > window.innerHeight - 8
    setAnchor({
      top: openUp ? Math.max(8, rect.top - 4 - estimatedMenuHeight) : rect.bottom + 4,
      left: Math.max(8, rect.right - MENU_WIDTH),
    })
    setMenuOpen(true)
  }

  useEffect(() => {
    if (!menuOpen) return
    function onClickAway(event: MouseEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      if ((target as Element)?.closest?.('[data-couple-row-menu]')) return
      closeMenu()
    }
    // A fixed menu would drift away from its row on scroll, so close instead of
    // trying to follow.
    document.addEventListener('mousedown', onClickAway)
    window.addEventListener('scroll', closeMenu, true)
    window.addEventListener('resize', closeMenu)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      window.removeEventListener('scroll', closeMenu, true)
      window.removeEventListener('resize', closeMenu)
    }
  }, [menuOpen])

  const message = dashboard.message ?? signIn.message
  const busy = dashboard.pending || signIn.pending

  if (!canWrite && !canDelete) return null

  return (
    <div ref={containerRef} className="relative flex justify-end">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Actions for ${couple.coupleName}`}
        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-[#7E5896]"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>

      {menuOpen && anchor ? (
        <div
          role="menu"
          data-couple-row-menu
          style={{ position: 'fixed', top: anchor.top, left: anchor.left, width: MENU_WIDTH }}
          className="z-50 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
        >
          {canWrite ? (
            <>
              <MenuItem
                icon={Pencil}
                label="Edit details"
                onClick={() => {
                  closeMenu()
                  setDialog('edit')
                }}
              />
              <MenuItem
                icon={ExternalLink}
                label="Open their dashboard"
                onClick={() => {
                  closeMenu()
                  dashboard.open()
                }}
              />
              {couple.canSignIn ? null : (
                <MenuItem
                  icon={KeyRound}
                  label="Give them a login"
                  onClick={() => {
                    closeMenu()
                    signIn.create()
                  }}
                />
              )}
            </>
          ) : null}
          {canDelete ? (
            <>
              <div className="my-1 border-t border-gray-100" />
              <MenuItem
                icon={Trash2}
                label="Delete account"
                tone="danger"
                onClick={() => {
                  closeMenu()
                  setDialog('delete')
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {message && anchor ? (
        <p
          role="alert"
          style={{ position: 'fixed', top: anchor.top, left: anchor.left, width: MENU_WIDTH + 64 }}
          className={`z-50 rounded-xl border px-3 py-2 text-left text-xs font-semibold shadow-lg ${
            message.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-[#7ec24a] bg-[#9FE870]/25 text-[#3d6b1f]'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {dialog === 'edit' ? <CoupleFormModal mode="edit" couple={couple} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <DeleteCoupleModal
          couple={couple}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition hover:bg-gray-50 ${
        tone === 'danger' ? 'text-rose-700' : 'text-gray-700'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      {label}
    </button>
  )
}

// --------------------------------------------------------- console header cluster

/** The same operations as the row menu, laid out as buttons for the per-couple
 *  console header where there is room for them. */
export function CoupleConsoleActions({
  couple,
  canWrite,
  canDelete,
}: {
  couple: CoupleEditable
  canWrite: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>(null)
  const dashboard = useOpenDashboard(couple.userId)
  const signIn = useCreateSignIn(couple.userId)
  const message = dashboard.message ?? signIn.message

  if (!canWrite && !canDelete) return null

  const secondary =
    'inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-[#C9A0DC] hover:text-[#7E5896] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canWrite ? (
          <>
            <button type="button" onClick={dashboard.open} disabled={dashboard.pending} className={secondary}>
              {dashboard.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Open dashboard
            </button>
            {couple.canSignIn ? null : (
              <button type="button" onClick={signIn.create} disabled={signIn.pending} className={secondary}>
                {signIn.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Give them a login
              </button>
            )}
            <button type="button" onClick={() => setDialog('edit')} className={secondary}>
              <Pencil className="h-4 w-4" />
              Edit details
            </button>
          </>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            onClick={() => setDialog('delete')}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        ) : null}
      </div>

      {message ? (
        <p
          role="alert"
          className={`max-w-sm rounded-xl border px-3 py-2 text-xs font-semibold ${
            message.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-[#7ec24a] bg-[#9FE870]/25 text-[#3d6b1f]'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {dialog === 'edit' ? <CoupleFormModal mode="edit" couple={couple} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <DeleteCoupleModal
          couple={couple}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null)
            // The account this page is about is gone, so stay off it.
            router.replace('/opus-pass/couples')
          }}
        />
      ) : null}
    </div>
  )
}
