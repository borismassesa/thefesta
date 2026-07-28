import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import SmoothScrollProvider from '@/components/providers/SmoothScrollProvider'
import ToastProvider from '@/components/providers/ToastProvider'
import OpusChat from '@/components/opus/OpusChat'
import JsonLd from '@/components/JsonLd'
import './globals.css'

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opusfesta.com'

export const metadata: Metadata = {
  title: 'OpusFesta — Plan Your Perfect Wedding',
  description:
    'Everything you need to plan your wedding, all in one place. Discover venues, connect with vendors, manage your registry.',
  metadataBase: new URL(BASE),
  openGraph: {
    siteName: 'OpusFesta',
    locale: 'en_TZ',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@opusfesta',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'OpusFesta',
  url: BASE,
  logo: `${BASE}/assets/logo/opusfesta-logo-black.png`,
  description:
    'Wedding planning marketplace for Tanzania — venues, vendors, digital cards, attire and more.',
}

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'OpusFesta',
  url: BASE,
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${BASE}/vendors/browse?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="bg-white">
        <body className="bg-white">
          <JsonLd data={organizationSchema} />
          <JsonLd data={websiteSchema} />
          <SmoothScrollProvider>{children}</SmoothScrollProvider>
          <OpusChat />
          <ToastProvider />
        </body>
      </html>
    </ClerkProvider>
  )
}
