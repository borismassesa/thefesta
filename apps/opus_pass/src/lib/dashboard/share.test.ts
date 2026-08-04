import assert from 'node:assert/strict'
import test from 'node:test'
import { firstNameOf, fullNameOf } from './share'

/**
 * Honorific stripping for greetings.
 *
 * Run with:
 *   npx tsx --test src/lib/dashboard/share.test.ts
 */

test('a plain name is returned untouched', () => {
  assert.equal(firstNameOf('Boris Massesa'), 'Boris')
  assert.equal(fullNameOf('Boris Massesa'), 'Boris Massesa')
})

test('a single leading title is skipped', () => {
  assert.equal(firstNameOf('Mr Boris Massesa'), 'Boris')
  assert.equal(fullNameOf('Mr. Boris Massesa'), 'Boris Massesa')
})

test('Swahili honorifics are skipped too', () => {
  assert.equal(firstNameOf('Mzee Juma Ally'), 'Juma')
  assert.equal(firstNameOf('Bi. Zawadi Mushi'), 'Zawadi')
})

test('a compound "Mr & Mrs" greets the name, not the ampersand', () => {
  // The title dropdown offers "Mr & Mrs" for a couple invited on one row, so
  // the connector has to be skipped along with the two honorifics.
  assert.equal(firstNameOf('Mr & Mrs Boris Massesa'), 'Boris')
  assert.equal(fullNameOf('Mr & Mrs Boris Massesa'), 'Boris Massesa')
  assert.equal(firstNameOf('Mr and Mrs Boris Massesa'), 'Boris')
})

test('a guest whose first name is Swahili for "and" keeps it', () => {
  // "na" is deliberately NOT treated as a connector: skipping it would eat a
  // real first name, and no title in the dropdown produces it.
  assert.equal(firstNameOf('Na Mwangi'), 'Na')
})

test('a name that is nothing but titles falls back to the whole input', () => {
  assert.equal(firstNameOf('Mr'), 'Mr')
  assert.equal(firstNameOf('Mr & Mrs'), 'Mr & Mrs')
  assert.equal(fullNameOf('Mr & Mrs'), 'Mr & Mrs')
})
