import assert from 'node:assert/strict'
import test from 'node:test'
import { scannerGuestDisplayName } from './scanner-guest-name'

test('removes legacy row, pledge and status decorations from scanner names', () => {
  assert.equal(scannerGuestDisplayName('33.Mariam Werema 100K 🅰️'), 'Mariam Werema')
  assert.equal(scannerGuestDisplayName('35.Mathias Albert 300K✅'), 'Mathias Albert')
  assert.equal(scannerGuestDisplayName('39.Paul Sabuka 200K✅'), 'Paul Sabuka')
  assert.equal(scannerGuestDisplayName('40) Harold Mbise TZS 1.5M ✔️'), 'Harold Mbise')
})

test('leaves legitimate names and numbers alone', () => {
  assert.equal(scannerGuestDisplayName('Dr. Asha Kweka'), 'Dr. Asha Kweka')
  assert.equal(scannerGuestDisplayName('Juma A'), 'Juma A')
  assert.equal(scannerGuestDisplayName('100K Band'), '100K Band')
  assert.equal(scannerGuestDisplayName('Guest 2'), 'Guest 2')
})

test('always returns a usable fallback', () => {
  assert.equal(scannerGuestDisplayName(null), 'Guest')
  assert.equal(scannerGuestDisplayName('  '), 'Guest')
})
