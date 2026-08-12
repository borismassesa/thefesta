import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Yellowtail, Playfair_Display, Cormorant_Garamond, Dancing_Script, Montserrat, EB_Garamond, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// opus_pass is indexed on its own standalone subdomain, served at the root.
// Override per-env with NEXT_PUBLIC_APP_URL (e.g. https://opuspass.opusfesta.com).
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opuspass.opusfesta.com'
const OPUS_PASS_LOGO = '/assets/logo/OpusPass%20Logo.svg'
// Square mark (O + sparkles) extracted from the wordmark — the full logo is
// 202.7×65.18, which letterboxes to an invisible sliver in a favicon slot.
const OPUS_PASS_MARK = '/assets/logo/opuspass-mark.svg'

const yellowtail   = Yellowtail(       { weight: '400',         subsets: ['latin'], variable: '--font-yellowtail',  display: 'swap' })
const playfair     = Playfair_Display( { weight: ['400','700'], subsets: ['latin'], variable: '--font-playfair',   display: 'swap' })
const cormorant    = Cormorant_Garamond({ weight: ['400','700'], subsets: ['latin'], variable: '--font-cormorant',  display: 'swap', style: ['normal','italic'] })
const dancing      = Dancing_Script(   { weight: ['400','700'], subsets: ['latin'], variable: '--font-dancing',    display: 'swap' })
const montserrat   = Montserrat(       { weight: ['400','700'], subsets: ['latin'], variable: '--font-montserrat', display: 'swap' })
const garamond     = EB_Garamond(      { weight: ['400','700'], subsets: ['latin'], variable: '--font-garamond',   display: 'swap' })
const jakarta      = Plus_Jakarta_Sans({ weight: ['300','400','500','600','700'], subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })

export const metadata: Metadata = {
  title: 'OpusPass — Your wedding, in one digital pass',
  description:
    'Digital cards, live RSVP tracking, and a beautiful wedding website — all in one pass. Free to start. Built for couples in Tanzania.',
  metadataBase: new URL(BASE),
  icons: {
    icon: [
      { url: OPUS_PASS_MARK, type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon.ico', sizes: '48x48' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    siteName: 'OpusPass',
    locale: 'en_TZ',
    type: 'website',
    images: [{ url: OPUS_PASS_LOGO, alt: 'OpusPass' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [OPUS_PASS_LOGO],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

/**
 * Root shell is intentionally lean: fonts + HTML only.
 *
 * Marketing / dashboard / shop live under `(site)` and pull in Clerk, cart,
 * Lenis, etc. The Entrance Card Scanner is a sibling route so door staff do
 * not download or initialise that stack on a shared phone at the door.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const fontVars = [
    yellowtail.variable,
    playfair.variable,
    cormorant.variable,
    dancing.variable,
    montserrat.variable,
    garamond.variable,
    jakarta.variable,
  ].join(' ')

  return (
    <html lang="en" className={`bg-white ${fontVars}`}>
      <body className="bg-white">{children}</body>
    </html>
  )
}
