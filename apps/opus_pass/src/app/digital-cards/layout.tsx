import type { ReactNode } from 'react'
import DigitalCardsChrome from '@/components/digital-cards-chrome'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'

// DigitalCardsChrome is a CLIENT component (it uses usePathname() to hide the
// chrome on the chromeless /customise editor). The SERVER layout resolves the
// locale + loads the bilingual chrome bundles and hands them down as props, so
// the client wrapper can mount the UIStringsProvider and pass Footer's strings —
// without ever importing the server-only loader. getLocale() ⇒ force-dynamic.
export const dynamic = 'force-dynamic'

export default async function DigitalCardsLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const [navbar, footer] = await Promise.all([
    loadUiStrings('navbar', locale),
    loadUiStrings('footer', locale),
  ])

  return (
    <div className="font-sans bg-[#FAFAF8] text-[#1A1A1A] selection:bg-(--accent) selection:text-(--on-accent) min-h-screen flex flex-col">
      <DigitalCardsChrome bundles={{ navbar, footer }} footer={footer}>
        {children}
      </DigitalCardsChrome>
    </div>
  )
}
