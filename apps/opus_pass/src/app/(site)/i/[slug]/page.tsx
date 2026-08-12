import { permanentRedirect } from 'next/navigation'
import { eventInvitePath } from '@/lib/dashboard/share'

// Old couple-wide invite hub path. The migration backfill assigns each
// couple's existing public_slug to their first event's own invite_slug, so
// the same slug value keeps resolving under the new path — see
// 20260718000003_opuspass_invite_event_scoped_link.sql.
interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function LegacyPublicInvitePage({ params }: PageProps) {
  const { slug } = await params
  permanentRedirect(eventInvitePath(slug))
}
