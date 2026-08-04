import assert from 'node:assert/strict'
import test from 'node:test'
import { formatImportLine, parseCsv, parseGuestImportRows } from './guest-import-rows'

test('preserves empty contact slots and imports Single/Double ticket sizes', () => {
  const { rows, unrecognizedTickets } = parseGuestImportRows([
    'Mr & Mrs Ngando, , 0713269227, Double',
    'Mrs Joyce Nkembo, , , Single',
  ].join('\n'))

  assert.deepEqual(rows, [
    { full_name: 'Mr & Mrs Ngando', email: null, phone: '0713269227', max_party_size: 2 },
    { full_name: 'Mrs Joyce Nkembo', email: null, phone: null, max_party_size: 1 },
  ])
  assert.deepEqual(unrecognizedTickets, [])
})

test('keeps the legacy three-column paste format as Single', () => {
  assert.deepEqual(parseGuestImportRows('Asha, asha@example.com, 0755000850').rows, [
    {
      full_name: 'Asha',
      email: 'asha@example.com',
      phone: '0755000850',
      max_party_size: 1,
    },
  ])
})

test('treats Swahili and couple ticket labels as a Double', () => {
  for (const label of ['Mbili', 'mbili', 'Couple', 'COUPLE', 'Wawili']) {
    const { rows, unrecognizedTickets } = parseGuestImportRows(`Bi. Zawadi, , , ${label}`)
    assert.equal(rows[0].max_party_size, 2, `${label} should import as a Double`)
    assert.deepEqual(unrecognizedTickets, [], `${label} should be recognized`)
  }
})

test('a name containing a comma survives the round-trip', () => {
  // A naive split would make the name "Ngando", the email "Jr.", drop the
  // phone entirely and silently downgrade the Double to a Single.
  const line = formatImportLine(['Ngando, Jr.', '', '0762269228', 'Double'])
  assert.equal(line, '"Ngando, Jr.", , 0762269228, Double')

  assert.deepEqual(parseGuestImportRows(line).rows, [
    { full_name: 'Ngando, Jr.', email: null, phone: '0762269228', max_party_size: 2 },
  ])
})

test('reports unrecognized ticket values instead of silently defaulting', () => {
  const { rows, unrecognizedTickets } = parseGuestImportRows(
    ['Asha, , 0755000001, VIP', 'Juma, , 0755000002, Doble', 'Neema, , 0755000003, VIP'].join('\n'),
  )

  assert.deepEqual(rows.map((r) => r.max_party_size), [1, 1, 1])
  // First-seen order, de-duplicated.
  assert.deepEqual(unrecognizedTickets, ['VIP', 'Doble'])
})

test('a blank ticket column is a Single and is not reported as unrecognized', () => {
  const { rows, unrecognizedTickets } = parseGuestImportRows(
    ['Foibe, , 0789566010, ', 'Tumaini Kimambo, , 0755000004'].join('\n'),
  )

  assert.deepEqual(rows.map((r) => r.max_party_size), [1, 1])
  assert.deepEqual(unrecognizedTickets, [])
})

test('skips rows without a name', () => {
  const { rows } = parseGuestImportRows([', a@example.com, 0712345678', 'Real Name, , 0713'].join('\n'))
  assert.deepEqual(rows.map((r) => r.full_name), ['Real Name'])
})

test('formatImportLine trims trailing empty fields but keeps interior slots', () => {
  assert.equal(formatImportLine(['Juma', '', '0712345678', '']), 'Juma, , 0712345678')
  assert.equal(formatImportLine(['NoPhone', '', '', '']), 'NoPhone')
  assert.equal(formatImportLine(['Quoted "Nick"', '', '', '']), '"Quoted ""Nick"""')
})

test('parseCsv handles quoted commas, escaped quotes and blank lines', () => {
  assert.deepEqual(parseCsv('a,b,c'), [['a', 'b', 'c']])
  assert.deepEqual(parseCsv('"Ngando, Jr.",x@e.com,0712'), [['Ngando, Jr.', 'x@e.com', '0712']])
  assert.deepEqual(parseCsv('"She said ""hi""",b'), [['She said "hi"', 'b']])
  assert.deepEqual(parseCsv('a,b\n\n  \nc,d'), [['a', 'b'], ['c', 'd']])
})
