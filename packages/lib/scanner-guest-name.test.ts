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
  assert.equal(scannerGuestDisplayName('2Pac'), '2Pac')
})

test('a leading number joined by a bare hyphen is part of the name', () => {
  // These read as list ordinals to a naive rule and lose their first character.
  assert.equal(scannerGuestDisplayName('3-D Productions'), '3-D Productions')
  assert.equal(scannerGuestDisplayName('24-7 Events'), '24-7 Events')
  assert.equal(scannerGuestDisplayName('7-Eleven'), '7-Eleven')
  // A SPACED hyphen is still the legacy list marker.
  assert.equal(scannerGuestDisplayName('33 - Mariam'), 'Mariam')
})

test('a bare amount is not row N of a guest named after its remainder', () => {
  assert.equal(scannerGuestDisplayName('1.5M'), '1.5M')
})

test('decorations are cleaned in either order', () => {
  assert.equal(scannerGuestDisplayName('Mariam 🅰️ 100K'), 'Mariam')
  assert.equal(scannerGuestDisplayName('Mariam 100K 🅰️'), 'Mariam')
})

test('always returns a usable fallback', () => {
  assert.equal(scannerGuestDisplayName(null), 'Guest')
  assert.equal(scannerGuestDisplayName('  '), 'Guest')
})
