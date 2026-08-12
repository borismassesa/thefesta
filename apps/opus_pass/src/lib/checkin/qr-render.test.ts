import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import jsQR from 'jsqr'
import sharp from 'sharp'
import {
  BRAND_AREA_RATIO,
  QUIET_ZONE_MODULES,
  buildEntryPassQrSvg,
  isProtectedModule,
  renderEntryPassQr,
} from './qr-render'

/**
 * Entrance-pass QR layout + scanability.
 *
 *   npx tsx --test src/lib/checkin/qr-render.test.ts
 */

const SAMPLE_OP1 = `OP1:${randomBytes(32).toString('base64url')}`

async function decodePng(png: Buffer): Promise<string | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)
  return code?.data ?? null
}

test('brand footprint stays in the 15–18% production band', () => {
  const { layout } = buildEntryPassQrSvg(SAMPLE_OP1)
  assert.ok(
    layout.brandRatio >= 0.15 && layout.brandRatio <= 0.18,
    `brand ratio ${layout.brandRatio} outside 15–18%`,
  )
  // Integer-pixel snap can drift a hair from the target ratio.
  assert.ok(
    Math.abs(layout.brandRatio - BRAND_AREA_RATIO) < 0.005,
    `brand ratio ${layout.brandRatio} drifted from target ${BRAND_AREA_RATIO}`,
  )
})

test('quiet zone is exactly four modules on every side', () => {
  const { layout } = buildEntryPassQrSvg(SAMPLE_OP1)
  assert.equal(layout.quietPx, QUIET_ZONE_MODULES * layout.modulePx)
  assert.equal(layout.size, (layout.matrixSize + QUIET_ZONE_MODULES * 2) * layout.modulePx)
})

test('logo sits inside the brand pad with safety margin', () => {
  const { layout } = buildEntryPassQrSvg(SAMPLE_OP1)
  assert.ok(layout.logo.size < layout.brand.size)
  assert.ok(layout.logo.x > layout.brand.x)
  assert.ok(layout.logo.y > layout.brand.y)
  assert.ok(layout.logo.x + layout.logo.size < layout.brand.x + layout.brand.size)
  assert.ok(layout.logo.y + layout.logo.size < layout.brand.y + layout.brand.size)
})

test('finder corner modules are protected', () => {
  const { layout } = buildEntryPassQrSvg(SAMPLE_OP1)
  const n = layout.matrixSize
  assert.equal(isProtectedModule(0, 0, n, layout.version), true)
  assert.equal(isProtectedModule(n - 1, 0, n, layout.version), true)
  assert.equal(isProtectedModule(0, n - 1, n, layout.version), true)
  // Center of a typical v6 matrix is data, not a function pattern.
  const mid = Math.floor(n / 2)
  assert.equal(isProtectedModule(mid, mid, n, layout.version), false)
})

test('rendered OP1 credential decodes back to the same payload', async () => {
  const { png, layout } = await renderEntryPassQr(SAMPLE_OP1)
  assert.ok(png.length > 0)
  assert.ok(layout.brandRatio >= 0.15 && layout.brandRatio <= 0.18)

  const decoded = await decodePng(png)
  assert.equal(decoded, SAMPLE_OP1)
})

test('quiet-zone edge pixels are white', async () => {
  const { png, layout } = await renderEntryPassQr(SAMPLE_OP1)
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const px = (x: number, y: number) => {
    const i = (y * info.width + x) * channels
    return [data[i], data[i + 1], data[i + 2]] as const
  }
  const isWhite = ([r, g, b]: readonly [number, number, number]) => r > 250 && g > 250 && b > 250

  // Sample mid-edge points inside the quiet zone.
  const inset = Math.max(1, Math.floor(layout.quietPx / 2))
  assert.ok(isWhite(px(inset, inset)), 'top-left quiet')
  assert.ok(isWhite(px(info.width - 1 - inset, inset)), 'top-right quiet')
  assert.ok(isWhite(px(inset, info.height - 1 - inset)), 'bottom-left quiet')
  assert.ok(isWhite(px(info.width - 1 - inset, info.height - 1 - inset)), 'bottom-right quiet')
})
