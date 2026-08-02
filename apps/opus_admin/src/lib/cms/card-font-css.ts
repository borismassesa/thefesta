import 'server-only'

import {
  buildFontFaceCss,
  matchCardFonts,
  type CardFontFace,
  type RequiredFont,
} from '@opusfesta/lib'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { listCardFonts } from '@/lib/cms/card-font-actions'
import { loadCardArtwork } from '@/lib/cms/card-artwork'

const BUCKET = 'card-fonts'

/**
 * Base64 of a font file, cached for the life of the lambda.
 *
 * The same handful of faces serves the whole catalogue, so without this every
 * card view would re-download and re-encode a few hundred KB that never change.
 */
const encoded = new Map<string, string>()

/**
 * The @font-face block for one card's typefaces, ready to inject into an SVG.
 *
 * Served SEPARATELY from the artwork wherever this is used. The editors fetch
 * the artwork once and re-run renderCardSvg on every change; folding ~400 KB of
 * base64 into that string would mean slicing and re-blobbing it each time. It
 * also means the same few fonts are fetched once per session rather than once
 * per card, because this response is cacheable while a personalised card is not.
 *
 * Returns '' rather than throwing for every "no fonts to send" case. A card
 * rendering in a fallback face is worse than one rendering correctly, but it is
 * far better than a preview that refuses to appear.
 */
export async function cardFontFaceCss(artworkSvgUrl: string): Promise<string> {
  const artwork = await loadCardArtwork(artworkSvgUrl)
  if (!artwork.ok) return ''
  return cardFontFaceCssFor(artwork.requiredFonts)
}

/**
 * The same block, for a caller that has already read the artwork.
 *
 * The release path holds the parsed SVG in memory because it is about to render
 * it, and the reference artwork is ~2 MB. Handing the required fonts straight in
 * avoids fetching and re-parsing that file a second time just to learn which
 * typefaces it asks for.
 */
export async function cardFontFaceCssFor(requiredFonts: RequiredFont[]): Promise<string> {
  if (requiredFonts.length === 0) return ''

  const supabase = createSupabaseAdminClient()
  const library = await listCardFonts()
  const faces: CardFontFace[] = library.fonts.map((font) => ({
    id: font.id,
    familyName: font.family_name,
    subfamilyName: font.subfamily_name,
    postscriptName: font.postscript_name,
    weightClass: font.weight_class,
    isItalic: font.is_italic,
    matchKeys: font.match_keys,
    embeddable: font.embeddable,
    restricted: font.fs_type_no_embedding,
  }))
  const byId = new Map(library.fonts.map((font) => [font.id, font]))

  const matches = matchCardFonts(requiredFonts, faces)
  const embeddable = []

  for (const match of matches) {
    // The licence gate is a generated column, so a font that is not cleared
    // simply never reaches this list. There is no second check to forget.
    if (!match.face?.embeddable) continue
    const row = byId.get(match.face.id)
    if (!row) continue

    let base64 = encoded.get(row.id)
    if (base64 === undefined) {
      const { data: blob } = await supabase.storage.from(BUCKET).download(row.storage_path)
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

export function fontCssHeaders() {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    // Licensed binaries: cacheable by the browser, never by a shared proxy.
    'Cache-Control': 'private, max-age=86400',
  }
}
