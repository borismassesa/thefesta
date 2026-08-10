import 'server-only'
import { PREVIEW_WIDTH_PX, traceDotOverlaySvg } from '@opusfesta/lib'

// Turning a print-resolution original into a preview a stranger may keep.
//
// TWO JOBS, ONE PASS. Downscale so the copy is useless for print, and composite
// the viewer's trace mark so a leak names a session. Both need the same decode,
// so they happen together or not at all.
//
// WHY sharp AND NOT resvg. The app already carries @resvg/resvg-wasm, so the
// obvious move was to wrap the raster in an <svg><image href="data:..."> and
// render that. It does not work: this build of resvg-wasm is compiled WITHOUT
// the image feature, and an embedded raster renders to nothing — verified, the
// output was byte-identical to an empty document. It fails silently, which is
// the worst possible shape, so the approach is recorded here to stop it being
// tried again. resvg still draws SVG and text correctly; it simply cannot
// composite bitmaps.
//
// sharp is safe to depend on here even though this repo has been bitten by
// platform-binary stripping: it is already a resolved optional dependency of
// Next, and package-lock.json already carries every @img/sharp-linux* and
// -linuxmusl* binary. Declaring it adds no new platform artefact to resolve.

/** Only these are downscaled. Anything else is passed through untouched. */
const RASTER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

export type PreviewResult = {
  body: Uint8Array
  contentType: string
  /** False when the original was returned unchanged, and why. */
  protected: boolean
  reason?: 'not_raster' | 'unavailable' | 'failed'
}

/**
 * Loaded once, lazily, and never re-thrown.
 *
 * A dynamic import rather than a static one so that a deployment without the
 * native binary degrades to "artwork served full size" instead of a module-load
 * crash that takes out the storefront. That trade is deliberate: this module
 * protects artwork, and artwork nobody can see protects nothing. The caller
 * logs the degradation.
 */
let sharpModule: Promise<typeof import('sharp') | null> | null = null

function loadSharp(): Promise<typeof import('sharp') | null> {
  if (!sharpModule) {
    sharpModule = import('sharp')
      .then((m) => m.default ?? m)
      .catch((err) => {
        console.error(
          '[card-art] sharp is unavailable; previews will be served at full ' +
            'size and unstamped. Install it in apps/opus_pass. ' +
            String(err instanceof Error ? err.message : err),
        )
        return null
      })
  }
  return sharpModule as Promise<typeof import('sharp') | null>
}

/**
 * Downscales a raster to preview width and stamps it with a trace code.
 *
 * Never throws and never returns nothing. Every failure path hands back the
 * ORIGINAL bytes with `protected: false` and a reason, because a card that does
 * not render is a worse outcome for the business than a card that renders
 * unprotected, and the caller needs to be able to say which happened.
 *
 * Images already narrower than the preview width are NOT upscaled; they are
 * still stamped, because a small original is still worth tracing.
 */
export async function renderPreviewRaster(
  source: Uint8Array,
  contentType: string,
  traceWith: string,
): Promise<PreviewResult> {
  if (!RASTER_TYPES.has(contentType)) {
    return { body: source, contentType, protected: false, reason: 'not_raster' }
  }

  const sharp = await loadSharp()
  if (!sharp) {
    return { body: source, contentType, protected: false, reason: 'unavailable' }
  }

  try {
    const input = sharp(Buffer.from(source), { failOn: 'none' })
    const meta = await input.metadata()
    if (!meta.width || !meta.height) {
      return { body: source, contentType, protected: false, reason: 'failed' }
    }

    // `withoutEnlargement` matters: upscaling a small original would add bytes
    // and invent detail without adding any protection.
    const resized = input.resize({
      width: PREVIEW_WIDTH_PX,
      withoutEnlargement: true,
      fit: 'inside',
    })

    // Re-read the post-resize box rather than computing it: `fit: inside` and
    // `withoutEnlargement` interact, and an overlay sized off a guess would be
    // rejected by composite() for exceeding the canvas.
    const resizedBuffer = await resized.toBuffer()
    const out = sharp(resizedBuffer, { failOn: 'none' })
    const outMeta = await out.metadata()
    const width = outMeta.width ?? PREVIEW_WIDTH_PX
    const height = outMeta.height ?? Math.round((PREVIEW_WIDTH_PX * 7) / 5)

    const overlay = Buffer.from(traceDotOverlaySvg(traceWith, width, height))
    const body = await out
      .composite([{ input: overlay, top: 0, left: 0 }])
      // WebP at high quality: markedly smaller than PNG for this artwork, and
      // universally supported by anything that can open the storefront.
      .webp({ quality: 82 })
      .toBuffer()

    return { body: new Uint8Array(body), contentType: 'image/webp', protected: true }
  } catch (err) {
    console.error(
      `[card-art] preview render failed, serving the original: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return { body: source, contentType, protected: false, reason: 'failed' }
  }
}
