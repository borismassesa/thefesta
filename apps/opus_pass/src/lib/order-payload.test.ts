import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseOrder } from './order-payload'

/**
 * parseOrder is the gate between an untrusted POST body and a rendered PDF.
 *
 * The fields under test here are the ones that decide WHICH document comes out.
 * They are easy to drop when adding a field — the type is all-optional, so a
 * missing line compiles, renders, and produces a document that claims the wrong
 * thing about money. That is exactly how the top-up invoice came to print a
 * delivery promise it could not keep.
 *
 * Run: npx tsx --test src/lib/order-payload.test.ts
 */

const base = {
  ref: 'QT-2026-8A31F0',
  paidAt: '2026-08-07T09:24:00.000Z',
  contact: { email: 'a@example.com', phone: '+255712345678' },
  items: [{ id: 'a', name: 'Rose Gold Heritage', summary: '250 guests', total: 375000 }],
  subtotal: 375000,
  discount: 0,
  total: 375000,
}

describe('parseOrder document kind', () => {
  it('keeps a quotation a quotation', () => {
    // Without this the cart's quote renders as a PAID invoice for money nobody
    // has sent — the single worst output this pipeline can produce.
    assert.equal(parseOrder({ ...base, documentKind: 'quotation' })?.documentKind, 'quotation')
  })

  it('defaults to an invoice, and treats any unknown value as one', () => {
    assert.equal(parseOrder(base)?.documentKind, 'invoice')
    assert.equal(parseOrder({ ...base, documentKind: 'receipt' })?.documentKind, 'invoice')
    assert.equal(parseOrder({ ...base, documentKind: 42 })?.documentKind, 'invoice')
  })

  it('keeps a top-up a top-up, and carries its parent', () => {
    const parsed = parseOrder({ ...base, orderKind: 'topup', parentRef: 'OF-2026-0142' })
    assert.equal(parsed?.orderKind, 'topup')
    assert.equal(parsed?.parentRef, 'OF-2026-0142')
  })

  it('defaults an ordinary payload to a purchase with no parent', () => {
    const parsed = parseOrder(base)
    assert.equal(parsed?.orderKind, 'purchase')
    assert.equal(parsed?.parentRef, null)
  })
})

describe('parseOrder line fields the documents read', () => {
  it('carries the per-guest rate through', () => {
    // The top-up line and the quotation both print "N x TZS rate" from this.
    const parsed = parseOrder({
      ...base,
      items: [{ ...base.items[0], guests: 250, pricePerGuest: 1500 }],
    })
    assert.equal(parsed?.items[0].pricePerGuest, 1500)
  })

  it('drops a non-numeric rate rather than passing it on', () => {
    const parsed = parseOrder({ ...base, items: [{ ...base.items[0], pricePerGuest: '1500' }] })
    assert.equal(parsed?.items[0].pricePerGuest, undefined)
  })
})

describe('parseOrder rejection', () => {
  it('refuses a payload with no reference or no lines', () => {
    // Every document is identified by its reference; one without is unusable
    // for support and cannot be matched to a payment.
    assert.equal(parseOrder({ ...base, ref: '' }), null)
    assert.equal(parseOrder({ ...base, items: [] }), null)
    assert.equal(parseOrder(null), null)
  })
})
