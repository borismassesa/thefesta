import type { ReactNode } from 'react'
import SiteChrome from '@/components/chrome/SiteChrome'

// SiteChrome calls getLocale() (cookies()), so this layout must render dynamically.
export const dynamic = 'force-dynamic'

export default function GuestsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="font-sans bg-[#FAFAF8] text-[#1A1A1A] selection:bg-(--accent) selection:text-(--on-accent) min-h-screen flex flex-col">
      <SiteChrome>{children}</SiteChrome>
    </div>
  )
}
