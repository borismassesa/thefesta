'use server'

import { revalidatePath } from 'next/cache'
import {
  createClerkSupabaseServerClient,
  createSupabaseAdminClient,
} from '@/lib/supabase'
import { getCurrentVendor } from '@/lib/vendor'

// Shared types — kept minimal so editors can import from here directly
// without pulling in onboarding-draft types.

export type StorefrontTeamMember = {
  id?: string
  name: string
  role: string
  bio?: string
  avatar?: string
}

export type StorefrontFaq = {
  id?: string
  question: string
  answer: string
}

export type StorefrontHours = Record<
  'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
  { open: boolean; from: string; to: string }
>

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string; reason: 'unauth' | 'permission' | 'invalid' | 'unknown' }

// Exported so sibling storefront sections (e.g. products/actions.ts) reuse the
// same live-vendor guard instead of re-deriving it.
export async function ensureLiveVendor() {
  const state = await getCurrentVendor()
  if (state.kind !== 'live') {
    return {
      ok: false as const,
      error:
        state.kind === 'no-env'
          ? 'Configuration error — please contact support.'
          : state.kind === 'pending-approval'
            ? 'Your vendor application is awaiting OpusFesta verification.'
            : state.kind === 'suspended'
              ? 'Your vendor account is suspended. Contact OpusFesta support.'
              : "You haven't started a vendor application yet.",
      reason: 'unauth' as const,
    }
  }
  return { ok: true as const, vendorId: state.vendor.id }
}

function permissionResult(): SaveResult {
  return {
    ok: false,
    reason: 'permission',
    error: 'You need owner or manager role to edit this section.',
  }
}

function unknownResult(error: { code?: string; message?: string } | null): SaveResult {
  return {
    ok: false,
    reason: 'unknown',
    error: `[storefront] write failed${error?.code ? ` (${error.code})` : ''}: ${error?.message ?? 'unknown'}`,
  }
}

function isPermissionError(err: { code?: string; message?: string }): boolean {
  return err.code === '42501' || /permission denied/i.test(err.message ?? '')
}

// ----- Team --------------------------------------------------------------

export async function saveTeam(team: StorefrontTeamMember[]): Promise<SaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return guard

  // Drop empty entries — a team member with no name AND no role is a stub
  // from the form scaffold, not real data.
  const cleaned = team
    .filter((m) => (m.name && m.name.trim()) || (m.role && m.role.trim()))
    .map((m) => ({
      id: m.id || undefined,
      name: m.name?.trim() ?? '',
      role: m.role?.trim() ?? '',
      bio: m.bio?.trim() || undefined,
      avatar: m.avatar?.trim() || undefined,
    }))

  const supabase = await createClerkSupabaseServerClient()
  const { error } = await supabase
    .from('vendors')
    .update({ team: cleaned })
    .eq('id', guard.vendorId)
  if (error) {
    if (isPermissionError(error)) return permissionResult()
    return unknownResult(error)
  }
  revalidatePath('/storefront/team')
  return { ok: true }
}

// ----- FAQ ---------------------------------------------------------------

export async function saveFaqs(faqs: StorefrontFaq[]): Promise<SaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return guard

  const cleaned = faqs
    .filter((f) => f.question?.trim() && f.answer?.trim())
    .map((f) => ({
      id: f.id || undefined,
      question: f.question.trim(),
      answer: f.answer.trim(),
    }))

  const supabase = await createClerkSupabaseServerClient()
  const { error } = await supabase
    .from('vendors')
    .update({ faqs: cleaned })
    .eq('id', guard.vendorId)
  if (error) {
    if (isPermissionError(error)) return permissionResult()
    return unknownResult(error)
  }
  revalidatePath('/storefront/faq')
  return { ok: true }
}

// ----- Availability -------------------------------------------------------

export type StorefrontAvailabilityEntry = {
  date: string
  status: 'unavailable' | 'limited'
  note?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function saveAvailability(
  entries: StorefrontAvailabilityEntry[],
): Promise<SaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return guard

  // Keep only well-formed YYYY-MM-DD entries with a known status, de-duped by
  // date (last write wins) so a calendar double-tap can't store two rows for
  // one day. Sorted for a stable, reviewable column value.
  const byDate = new Map<string, StorefrontAvailabilityEntry>()
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e.date !== 'string' || !ISO_DATE.test(e.date)) continue
    if (e.status !== 'unavailable' && e.status !== 'limited') continue
    byDate.set(e.date, {
      date: e.date,
      status: e.status,
      ...(e.note?.trim() ? { note: e.note.trim().slice(0, 120) } : {}),
    })
  }
  const cleaned = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  const supabase = await createClerkSupabaseServerClient()
  const { error } = await supabase
    .from('vendors')
    .update({ availability: cleaned.length > 0 ? cleaned : null })
    .eq('id', guard.vendorId)
  if (error) {
    if (isPermissionError(error)) return permissionResult()
    return unknownResult(error)
  }
  revalidatePath('/storefront/availability')
  return { ok: true }
}

export async function loadAvailability(): Promise<
  { ok: true; entries: StorefrontAvailabilityEntry[] } | { ok: false }
> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .select('availability')
    .eq('id', guard.vendorId)
    .maybeSingle<{ availability: StorefrontAvailabilityEntry[] | null }>()
  if (error || !data) return { ok: false }
  const entries = Array.isArray(data.availability)
    ? data.availability.filter(
        (e): e is StorefrontAvailabilityEntry =>
          !!e &&
          typeof e.date === 'string' &&
          ISO_DATE.test(e.date) &&
          (e.status === 'unavailable' || e.status === 'limited'),
      )
    : []
  return { ok: true, entries }
}

// Read the vendor's saved business hours so the Availability editor can hydrate
// from the DB (source of truth) on a fresh device. The hours column is only
// ever written via saveProfileFields; without this load it would silently
// reset to client defaults whenever local storage was empty.
export async function loadBusinessHours(): Promise<
  { ok: true; hours: StorefrontHours | null } | { ok: false }
> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .select('hours')
    .eq('id', guard.vendorId)
    .maybeSingle<{ hours: StorefrontHours | null }>()
  if (error || !data) return { ok: false }
  return { ok: true, hours: data.hours ?? null }
}

// ----- Recognition (awards, response time, locally owned, languages) -----

export type StorefrontRecognition = {
  awards: string
  responseTimeHours: string
  locallyOwned: boolean
  languages: string[]
  awardCertificates: Array<Record<string, unknown>>
}

export async function saveRecognition(input: StorefrontRecognition): Promise<SaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return guard

  const supabase = await createClerkSupabaseServerClient()
  const { error } = await supabase
    .from('vendors')
    .update({
      awards: input.awards?.trim() || null,
      response_time_hours: input.responseTimeHours?.trim() || null,
      locally_owned: !!input.locallyOwned,
      languages:
        Array.isArray(input.languages) && input.languages.length > 0
          ? input.languages.filter((l) => typeof l === 'string' && l.trim() !== '')
          : null,
      award_certificates: Array.isArray(input.awardCertificates)
        ? input.awardCertificates
        : [],
    })
    .eq('id', guard.vendorId)
  if (error) {
    if (isPermissionError(error)) return permissionResult()
    return unknownResult(error)
  }
  revalidatePath('/storefront/recognition')
  return { ok: true }
}

// ----- Section reads (hydrate editors from DB) ---------------------------
//
// Team / FAQ / Recognition editors keep their working copy in the
// localStorage onboarding draft, but the source of truth is the vendors
// row. On a fresh device (or after clearing storage, or when an admin
// approved the vendor) the draft is empty, so the editor must pull the
// saved values back from the DB. These read actions power that hydration.
//
// We read through the service-role admin client for the same reason the
// photo/save actions do: when the Clerk 'supabase' JWT template isn't set,
// the Clerk-authed client falls back to anon and RLS returns zero rows,
// which would look like "no data" to the editor. `ensureLiveVendor` has
// already proven the caller owns `vendorId`, so scoping every read to that
// id is safe.

export async function loadFaqs(): Promise<
  { ok: true; faqs: StorefrontFaq[] } | { ok: false }
> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .select('faqs')
    .eq('id', guard.vendorId)
    .maybeSingle<{ faqs: StorefrontFaq[] | null }>()
  if (error || !data) return { ok: false }
  const faqs = Array.isArray(data.faqs)
    ? data.faqs.filter(
        (f): f is StorefrontFaq =>
          !!f && typeof f.question === 'string' && typeof f.answer === 'string',
      )
    : []
  return { ok: true, faqs }
}

export async function loadTeam(): Promise<
  { ok: true; team: StorefrontTeamMember[] } | { ok: false }
> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .select('team')
    .eq('id', guard.vendorId)
    .maybeSingle<{ team: StorefrontTeamMember[] | null }>()
  if (error || !data) return { ok: false }
  const team = Array.isArray(data.team)
    ? data.team.filter(
        (m): m is StorefrontTeamMember =>
          !!m && (typeof m.name === 'string' || typeof m.role === 'string'),
      )
    : []
  return { ok: true, team }
}

export async function loadRecognition(): Promise<
  { ok: true; data: StorefrontRecognition } | { ok: false }
> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('vendors')
    .select('awards, response_time_hours, locally_owned, languages, award_certificates')
    .eq('id', guard.vendorId)
    .maybeSingle<{
      awards: string | null
      response_time_hours: string | null
      locally_owned: boolean | null
      languages: string[] | null
      award_certificates: Array<Record<string, unknown>> | null
    }>()
  if (error || !data) return { ok: false }
  return {
    ok: true,
    data: {
      awards: data.awards ?? '',
      responseTimeHours: data.response_time_hours ?? '',
      locallyOwned: !!data.locally_owned,
      languages: Array.isArray(data.languages) ? data.languages : [],
      awardCertificates: Array.isArray(data.award_certificates)
        ? data.award_certificates
        : [],
    },
  }
}

// ----- Photo uploads -----------------------------------------------------
//
// Uploads land in the existing `vendor-portfolios` Supabase Storage bucket
// (public, 10MB, JPEG/PNG/WebP). We use the service-role admin client so the
// upload doesn't depend on the Clerk-JWT-sub matching the storage policy
// folder convention — the action itself enforces that the uploader is the
// vendor's owner via getCurrentVendor() before writing.
//
// The path convention is `{vendorId}/storefront/{kind}/{timestamp}.{ext}`
// so admin can identify which vendor owns a file at a glance, and so cover
// photos can be replaced without orphaning gallery entries.

export type UploadKind = 'cover' | 'gallery' | 'avatar' | 'logo' | 'products'
export type UploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string; reason: 'unauth' | 'invalid' | 'unknown' }

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])
// Post-compression safety net. compressImage() reliably produces files
// under ~2 MB; this cap exists for the rare case where compression
// can't help (already-small WebP, unusual aspect ratio). Raised from
// 10 MB to 25 MB to match the vendor-portfolios Supabase bucket limit
// on the Pro tier — keeps client and bucket in sync.
const MAX_BYTES = 25 * 1024 * 1024

export async function uploadStorefrontPhoto(
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get('file')
  const kindRaw = formData.get('kind')
  if (!(file instanceof File)) {
    return { ok: false, reason: 'invalid', error: 'No file in upload payload.' }
  }
  if (
    kindRaw !== 'cover' &&
    kindRaw !== 'gallery' &&
    kindRaw !== 'avatar' &&
    kindRaw !== 'logo' &&
    kindRaw !== 'products'
  ) {
    return { ok: false, reason: 'invalid', error: 'Unknown upload kind.' }
  }
  const kind = kindRaw as UploadKind
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Only JPEG, PNG, or WebP images are allowed.',
    }
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      reason: 'invalid',
      error: `File is over the 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    }
  }

  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, reason: 'unauth', error: guard.error }

  const ext = (() => {
    if (file.type === 'image/jpeg') return 'jpg'
    if (file.type === 'image/png') return 'png'
    if (file.type === 'image/webp') return 'webp'
    return 'bin'
  })()
  const path = `${guard.vendorId}/storefront/${kind}/${Date.now()}.${ext}`

  const admin = createSupabaseAdminClient()
  const buf = Buffer.from(await file.arrayBuffer())
  const upload = await admin.storage.from('vendor-portfolios').upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (upload.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[storefront] upload failed: ${upload.error.message}`,
    }
  }
  const publicUrl = admin.storage.from('vendor-portfolios').getPublicUrl(path)
  return { ok: true, url: publicUrl.data.publicUrl, path }
}

// ----- Video uploads -----------------------------------------------------
//
// Videos can't ride server actions: Vercel caps action request bodies at
// ~1 MB and even a tightly-compressed 30 s wedding reel is 30-50 MB. So we
// mint a signed *upload* URL pointing at the vendor-portfolios bucket and
// have the browser PUT the file directly to Supabase Storage. The action
// itself never touches the bytes.
//
// Server-side we still enforce auth (must be a live vendor) and clamp the
// MIME type to a known-safe whitelist before issuing the URL.

const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const VIDEO_MAX_BYTES = 500 * 1024 * 1024 // 500 MB — matches bucket cap

export type VideoUploadUrlResult =
  | {
      ok: true
      // PUT the file body to `uploadUrl` with `Content-Type: <mimeType>`.
      uploadUrl: string
      token: string
      // After the PUT succeeds the public URL is stable — store this.
      publicUrl: string
      path: string
    }
  | { ok: false; error: string; reason: 'unauth' | 'invalid' | 'unknown' }

export async function createStorefrontVideoUploadUrl(input: {
  filename: string
  mimeType: string
  sizeBytes: number
}): Promise<VideoUploadUrlResult> {
  if (!VIDEO_MIME.has(input.mimeType)) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'Only MP4, WebM, or MOV video files are allowed.',
    }
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, reason: 'invalid', error: 'Missing file size.' }
  }
  if (input.sizeBytes > VIDEO_MAX_BYTES) {
    return {
      ok: false,
      reason: 'invalid',
      error: `${input.filename}: video is over the 500 MB limit (${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB).`,
    }
  }

  const guard = await ensureLiveVendor()
  if (!guard.ok) return { ok: false, reason: 'unauth', error: guard.error }

  const ext = (() => {
    if (input.mimeType === 'video/mp4') return 'mp4'
    if (input.mimeType === 'video/webm') return 'webm'
    if (input.mimeType === 'video/quicktime') return 'mov'
    return 'bin'
  })()
  const path = `${guard.vendorId}/storefront/video/${Date.now()}.${ext}`

  const admin = createSupabaseAdminClient()
  const signed = await admin.storage
    .from('vendor-portfolios')
    .createSignedUploadUrl(path)
  if (signed.error || !signed.data) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[storefront] signed upload URL failed: ${signed.error?.message ?? 'unknown'}`,
    }
  }
  const publicUrl = admin.storage.from('vendor-portfolios').getPublicUrl(path)
  return {
    ok: true,
    uploadUrl: signed.data.signedUrl,
    token: signed.data.token,
    publicUrl: publicUrl.data.publicUrl,
    path,
  }
}

// ----- Photos (cover image + gallery + videos) ---------------------------

export type StorefrontPhotos = {
  coverImage: string | null
  galleryUrls: string[]
  videoUrls?: string[]
}

export async function savePhotos(input: StorefrontPhotos): Promise<SaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return guard

  // Reject non-http URLs at the boundary so the public page doesn't render
  // a data: or javascript: scheme by accident.
  const cleanedGallery = (input.galleryUrls ?? [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => /^https?:\/\//i.test(u))
  const cleanedVideos = (input.videoUrls ?? [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => /^https?:\/\//i.test(u))
  const cover = input.coverImage?.trim()
  const coverValid = cover && /^https?:\/\//i.test(cover) ? cover : null

  // Use the service-role admin client for the UPDATE. `ensureLiveVendor`
  // has already validated that the authenticated user owns `vendorId`
  // (it reads via the admin client too), so scoping the UPDATE to that
  // specific id is safe. The Clerk-authed client falls back to an
  // unauthenticated client when the 'supabase' JWT template isn't set —
  // RLS then matches 0 rows and the UPDATE silently no-ops with
  // error: null, which is the worst possible outcome for a save action.
  const admin = createSupabaseAdminClient()
  // Two-step update: try with `video_urls`; if PostgREST reports the column
  // doesn't exist yet (migration 20260512000010 not applied), drop the
  // field and retry so vendors can still save photos in environments
  // where the schema is behind.
  const baseUpdate: Record<string, unknown> = {
    cover_image: coverValid,
    gallery_urls: cleanedGallery.length > 0 ? cleanedGallery : null,
  }
  let { data, error } = await admin
    .from('vendors')
    .update({
      ...baseUpdate,
      video_urls: cleanedVideos.length > 0 ? cleanedVideos : null,
    })
    .eq('id', guard.vendorId)
    .select('id')
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    const retry = await admin
      .from('vendors')
      .update(baseUpdate)
      .eq('id', guard.vendorId)
      .select('id')
    error = retry.error
    data = retry.data
    if (!error && cleanedVideos.length > 0) {
      console.warn(
        '[storefront] video_urls column missing — videos were not persisted. Apply migration 20260512000010.',
      )
    }
  }
  if (error) {
    if (isPermissionError(error)) return permissionResult()
    return unknownResult(error)
  }
  // Defensive: if the UPDATE matched 0 rows despite no error, that means
  // the vendor row vanished between the ensureLiveVendor check and this
  // update — surface it instead of pretending the save worked.
  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: 'unknown',
      error: '[storefront] save matched no rows — vendor record may have been deleted.',
    }
  }
  revalidatePath('/storefront/photos')
  return { ok: true }
}

// ----- Photos (read for hydration) ---------------------------------------

export type StorefrontPhotosState = {
  coverImage: string | null
  galleryUrls: string[]
  videoUrls: string[]
}

export type LoadPhotosResult =
  | { ok: true; data: StorefrontPhotosState }
  | { ok: false; error: string; reason: 'unauth' | 'unknown' }

export async function loadStorefrontPhotos(): Promise<LoadPhotosResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok)
    return { ok: false, reason: 'unauth', error: guard.error }

  const admin = createSupabaseAdminClient()
  // Try the full projection first; fall back without video_urls if the
  // column hasn't been migrated yet.
  let cover: string | null = null
  let gallery: string[] = []
  let videos: string[] = []
  const full = await admin
    .from('vendors')
    .select('cover_image, gallery_urls, video_urls')
    .eq('id', guard.vendorId)
    .maybeSingle<{
      cover_image: string | null
      gallery_urls: string[] | null
      video_urls: string[] | null
    }>()
  if (full.error && (full.error.code === '42703' || full.error.code === 'PGRST204')) {
    const fallback = await admin
      .from('vendors')
      .select('cover_image, gallery_urls')
      .eq('id', guard.vendorId)
      .maybeSingle<{
        cover_image: string | null
        gallery_urls: string[] | null
      }>()
    if (fallback.error) {
      return {
        ok: false,
        reason: 'unknown',
        error: `[storefront] photos load failed: ${fallback.error.code} ${fallback.error.message}`,
      }
    }
    cover = fallback.data?.cover_image ?? null
    gallery = fallback.data?.gallery_urls ?? []
  } else if (full.error) {
    return {
      ok: false,
      reason: 'unknown',
      error: `[storefront] photos load failed: ${full.error.code} ${full.error.message}`,
    }
  } else {
    cover = full.data?.cover_image ?? null
    gallery = full.data?.gallery_urls ?? []
    videos = full.data?.video_urls ?? []
  }
  return {
    ok: true,
    data: { coverImage: cover, galleryUrls: gallery, videoUrls: videos },
  }
}

// ----- Hours, style, personality, markets, booking policies --------------
//
// Every field below is a first-class part of the storefront — they're
// grouped here only because they share the Profile editor surface, not
// because any of them is optional.

export type StorefrontProfileFields = {
  hours?: StorefrontHours
  // Public URL of the vendor's logo / profile picture (vendors.logo).
  logo?: string | null
  style?: string | null
  personality?: string | null
  homeMarket?: string | null
  serviceMarkets?: string[]
  // Languages the vendor speaks with clients. Until now only saveRecognition
  // wrote this, which left the About page's language picker stuck on local
  // draft despite a perfectly good vendors.languages column existing.
  languages?: string[]
  depositPercent?: string | null
  cancellationLevel?: 'flexible' | 'moderate' | 'strict' | null
  reschedulePolicy?: 'one-free' | 'unlimited' | 'none' | null
  parallelBookingCapacity?: number | null
  // Capacity + map coordinates — fields that previously only the admin could
  // fill (via AdminFillableFields). The vendor portal now owns them too.
  capacityMin?: number | null
  capacityMax?: number | null
  lat?: number | null
  lng?: number | null
}

export async function saveProfileFields(input: StorefrontProfileFields): Promise<SaveResult> {
  const guard = await ensureLiveVendor()
  if (!guard.ok) return guard

  const update: Record<string, unknown> = {}
  if (input.hours !== undefined) update.hours = input.hours
  if (input.logo !== undefined) update.logo = input.logo?.trim() || null
  if (input.style !== undefined) update.style = input.style
  if (input.personality !== undefined) update.personality = input.personality
  if (input.homeMarket !== undefined) update.home_market = input.homeMarket
  if (input.serviceMarkets !== undefined) update.service_markets = input.serviceMarkets
  if (input.languages !== undefined) {
    const cleaned = Array.isArray(input.languages)
      ? input.languages.filter((l) => typeof l === 'string' && l.trim() !== '')
      : []
    update.languages = cleaned.length > 0 ? cleaned : null
  }
  if (input.depositPercent !== undefined) update.deposit_percent = input.depositPercent
  if (input.cancellationLevel !== undefined) update.cancellation_level = input.cancellationLevel
  if (input.reschedulePolicy !== undefined) update.reschedule_policy = input.reschedulePolicy
  if (input.parallelBookingCapacity !== undefined) {
    update.parallel_booking_capacity = input.parallelBookingCapacity
  }
  if (input.capacityMin !== undefined || input.capacityMax !== undefined) {
    if (input.capacityMin == null && input.capacityMax == null) {
      update.capacity = null
    } else {
      const min = input.capacityMin ?? 0
      const max = input.capacityMax ?? input.capacityMin ?? 0
      if (max < min) {
        return {
          ok: false,
          reason: 'invalid',
          error: 'Max capacity must be at least the minimum.',
        }
      }
      update.capacity = { min, max }
    }
  }
  if (input.lat !== undefined) {
    if (input.lat != null && (input.lat < -90 || input.lat > 90)) {
      return {
        ok: false,
        reason: 'invalid',
        error: 'Latitude must be between -90 and 90.',
      }
    }
    update.lat = input.lat
  }
  if (input.lng !== undefined) {
    if (input.lng != null && (input.lng < -180 || input.lng > 180)) {
      return {
        ok: false,
        reason: 'invalid',
        error: 'Longitude must be between -180 and 180.',
      }
    }
    update.lng = input.lng
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, reason: 'invalid', error: 'No fields to update.' }
  }

  const supabase = await createClerkSupabaseServerClient()
  const { data, error } = await supabase
    .from('vendors')
    .update(update)
    .eq('id', guard.vendorId)
    .select('id')
  if (error) {
    if (isPermissionError(error)) return permissionResult()
    return unknownResult(error)
  }
  // Defensive: a 0-row UPDATE with no error means the write was blocked (RLS) or
  // the vendor row vanished between the guard check and this update — surface it
  // instead of pretending the save worked. (Same guard as savePhotos/saveProfile.)
  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: 'unknown',
      error: '[storefront] save matched no rows — vendor record may have been deleted.',
    }
  }
  // Both editors persist via this action: About (bio/contact/socials/…) and
  // Packages (booking policies). Revalidate both so either page reflects the
  // write immediately.
  revalidatePath('/storefront/about')
  revalidatePath('/storefront/packages')
  return { ok: true }
}
