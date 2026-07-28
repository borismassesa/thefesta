'use client'

import { useSetPageHeading } from '@/components/PageHeading'

// Pushes the page title/subtitle into the shared admin header instead of
// rendering an in-page heading (mirrors finance/payments' PaymentsHeading).
// The header subtitle is plain text, so the cross-link to Digital Card Payments
// lives in the header's action slot rather than inline in this sentence.
export default function OrdersHeading() {
  useSetPageHeading({
    title: 'Order fulfilment',
    subtitle: 'Track every digital card order from payment review through to delivery.',
  })
  return null
}
