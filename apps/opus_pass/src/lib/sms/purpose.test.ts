import assert from 'node:assert/strict'
import test from 'node:test'
import { SMS_PURPOSES, isBeemEnabledForPurpose, purposeFlagName, type SmsPurpose } from './purpose'

/**
 * Run with:
 *   npx tsx --test src/lib/sms/purpose.test.ts
 *
 * This gate is the reason the Beem work could be landed at all: without it,
 * configuring a gateway would have switched on every SMS surface in the app
 * simultaneously. The assertions that matter are the ones proving a surface
 * stays off.
 */

const ON = 'true'

function env(overrides: Record<string, string | undefined>): Record<string, string | undefined> {
  return { SMS_PROVIDER: 'beem', ...overrides }
}

test('a purpose is live only when its own flag is on', () => {
  assert.equal(
    isBeemEnabledForPurpose('invitation', env({ SMS_BEEM_INVITATIONS_ENABLED: ON })),
    true,
  )
  assert.equal(isBeemEnabledForPurpose('invitation', env({})), false)
})

test('enabling invitations leaves every other surface on the stub', () => {
  // The whole point of the gate: pledge nudges, staff sends and commission
  // notifications must not go live as a side effect of launching invitations.
  const e = env({ SMS_BEEM_INVITATIONS_ENABLED: ON })
  assert.equal(isBeemEnabledForPurpose('pledge', e), false)
  assert.equal(isBeemEnabledForPurpose('admin_pledge', e), false)
  assert.equal(isBeemEnabledForPurpose('commission', e), false)
})

test('each purpose has its own distinct flag', () => {
  const flags = SMS_PURPOSES.map(purposeFlagName)
  assert.equal(new Set(flags).size, SMS_PURPOSES.length)
})

test('every purpose defaults to off with an empty environment', () => {
  for (const purpose of SMS_PURPOSES) {
    assert.equal(isBeemEnabledForPurpose(purpose, {}), false, purpose)
  }
})

test('the per-purpose flag alone does nothing while SMS_PROVIDER is unset', () => {
  // Two independent switches, so a stray flag left in a .env cannot start
  // sending on its own.
  const flags: Record<string, string> = {}
  for (const purpose of SMS_PURPOSES) flags[purposeFlagName(purpose)] = ON
  for (const purpose of SMS_PURPOSES) {
    assert.equal(isBeemEnabledForPurpose(purpose, flags), false, purpose)
    assert.equal(isBeemEnabledForPurpose(purpose, { ...flags, SMS_PROVIDER: 'stub' }), false, purpose)
  }
})

test('only an explicit "true" counts as enabled', () => {
  for (const value of ['false', '0', '1', 'yes', 'TRUE ', '', ' ']) {
    const expected = value.trim().toLowerCase() === 'true'
    assert.equal(
      isBeemEnabledForPurpose('invitation', env({ SMS_BEEM_INVITATIONS_ENABLED: value })),
      expected,
      JSON.stringify(value),
    )
  }
})

test('SMS_PROVIDER matching is case- and whitespace-tolerant', () => {
  const e = { SMS_PROVIDER: ' Beem ', SMS_BEEM_INVITATIONS_ENABLED: ON }
  assert.equal(isBeemEnabledForPurpose('invitation', e), true)
})

test('turning one purpose off does not disturb the others', () => {
  const e = env({
    SMS_BEEM_INVITATIONS_ENABLED: ON,
    SMS_BEEM_PLEDGES_ENABLED: ON,
    SMS_BEEM_ADMIN_PLEDGES_ENABLED: 'false',
    SMS_BEEM_COMMISSIONS_ENABLED: ON,
  })
  const live = SMS_PURPOSES.filter((p) => isBeemEnabledForPurpose(p, e))
  assert.deepEqual(live, ['invitation', 'pledge', 'commission'] satisfies SmsPurpose[])
})
