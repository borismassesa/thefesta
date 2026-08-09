import type { CartItem } from '@/components/providers/CartProvider'
import { getContact, getOrCreateQuoteRef, type StoredOrder } from '@/lib/cart-storage'

/**
 * A cart, priced, as a document someone else can pay from.
 *
 * Shared by the cart page and the checkout page: a couple may only realise they
 * need a quotation once they reach the payment step and see the total, and a
 * quotation that differed between the two screens would be a quotation nobody
 * could trust.
 *
 * Shaped as a StoredOrder because /api/invoice renders that and nothing else.
 * `documentKind: 'quotation'` is what stops the renderer claiming a paid
 * invoice — see the branch in invoice-pdf.tsx.
 */
export function buildQuotation(input: {
  items: CartItem[]
  subtotal: number
  discount: number
  total: number
}): StoredOrder {
  const contact = getContact()
  return {
    ref: getOrCreateQuoteRef(quoteSignature(input.items)),
    documentKind: 'quotation',
    // The issue date. The document derives "valid until" from it, so the
    // validity window can never disagree with when the quote was raised.
    paidAt: new Date().toISOString(),
    contact: {
      name: contact?.fullName || undefined,
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
    },
    // No `payment` block: nothing has been paid, and the document's "How to
    // pay" section imports OpusFesta's own numbers rather than being handed
    // them. Setting it here would imply a transaction that does not exist.
    items: input.items.map((i) => ({
      id: i.id,
      name: i.name,
      summary: i.summary,
      total: i.total,
      image: i.image,
      tier: i.tier,
      tierId: i.tierId,
      guests: i.guests,
      pricePerGuest: i.pricePerGuest,
      addOns: i.addOns,
      addOnItems: i.addOnItems,
    })),
    subtotal: input.subtotal,
    discount: input.discount,
    total: input.total,
  }
}

/**
 * What makes two carts "the same offer", for reusing a quotation number.
 *
 * Sorted by id, and by add-on within a line, because the signature has to
 * describe the offer rather than the array. Re-adding a design already in the
 * cart moves it to the end (CartProvider.addItem drops and re-appends), so an
 * order-sensitive signature would mint a second quotation number for a cart
 * nobody actually changed — and a finance desk holding two numbered PDFs has
 * no way to tell they are one offer.
 */
export function quoteSignature(items: CartItem[]): string {
  return JSON.stringify(
    items
      .map((i) => [i.id, i.guests ?? 0, i.total, [...(i.addOns ?? [])].sort()] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
  )
}
