import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import ScannerProviders from '@/components/scanner/ScannerProviders'

/**
 * Door-staff check-in UI — chrome-free and Clerk-public.
 *
 * Intentionally NOT wrapped in SiteChrome (no marketing nav/footer). Door
 * attendants open this from a shared link or typed access code; they never
 * sign into OpusPass. Keep `/entrance-card-scanner/**` outside Clerk middleware
 * (see matcher exclusions in middleware.ts).
 */
export const metadata: Metadata = {
  title: 'Entrance Card Scanner — OpusPass',
  description: 'Scan guest entry passes at the door.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return <ScannerProviders>{children}</ScannerProviders>
}
