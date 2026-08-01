'use server'

import { requireAdminRole, type AdminAccessRole } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Vercel's serverless request-body cap (~4.5 MB at the time of writing)
// rejects larger payloads before the function runs and the browser surfaces
// the rejection as a generic "An unexpected response was received from the
// server." So every CMS image/video upload mints a signed Supabase Storage
// URL and the browser PUTs the file straight to Storage — same mechanism
// the vendor portfolio admin (`adminCreateVendorVideoUploadUrl`) uses, and
// like that helper this one gates on `requireAdminRole` because Server
// Actions are reachable as RPC endpoints regardless of route layout.

const CMS_UPLOAD_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']
// SVGs can carry inline <script> and event handlers. The public Storage URL
// is reachable directly, so a malicious SVG served from `*.supabase.co` could
// be used to phish. Limit SVG uploads to elevated roles until we sanitize
// server-side. See: tracking note in the storage-allow-svg migration.
const CMS_SVG_UPLOAD_ROLES: AdminAccessRole[] = ['owner', 'admin']

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
])
const SVG_MIME = 'image/svg+xml'
const VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const MAX_BYTES = 500 * 1024 * 1024 // matches the website-media bucket cap

// Path-prefix sanity: lowercase segments, no leading slash, no '..'. Stops a
// malformed prefix from writing into another section's namespace.
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9/_-]*[a-z0-9]$/
// Full fixed storage path (prefix + filename.ext): same safety as PREFIX_PATTERN
// but allows a dotted file extension. Must start alphanumeric (no leading slash)
// and end in an extension; '..' is rejected separately at the call site.
const FIXED_PATH_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]+$/i

export type CmsMediaUploadUrlResult =
  | {
      ok: true
      uploadUrl: string
      token: string
      publicUrl: string
      path: string
      mediaType: 'image' | 'video'
    }
  | { ok: false; error: string }

export async function createCmsMediaUploadUrl(input: {
  pathPrefix: string
  filename: string
  mimeType: string
  sizeBytes: number
  kind: 'image' | 'svg' | 'raster' | 'video' | 'media'
}): Promise<CmsMediaUploadUrlResult> {
  const isSvg = input.mimeType === SVG_MIME
  // Gate on actual mime, not declared `kind`, so an editor can't smuggle an
  // SVG by claiming `kind: 'image'`.
  await requireAdminRole(isSvg ? CMS_SVG_UPLOAD_ROLES : CMS_UPLOAD_ROLES)
  const isImage = IMAGE_MIME.has(input.mimeType)
  const isVideo = VIDEO_MIME.has(input.mimeType)
  if (input.kind === 'image' && !isImage) {
    return { ok: false, error: 'Only JPEG, PNG, WebP, GIF, AVIF, or SVG images are allowed.' }
  }
  if (input.kind === 'raster' && (!isImage || isSvg)) {
    return { ok: false, error: 'Only JPEG, PNG, WebP, GIF, or AVIF images are allowed.' }
  }
  if (input.kind === 'svg' && !isSvg) {
    return { ok: false, error: 'Only SVG files are allowed for this field.' }
  }
  if (input.kind === 'video' && !isVideo) {
    return { ok: false, error: 'Only MP4, WebM, or MOV video files are allowed.' }
  }
  if (input.kind === 'media' && !isImage && !isVideo) {
    return { ok: false, error: 'Only image or video files are allowed.' }
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'Missing file size.' }
  }
  if (input.sizeBytes > MAX_BYTES) {
    return {
      ok: false,
      error: `${input.filename}: file is over the 500 MB limit (${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB).`,
    }
  }
  if (!PREFIX_PATTERN.test(input.pathPrefix) || input.pathPrefix.includes('..')) {
    return { ok: false, error: 'Invalid path prefix.' }
  }

  const ext = extFromMime(input.mimeType) ?? safeExt(input.filename)
  const path = `${input.pathPrefix}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const supabase = createSupabaseAdminClient()
  const signed = await supabase.storage
    .from('website-media')
    .createSignedUploadUrl(path)
  if (signed.error || !signed.data) {
    console.error('[cms-upload] createSignedUploadUrl failed', {
      path,
      mime: input.mimeType,
      size: input.sizeBytes,
      err: signed.error?.message,
    })
    return {
      ok: false,
      error: `Signed upload URL failed: ${signed.error?.message ?? 'unknown'}`,
    }
  }
  const publicUrl = supabase.storage.from('website-media').getPublicUrl(path)
  return {
    ok: true,
    uploadUrl: signed.data.signedUrl,
    token: signed.data.token,
    publicUrl: publicUrl.data.publicUrl,
    path,
    mediaType: isVideo ? 'video' : 'image',
  }
}

// Mints a signed upload URL for a fixed, pre-determined storage path.
// The PUT must set x-upsert: true to overwrite the existing file.
export async function createCmsMediaFixedUploadUrl(input: {
  storagePath: string
  mimeType: string
  sizeBytes: number
}): Promise<CmsMediaUploadUrlResult> {
  await requireAdminRole(CMS_UPLOAD_ROLES)
  if (input.mimeType !== SVG_MIME) {
    return { ok: false, error: 'Only SVG files are allowed for this field.' }
  }
  // Validate the client-supplied storage path: reject traversal/absolute paths so
  // a caller can't mint a signed URL outside the intended area of the bucket
  // (overwriting another product's asset, the hero image, etc.). Relative,
  // safe-charset, with a file extension only.
  if (input.storagePath.includes('..') || !FIXED_PATH_PATTERN.test(input.storagePath)) {
    return { ok: false, error: 'Invalid storage path.' }
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'Missing file size.' }
  }
  if (input.sizeBytes > MAX_BYTES) {
    return {
      ok: false,
      error: `File is over the 500 MB limit (${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB).`,
    }
  }
  const supabase = createSupabaseAdminClient()
  const signed = await supabase.storage
    .from('website-media')
    .createSignedUploadUrl(input.storagePath, { upsert: true })
  if (signed.error || !signed.data) {
    return {
      ok: false,
      error: `Signed upload URL failed: ${signed.error?.message ?? 'unknown'}`,
    }
  }
  const publicUrl = supabase.storage.from('website-media').getPublicUrl(input.storagePath)
  return {
    ok: true,
    uploadUrl: signed.data.signedUrl,
    token: signed.data.token,
    publicUrl: publicUrl.data.publicUrl,
    path: input.storagePath,
    mediaType: 'image',
  }
}

function extFromMime(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/avif') return 'avif'
  if (mime === 'image/svg+xml') return 'svg'
  if (mime === 'video/mp4') return 'mp4'
  if (mime === 'video/webm') return 'webm'
  if (mime === 'video/quicktime') return 'mov'
  return null
}

function safeExt(filename: string): string {
  const raw = filename.split('.').pop() ?? 'bin'
  return /^[a-z0-9]{1,8}$/i.test(raw) ? raw.toLowerCase() : 'bin'
}
