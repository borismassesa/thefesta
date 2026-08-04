import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFileSync } from 'node:fs'

import { decideStageAfterSave, isReleasedDesign } from './design-save-stage'

/** The 19-ish roles a mapped card asks for, shortened. */
const KEYS = ['hosts_names', 'couple_name_1', 'couple_name_2', 'day', 'month']
const ALL_FILLED = {
  hosts_names: 'Bw & Bi Ambukege Seeta',
  couple_name_1: 'Moses Seeta',
  couple_name_2: 'Dayness Mwandri',
  day: '08',
  month: 'AGOSTI',
}

describe('a job stops waiting on the couple once nothing is outstanding', () => {
  it('advances an awaiting_info job whose fields the designer filled in themselves', () => {
    // The original defect: requested_fields never held anything, because nobody
    // ticked an Ask box, so the job sat on "Waiting on couple" with every field
    // answered and no button that could move it.
    const decision = decideStageAfterSave({
      status: 'awaiting_info',
      requestedFields: [],
      merged: ALL_FILLED,
      requestableKeys: KEYS,
    })
    assert.equal(decision.status, 'in_design')
  })

  it('does not claim the couple answered when the designer typed it', () => {
    // info_received_at drives the editor's "Answered <date>" caption, which
    // would be a lie about who supplied the values.
    const decision = decideStageAfterSave({
      status: 'awaiting_info',
      requestedFields: [],
      merged: ALL_FILLED,
      requestableKeys: KEYS,
    })
    assert.equal(decision.stampInfoReceived, false)
  })

  it('still stamps info_received_at when a real request is closed out', () => {
    const decision = decideStageAfterSave({
      status: 'awaiting_info',
      requestedFields: ['couple_name_2'],
      merged: ALL_FILLED,
      requestableKeys: KEYS,
    })
    assert.equal(decision.status, 'in_design')
    assert.equal(decision.stampInfoReceived, true)
    assert.deepEqual(decision.requestedFields, [])
  })

  it('keeps waiting while any field is still blank', () => {
    const decision = decideStageAfterSave({
      status: 'awaiting_info',
      requestedFields: [],
      merged: { ...ALL_FILLED, month: '   ' },
      requestableKeys: KEYS,
    })
    assert.equal(decision.status, null)
  })

  it('keeps waiting while a requested field is unanswered', () => {
    const decision = decideStageAfterSave({
      status: 'awaiting_info',
      requestedFields: ['day', 'month'],
      merged: { ...ALL_FILLED, month: '' },
      requestableKeys: KEYS,
    })
    assert.equal(decision.status, null)
    assert.deepEqual(decision.requestedFields, ['month'])
  })

  it('does not advance a card with no requestable fields at all', () => {
    // An unmapped card asks for nothing, so `every` over an empty list would be
    // vacuously true and would advance a job that cannot be designed yet.
    const decision = decideStageAfterSave({
      status: 'awaiting_info',
      requestedFields: [],
      merged: {},
      requestableKeys: [],
    })
    assert.equal(decision.status, null)
  })
})

describe('a released card is never dragged backwards', () => {
  for (const status of ['ready', 'delivered'] as const) {
    it(`leaves a ${status} card alone when the last request is answered`, () => {
      // OpusPass resolves guest cards with `.in('status', ['ready','delivered'])`,
      // so demoting one makes the couple's delivered card stop resolving.
      const decision = decideStageAfterSave({
        status,
        requestedFields: ['couple_name_2'],
        merged: ALL_FILLED,
        requestableKeys: KEYS,
      })
      assert.equal(decision.status, null)
      assert.equal(decision.stampInfoReceived, true)
    })
  }
})

describe('isReleasedDesign names exactly the statuses OpusPass resolves', () => {
  it('is true for the two guest-facing statuses and false for the rest', () => {
    // Guest cards resolve with `.in('status', ['ready', 'delivered'])`. If this
    // set ever drifts from that filter, every caller's demotion guard drifts too.
    assert.equal(isReleasedDesign('ready'), true)
    assert.equal(isReleasedDesign('delivered'), true)
    for (const status of ['awaiting_info', 'in_design', 'in_review']) {
      assert.equal(isReleasedDesign(status), false, status)
    }
  })
})

describe('requestDesignInfo cannot demote a released card either', () => {
  // The rule is enforced inside a server action wrapped in Supabase calls, so
  // this is a source-level guard rather than a behavioural test. The hole it
  // closes: the footer's request button writes `status` on every click, and it
  // renders for a ready/delivered card exactly as it does for any other. One
  // click with nothing ticked used to set in_design, dropping the card out of
  // OpusPass's guest lookup while the couple's order still said delivered.
  const actionsSrc = readFileSync(
    new URL(
      '../../app/(admin)/opus-pass/digital-cards/designer/actions.ts',
      import.meta.url,
    ),
    'utf8',
  )
  const requestDesignInfoBody = actionsSrc.slice(
    actionsSrc.indexOf('export async function requestDesignInfo'),
    actionsSrc.indexOf('export async function saveDesignFieldValues'),
  )

  it('reads the current status before writing one', () => {
    assert.match(requestDesignInfoBody, /\.select\([^)]*status/)
  })

  it('gates its status write on isReleasedDesign', () => {
    assert.match(requestDesignInfoBody, /isReleasedDesign\(design\.status\)/)
    // The write must sit INSIDE the guard, not beside it.
    assert.doesNotMatch(requestDesignInfoBody, /^\s*status: clean\.length > 0/m)
  })
})

describe('stages other than awaiting_info are left where they are', () => {
  for (const status of ['in_design', 'in_review'] as const) {
    it(`a complete save does not move an ${status} card`, () => {
      const decision = decideStageAfterSave({
        status,
        requestedFields: [],
        merged: ALL_FILLED,
        requestableKeys: KEYS,
      })
      assert.equal(decision.status, null)
    })
  }
})
