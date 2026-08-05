import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  ALL_PERMISSION_KEYS,
  CMS_PUBLISH_EXPANSION,
  CMS_READ_EXPANSION,
  CMS_WRITE_EXPANSION,
  DIGITAL_CARDS_KEYS,
  LEGACY_READ_EXPANSION,
  LEGACY_WRITE_EXPANSION,
  NEVER_EXPANDED,
  expandLegacyPermissions,
} from './permissions'
import { PERMISSIONS } from '../../app/(admin)/workforce/_lib/types'

describe('catalogue synchronisation', () => {
  // The regression this guards: ALL_PERMISSION_KEYS and PERMISSIONS were
  // maintained by hand in two files and drifted. support.read / support.write
  // existed in the former but not the latter, and because
  // roles/actions.ts validates against PERMISSIONS, Support access could not
  // be granted through the Roles UI at all.
  const catalogueKeys = new Set(ALL_PERMISSION_KEYS)
  const displayKeys = new Set(PERMISSIONS.map((p) => p.key))

  it('every catalogue key has a display entry', () => {
    const missing = [...catalogueKeys].filter((k) => !displayKeys.has(k))
    assert.deepEqual(missing, [], `keys held but invisible in the Roles matrix: ${missing.join(', ')}`)
  })

  it('every display entry is a real catalogue key', () => {
    const extra = [...displayKeys].filter((k) => !catalogueKeys.has(k))
    assert.deepEqual(extra, [], `grantable but never held: ${extra.join(', ')}`)
  })

  it('has no duplicate keys', () => {
    assert.equal(ALL_PERMISSION_KEYS.length, catalogueKeys.size)
    assert.equal(PERMISSIONS.length, displayKeys.size)
  })

  it('every display entry has a label and description', () => {
    for (const p of PERMISSIONS) {
      assert.ok(p.label.length > 0, `${p.key} has no label`)
      assert.ok(p.description.length > 0, `${p.key} has no description`)
    }
  })
})

describe('expandLegacyPermissions', () => {
  it('workforce.read yields every read key', () => {
    const out = expandLegacyPermissions(new Set(['workforce.read']))
    for (const k of LEGACY_READ_EXPANSION) {
      assert.ok(out.has(k), `expected ${k}`)
    }
  })

  it('workforce.read yields NO write keys', () => {
    const out = expandLegacyPermissions(new Set(['workforce.read']))
    for (const k of LEGACY_WRITE_EXPANSION) {
      assert.equal(out.has(k), false, `workforce.read must not grant ${k}`)
    }
  })

  it('workforce.write yields both read and write keys', () => {
    const out = expandLegacyPermissions(new Set(['workforce.write']))
    for (const k of [...LEGACY_READ_EXPANSION, ...LEGACY_WRITE_EXPANSION]) {
      assert.ok(out.has(k), `expected ${k}`)
    }
  })

  it('never grants an excluded key, from either legacy key', () => {
    for (const legacy of ['workforce.read', 'workforce.write']) {
      const out = expandLegacyPermissions(new Set([legacy]))
      for (const k of NEVER_EXPANDED) {
        assert.equal(out.has(k), false, `${legacy} must not grant ${k}`)
      }
    }
  })

  it('workforce.write does not grant roles.write or roles.assign', () => {
    const out = expandLegacyPermissions(new Set(['workforce.write']))
    assert.equal(out.has('workforce.roles.write'), false)
    assert.equal(out.has('workforce.roles.assign'), false)
  })

  it('workforce.read still grants roles.read (preserves current visibility)', () => {
    const out = expandLegacyPermissions(new Set(['workforce.read']))
    assert.equal(out.has('workforce.roles.read'), true)
  })

  it('grants nothing to a caller holding no expanding key', () => {
    // Was ['cms.read', 'support.read']. cms.read now expands into
    // digitalcards.read, so this case needs keys that expand into nothing at
    // all — otherwise it asserts the absence of an expansion we added on
    // purpose. The cms.* mapping has its own block below.
    const out = expandLegacyPermissions(new Set(['vendor.read', 'support.read']))
    assert.deepEqual([...out].sort(), ['support.read', 'vendor.read'])
  })

  it('is pure: does not mutate its input', () => {
    const input = new Set(['workforce.write'])
    expandLegacyPermissions(input)
    assert.deepEqual([...input], ['workforce.write'])
  })

  it('every expanded key is a real catalogue key', () => {
    const known = new Set(ALL_PERMISSION_KEYS)
    for (const k of [...LEGACY_READ_EXPANSION, ...LEGACY_WRITE_EXPANSION]) {
      assert.ok(known.has(k), `${k} is expanded but not in the catalogue`)
    }
  })

  it('read and write expansions do not overlap', () => {
    const read = new Set<string>(LEGACY_READ_EXPANSION)
    const overlap = LEGACY_WRITE_EXPANSION.filter((k) => read.has(k))
    assert.deepEqual(overlap, [])
  })
})

// ---------------------------------------------------------------------------
// cms.* -> digitalcards.* compatibility
// ---------------------------------------------------------------------------
// Digital Cards moved off the website-content keys onto its own. These tests
// guard the property that made that deploy safe: every gate that used to read
// a cms.* key must still open for whoever held it, and nothing more.
describe('Digital Cards expansion', () => {
  it('cms.read grants read but never write or publish', () => {
    const out = expandLegacyPermissions(new Set(['cms.read']))
    assert.equal(out.has('digitalcards.read'), true)
    assert.equal(out.has('digitalcards.write'), false)
    assert.equal(out.has('digitalcards.publish'), false)
  })

  it('cms.write grants write AND read', () => {
    // Read is included because every cms.write holder also passed the old
    // cms.read page gate; granting write alone would let someone save a card
    // they could not open.
    const out = expandLegacyPermissions(new Set(['cms.write']))
    assert.equal(out.has('digitalcards.read'), true)
    assert.equal(out.has('digitalcards.write'), true)
    assert.equal(out.has('digitalcards.publish'), false)
  })

  it('cms.publish grants publish but not write', () => {
    // Mirrors the old gates exactly: approveAndRelease required cms.publish
    // and nothing else, so publish does not imply the ability to edit values.
    const out = expandLegacyPermissions(new Set(['cms.publish']))
    assert.equal(out.has('digitalcards.publish'), true)
    assert.equal(out.has('digitalcards.write'), false)
  })

  it('the full CMS trio reproduces the whole Digital Cards surface', () => {
    const out = expandLegacyPermissions(new Set(['cms.read', 'cms.write', 'cms.publish']))
    for (const k of DIGITAL_CARDS_KEYS) {
      assert.ok(out.has(k), `a full CMS holder lost ${k}`)
    }
  })

  it('a caller with no CMS key gains no card access', () => {
    const out = expandLegacyPermissions(new Set(['commissions.read', 'finance.read']))
    for (const k of DIGITAL_CARDS_KEYS) {
      assert.equal(out.has(k), false, `${k} was granted without any cms.* key`)
    }
  })

  it('every digitalcards key is in the catalogue', () => {
    const known = new Set(ALL_PERMISSION_KEYS)
    for (const k of DIGITAL_CARDS_KEYS) {
      assert.ok(known.has(k), `${k} is used but not in the catalogue`)
    }
  })

  it('every key the CMS expansions produce is a real digitalcards key', () => {
    const declared = new Set<string>(DIGITAL_CARDS_KEYS)
    for (const k of [...CMS_READ_EXPANSION, ...CMS_WRITE_EXPANSION, ...CMS_PUBLISH_EXPANSION]) {
      assert.ok(declared.has(k), `${k} is expanded but is not a Digital Cards key`)
    }
  })

  it('is pure: does not mutate its input', () => {
    const input = new Set(['cms.publish'])
    expandLegacyPermissions(input)
    assert.deepEqual([...input], ['cms.publish'])
  })
})
