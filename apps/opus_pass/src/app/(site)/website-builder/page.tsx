import type { Metadata } from 'next'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { getGiftRegistryItems, getGuestbookEntries } from '@/lib/dashboard/queries'
import WebsiteBuilderClient from './WebsiteBuilderClient'

export const metadata: Metadata = {
  title: 'Website Builder | OpusPass',
  description:
    'Design your wedding website with the OpusPass editor — drag-and-drop layouts, live preview, RSVP and registry widgets, all bilingual.',
}

export default async function WebsiteBuilderPage() {
  // getGiftRegistryItems()/getGuestbookEntries() themselves require auth
  // (redirect to /sign-in) — check first so the builder still opens for a
  // signed-out preview, same as before these fetches existed; they just fall
  // back to empty/illustrative content.
  const user = await getDashboardUser()
  // Every event's data — the preview is illustrative, not scoped to one
  // event, so the couple sees real content as soon as they've added any.
  const [registryItems, guestbookEntries] = user
    ? await Promise.all([getGiftRegistryItems(null), getGuestbookEntries(null)])
    : [[], []]
  return <WebsiteBuilderClient registryItems={registryItems} guestbookEntries={guestbookEntries} />
}
