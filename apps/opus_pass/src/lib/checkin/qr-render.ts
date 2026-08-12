/**
 * OpusPass entrance-pass QR renderer.
 *
 * Owns the full contract:
 *   payload → QR matrix (ECC H) → protected logo region → 4-module quiet zone → PNG
 *
 * Deliberately free of `server-only` so the unit suite can exercise the exact
 * bytes the ticket ships. Credentials still enter only via qr.ts.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import QRCode from 'qrcode'

/** Target output edge in px. Final size is snapped to an integer module grid. */
export const QR_TARGET_PX = 512

/** Spec minimum quiet zone — four light modules on every side. */
export const QUIET_ZONE_MODULES = 4

/**
 * Branded center footprint as a fraction of the full QR image width
 * (quiet zone included). Kept in 15–18% so ECC-H retains headroom under
 * print, glare, WhatsApp compression and older cameras.
 */
export const BRAND_AREA_RATIO = 0.16

/** Logo fill inside the brand box; remainder is white safety padding. */
export const LOGO_FILL_RATIO = 0.72

/** Deep Opus purple — dark enough for scanner contrast on white. */
export const QR_DARK = '#4A2472'
export const QR_LIGHT = '#FFFFFF'

const LOGO_PATH = path.join(process.cwd(), 'public', 'assets', 'logo', 'opuspass-mark.svg')

/**
 * Alignment-pattern center coordinates by QR version (ISO/IEC 18004).
 * Index = version. Empty for v1 (no alignment patterns).
 */
const ALIGNMENT_LOCS: readonly (readonly number[])[] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
]

export type EntryPassQrLayout = {
  /** Full PNG edge in px (quiet zone included). */
  size: number
  modulePx: number
  matrixSize: number
  version: number
  quietPx: number
  /** Axis-aligned brand box in px (white safety pad + logo). */
  brand: { x: number; y: number; size: number }
  /** Logo box inside the brand pad. */
  logo: { x: number; y: number; size: number }
  brandRatio: number
}

/** Lazy sharp — degrade to an unbranded QR if the native binary is missing. */
let sharpModule: Promise<typeof import('sharp') | null> | null = null
function loadSharp(): Promise<typeof import('sharp') | null> {
  if (!sharpModule) {
    sharpModule = import('sharp')
      .then((m) => m.default ?? m)
      .catch((err) => {
        console.error(
          '[entry-pass-qr] sharp unavailable; shipping unbranded QR. ' +
            String(err instanceof Error ? err.message : err),
        )
        return null
      })
  }
  return sharpModule as Promise<typeof import('sharp') | null>
}

/**
 * Function-pattern modules that branding must never erase: finders +
 * separators, timing, format info, version info, and alignment patterns.
 */
export function isProtectedModule(x: number, y: number, size: number, version: number): boolean {
  // Finder 7×7 + 1-module separator → 8×8 corner zones.
  if (x < 8 && y < 8) return true
  if (x >= size - 8 && y < 8) return true
  if (x < 8 && y >= size - 8) return true

  // Timing patterns.
  if (x === 6 || y === 6) return true

  // Format information (around finders, including the dark module at 8, size-8).
  if (y === 8 && (x <= 8 || x >= size - 8)) return true
  if (x === 8 && (y <= 8 || y >= size - 8)) return true

  // Version information (versions 7+).
  if (version >= 7) {
    if (x <= 5 && y >= size - 11 && y <= size - 9) return true
    if (y <= 5 && x >= size - 11 && x <= size - 9) return true
  }

  // Alignment patterns (5×5), skipping centers that coincide with finders.
  const locs = ALIGNMENT_LOCS[version] ?? []
  for (const row of locs) {
    for (const col of locs) {
      if ((row < 8 && col < 8) || (row < 8 && col >= size - 8) || (row >= size - 8 && col < 8)) {
        continue
      }
      if (Math.abs(x - col) <= 2 && Math.abs(y - row) <= 2) return true
    }
  }

  return false
}

function computeLayout(matrixSize: number, version: number): EntryPassQrLayout {
  const totalModules = matrixSize + QUIET_ZONE_MODULES * 2
  const modulePx = Math.max(4, Math.floor(QR_TARGET_PX / totalModules))
  const size = totalModules * modulePx
  const quietPx = QUIET_ZONE_MODULES * modulePx

  const brandSize = Math.round(size * BRAND_AREA_RATIO)
  const brandX = Math.floor((size - brandSize) / 2)
  const brandY = Math.floor((size - brandSize) / 2)

  const logoSize = Math.max(1, Math.round(brandSize * LOGO_FILL_RATIO))
  const logoX = brandX + Math.floor((brandSize - logoSize) / 2)
  const logoY = brandY + Math.floor((brandSize - logoSize) / 2)

  return {
    size,
    modulePx,
    matrixSize,
    version,
    quietPx,
    brand: { x: brandX, y: brandY, size: brandSize },
    logo: { x: logoX, y: logoY, size: logoSize },
    brandRatio: brandSize / size,
  }
}

/** True when a module's pixel center sits inside the reserved brand box. */
function moduleInBrandRegion(
  mx: number,
  my: number,
  layout: EntryPassQrLayout,
): boolean {
  const cx = layout.quietPx + mx * layout.modulePx + layout.modulePx / 2
  const cy = layout.quietPx + my * layout.modulePx + layout.modulePx / 2
  const { x, y, size } = layout.brand
  return cx >= x && cx < x + size && cy >= y && cy < y + size
}

/**
 * Build the QR SVG from the ECC-H matrix: quiet zone, data modules, and an
 * empty reserved brand box. Finder/timing/format/alignment modules are never
 * omitted even if they fall in the brand box (they should not at 16%).
 */
export function buildEntryPassQrSvg(payload: string): { svg: string; layout: EntryPassQrLayout } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'H' })
  const matrix = qr.modules
  const n = matrix.size
  const version = qr.version
  const layout = computeLayout(n, version)

  const dark: string[] = []
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!matrix.get(x, y)) continue

      const protectedModule = isProtectedModule(x, y, n, version)
      if (!protectedModule && moduleInBrandRegion(x, y, layout)) continue

      const px = layout.quietPx + x * layout.modulePx
      const py = layout.quietPx + y * layout.modulePx
      dark.push(
        `<rect x="${px}" y="${py}" width="${layout.modulePx}" height="${layout.modulePx}"/>`,
      )
    }
  }

  // White brand pad — explicit reserved region, not a post-hoc cover-up over
  // dark modules (those were never drawn above).
  const { brand } = layout
  const brandRect = `<rect x="${brand.x}" y="${brand.y}" width="${brand.size}" height="${brand.size}" fill="${QR_LIGHT}"/>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.size}" height="${layout.size}" viewBox="0 0 ${layout.size} ${layout.size}" shape-rendering="crispEdges">
<rect width="100%" height="100%" fill="${QR_LIGHT}"/>
<g fill="${QR_DARK}">${dark.join('')}</g>
${brandRect}
</svg>`

  return { svg, layout }
}

async function rasterizeLogo(logoSize: number): Promise<Buffer | null> {
  const sharp = await loadSharp()
  if (!sharp) return null
  try {
    const svg = await readFile(LOGO_PATH)
    return sharp(svg, { density: 300 })
      .resize(logoSize, logoSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer()
  } catch (err) {
    console.error('[entry-pass-qr] failed to rasterize OpusPass mark', err)
    return null
  }
}

export type RenderedEntryPassQr = {
  png: Buffer
  dataUrl: string
  layout: EntryPassQrLayout
}

/**
 * Render the admission credential (or any scannable payload) to a branded PNG.
 * The payload is the QR content — never a display Pass ID or card number.
 */
export async function renderEntryPassQr(payload: string): Promise<RenderedEntryPassQr> {
  const { svg, layout } = buildEntryPassQrSvg(payload)
  const sharp = await loadSharp()

  if (!sharp) {
    // Unbranded but still ECC-H with a real 4-module quiet zone.
    const png = await QRCode.toBuffer(payload, {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: QUIET_ZONE_MODULES,
      width: layout.size,
      color: { dark: QR_DARK, light: QR_LIGHT },
    })
    return { png, dataUrl: `data:image/png;base64,${png.toString('base64')}`, layout }
  }

  const base = await sharp(Buffer.from(svg)).png().toBuffer()
  const mark = await rasterizeLogo(layout.logo.size)

  const png = mark
    ? await sharp(base)
        .composite([{ input: mark, left: layout.logo.x, top: layout.logo.y }])
        .png()
        .toBuffer()
    : base

  return {
    png,
    dataUrl: `data:image/png;base64,${png.toString('base64')}`,
    layout,
  }
}
