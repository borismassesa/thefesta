import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGuestImportRows } from './guest-import-rows'

test('preserves empty contact slots and imports Single/Double ticket sizes', () => {
  assert.deepEqual(
    parseGuestImportRows([
      'Mr & Mrs Ngando, , 0713269227, Double',
      'Mrs Joyce Nkembo, , , Single',
    ].join('\n')),
    [
      {
        full_name: 'Mr & Mrs Ngando',
        email: null,
        phone: '0713269227',
        max_party_size: 2,
      },
      {
        full_name: 'Mrs Joyce Nkembo',
        email: null,
        phone: null,
        max_party_size: 1,
      },
    ],
  )
})

test('keeps the legacy three-column paste format as Single', () => {
  assert.deepEqual(parseGuestImportRows('Asha, asha@example.com, 0755000850'), [
    {
      full_name: 'Asha',
      email: 'asha@example.com',
      phone: '0755000850',
      max_party_size: 1,
    },
  ])
})
