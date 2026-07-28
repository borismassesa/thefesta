'use client'

import Link from 'next/link'
import { MessagesSquare, Heart } from 'lucide-react'
import CartMenu from '@/components/CartMenu'
import NotificationsBell from '@/components/NotificationsBell'
import { useFavorites } from '@/components/providers/FavoritesProvider'

// Shared right-aligned icon cluster for the dashboard header (desktop + mobile).
// Message → vendor inquiries; Heart → saved designs (/digital-cards/favorites);
// Bell + Cart reuse the existing navbar components so behaviour stays identical
// to the public site (unread polling, cart count).
const ICON_BUTTON =
  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 sm:h-10 sm:w-10 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2'

export default function DashboardTopIcons() {
  const { count } = useFavorites()

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <Link href="/my/dashboard/inquiries" aria-label="Messages" className={ICON_BUTTON}>
        <MessagesSquare size={18} />
      </Link>
      <Link
        href="/digital-cards/favorites"
        aria-label={count > 0 ? `Favorites (${count} saved)` : 'Favorites'}
        className={ICON_BUTTON}
      >
        <Heart size={18} />
        {count > 0 && (
          <span className="absolute right-1 top-1 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-(--accent) px-1 text-[10px] font-bold leading-none text-(--on-accent)">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Link>
      <NotificationsBell />
      <CartMenu />
    </div>
  )
}
