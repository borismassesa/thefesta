'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useActiveVendorId } from './active-vendor-context'
import type { PackageDraft } from './packages'
import type { VendorVertical } from './verticals'
import {
  emptyPayoutEntry,
  hasCompletePayout,
  isPayoutEntryComplete,
  newPayoutEntryId,
  primaryPayoutEntry,
  type PayoutEntry,
  type PayoutMethod,
} from './payout'

// The pure payout helpers/types live in the (non-client) ./payout module so
// server code can use them without crossing the client boundary. Re-export them
// here so existing importers of '@/lib/onboarding/draft' keep working.
export {
  emptyPayoutEntry,
  hasCompletePayout,
  isPayoutEntryComplete,
  newPayoutEntryId,
  primaryPayoutEntry,
}
export type { PayoutEntry, PayoutMethod }

export type DayHours = {
  open: boolean
  from: string
  to: string
}

export type BusinessHours = {
  mon: DayHours
  tue: DayHours
  wed: DayHours
  thu: DayHours
  fri: DayHours
  sat: DayHours
  sun: DayHours
}

export type SocialLinks = {
  website: string
  instagram: string
  facebook: string
  tiktok: string
  whatsapp: string
}

export type FAQItem = {
  id: string
  question: string
  answer: string
}

export type TeamMember = {
  id: string
  name: string
  role: string
  bio: string
  // Transient preview only: a `blob:` URL from URL.createObjectURL, shown while
  // the file uploads. Never persisted (resolves only in the current tab).
  avatarUrl?: string
  // Persisted public URL of the uploaded avatar (vendor-portfolios bucket).
  // This is what's saved to vendors.team and shown on admin + the public
  // storefront. Set once the upload in the team editor returns.
  avatar?: string
}

// The Availability tab represents the vendor's *operating* posture (when they
// can work) — booking entries themselves live in the Bookings module so the
// two responsibilities don't bleed into each other.
// `unavailable` = fully booked / off (shown red on the public calendar);
// `limited` = still bookable but tight (shown amber).
export type AvailabilityStatus = 'unavailable' | 'limited'

export type AvailabilityDate = {
  // Local date in YYYY-MM-DD form. Times-of-day aren't needed at this layer.
  date: string
  status: AvailabilityStatus
  // Free-text context — vacation, training, personal leave.
  note?: string
}

export type AwardCertStatus = 'pending' | 'verified' | 'needs_info' | 'rejected'

export type AwardCertificate = {
  id: string
  title: string
  issuer: string
  year: string
  fileName: string
  status: AwardCertStatus
  // Reviewer message — populated for needs_info / rejected, optional for others.
  notes?: string
  submittedAt: string
  verifiedAt?: string | null
}

export type CancellationLevel = 'flexible' | 'moderate' | 'strict' | null
export type ReschedulePolicy = 'one-free' | 'unlimited' | 'none' | null

export type OnboardingDraft = {
  // The first fork in the wizard: wedding service vs gift shop vs attire &
  // rings. Decides which categories are offered, which steps are asked, and
  // which public surface the vendor lands on. Null until the vendor chooses.
  vertical: VendorVertical | null
  categoryId: string | null
  customCategoryLabel: string
  vowsAccepted: boolean
  firstName: string
  lastName: string
  businessName: string
  // Public URL of the vendor's logo / profile picture (vendor-portfolios
  // bucket). Captured in onboarding and editable in the storefront; persisted
  // to vendors.logo and shown on admin + the public storefront.
  logo: string
  // Tanzania administrative address (Region › District › Ward › Street/Village).
  houseNumber: string // House / Plot number
  street: string // Street / Village (Mtaa / Kijiji)
  ward: string // Ward (Kata)
  district: string // District (Wilaya)
  region: string // Region (Mkoa) — TZ_REGIONS code
  landmark: string // Landmark / directions (Alama ya kujulikana) — optional
  postalCode: string // P.O. Box / Postal code — optional
  phone: string
  email: string
  whatsapp: string
  homeMarket: string | null
  serviceMarkets: string[]
  bio: string
  description: string
  yearsInBusiness: string
  languages: string[]
  specialServices: string[]
  customServices: string[]
  style: string | null
  personality: string | null
  packages: PackageDraft[]
  startingPrice: string
  customQuotes: boolean
  depositPercent: string
  cancellationLevel: CancellationLevel
  reschedulePolicy: ReschedulePolicy
  payoutMethods: PayoutEntry[]
  hours: BusinessHours
  socials: SocialLinks
  awards: string
  locallyOwned: boolean
  responseTimeHours: string
  faqs: FAQItem[]
  team: TeamMember[]
  availability: AvailabilityDate[]
  // How many bookings the vendor's team can run in parallel on the same day.
  // Solo operators leave this at 1 — venues / multi-team studios bump it up.
  parallelBookingCapacity: number
  awardCertificates: AwardCertificate[]
  // Photos and videos themselves are large blobs we don't want in localStorage
  // — the editor keeps the content in component state and reports back the
  // counts so the storefront sidebar can show progress for the section.
  photoCount: number
  videoCount: number
  // Cover slots are fixed at 4 (3 landscape + 1 portrait). We mirror the
  // filled-slot count here so the storefront sidebar can grade completion
  // without persisting the (often blob-URL) image data itself.
  coverPhotoCount: number
  submittedAt: string | null
}

const defaultHours = (open: boolean, from = '09:00', to = '18:00'): DayHours => ({ open, from, to })

const DEFAULT_HOURS: BusinessHours = {
  mon: defaultHours(true),
  tue: defaultHours(true),
  wed: defaultHours(true),
  thu: defaultHours(true),
  fri: defaultHours(true),
  sat: defaultHours(true, '10:00', '20:00'),
  sun: defaultHours(false),
}

const DEFAULT_SOCIALS: SocialLinks = {
  website: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  whatsapp: '',
}

// Per-(user, vendor) storage. The draft first lived under a single global key,
// which leaked a previous vendor's draft into the next vendor's form on a
// SHARED device. Scoping to the Clerk user id closed that. But one user can own
// SEVERAL vendor businesses (one profile per category — see the multi-category
// model + `of-active-vendor` cookie), and a user-only key let business A's
// draft-only fields (booking policies, languages, style, service markets,
// hours) bleed into business B's storefront editors after switching — and worse,
// a Save would then write A's values onto B's columns. We now scope the key to
// the ACTIVE vendor id so each business reads and writes its own draft.
const STORAGE_PREFIX = 'opusfesta:vendor-onboarding-draft'

// The earliest un-scoped global key. It may hold a *different* vendor's data, so
// we never inherit it — we delete it on load (see `useOnboardingDraft`).
const LEGACY_GLOBAL_KEY = STORAGE_PREFIX

// The per-USER key used before drafts were scoped to the active vendor. A given
// user is in exactly one state when this ships (mid-onboarding, or editing one
// existing business), so on first read we migrate this draft into whichever
// slot we resolved (the active vendor, or 'onboarding') and then remove it.
function legacyUserKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`
}

// While a brand-new application is being filled there is no vendor row yet, so
// the draft lives in this shared slot. At submit we copy it into the freshly
// created vendor's slot (see `claimDraftForVendor` / `claimForVendor`) so the
// storefront editors — which read the active-vendor slot — show the onboarding
// answers instead of blanks.
const ONBOARDING_SLOT = 'onboarding'

function storageKey(userId: string, slot: string): string {
  return `${STORAGE_PREFIX}:${userId}:${slot}`
}

const EMPTY: OnboardingDraft = {
  vertical: null,
  categoryId: null,
  customCategoryLabel: '',
  vowsAccepted: false,
  firstName: '',
  lastName: '',
  businessName: '',
  logo: '',
  houseNumber: '',
  street: '',
  ward: '',
  district: '',
  region: '',
  landmark: '',
  postalCode: '',
  phone: '',
  email: '',
  whatsapp: '',
  homeMarket: null,
  serviceMarkets: [],
  bio: '',
  description: '',
  yearsInBusiness: '',
  languages: [],
  specialServices: [],
  customServices: [],
  style: null,
  personality: null,
  packages: [],
  startingPrice: '',
  customQuotes: false,
  depositPercent: '30',
  cancellationLevel: null,
  reschedulePolicy: null,
  payoutMethods: [],
  hours: DEFAULT_HOURS,
  socials: DEFAULT_SOCIALS,
  awards: '',
  locallyOwned: false,
  responseTimeHours: '',
  faqs: [],
  team: [],
  availability: [],
  parallelBookingCapacity: 1,
  awardCertificates: [],
  photoCount: 0,
  videoCount: 0,
  coverPhotoCount: 0,
  submittedAt: null,
}

// Legacy single-payout fields stored by drafts created before multi-payout
// support. Read off the raw JSON so we can migrate them into the new array.
type LegacyPayoutShape = {
  payoutMethod?: PayoutMethod
  payoutNumber?: string
  payoutAccountName?: string
  payoutBankName?: string
  payoutNetwork?: string
}

// Legacy address fields stored by drafts created before the Tanzania
// administrative address model (city/street2 → district/houseNumber).
type LegacyAddressShape = {
  city?: string
  street2?: string
}

function readDraft(userId: string | null, slot: string): OnboardingDraft {
  if (typeof window === 'undefined' || !userId) return EMPTY
  try {
    const key = storageKey(userId, slot)
    let raw = window.localStorage.getItem(key)
    // One-time migration: adopt the pre-vendor-scoping per-user draft into the
    // slot we resolved on this page (the active vendor, or 'onboarding'). A
    // user is in exactly one state when this ships, so the legacy draft lands
    // in the right slot. Remove it afterwards so it can't be claimed twice.
    if (raw === null) {
      const legacy = window.localStorage.getItem(legacyUserKey(userId))
      if (legacy !== null) {
        window.localStorage.setItem(key, legacy)
        window.localStorage.removeItem(legacyUserKey(userId))
        raw = legacy
      }
    }
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft> &
      LegacyPayoutShape &
      LegacyAddressShape
    const merged = { ...EMPTY, ...parsed }
    // Migrate a legacy address into the Tanzania administrative model so drafts
    // started before the address change keep their locality and aren't bounced
    // back to re-enter it (the contact/Stepper gates now key off `district`).
    if (!merged.district.trim() && parsed.city?.trim()) {
      merged.district = parsed.city.trim()
    }
    if (!merged.houseNumber.trim() && parsed.street2?.trim()) {
      merged.houseNumber = parsed.street2.trim()
    }
    // Migrate a legacy single payout method into the array so drafts started
    // before multi-payout don't lose what the vendor already entered.
    if (merged.payoutMethods.length === 0 && parsed.payoutMethod) {
      merged.payoutMethods = [
        {
          id: newPayoutEntryId(),
          method: parsed.payoutMethod,
          number: parsed.payoutNumber ?? '',
          accountName: parsed.payoutAccountName ?? '',
          bankName: parsed.payoutBankName ?? '',
          network: parsed.payoutNetwork ?? '',
          primary: true,
        },
      ]
    }
    return merged
  } catch {
    return EMPTY
  }
}

// Internal broadcast — `useOnboardingDraft` is invoked independently by
// multiple components (the storefront sidebar, the section editors, the
// header completion meter) and each call owns its own `useState` copy.
// Without this event, one component's `update()` only refreshes its own
// copy: the sidebar keeps showing "needs more work" even after the photos
// page has marked everything complete. We dispatch a custom event on every
// write so every instance re-reads from localStorage.
//
// The detail carries the FULL storage key the write targeted, so a listener
// only adopts the payload when it's reading that same key. Without this guard a
// write to business A's slot would also overwrite a business-B instance's state
// if both are mounted at once (two tabs, or a transient navigation overlap).
const DRAFT_CHANGE_EVENT = 'opusfesta:onboarding-draft-changed'

type DraftChangeDetail = { key: string; draft: OnboardingDraft }

function writeDraft(userId: string | null, slot: string, draft: OnboardingDraft) {
  if (typeof window === 'undefined' || !userId) return
  try {
    const key = storageKey(userId, slot)
    window.localStorage.setItem(key, JSON.stringify(draft))
    // Defer the cross-instance broadcast. `writeDraft` is called from
    // inside the `setDraft` state updater in `update()` — dispatching
    // synchronously would call listeners' setState during the calling
    // component's render/commit phase, which React warns about as a
    // cross-component setState-in-render. A microtask runs after the
    // current updater returns but before paint, so the sidebar still
    // refreshes in the same tick.
    queueMicrotask(() => {
      window.dispatchEvent(
        new CustomEvent<DraftChangeDetail>(DRAFT_CHANGE_EVENT, {
          detail: { key, draft },
        }),
      )
    })
  } catch {
    // ignore quota / private browsing errors — UX still works in-memory
  }
}

// Copy a draft into a specific vendor's slot WITHOUT broadcasting. Used at
// submit time to hand the freshly-filled onboarding draft to the new vendor's
// slot: no mounted consumer is reading that slot yet (the wizard is still on the
// 'onboarding' slot), so there's nothing to notify.
function claimDraftForVendor(
  userId: string | null,
  vendorId: string,
  draft: OnboardingDraft,
) {
  if (typeof window === 'undefined' || !userId || !vendorId) return
  try {
    window.localStorage.setItem(
      storageKey(userId, vendorId),
      JSON.stringify(draft),
    )
  } catch {
    // ignore quota / private browsing errors
  }
}

export function useOnboardingDraft() {
  // The draft is keyed to the signed-in user AND the active vendor business, so
  // we must wait for Clerk to resolve the user before reading — otherwise we'd
  // read EMPTY (or, worse, the wrong key) and flash stale UI.
  const { isLoaded, userId: clerkUserId } = useAuth()
  const userId = clerkUserId ?? null
  // The active vendor id comes from the (portal) server layout via context.
  // It's null in the onboarding wizard (no vendor row yet) and the no-env dev
  // fallback, where the draft uses the shared 'onboarding' slot.
  const activeVendorId = useActiveVendorId()
  const slot = activeVendorId ?? ONBOARDING_SLOT
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!isLoaded) return

    // One-time purge of the earliest un-scoped global key. It may belong to a
    // *different* vendor who used this device before, so we never read it into
    // the form — we delete it outright.
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LEGACY_GLOBAL_KEY)
    }

    setDraft(readDraft(userId, slot))
    setHydrated(true)

    if (!userId) return

    // Listen for cross-instance updates so every consumer of the hook
    // converges on the latest persisted draft. Same-tab updates come
    // through the custom event; cross-tab updates use the native
    // `storage` event (scoped to THIS user+vendor's key). Every consumer in a
    // given route tree resolves the same slot, so the broadcast detail always
    // matches the slot they're reading.
    const key = storageKey(userId, slot)
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<DraftChangeDetail>).detail
      // Only adopt a broadcast that targeted THIS instance's key — a write to a
      // different (user, vendor) slot must not clobber our state.
      if (!detail || detail.key !== key) return
      setDraft(detail.draft)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setDraft(readDraft(userId, slot))
    }
    window.addEventListener(DRAFT_CHANGE_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(DRAFT_CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [isLoaded, userId, slot])

  const update = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch }
        writeDraft(userId, slot, next)
        return next
      })
    },
    [userId, slot],
  )

  const reset = useCallback(() => {
    setDraft(EMPTY)
    if (typeof window !== 'undefined' && userId) {
      const key = storageKey(userId, slot)
      window.localStorage.removeItem(key)
      window.dispatchEvent(
        new CustomEvent<DraftChangeDetail>(DRAFT_CHANGE_EVENT, {
          detail: { key, draft: EMPTY },
        }),
      )
    }
  }, [userId, slot])

  // Hand the just-submitted onboarding draft to the new vendor's slot so the
  // storefront editors (which read the active-vendor slot) show the onboarding
  // answers. Optionally stamps a patch (e.g. submittedAt) first. We do NOT clear
  // the current ('onboarding') slot — a vendor sent back to /verify can still
  // re-open the wizard with their answers intact; a future "add another
  // business" entry point should call `reset()` to start a clean draft.
  const claimForVendor = useCallback(
    (vendorId: string, patch?: Partial<OnboardingDraft>) => {
      if (!userId) return
      setDraft((prev) => {
        const next = patch ? { ...prev, ...patch } : prev
        writeDraft(userId, slot, next)
        claimDraftForVendor(userId, vendorId, next)
        return next
      })
    },
    [userId, slot],
  )

  return { draft, update, reset, hydrated, claimForVendor }
}

export function clearOnboardingDraft(userId?: string) {
  if (typeof window === 'undefined') return
  // Always drop the earliest global key. When we know the user, drop every
  // per-(user, slot) draft and the legacy per-user key too.
  window.localStorage.removeItem(LEGACY_GLOBAL_KEY)
  if (!userId) return
  window.localStorage.removeItem(legacyUserKey(userId))
  const prefix = `${STORAGE_PREFIX}:${userId}:`
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const key = window.localStorage.key(i)
    if (key && key.startsWith(prefix)) window.localStorage.removeItem(key)
  }
}
