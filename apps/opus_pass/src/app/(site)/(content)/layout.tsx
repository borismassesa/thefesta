import type { ReactNode } from 'react'
import SiteChrome from '@/components/chrome/SiteChrome'

// SiteChrome calls getLocale() (cookies()), so this layout must render dynamically
// — a shared ISR entry keys only on path and would serve one visitor's language
// (and chrome microcopy) to everyone.
export const dynamic = 'force-dynamic'

export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="font-sans bg-[#FAFAF8] text-[#1A1A1A] selection:bg-(--accent) selection:text-(--on-accent) min-h-screen flex flex-col">
      <SiteChrome>{children}</SiteChrome>
    </div>
  )
}
