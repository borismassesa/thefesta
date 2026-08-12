'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  GitMerge,
  Loader2,
  Search,
  X,
} from 'lucide-react'
import { VendorAvatar } from './VendorAvatar'
import { StatusPill, type StatusPillVariant } from './StatusPill'
import { mergeVendors } from '../actions'
import type { VendorAccount, VendorStatus } from '../_lib/types'

// Lifecycle "advancement" rank — used to auto-suggest which record survives
// (the furthest-along, most-complete one). Admin can always flip it.
const STATUS_RANK: Record<VendorStatus, number> = {
  active: 6,
  awaiting_review: 5,
  needs_corrections: 4,
  uploading_docs: 3,
  drafting: 2,
  suspended: 1,
}

const STATUS_LABEL: Record<VendorStatus, { label: string; variant: StatusPillVariant }> = {
  awaiting_review: { label: 'Submitted', variant: 'warning' },
  needs_corrections: { label: 'Corrections', variant: 'danger' },
  uploading_docs: { label: 'Uploading', variant: 'info' },
  drafting: { label: 'Drafting', variant: 'neutral' },
  active: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'neutral' },
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|co|company|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

// Auto survivor: highest lifecycle rank → most verified docs → oldest record.
function pickSurvivorId(a: VendorAccount, b: VendorAccount): string {
  const ra = STATUS_RANK[a.status] ?? 0
  const rb = STATUS_RANK[b.status] ?? 0
  if (ra !== rb) return ra > rb ? a.id : b.id
  const da = a.documentsVerified + a.documentsTotal
  const db = b.documentsVerified + b.documentsTotal
  if (da !== db) return da > db ? a.id : b.id
  return new Date(a.createdAt).getTime() <= new Date(b.createdAt).getTime()
    ? a.id
    : b.id
}

export function MergeVendorDialog({
  anchor,
  vendors,
  onClose,
  onMerged,
}: {
  /** the vendor the admin clicked "Merge" on; null = dialog closed */
  anchor: VendorAccount | null
  vendors: VendorAccount[]
  onClose: () => void
  onMerged: () => void
}) {
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [survivorId, setSurvivorId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const partner = partnerId ? vendors.find((v) => v.id === partnerId) ?? null : null

  // Likely duplicates float to the top of the picker: same normalized name,
  // else same city. Everything else is searchable below.
  const candidates = useMemo(() => {
    if (!anchor) return []
    const anchorName = normalizeName(anchor.businessName)
    const q = query.trim().toLowerCase()
    return vendors
      .filter((v) => v.id !== anchor.id)
      .filter((v) =>
        q
          ? [v.businessName, v.publicId, v.city ?? '', v.category]
              .join(' ')
              .toLowerCase()
              .includes(q)
          : true,
      )
      .map((v) => {
        const sameName = normalizeName(v.businessName) === anchorName
        const sameCity =
          !!v.city && !!anchor.city &&
          v.city.trim().toLowerCase() === anchor.city.trim().toLowerCase()
        return { v, score: sameName ? 2 : sameCity ? 1 : 0 }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }, [anchor, vendors, query])

  if (!anchor) return null

  const choosePartner = (v: VendorAccount) => {
    setPartnerId(v.id)
    setSurvivorId(pickSurvivorId(anchor, v))
    setError(null)
    setConfirmName('')
  }

  const survivor =
    survivorId === anchor.id ? anchor : survivorId === partner?.id ? partner : null
  const loser =
    survivor && partner ? (survivor.id === anchor.id ? partner : anchor) : null

  const expectedName = (loser?.businessName ?? '').trim()
  const canMerge =
    !!survivor && !!loser && confirmName.trim() === expectedName && !pending

  const submit = () => {
    if (!survivor || !loser) return
    setError(null)
    startTransition(async () => {
      const res = await mergeVendors({
        survivorId: survivor.id,
        loserId: loser.id,
        confirmName,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onMerged()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-vendor-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-gray-100 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0DFF6] text-[#5B2D8E]">
              <GitMerge className="h-4 w-4" />
            </span>
            <div>
              <h2 id="merge-vendor-title" className="text-base font-semibold text-gray-900">
                Merge duplicate vendors
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Move all data onto one record and permanently remove the other.
              </p>
            </div>
          </div>
          <button data-opus-button="control"
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-xs leading-relaxed text-rose-800">{error}</p>
            </div>
          )}

          {/* The anchor vendor, always shown */}
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Merging
          </p>
          <VendorMini vendor={anchor} />

          {!partner ? (
            <>
              {/* Phase 1 — pick the duplicate */}
              <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                With this duplicate
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, city, ID…"
                  aria-label="Search vendors to merge"
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-[#C9A0DC]"
                />
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="px-1 py-6 text-center text-sm text-gray-500">
                    No other vendors match.
                  </p>
                ) : (
                  candidates.map(({ v, score }) => (
                    <button data-opus-button="neutral" data-opus-button-size="medium"
                      key={v.id}
                      type="button"
                      onClick={() => choosePartner(v)}
                      className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 text-left transition-colors hover:border-[#C9A0DC] hover:bg-[#FCF9FF]"
                    >
                      <VendorAvatar
                        logoUrl={v.logoUrl}
                        businessName={v.businessName}
                        category={v.category}
                        size={32}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {v.businessName}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {v.publicId} · {v.city || 'Location TBC'}
                        </p>
                      </div>
                      {score > 0 && (
                        <span className="shrink-0 rounded-full bg-[#F0DFF6] px-2 py-0.5 text-[10px] font-semibold text-[#5B2D8E]">
                          {score === 2 ? 'Same name' : 'Same city'}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              {/* Phase 2 — confirm survivor + destructive confirm */}
              <div className="mt-5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Keep this record
                </p>
                <button data-opus-button="control"
                  type="button"
                  onClick={() =>
                    setSurvivorId((id) => (id === anchor.id ? partner.id : anchor.id))
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B2D8E] hover:underline"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  Swap
                </button>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[anchor, partner].map((v) => {
                  const isSurvivor = v.id === survivorId
                  return (
                    <button data-opus-button="control"
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSurvivorId(v.id)
                        setConfirmName('')
                      }}
                      className={
                        isSurvivor
                          ? 'rounded-xl border-2 border-[#9FE870] bg-[#FCFFFD] p-3 text-left'
                          : 'rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 p-3 text-left opacity-80'
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={
                            isSurvivor
                              ? 'inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#3F8B5C]'
                              : 'text-[11px] font-bold uppercase tracking-wider text-rose-500'
                          }
                        >
                          {isSurvivor ? (
                            <>
                              <Check className="h-3 w-3" strokeWidth={3} /> Survivor
                            </>
                          ) : (
                            'Deleted'
                          )}
                        </span>
                        <StatusPill variant={STATUS_LABEL[v.status].variant}>
                          {STATUS_LABEL[v.status].label}
                        </StatusPill>
                      </div>
                      <div className="mt-2">
                        <VendorMini vendor={v} bare />
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                All bookings, payments, reviews, documents and media from{' '}
                <span className="font-semibold">{loser?.businessName}</span> move to{' '}
                <span className="font-semibold">{survivor?.businessName}</span>. The
                duplicate record and its vendor login are then permanently deleted.
                This can’t be undone.
              </div>

              <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Type <span className="text-gray-900">{expectedName}</span> to confirm
              </label>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={expectedName}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#7E5896]/40 focus:ring-2 focus:ring-[#7E5896]/30"
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-6 py-3">
          {partner ? (
            <button data-opus-button="control"
              type="button"
              onClick={() => {
                setPartnerId(null)
                setConfirmName('')
                setError(null)
              }}
              disabled={pending}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button data-opus-button="control"
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            {partner && (
              <button data-opus-button="danger" data-opus-button-size="medium"
                type="button"
                onClick={submit}
                disabled={!canMerge}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Merging…
                  </>
                ) : (
                  <>
                    <GitMerge className="h-3.5 w-3.5" /> Merge &amp; delete duplicate
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VendorMini({
  vendor,
  bare = false,
}: {
  vendor: VendorAccount
  bare?: boolean
}) {
  return (
    <div
      className={
        bare
          ? 'flex items-center gap-3'
          : 'flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2'
      }
    >
      <VendorAvatar
        logoUrl={vendor.logoUrl}
        businessName={vendor.businessName}
        category={vendor.category}
        size={36}
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">
          {vendor.businessName}
        </p>
        <p className="truncate text-xs text-gray-500">
          {vendor.publicId} · {vendor.city || 'Location TBC'}
        </p>
      </div>
    </div>
  )
}
