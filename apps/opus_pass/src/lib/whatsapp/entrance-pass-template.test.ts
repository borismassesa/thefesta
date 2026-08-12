import assert from 'node:assert/strict'
import { test } from 'node:test'
import { entrancePassComponents } from './entrance-pass-template'
import type { EntrancePassSend } from './types'

const SEND: EntrancePassSend = {
  to: '255712345678',
  guestName: 'Test Guest',
  eventCategory: 'Harusi',
  coupleName: 'Asha & Juma',
  dateLabel: '10 Agosti 2026',
  timeLabel: '12:00',
  venue: 'Opus Gardens',
  headerImageUrl: 'https://opuspass.opusfesta.com/entrance-pass/test',
}

test('the existing entrance-pass template stays image-only', () => {
  const components = entrancePassComponents(SEND, false)
  assert.equal(components.length, 2)
  assert.deepEqual(components.map((component) => component.type), ['header', 'body'])
})

test('the wallet template receives one encoded dynamic URL suffix', () => {
  const walletToken = `WMT1:${'b'.repeat(43)}`
  const components = entrancePassComponents({ ...SEND, walletToken }, true)
  assert.equal(components.length, 3)
  assert.deepEqual(components[2], {
    type: 'button',
    sub_type: 'url',
    index: '0',
    parameters: [{ type: 'text', text: encodeURIComponent(walletToken) }],
  })
})

test('the wallet component cannot render without a guest capability', () => {
  const components = entrancePassComponents(SEND, true)
  assert.equal(components.length, 2)
})
