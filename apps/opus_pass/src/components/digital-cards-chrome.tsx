'use client'

import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import type { FooterStrings, UiArea, UiStringsByArea } from '@/lib/cms/ui-strings-fallback'

// Client chrome wrapper for /digital-cards/*. Receives the already-resolved
// (locale-aware) Site UI bundles from the SERVER layout — it never imports the
// loader (next/headers). Navbar reads its labels from the provider via useT;
// Footer (a server component) takes its strings prop directly.
//
// The customise editor is a full-screen, chromeless surface — no site nav/footer.
export default function DigitalCardsChrome({
  children,
  bundles,
  footer,
}: {
  children: ReactNode
  bundles: Partial<{ [A in UiArea]: UiStringsByArea[A] }>
  footer: FooterStrings
}) {
  const pathname = usePathname()
  const chromeless = pathname?.endsWith('/customise') ?? false

  if (chromeless) {
    return <main className="flex-1">{children}</main>
  }

  return (
    <UIStringsProvider bundles={bundles}>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer strings={footer} />
    </UIStringsProvider>
  )
}
