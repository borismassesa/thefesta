'use client'

import { createCardFontUploadUrl, registerCardFont } from './card-font-actions'

export type FontUploadOutcome = {
  filename: string
  status: 'registered' | 'already_present' | 'skipped' | 'failed'
  message: string
}

export type FontUploadReport = {
  outcomes: FontUploadOutcome[]
  /**
   * Set when the whole batch was abandoned for one environment-level reason.
   *
   * Reported once instead of per file. A folder of fifteen fonts hitting an
   * unconfigured library used to render the same sentence fifteen times, which
   * reads as fifteen problems rather than one.
   */
  fatal: string | null
}

/** Noise every folder drop includes. Skipped quietly rather than reported. */
function isNoise(file: File): boolean {
  return file.name.startsWith('.') || file.name === 'Thumbs.db' || file.size === 0
}

/**
 * Upload and register a delivery folder, one file at a time.
 *
 * Sequential on purpose. The useful result is "12 of 15 registered" with a
 * reason for each of the three, so the loop keeps going past a bad file rather
 * than failing the batch. The only thing that stops it is a fault that would
 * clearly affect every remaining file.
 */
export async function uploadCardFonts(
  files: File[],
  onProgress?: (filename: string, index: number, total: number) => void,
): Promise<FontUploadReport> {
  const candidates = files.filter((file) => !isNoise(file))
  const outcomes: FontUploadOutcome[] = []

  for (const [index, file] of candidates.entries()) {
    onProgress?.(file.name, index, candidates.length)
    try {
      const minted = await createCardFontUploadUrl({
        filename: file.name,
        sizeBytes: file.size,
      })
      if (!minted.ok) {
        // A minting failure is about the environment, not this file, so nothing
        // after it would behave differently.
        return { outcomes, fatal: minted.error }
      }

      const put = await fetch(minted.uploadUrl, {
        method: 'PUT',
        headers: { 'x-upsert': 'false' },
        body: file,
      })
      if (!put.ok) {
        outcomes.push({
          filename: file.name,
          status: 'failed',
          message: `Storage rejected the upload (${put.status}).`,
        })
        continue
      }

      const registered = await registerCardFont({
        path: minted.path,
        originalFilename: file.name,
        mimeType: file.type,
      })
      if (!registered.ok) {
        // "Not a font" is about this file; anything else is about the library.
        const perFile = /not a font|collection|embedded name|too large|empty/i.test(registered.error)
        if (!perFile) return { outcomes, fatal: registered.error }
        outcomes.push({ filename: file.name, status: 'skipped', message: registered.error })
        continue
      }

      outcomes.push({
        filename: file.name,
        status: registered.duplicate ? 'already_present' : 'registered',
        message: registered.duplicate
          ? `Already in the library as ${registered.label}.`
          : `${registered.label}.`,
      })
    } catch (error) {
      outcomes.push({
        filename: file.name,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Upload failed.',
      })
    }
  }

  return { outcomes, fatal: null }
}
