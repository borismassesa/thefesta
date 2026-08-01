'use client'

import { createCmsMediaUploadUrl, createCmsMediaFixedUploadUrl } from './upload-media'

export type UploadedMedia = { url: string; type: 'image' | 'video' }

// Why this PUTs directly to Supabase instead of POSTing the file to a Server
// Action: see upload-media.ts (Vercel body cap). Failures are logged here so
// each editor's catch block only has to worry about user-facing messaging.
export async function uploadCmsMedia(
  file: File,
  pathPrefix: string,
  kind: 'image' | 'svg' | 'raster' | 'video' | 'media',
): Promise<UploadedMedia> {
  const minted = await createCmsMediaUploadUrl({
    pathPrefix,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    kind,
  })
  if (!minted.ok) {
    console.error('[cms-upload] mint failed', {
      pathPrefix,
      filename: file.name,
      mime: file.type,
      size: file.size,
      err: minted.error,
    })
    throw new Error(minted.error)
  }

  const put = await fetch(minted.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
    body: file,
  })
  if (!put.ok) {
    const body = await put.text().catch(() => '')
    console.error('[cms-upload] storage PUT rejected', {
      pathPrefix,
      filename: file.name,
      status: put.status,
      body: body.slice(0, 200),
    })
    throw new Error(
      `Storage rejected upload (${put.status}${body ? `: ${body.slice(0, 120)}` : ''})`,
    )
  }
  return { url: minted.publicUrl, type: minted.mediaType }
}

// Uploads a file to a fixed, pre-determined storage path, overwriting whatever is there.
export async function uploadCmsMediaToFixedPath(
  file: File,
  storagePath: string,
): Promise<UploadedMedia> {
  const minted = await createCmsMediaFixedUploadUrl({
    storagePath,
    mimeType: file.type,
    sizeBytes: file.size,
  })
  if (!minted.ok) throw new Error(minted.error)

  const put = await fetch(minted.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
    body: file,
  })
  if (!put.ok) {
    const body = await put.text().catch(() => '')
    const detail = body ? ': ' + body.slice(0, 120) : ''
    throw new Error(`Storage rejected upload (${put.status}${detail})`)
  }
  return { url: minted.publicUrl, type: 'image' }
}
