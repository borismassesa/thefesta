'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileImage, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The two halves of setting a card up, on one card.
 *
 * These used to be separate top-level tabs listing the same table: "Cards" for
 * the catalogue entry and "Templates" for the layer mapping. Two lists of the
 * same thing meant setting one card up was a round trip between two tabs, and
 * coming back landed on a list rather than on the card being worked on.
 *
 * Hidden while creating a card, because there is no artwork to map until the
 * record exists.
 */
export default function CardSectionTabs({ productId }: { productId: string }) {
  const pathname = usePathname()
  if (productId === 'new') return null

  const base = `/opus-pass/digital-cards/cards/${productId}`
  const tabs = [
    { label: 'Details', href: base, icon: FileImage },
    { label: 'Artwork & fields', href: `${base}/artwork`, icon: Layers },
  ]

  return (
    <div className="border-b border-gray-100 bg-white">
      <nav className="flex gap-1 px-8" aria-label="Card sections">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-[#7E5896] text-[#7E5896]'
                  : 'border-transparent text-gray-500 hover:text-gray-900',
              )}
            >
              <Icon className="h-4 w-4 stroke-[1.75]" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
