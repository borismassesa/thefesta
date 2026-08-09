import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { quoteSignature } from './quotation'

/**
 * The quotation number has to stay the same for an unchanged cart.
 *
 * A finance desk holding two PDFs numbered QT-…-A and QT-…-B for one selection
 * has no way to know they are the same offer, so it asks, or pays twice, or
 * pays neither. Stability comes from this signature, and the non-obvious part
 * is what counts as "unchanged": re-adding a design already in the cart
 * reorders the array without altering the offer at all.
 *
 * Only the signature is covered here. buildQuotation itself reads
 * localStorage, which the CJS test runner has no DOM for; its output is
 * exercised end-to-end by the parseOrder tests and by rendering the PDF.
 *
 * Run: npx tsx --test src/lib/quotation.test.ts
 */

type Item = Parameters<typeof quoteSignature>[0][number]

const item = (over: Partial<Item> & { id: string }): Item =>
  ({
    name: 'Rose Gold Heritage',
    designer: 'OpusFesta',
    treatment: 'ivory',
    summary: '250 guests',
    total: 375000,
    ...over,
  }) as Item

describe('quoteSignature', () => {
  it('is unchanged when the cart is only reordered', () => {
    // CartProvider.addItem drops and re-appends an existing design, so a
    // re-added card moves to the end while the offer stays identical.
    const a = item({ id: 'a', guests: 250 })
    const b = item({ id: 'b', guests: 100, total: 50000 })
    assert.equal(quoteSignature([a, b]), quoteSignature([b, a]))
  })

  it('is unchanged when only the add-on order differs', () => {
    assert.equal(
      quoteSignature([item({ id: 'a', addOns: ['Prints', 'Door scanning'] })]),
      quoteSignature([item({ id: 'a', addOns: ['Door scanning', 'Prints'] })]),
    )
  })

  it('changes when the guest count changes', () => {
    assert.notEqual(
      quoteSignature([item({ id: 'a', guests: 250 })]),
      quoteSignature([item({ id: 'a', guests: 300 })]),
    )
  })

  it('changes when the price changes', () => {
    // A tier price edit in the CMS re-prices the line. That is a different
    // offer and must not reuse the old quotation's number.
    assert.notEqual(
      quoteSignature([item({ id: 'a', total: 375000 })]),
      quoteSignature([item({ id: 'a', total: 400000 })]),
    )
  })

  it('changes when an add-on is added or removed', () => {
    assert.notEqual(
      quoteSignature([item({ id: 'a', addOns: ['Prints'] })]),
      quoteSignature([item({ id: 'a', addOns: [] })]),
    )
  })

  it('changes when a design is added to the cart', () => {
    assert.notEqual(
      quoteSignature([item({ id: 'a' })]),
      quoteSignature([item({ id: 'a' }), item({ id: 'b' })]),
    )
  })

  it('treats a missing guest count and add-on list as empty rather than throwing', () => {
    assert.equal(quoteSignature([item({ id: 'a' })]), quoteSignature([item({ id: 'a' })]))
  })
})
