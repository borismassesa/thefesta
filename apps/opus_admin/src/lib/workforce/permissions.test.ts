import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  ALL_PERMISSION_KEYS,
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

  it('grants nothing to a caller holding neither legacy key', () => {
    const out = expandLegacyPermissions(new Set(['cms.read', 'support.read']))
    assert.deepEqual([...out].sort(), ['cms.read', 'support.read'])
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
