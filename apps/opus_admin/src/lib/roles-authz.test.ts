import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  canAssignRole,
  canDeleteRole,
  canGrantPermissionKeys,
  canReadRoles,
  canWriteRoleDefinition,
  expandRolePermissions,
  isCriticalRole,
  type AuthzCaller,
  type RoleSummary,
} from './roles-authz'
import { legacyRoleBucket } from './role-bucket'

// ---------------------------------------------------------------------------
// Fixtures mirroring the six roles actually in use in production, with the
// permission keys they hold as at 2026-07-31. The point of these tests is that
// NONE of them, except owner, may mutate roles — before this hotfix all six
// could, because legacyRoleBucket promoted every one of them to 'admin'.
// ---------------------------------------------------------------------------

const LIVE_ROLE_KEYS: Record<string, string[]> = {
  owner: [
    'cms.read', 'cms.write', 'cms.publish', 'vendor.read', 'vendor.moderate',
    'bookings.read', 'bookings.write', 'finance.read', 'finance.write',
    'workforce.read', 'workforce.write', 'workforce.payroll', 'insights.read',
    'platform.admin', 'growth.admin', 'growth.write', 'md_tracker.review',
    'opuspass.checkin', 'opuspass.tickets',
  ],
  admin: [
    'cms.read', 'cms.write', 'cms.publish', 'vendor.read', 'vendor.moderate',
    'bookings.read', 'bookings.write', 'finance.read', 'finance.write',
    'workforce.read', 'workforce.write', 'workforce.payroll', 'insights.read',
    'growth.admin', 'growth.write', 'md_tracker.review',
  ],
  'people-ops': [
    'insights.read', 'workforce.payroll', 'workforce.read', 'workforce.write',
    'growth.write', 'finance.read',
  ],
  finance: [
    'finance.write', 'bookings.read', 'insights.read', 'workforce.read',
    'workforce.payroll', 'growth.write', 'finance.read',
  ],
  'content-editor': ['cms.read', 'cms.write', 'cms.publish', 'vendor.read'],
  'vendor-success': [
    'vendor.moderate', 'bookings.read', 'cms.read', 'vendor.read', 'growth.write',
  ],
}

function caller(slug: string, employeeId = 'emp-self'): AuthzCaller {
  return {
    isOwner: slug === 'owner',
    // expandRolePermissions mirrors what getCallerPermissions applies at
    // runtime, so these fixtures exercise the real permission set.
    permissions: expandRolePermissions(new Set(LIVE_ROLE_KEYS[slug] ?? [])),
    employeeId,
  }
}

const role = (over: Partial<RoleSummary> = {}): RoleSummary => ({
  id: 'role-1',
  slug: 'support-agent',
  isSystem: false,
  permissionKeys: ['support.read'],
  ...over,
})

const ownerRole = role({ id: 'r-owner', slug: 'owner', isSystem: true, permissionKeys: LIVE_ROLE_KEYS.owner })
const adminRole = role({ id: 'r-admin', slug: 'admin', isSystem: true, permissionKeys: LIVE_ROLE_KEYS.admin })

describe('legacy bucket is no longer sufficient authorisation', () => {
  // Regression guard for the vulnerability itself. Each of these roles buckets
  // to 'owner' or 'admin', which is exactly what the old
  // requireAdminRole(['owner','admin']) gate accepted.
  const bucketsToAdminOrOwner = ['content-editor', 'vendor-success', 'finance', 'people-ops']

  for (const slug of bucketsToAdminOrOwner) {
    it(`${slug} still buckets to owner/admin but cannot mutate roles`, () => {
      const bucket = legacyRoleBucket(slug, LIVE_ROLE_KEYS[slug])
      assert.ok(
        bucket === 'admin' || bucket === 'owner',
        `${slug} expected to bucket to admin/owner, got ${bucket}`,
      )
      const c = caller(slug)
      assert.equal(canWriteRoleDefinition(c).allowed, false)
      assert.equal(canAssignRole(c, role(), ['emp-other']).allowed, false)
    })
  }
})

describe('canReadRoles', () => {
  it('owner may read', () => {
    assert.equal(canReadRoles(caller('owner')).allowed, true)
  })
  it('content-editor may not read (no workforce.read, so no roles.read)', () => {
    assert.equal(canReadRoles(caller('content-editor')).allowed, false)
  })
  it('workforce.read holders may read via the narrow legacy expansion', () => {
    assert.equal(canReadRoles(caller('finance')).allowed, true)
    assert.equal(canReadRoles(caller('people-ops')).allowed, true)
  })
})

describe('canWriteRoleDefinition', () => {
  it('rejects finance holding workforce.payroll', () => {
    assert.equal(canWriteRoleDefinition(caller('finance')).allowed, false)
  })
  it('rejects people-ops holding workforce.payroll and workforce.write', () => {
    assert.equal(canWriteRoleDefinition(caller('people-ops')).allowed, false)
  })
  it('rejects vendor-success', () => {
    assert.equal(canWriteRoleDefinition(caller('vendor-success')).allowed, false)
  })
  it('accepts an explicit roles.write holder', () => {
    const c: AuthzCaller = {
      isOwner: false,
      permissions: new Set(['workforce.roles.write']),
      employeeId: 'emp-self',
    }
    assert.equal(canWriteRoleDefinition(c).allowed, true)
  })
  it('roles.assign alone cannot edit a permission bundle', () => {
    const c: AuthzCaller = {
      isOwner: false,
      permissions: new Set(['workforce.roles.assign']),
      employeeId: 'emp-self',
    }
    assert.equal(canWriteRoleDefinition(c).allowed, false)
  })
  it('system roles stay locked even for an owner', () => {
    assert.equal(canWriteRoleDefinition(caller('owner'), adminRole).allowed, false)
  })
})

describe('canGrantPermissionKeys containment', () => {
  it('owner may grant anything', () => {
    assert.equal(
      canGrantPermissionKeys(caller('owner'), ['platform.admin']).allowed,
      true,
    )
  })
  it('a roles.write holder cannot mint a role granting platform.admin', () => {
    const c: AuthzCaller = {
      isOwner: false,
      permissions: new Set(['workforce.roles.write', 'cms.read']),
      employeeId: 'emp-self',
    }
    const decision = canGrantPermissionKeys(c, ['cms.read', 'platform.admin'])
    assert.equal(decision.allowed, false)
    assert.match(decision.allowed === false ? decision.reason : '', /platform\.admin/)
  })
  it('a roles.write holder may grant permissions they do hold', () => {
    const c: AuthzCaller = {
      isOwner: false,
      permissions: new Set(['workforce.roles.write', 'cms.read', 'cms.write']),
      employeeId: 'emp-self',
    }
    assert.equal(canGrantPermissionKeys(c, ['cms.read', 'cms.write']).allowed, true)
  })
})

describe('canAssignRole', () => {
  const assigner: AuthzCaller = {
    isOwner: false,
    permissions: new Set(['workforce.roles.assign', 'workforce.roles.read']),
    employeeId: 'emp-self',
  }

  it('roles.assign may assign an ordinary role to someone else', () => {
    assert.equal(canAssignRole(assigner, role(), ['emp-other']).allowed, true)
  })
  it('roles.assign cannot assign Owner', () => {
    assert.equal(canAssignRole(assigner, ownerRole, ['emp-other']).allowed, false)
  })
  it('roles.assign cannot assign Admin', () => {
    assert.equal(canAssignRole(assigner, adminRole, ['emp-other']).allowed, false)
  })
  it('roles.assign cannot assign a role carrying a critical permission', () => {
    const risky = role({ slug: 'ops-lead', permissionKeys: ['support.read', 'workforce.payroll'] })
    assert.equal(canAssignRole(assigner, risky, ['emp-other']).allowed, false)
  })
  it('caller cannot include themselves in the member set', () => {
    const decision = canAssignRole(assigner, role(), ['emp-other', 'emp-self'])
    assert.equal(decision.allowed, false)
    assert.match(decision.allowed === false ? decision.reason : '', /yourself/i)
  })
  // Regression: an earlier guard read `caller.employeeId && targetIds.includes(...)`,
  // so an unresolved employee id silently SKIPPED the self-elevation check
  // instead of blocking. A non-owner whose id we cannot resolve must be denied,
  // not waved through.
  it('fails CLOSED when the caller employee id cannot be resolved', () => {
    const unresolved: AuthzCaller = { ...assigner, employeeId: null }
    const decision = canAssignRole(unresolved, role(), ['emp-other'])
    assert.equal(decision.allowed, false)
  })
  it('an owner is still allowed when their employee id is unresolved', () => {
    const owner: AuthzCaller = { isOwner: true, permissions: new Set(), employeeId: null }
    assert.equal(canAssignRole(owner, role(), ['emp-other']).allowed, true)
  })
  // Self-REMOVAL is de-escalation and stays permitted. Pinned so the asymmetry
  // with self-addition above is deliberate rather than accidental.
  it('caller may remove themselves by omitting their own id', () => {
    assert.equal(canAssignRole(assigner, role(), ['emp-other']).allowed, true)
  })
  it('roles.write alone cannot assign members', () => {
    const writer: AuthzCaller = {
      isOwner: false,
      permissions: new Set(['workforce.roles.write']),
      employeeId: 'emp-self',
    }
    assert.equal(canAssignRole(writer, role(), ['emp-other']).allowed, false)
  })
  it('owner may assign Owner, including to themselves', () => {
    assert.equal(canAssignRole(caller('owner'), ownerRole, ['emp-self']).allowed, true)
  })
})

describe('canDeleteRole', () => {
  it('non-owner with roles.write cannot delete', () => {
    const c: AuthzCaller = {
      isOwner: false,
      permissions: new Set(['workforce.roles.write']),
      employeeId: 'emp-self',
    }
    assert.equal(canDeleteRole(c, role()).allowed, false)
  })
  it('owner may delete a custom role', () => {
    assert.equal(canDeleteRole(caller('owner'), role()).allowed, true)
  })
  it('nobody may delete a system role', () => {
    assert.equal(canDeleteRole(caller('owner'), adminRole).allowed, false)
  })
})

describe('expandRolePermissions', () => {
  it('workforce.read expands to roles.read', () => {
    const out = expandRolePermissions(new Set(['workforce.read']))
    assert.equal(out.has('workforce.roles.read'), true)
  })
  it('workforce.write does NOT expand to roles.write', () => {
    const out = expandRolePermissions(new Set(['workforce.write']))
    assert.equal(out.has('workforce.roles.write'), false)
  })
  it('workforce.write does NOT expand to roles.assign', () => {
    const out = expandRolePermissions(new Set(['workforce.write']))
    assert.equal(out.has('workforce.roles.assign'), false)
  })
  it('does not invent roles.read for callers without workforce.read', () => {
    const out = expandRolePermissions(new Set(['cms.read']))
    assert.equal(out.has('workforce.roles.read'), false)
  })
})

// fallbackRolePermissions is not exported, and admin-auth.ts pulls in
// `server-only` transitively, so it cannot be imported here. This asserts the
// invariant against the SOURCE instead. Crude, but the alternative is no guard
// at all on a branch that already shipped this exact bug once: the fallback is
// reached on an RPC error, and the role it switches on comes from
// legacyRoleBucket, which promotes finance / people-ops / content-editor /
// vendor-success to 'admin'. Granting mutating roles.* keys there hands those
// four full RBAC control during any transient DB failure.
describe('fallbackRolePermissions must not fail open on roles.*', () => {
  const source = readFileSync(
    new URL('./admin-auth.ts', import.meta.url),
    'utf8',
  )
  const fallbackBody = source.slice(
    source.indexOf('function fallbackRolePermissions'),
  )
  const adminArm = fallbackBody.slice(0, fallbackBody.indexOf("case 'editor':"))

  it('grants roles.read in the owner/admin fallback arm', () => {
    assert.match(adminArm, /'workforce\.roles\.read'/)
  })
  it('does NOT grant roles.write in the fallback arm', () => {
    assert.doesNotMatch(adminArm, /'workforce\.roles\.write'/)
  })
  it('does NOT grant roles.assign in the fallback arm', () => {
    assert.doesNotMatch(adminArm, /'workforce\.roles\.assign'/)
  })
})

describe('isCriticalRole', () => {
  it('flags platform.admin', () => {
    assert.equal(isCriticalRole(['cms.read', 'platform.admin']), true)
  })
  it('flags payroll and finance.write', () => {
    assert.equal(isCriticalRole(['workforce.payroll']), true)
    assert.equal(isCriticalRole(['finance.write']), true)
  })
  it('does not flag an ordinary bundle', () => {
    assert.equal(isCriticalRole(['cms.read', 'support.read']), false)
  })
})
