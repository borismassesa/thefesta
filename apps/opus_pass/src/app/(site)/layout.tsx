import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import SmoothScrollProvider from '@/components/providers/SmoothScrollProvider'
import ToastProvider from '@/components/providers/ToastProvider'
import { CartProvider } from '@/components/providers/CartProvider'
import { FavoritesProvider } from '@/components/providers/FavoritesProvider'
import ClerkLoadFallback from '@/components/ClerkLoadFallback'
import JsonLd from '@/components/JsonLd'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opuspass.opusfesta.com'

/**
 * Marketing + couple dashboard + storefront shell.
 *
 * Kept out of the root layout so `/entrance-card-scanner` stays a thin
 * door-staff surface (no Clerk / cart / Lenis on that tree).
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'OpusPass',
    url: BASE,
    description: 'Digital cards, RSVP tracking, and wedding websites for couples in Tanzania.',
  }

  return (
    <ClerkProvider>
      <ClerkLoadFallback />
      <JsonLd data={organizationSchema} />
      <CartProvider>
        <FavoritesProvider>
          <SmoothScrollProvider>{children}</SmoothScrollProvider>
        </FavoritesProvider>
      </CartProvider>
      <ToastProvider />
    </ClerkProvider>
  )
}
