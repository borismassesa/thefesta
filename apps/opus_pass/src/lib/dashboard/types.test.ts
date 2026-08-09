import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DOUBLE_TICKET_PARTY,
  MAX_SELF_SERVICE_PARTY,
  MAX_TICKET_PARTY,
  SINGLE_TICKET_PARTY,
  TICKET_TYPES,
  WAKWE_TICKET_PARTY,
  ticketPartyFor,
  ticketTypeLabel,
} from './types'

// ------------------------------------------------------------- the sold table

test('the ticket table is ordered by size, which ticketPartyFor relies on', () => {
  const sizes = TICKET_TYPES.map((t) => t.size)
  assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b))
  assert.deepEqual(sizes, [1, 2, 10])
})

test('MAX_TICKET_PARTY is the largest sold ticket', () => {
  assert.equal(MAX_TICKET_PARTY, Math.max(...TICKET_TYPES.map((t) => t.size)))
  assert.equal(MAX_TICKET_PARTY, WAKWE_TICKET_PARTY)
})

test('self-service stops below Wakwe, which is a host allocation only', () => {
  // A public RSVP or pledge link is filled in by someone the couple has not
  // vetted; if this ever reached MAX_TICKET_PARTY a stranger could mint ten
  // admissions for themselves.
  assert.equal(MAX_SELF_SERVICE_PARTY, DOUBLE_TICKET_PARTY)
  assert.ok(MAX_SELF_SERVICE_PARTY < WAKWE_TICKET_PARTY)
})

// ------------------------------------------------------------ ticketPartyFor

test('every sold size survives a write unchanged', () => {
  for (const { size, label } of TICKET_TYPES) {
    assert.equal(ticketPartyFor(size), size, `${label} must not be rewritten`)
  }
})

test('a count between two tickets settles onto the one it covers', () => {
  // Floors rather than rounds: storing 9 as a Wakwe would hand out an
  // admission the couple never allocated.
  assert.equal(ticketPartyFor(3), DOUBLE_TICKET_PARTY)
  assert.equal(ticketPartyFor(9), DOUBLE_TICKET_PARTY)
  assert.equal(ticketPartyFor(11), WAKWE_TICKET_PARTY)
  assert.equal(ticketPartyFor(999), WAKWE_TICKET_PARTY)
})

test('junk and sub-one values fall back to a Single rather than zero seats', () => {
  // entry_allowance is CHECK (>= 1) in Postgres, so a 0 here is a write error,
  // not a smaller ticket.
  for (const value of [null, undefined, 0, -4, Number.NaN]) {
    assert.equal(ticketPartyFor(value as number | null | undefined), SINGLE_TICKET_PARTY)
  }
  assert.equal(ticketPartyFor(1.9), SINGLE_TICKET_PARTY)
})

// ----------------------------------------------------------- ticketTypeLabel

test('each ticket is named after itself', () => {
  assert.equal(ticketTypeLabel(1), 'Single')
  assert.equal(ticketTypeLabel(2), 'Double')
  assert.equal(ticketTypeLabel(10), 'Wakwe')
})

test('a legacy count reads as the ticket it covers, never as a bare number', () => {
  // Rows predating the snap-on-write rule still hold odd counts; the couple's
  // roster has to name them in ticket words.
  assert.equal(ticketTypeLabel(3), 'Double')
  assert.equal(ticketTypeLabel(12), 'Wakwe')
  assert.equal(ticketTypeLabel(null), 'Single')
})
