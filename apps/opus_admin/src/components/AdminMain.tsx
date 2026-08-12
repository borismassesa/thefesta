'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { isImmersiveWorkspace } from '@/lib/admin-immersive'
import { cn } from '@/lib/utils'

/** Content column for the admin shell. Immersive workspaces fill the viewport
 *  without a visible page scrollbar; other routes keep scroll, bar hidden. */
export function AdminMain({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const immersive = isImmersiveWorkspace(pathname)

  return (
    <main
      className={cn(
        'flex-1 overflow-x-hidden print:overflow-visible',
        immersive ? 'overflow-hidden' : 'overflow-y-auto no-scrollbar',
      )}
    >
      {children}
    </main>
  )
}
