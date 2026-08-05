import 'server-only'

import {
  buildFontFaceCss,
  matchCardFonts,
  readRequiredFonts,
  type CardFontFace,
} from '@opusfesta/lib'

import { createSupabaseServerClient } from '@/lib/supabase'

// Card artwork is large — the reference card is a 2 MB SVG, most of it base64
// bitmaps — so it is fetched on demand by the preview route and never as part
// of a page render.
const MAX_ARTWORK_BYTES = 12 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const FONTS_BUCKET = 'card-fonts'

/**
 * Absolute URL for a stored artwork path.
 *
 * An admin types this field by hand, so it is either already absolute or an
 * app-relative `/assets/...` path that lives in this app's own public folder.
 */
function resolveArtworkUrl(url: string, base: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return new URL(url, base).toString()
  return url
}

/**
 * A card's unpersonalised artwork.
 *
 * Returned to the browser once per card so the couple's preview can re-render
 * locally as they type, rather than round-tripping megabytes per keystroke.
 * Failure is a reason string, not a throw: "this card has no SVG yet" is an
 * ordinary state the form has to explain, not an error that should blank it.
 */
export async function loadArtworkSvg(
  artworkSvgUrl: string,
  base: string,
): Promise<{ ok: true; svg: string } | { ok: false; reason: string }> {
  const url = artworkSvgUrl.trim()
  if (!url) return { ok: false, reason: 'This card has no editable artwork attached yet.' }
  if (!/\.svg(\?|#|$)/i.test(url)) {
    return { ok: false, reason: 'This card’s artwork is a flat image, so it cannot be previewed.' }
  }

  try {
    const response = await fetch(resolveArtworkUrl(url, base), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Megabytes that change only when an admin re-uploads: never worth
      // holding in Next's fetch cache.
      cache: 'no-store',
    })
    if (!response.ok) {
      return { ok: false, reason: `Could not load the artwork (HTTP ${response.status}).` }
    }

    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > MAX_ARTWORK_BYTES) {
      return { ok: false, reason: 'This card’s artwork is too large to preview.' }
    }

    const svg = await response.text()
    // content-length can be absent or wrong under compression; check the real size.
    if (svg.length > MAX_ARTWORK_BYTES) {
      return { ok: false, reason: 'This card’s artwork is too large to preview.' }
    }
    return { ok: true, svg }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return {
      ok: false,
      reason: timedOut ? 'Loading the artwork timed out.' : 'Could not load the artwork.',
    }
  }
}

type FontRow = {
  id: string
  storage_path: string
  format: string
  family_name: string
  subfamily_name: string
  postscript_name: string
  weight_class: number
  is_italic: boolean
  match_keys: string[]
  embeddable: boolean
  fs_type_no_embedding: boolean
}

/**
 * Base64 of a font file, cached for the life of the lambda.
 *
 * The same handful of faces serves the whole catalogue, so without this every
 * preview would re-download and re-encode a few hundred KB that never change.
 */
const encoded = new Map<string, string>()

/**
 * The `@font-face` block for the typefaces one card's artwork asks for.
 *
 * Served separately from the artwork on purpose: the form fetches the artwork
 * once and re-renders on every keystroke, and folding ~400 KB of base64 into
 * that string would mean re-slicing it each time. This response is also
 * cacheable while a personalised card never is.
 *
 * Returns '' rather than throwing for every "no fonts to send" case. A preview
 * in a fallback face is worse than a correct one and far better than none.
 */
export async function cardFontFaceCss(svg: string): Promise<string> {
  const required = readRequiredFonts(svg)
  if (required.length === 0) return ''

  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('card_fonts')
    .select(
      'id, storage_path, format, family_name, subfamily_name, postscript_name, weight_class, is_italic, match_keys, embeddable, fs_type_no_embedding',
    )
  const library = (data ?? []) as FontRow[]
  if (library.length === 0) return ''

  const faces: CardFontFace[] = library.map((row) => ({
    id: row.id,
    familyName: row.family_name,
    subfamilyName: row.subfamily_name,
    postscriptName: row.postscript_name,
    weightClass: row.weight_class,
    isItalic: row.is_italic,
    matchKeys: row.match_keys,
    embeddable: row.embeddable,
    restricted: row.fs_type_no_embedding,
  }))
  const byId = new Map(library.map((row) => [row.id, row]))

  const embeddable = []
  for (const match of matchCardFonts(required, faces)) {
    // The licence gate is a generated column, so a face that is not cleared
    // never reaches this list. There is no second check to forget.
    if (!match.face?.embeddable) continue
    const row = byId.get(match.face.id)
    if (!row) continue

    let base64 = encoded.get(row.id)
    if (base64 === undefined) {
      const { data: blob } = await supabase.storage.from(FONTS_BUCKET).download(row.storage_path)
      if (!blob) continue
      base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      encoded.set(row.id, base64)
    }

    embeddable.push({
      // Keyed on the name the ARTWORK asks for, not the font's own family, so
      // CSS resolves it on the first entry of the font-family list.
      familyName: match.required.primary,
      italic: match.required.italic,
      format: row.format,
      base64,
    })
  }

  return buildFontFaceCss(embeddable)
}
