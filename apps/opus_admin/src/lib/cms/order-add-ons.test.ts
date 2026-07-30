import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADD_ON_DOOR_SCAN,
  ADD_ON_PRINTED_CARDS,
  parseAddOnLabel,
  readOrderLine,
  readOrderTotals,
} from './order-add-ons'

// The four add-on labels that actually exist across the live paid orders.
const LIVE_LABELS = [
  '25 paper prints',
  '25 premium printed cards',
  '50 premium printed cards',
  'On-site attendant',
]

test('parses every add-on label present in live orders', () => {
  for (const label of LIVE_LABELS) {
    assert.ok(parseAddOnLabel(label), `"${label}" must be understood`)
  }
})

test('recovers the print quantity from both historical wordings', () => {
  // Same add-on, two CMS titles — this drift is why parsing is a fallback.
  assert.equal(parseAddOnLabel('25 paper prints')?.qty, 25)
  assert.equal(parseAddOnLabel('25 paper prints')?.code, ADD_ON_PRINTED_CARDS)
  assert.equal(parseAddOnLabel('25 premium printed cards')?.qty, 25)
  assert.equal(parseAddOnLabel('25 premium printed cards')?.code, ADD_ON_PRINTED_CARDS)
  assert.equal(parseAddOnLabel('50 premium printed cards')?.qty, 50)
})

test('a flat add-on with no quantity counts as one', () => {
  const attendant = parseAddOnLabel('On-site attendant')
  assert.equal(attendant?.code, ADD_ON_DOOR_SCAN)
  assert.equal(attendant?.qty, 1)
})

test('handles thousands separators', () => {
  assert.equal(parseAddOnLabel('1,200 premium printed cards')?.qty, 1200)
})

test('refuses to guess at an unknown label', () => {
  // Inventing a code here would put a wrong number in front of a printer.
  assert.equal(parseAddOnLabel('12 mystery extras'), null)
  assert.equal(parseAddOnLabel(''), null)
})

test('structured add-ons are used as-is, with no inference', () => {
  const line = readOrderLine({
    guests: 50,
    addOns: ['25 premium printed cards'],
    addOnItems: [{ code: ADD_ON_PRINTED_CARDS, label: 'Premium printed cards', qty: 25, amount: 50000 }],
  })
  assert.equal(line.digitalCards, 50)
  assert.equal(line.printedCards, 25)
  assert.equal(line.inferred, false, 'structured data must not be flagged as inferred')
})

test('structured data wins even when the display string disagrees', () => {
  // A CMS rename can leave the label stale; the structured qty is authoritative.
  const line = readOrderLine({
    guests: 100,
    addOns: ['25 paper prints'],
    addOnItems: [{ code: ADD_ON_PRINTED_CARDS, label: 'Premium printed cards', qty: 40, amount: 80000 }],
  })
  assert.equal(line.printedCards, 40)
})

test('legacy rows fall back to parsing and are flagged', () => {
  const line = readOrderLine({ guests: 50, addOns: ['25 premium printed cards', 'On-site attendant'] })
  assert.equal(line.digitalCards, 50)
  assert.equal(line.printedCards, 25)
  assert.equal(line.inferred, true, 'a parsed count must be visibly uncertain')
  assert.deepEqual(line.unparsed, [])
})

test('a line with no add-ons is not flagged as inferred', () => {
  const line = readOrderLine({ guests: 50, addOns: [] })
  assert.equal(line.printedCards, 0)
  assert.equal(line.inferred, false, 'nothing was inferred, so nothing to warn about')
})

test('unrecognised labels are reported, never dropped', () => {
  const line = readOrderLine({ guests: 50, addOns: ['25 premium printed cards', '3 unicorns'] })
  assert.equal(line.printedCards, 25)
  assert.deepEqual(line.unparsed, ['3 unicorns'])
})

test('a missing guest count reads as zero rather than NaN', () => {
  assert.equal(readOrderLine({}).digitalCards, 0)
  assert.equal(readOrderLine({ guests: null }).digitalCards, 0)
})

test('several print add-ons on one line add up', () => {
  const line = readOrderLine({
    guests: 50,
    addOnItems: [
      { code: ADD_ON_PRINTED_CARDS, label: 'Premium printed cards', qty: 25, amount: 50000 },
      { code: ADD_ON_PRINTED_CARDS, label: 'Premium printed cards', qty: 15, amount: 30000 },
    ],
  })
  assert.equal(line.printedCards, 40)
})

test('order totals roll up every line', () => {
  // The real shape of a multi-card order: one 2026-07 order held six cards.
  const totals = readOrderTotals([
    { guests: 50, addOns: ['25 premium printed cards'] },
    { guests: 50, addOns: [] },
    { guests: 100, addOns: ['On-site attendant'] },
  ])
  assert.equal(totals.digitalCards, 200)
  assert.equal(totals.printedCards, 25)
  assert.equal(totals.inferred, true, 'one line was parsed, so the total is uncertain')
})

test('totals of an empty order are zero, not NaN', () => {
  const totals = readOrderTotals([])
  assert.equal(totals.digitalCards, 0)
  assert.equal(totals.printedCards, 0)
  assert.equal(totals.inferred, false)
})
