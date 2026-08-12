import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ARTWORK_TOKEN_TTL_SECONDS,
  artworkTraceCode,
  artworkUrl,
  mintArtworkToken,
  parseStorageUrl,
  verifyArtworkToken,
} from './protected-art'

// Assigned after the imports, which is safe only because the module under test
// reads the secret lazily inside signingSecret() rather than at import time.
// Reading it at module scope there would make every one of these tests throw.
process.env.CARD_ASSET_TOKEN_SECRET_CURRENT ??= 'artwork-test-secret'

const PRODUCT = '3f1c8a20-0000-4000-8000-000000000001'
const OTHER = '3f1c8a20-0000-4000-8000-000000000002'
const VIEWER = 'user_2abcdef'
const NOW = 1_800_000_000

/** Tokens are nullable only when unsigned; every test here runs with a secret. */
function mint(productId: string, now: number): string {
  const token = mintArtworkToken(productId, now)
  assert.ok(token, 'expected a signed token')
  return token
}

test('a freshly minted token verifies', () => {
  assert.equal(verifyArtworkToken(PRODUCT, mint(PRODUCT, NOW), NOW).ok, true)
})

test('the url is identical for two viewers in the same window', () => {
  // Load-bearing: a per-viewer URL would give next/image a fresh cache key on
  // every render and re-optimise the whole catalogue per visitor.
  assert.equal(mintArtworkToken(PRODUCT, NOW), mintArtworkToken(PRODUCT, NOW + 60))
})

test('the token still rolls over between windows', () => {
  assert.notEqual(
    mintArtworkToken(PRODUCT, NOW),
    mintArtworkToken(PRODUCT, NOW + ARTWORK_TOKEN_TTL_SECONDS * 2),
  )
})

test('a token minted for one product does not open another', () => {
  // Otherwise one token scrapes the whole catalogue, which is the attack.
  const token = mint(PRODUCT, NOW)
  const check = verifyArtworkToken(OTHER, token, NOW)
  assert.equal(check.ok, false)
  assert.equal(check.ok === false && check.reason, 'bad_signature')
})

test('a token expires', () => {
  const token = mint(PRODUCT, NOW)
  const wellAfter = NOW + ARTWORK_TOKEN_TTL_SECONDS * 3
  const check = verifyArtworkToken(PRODUCT, token, wellAfter)
  assert.equal(check.ok, false)
  assert.equal(check.ok === false && check.reason, 'expired')
})

test('a token is still good just inside its window', () => {
  const token = mint(PRODUCT, NOW)
  const check = verifyArtworkToken(PRODUCT, token, NOW + ARTWORK_TOKEN_TTL_SECONDS)
  assert.equal(check.ok, true)
})

test('the expiry cannot be edited to extend the window', () => {
  const [, signature] = mint(PRODUCT, NOW).split('.')
  const forged = `${NOW + 999_999}.${signature}`
  const check = verifyArtworkToken(PRODUCT, forged, NOW)
  assert.equal(check.ok, false)
  assert.equal(check.ok === false && check.reason, 'bad_signature')
})

test('malformed tokens are rejected rather than throwing', () => {
  for (const bad of ['', 'x', 'a', 'a.b.c', '....', 'notanumber.sig']) {
    const check = verifyArtworkToken(PRODUCT, bad, NOW)
    assert.equal(check.ok, false, `expected rejection for ${JSON.stringify(bad)}`)
  }
})

test('the trace code is stable per viewer and differs between viewers', () => {
  assert.equal(artworkTraceCode(PRODUCT, VIEWER), artworkTraceCode(PRODUCT, VIEWER))
  assert.notEqual(artworkTraceCode(PRODUCT, VIEWER), artworkTraceCode(PRODUCT, 'user_other'))
})

test('the trace code differs per product for one viewer', () => {
  assert.notEqual(artworkTraceCode(PRODUCT, VIEWER), artworkTraceCode(OTHER, VIEWER))
})

test('artworkUrl is same-origin and carries the token', () => {
  const url = artworkUrl(PRODUCT)!
  assert.ok(url.startsWith('/api/card-art/'))
  assert.ok(url.includes('?t='))
  // No storage host may survive into anything the browser sees.
  assert.ok(!url.includes('supabase'))
})

test('artworkUrl escapes a product id rather than splicing it into the path', () => {
  const url = artworkUrl('../../etc/passwd')!
  assert.ok(!url.includes('../'))
})

test('a public storage url splits into bucket and path', () => {
  const parsed = parseStorageUrl(
    'https://ppdapuqehwlfwofbpbvb.supabase.co/storage/v1/object/public/website-media/invitation-svgs/rose/card.svg',
  )
  assert.deepEqual(parsed, {
    bucket: 'website-media',
    path: 'invitation-svgs/rose/card.svg',
  })
})

test('a signed or authenticated storage url splits the same way', () => {
  // The column has held all three shapes over the project's life.
  for (const kind of ['sign', 'authenticated']) {
    const parsed = parseStorageUrl(
      `https://x.supabase.co/storage/v1/object/${kind}/website-media/a/b.svg`,
    )
    assert.equal(parsed?.bucket, 'website-media')
    assert.equal(parsed?.path, 'a/b.svg')
  }
})

test('a percent-encoded object path is decoded', () => {
  const parsed = parseStorageUrl(
    'https://x.supabase.co/storage/v1/object/public/website-media/opus%20pass/my%20card.svg',
  )
  assert.equal(parsed?.path, 'opus pass/my card.svg')
})

test('non-storage urls are refused rather than guessed at', () => {
  for (const url of ['', '/assets/local.svg', 'not a url', 'https://example.com/x.png']) {
    assert.equal(parseStorageUrl(url), null, `expected null for ${JSON.stringify(url)}`)
  }
})

test('an unsigned environment serves no artwork rather than the raw storage url', () => {
  // The failure that took the whole catalogue down once already: a missing
  // secret must cost the pictures, never the page, and never the artwork.
  const saved = process.env.CARD_ASSET_TOKEN_SECRET_CURRENT
  const savedEnv = process.env.NODE_ENV
  try {
    delete process.env.CARD_ASSET_TOKEN_SECRET_CURRENT
    delete process.env.CARD_ASSET_TOKEN_SECRET
    // NODE_ENV is readonly in the Next types but a plain writable string at
    // runtime; process.env rejects defineProperty descriptors outright.
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    assert.equal(mintArtworkToken(PRODUCT, NOW), null)
    assert.equal(artworkUrl(PRODUCT), null)
  } finally {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = savedEnv
    if (saved) process.env.CARD_ASSET_TOKEN_SECRET_CURRENT = saved
  }
})

test('development without a secret still renders, using a non-secret constant', () => {
  const saved = process.env.CARD_ASSET_TOKEN_SECRET_CURRENT
  try {
    delete process.env.CARD_ASSET_TOKEN_SECRET_CURRENT
    delete process.env.CARD_ASSET_TOKEN_SECRET
    const token = mintArtworkToken(PRODUCT, NOW)
    assert.ok(token)
    assert.equal(verifyArtworkToken(PRODUCT, token, NOW).ok, true)
  } finally {
    if (saved) process.env.CARD_ASSET_TOKEN_SECRET_CURRENT = saved
  }
})
