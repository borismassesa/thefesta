'use client'

import { useSetPageHeading } from '@/components/PageHeading'

// Pushes the page title/subtitle into the shared admin header instead of
// rendering an in-page heading.
export default function PaymentsHeading() {
  useSetPageHeading({
    title: 'Payments',
    subtitle: 'Review manual M-Pesa / Lipa Namba payments across digital cards, thank-you & pledge cards, and the gift registry.',
  })
  return null
}
