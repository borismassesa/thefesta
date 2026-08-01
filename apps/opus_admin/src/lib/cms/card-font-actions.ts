'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { normaliseFontKey } from '@opusfesta/lib'
import { requireAdminRole, type AdminAccessRole } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { parseFontFile } from '@/lib/cms/font-metadata'

const BUCKET = 'card-fonts'
const LIST_PATH = '/opus-pass/digital-cards/templates'

/**
 * The font library needs a table and a storage bucket that only exist once
 * supabase/migrations/20260730120000_card_fonts.sql has been applied.
 *
 * Until then Supabase answers with 'The related resource does not exist' and
 * PostgREST with 42P01, neither of which means anything to an admin. Worse,
 * uploading a folder produced that same sentence once per file, so a single
 * unapplied migration read as fifteen separate mysterious failures. Detect it
 * once and say the one useful thing instead.
 */
const SETUP_REQUIRED =
  'The font library is not set up on this environment yet. Apply the card_fonts migration (supabase/migrations/20260730120000_card_fonts.sql), which creates the card-fonts storage bucket and its tables.'

// The same missing schema is reported four different ways depending on which
// layer notices it first, and none of the four says what to do:
//
//   PostgREST cache   PGRST205  "Could not find the table 'public.card_fonts'
//                                in the schema cache"
//   Postgres direct   42P01     "relation ... does not exist"
//   Storage           404       "The related resource does not exist"
//
// Matching all of them is the point: a check that covers only one leaks the
// raw string for the others, which is the bug this replaced.
function isMissingLibrary(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const message = (error.message ?? '').toLowerCase()
  const code = error.code ?? ''
  return (
    code === '42P01' ||
    code.startsWith('PGRST20') ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('related resource does not exist') ||
    message.includes('does not exist') ||
    message.includes('bucket not found')
  )
}

// Registering a font is catalogue work, same as mapping a card's layers.
const FONT_UPLOAD_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']
// Attesting a licence is not. It is a commercial claim about what we are
// permitted to ship, so it sits with the same roles that can upload an SVG.
const LICENCE_ROLES: AdminAccessRole[] = ['owner', 'admin']

const MAX_BYTES = 20 * 1024 * 1024 // matches the bucket's file_size_limit

export type LicenceStatus =
  | 'unknown'
  | 'open'
  | 'webfont_licensed'
  | 'desktop_only'
  | 'blocked'

const LICENCE_STATUSES: LicenceStatus[] = [
  'unknown',
  'open',
  'webfont_licensed',
  'desktop_only',
  'blocked',
]

export type CardFontRow = {
  id: string
  storage_path: string
  original_filename: string
  size_bytes: number
  format: string
  family_name: string
  subfamily_name: string
  full_name: string
  postscript_name: string
  weight_class: number
  is_italic: boolean
  glyph_count: number
  match_keys: string[]
  fs_type_no_embedding: boolean
  fs_type_view_only: boolean
  licence_status: LicenceStatus
  licence_note: string
  embeddable: boolean
  created_at: string
}

/** Keep a designer's filename recognisable without letting it steer the path. */
function safeFilename(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 80)
  return cleaned || 'font'
}

export type CardFontLibrary = {
  fonts: CardFontRow[]
  /** Set when the library's own schema is missing, not when it is merely empty. */
  setupError: string | null
}

/**
 * Read the library, distinguishing "empty" from "not installed".
 *
 * Those two states look identical to a caller that only gets an array back,
 * and they need opposite responses: one means upload some fonts, the other
 * means run a migration.
 */
export async function listCardFonts(): Promise<CardFontLibrary> {
  await requireAdminRole(FONT_UPLOAD_ROLES)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('card_fonts')
    .select(
      'id, storage_path, original_filename, size_bytes, format, family_name, subfamily_name, full_name, postscript_name, weight_class, is_italic, glyph_count, match_keys, fs_type_no_embedding, fs_type_view_only, licence_status, licence_note, embeddable, created_at',
    )
    .order('family_name', { ascending: true })
    .order('weight_class', { ascending: true })

  if (error) {
    return { fonts: [], setupError: isMissingLibrary(error) ? SETUP_REQUIRED : error.message }
  }
  return { fonts: (data ?? []) as CardFontRow[], setupError: null }
}

export type MintResult =
  | { ok: true; uploadUrl: string; path: string }
  | { ok: false; error: string }

/**
 * Mint a signed URL so the browser can PUT the font straight to Storage.
 *
 * Separate from `createCmsMediaUploadUrl`, which is hardwired to the public
 * website-media bucket and to image/video MIME gating. Fonts go to a private
 * bucket and are validated by magic bytes rather than by MIME, so contorting
 * that helper would make both harder to read.
 */
export async function createCardFontUploadUrl(input: {
  filename: string
  sizeBytes: number
}): Promise<MintResult> {
  await requireAdminRole(FONT_UPLOAD_ROLES)

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'Empty file.' }
  }
  if (input.sizeBytes > MAX_BYTES) {
    return { ok: false, error: `Too large (${Math.round(input.sizeBytes / 1e6)} MB, limit 20 MB).` }
  }

  // Deliberately not derived from the declared MIME type: browsers report .otf
  // and .ttf inconsistently, so the extension here is cosmetic and the real
  // format is read from the bytes at registration.
  const path = `${Date.now()}-${crypto.randomUUID()}-${safeFilename(input.filename)}`

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return {
      ok: false,
      error: isMissingLibrary(error) ? SETUP_REQUIRED : error?.message || 'Could not start the upload.',
    }
  }
  return { ok: true, uploadUrl: data.signedUrl, path }
}

export type RegisterResult =
  | { ok: true; id: string; label: string; duplicate: boolean }
  | { ok: false; error: string }

/**
 * Read an uploaded font and file it in the library.
 *
 * This is a SECOND step rather than part of the upload because the signed-URL
 * pattern sends bytes browser-to-Storage directly: the server never sees the
 * file at upload time, so it has to fetch it back to parse it.
 *
 * Every failure path deletes the stored object. Without that, a font we refuse
 * to register still leaves its bytes sitting in the bucket, which for licensed
 * binaries is exactly the thing the private bucket exists to prevent.
 */
export async function registerCardFont(input: {
  path: string
  originalFilename: string
  mimeType: string
}): Promise<RegisterResult> {
  await requireAdminRole(FONT_UPLOAD_ROLES)
  const supabase = createSupabaseAdminClient()

  const discard = async () => {
    await supabase.storage
      .from(BUCKET)
      .remove([input.path])
      .catch(() => undefined)
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(input.path)
  if (downloadError || !blob) {
    await discard()
    return { ok: false, error: downloadError?.message || 'Could not read the uploaded file.' }
  }

  const bytes = Buffer.from(await blob.arrayBuffer())
  const parsed = parseFontFile(bytes)
  if (!parsed.ok) {
    await discard()
    return { ok: false, error: parsed.reason }
  }
  const font = parsed.font
  const contentSha256 = createHash('sha256').update(bytes).digest('hex')

  // The same font arrives with many designs. Recognise it rather than storing
  // a second copy, and drop the bytes we just uploaded.
  const { data: existing } = await supabase
    .from('card_fonts')
    .select('id, family_name, subfamily_name')
    .eq('content_sha256', contentSha256)
    .maybeSingle<{ id: string; family_name: string; subfamily_name: string }>()
  if (existing) {
    await discard()
    return {
      ok: true,
      id: existing.id,
      label: `${existing.family_name} ${existing.subfamily_name}`,
      duplicate: true,
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('card_fonts')
    .insert({
      storage_path: input.path,
      original_filename: input.originalFilename.slice(0, 200),
      mime_type: input.mimeType.slice(0, 100),
      size_bytes: bytes.byteLength,
      content_sha256: contentSha256,
      format: font.format,
      family_name: font.familyName,
      subfamily_name: font.subfamilyName,
      full_name: font.fullName,
      postscript_name: font.postscriptName,
      typographic_family: font.typographicFamily,
      typographic_subfamily: font.typographicSubfamily,
      weight_class: font.weightClass,
      is_italic: font.isItalic,
      glyph_count: font.glyphCount,
      match_keys: font.matchKeys,
      fs_type_no_embedding: font.fsTypeNoEmbedding,
      fs_type_view_only: font.fsTypeViewOnly,
      fs_type_no_subsetting: font.fsTypeNoSubsetting,
      // licence_status defaults to 'unknown', so a newly registered font is
      // visible in the library and in the readout but is never embedded until
      // somebody with the authority to say so attests it.
    })
    .select('id')
    .single<{ id: string }>()

  if (insertError || !inserted) {
    await discard()
    return {
      ok: false,
      error: isMissingLibrary(insertError)
        ? SETUP_REQUIRED
        : insertError?.message || 'Could not save the font.',
    }
  }

  revalidatePath(LIST_PATH)
  return {
    ok: true,
    id: inserted.id,
    label: `${font.familyName} ${font.subfamilyName}`,
    duplicate: false,
  }
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Attest what we are permitted to do with a font.
 *
 * Elevated roles only. fsType is an automated red flag; this is the commercial
 * claim, and `embeddable` is a generated column derived from both, so nothing
 * downstream can ship a font on the strength of a UI check alone.
 */
export async function setCardFontLicence(
  id: string,
  status: LicenceStatus,
  note: string,
): Promise<ActionResult> {
  await requireAdminRole(LICENCE_ROLES)
  if (!LICENCE_STATUSES.includes(status)) {
    return { ok: false, error: 'Unknown licence status.' }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('card_fonts')
    .update({
      licence_status: status,
      licence_note: note.slice(0, 500),
      licence_set_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(LIST_PATH)
  return { ok: true }
}

/**
 * Delete a font and its bytes.
 *
 * Storage first: an orphaned row is visible and fixable, whereas an orphaned
 * licensed binary in the bucket is neither.
 */
export async function deleteCardFont(id: string): Promise<ActionResult> {
  await requireAdminRole(LICENCE_ROLES)
  const supabase = createSupabaseAdminClient()

  const { data: row } = await supabase
    .from('card_fonts')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle<{ storage_path: string }>()
  if (row?.storage_path) {
    await supabase.storage
      .from(BUCKET)
      .remove([row.storage_path])
      .catch(() => undefined)
  }

  const { error } = await supabase.from('card_fonts').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(LIST_PATH)
  return { ok: true }
}

/**
 * Point a font name the artwork asks for at a face we actually hold.
 *
 * The release valve for a typeface we cannot license: substitute once here
 * rather than re-cutting a thousand pieces of artwork.
 */
export async function setCardFontAlias(
  requiredName: string,
  fontId: string,
  note: string,
): Promise<ActionResult> {
  await requireAdminRole(LICENCE_ROLES)
  const key = normaliseFontKey(requiredName)
  if (!key) return { ok: false, error: 'Missing font name.' }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('card_font_aliases')
    .upsert(
      { required_name: key, font_id: fontId, note: note.slice(0, 500) },
      { onConflict: 'required_name' },
    )
  if (error) return { ok: false, error: error.message }

  revalidatePath(LIST_PATH)
  return { ok: true }
}
