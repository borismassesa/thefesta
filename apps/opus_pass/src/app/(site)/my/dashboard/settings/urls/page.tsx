import { SettingsShell } from '@/components/dashboard/SettingsNav'
import { getEvents, getInviteShareInfo } from '@/lib/dashboard/queries'
import { publicOrigin, eventInviteUrl } from '@/lib/dashboard/share'
import UrlsView from './UrlsView'

export const dynamic = 'force-dynamic'

export default async function UrlsSettingsPage() {
  // The invite link is event-scoped (see RSVP setup); this single-link
  // settings view shows the couple's first event's, matching the value the
  // 20260718000003 migration backfilled from the old couple-wide slug.
  const events = await getEvents()
  const firstEvent = events[0] ?? null
  const share = firstEvent ? await getInviteShareInfo(firstEvent.id) : { slug: null, enabled: false }
  const url = share.slug ? eventInviteUrl(publicOrigin(), share.slug) : null
  return (
    <SettingsShell>
      <UrlsView url={url} enabled={share.enabled} />
    </SettingsShell>
  )
}
