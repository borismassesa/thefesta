import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CRITICAL_BYPASS_REASON, resolvePreference, type PreferenceRow } from './preferences'

// Preference resolution decides whether a person hears about something at all,
// so the failure mode is silence — the hardest kind of bug to notice in
// production. These cases pin the rules the migration comments promise.

const ME = 'emp-1'
const OTHER = 'emp-2'
const EVENT = 'approval.submitted'

function row(over: Partial<PreferenceRow> = {}): PreferenceRow {
  return {
    employee_id: ME,
    event_type: EVENT,
    bell_enabled: true,
    email_enabled: true,
    digest_frequency: 'immediate',
    ...over,
  }
}

describe('resolvePreference', () => {
  it('delivers when no preference row exists', () => {
    // The load-bearing default. "Absent means enabled" is what stops the first
    // request after launch reaching nobody.
    for (const channel of ['bell', 'email'] as const) {
      const d = resolvePreference([], ME, EVENT, channel, 'high')
      assert.equal(d.deliver, true)
      assert.equal(d.bypassed, false)
    }
  })

  it('ignores rows belonging to a different employee', () => {
    const rows = [row({ employee_id: OTHER, bell_enabled: false, email_enabled: false })]
    assert.equal(resolvePreference(rows, ME, EVENT, 'bell', 'high').deliver, true)
    assert.equal(resolvePreference(rows, ME, EVENT, 'email', 'high').deliver, true)
  })

  it('honours an explicit opt-out per channel', () => {
    const rows = [row({ bell_enabled: false, email_enabled: true })]
    assert.equal(resolvePreference(rows, ME, EVENT, 'bell', 'high').deliver, false)
    assert.equal(resolvePreference(rows, ME, EVENT, 'email', 'high').deliver, true)
  })

  it('falls back to the blanket * row when no exact match exists', () => {
    const rows = [row({ event_type: '*', email_enabled: false })]
    assert.equal(resolvePreference(rows, ME, 'approval.approved', 'email', 'normal').deliver, false)
  })

  it('prefers an exact event row over the blanket * row', () => {
    const rows = [
      row({ event_type: '*', email_enabled: false }),
      row({ event_type: EVENT, email_enabled: true }),
    ]
    assert.equal(resolvePreference(rows, ME, EVENT, 'email', 'high').deliver, true)
  })

  it("treats digest_frequency 'off' as silencing email but not the bell", () => {
    const rows = [row({ digest_frequency: 'off' })]
    assert.equal(resolvePreference(rows, ME, EVENT, 'email', 'high').deliver, false)
    assert.equal(resolvePreference(rows, ME, EVENT, 'bell', 'high').deliver, true)
  })

  it('delivers immediately for daily/weekly, since no scheduler consumes them yet', () => {
    // Deferring to a digest that nothing sends would silently drop the message.
    for (const digest of ['daily', 'weekly']) {
      const rows = [row({ digest_frequency: digest })]
      assert.equal(resolvePreference(rows, ME, EVENT, 'email', 'high').deliver, true)
    }
  })

  it('lets critical priority override a disabled bell, and records why', () => {
    const rows = [row({ bell_enabled: false })]
    const d = resolvePreference(rows, ME, EVENT, 'bell', 'critical')
    assert.equal(d.deliver, true)
    assert.equal(d.bypassed, true)
    assert.equal(d.bypassReason, CRITICAL_BYPASS_REASON)
  })

  it('does not let critical priority override a disabled email channel', () => {
    // Email may be off at the mail-server level; forcing it achieves nothing.
    const rows = [row({ email_enabled: false })]
    const d = resolvePreference(rows, ME, EVENT, 'email', 'critical')
    assert.equal(d.deliver, false)
    assert.equal(d.bypassed, false)
  })

  it('does not mark a bypass when the preference already allowed delivery', () => {
    const d = resolvePreference([row()], ME, EVENT, 'bell', 'critical')
    assert.equal(d.deliver, true)
    assert.equal(d.bypassed, false)
    assert.equal(d.bypassReason, null)
  })

  it('respects a disabled preference for non-critical priorities', () => {
    for (const priority of ['high', 'normal', 'info'] as const) {
      const rows = [row({ bell_enabled: false })]
      assert.equal(resolvePreference(rows, ME, EVENT, 'bell', priority).deliver, false)
    }
  })
})
