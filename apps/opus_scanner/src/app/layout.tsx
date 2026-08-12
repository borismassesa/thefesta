import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import Providers from '@/components/Providers'
import ServiceWorkerCleanup from './ServiceWorkerCleanup'
import './globals.css'

export const metadata: Metadata = {
  title: 'OpusPass Door Scanner',
  description: 'Scan guest entry passes at the door.',
  manifest: '/manifest.json',
  icons: {
    icon: '/assets/logo/opuspass-mark.svg',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

// No custom font loaded — opus_pass's own dashboard (<body className="bg-white">
// in its layout.tsx) applies no font override either. Montserrat is only used
// there as a selectable font *within* invitation card designs, not as the
// dashboard's UI typeface, so matching it here would have been a mismatch.
// Tailwind's default sans stack (system UI fonts) is the correct match.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-[#1A1A1A] antialiased selection:bg-[#C9A0DC]/25 selection:text-[#1A1A1A]">
        <Providers>{children}</Providers>
        {/* The old offline PWA service worker must go, or returning devices
            keep serving the stale cached shell instead of this build. */}
        <ServiceWorkerCleanup />
      </body>
    </html>
  )
}
