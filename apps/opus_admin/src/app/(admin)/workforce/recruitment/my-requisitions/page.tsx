import { permanentRedirect } from 'next/navigation'

/**
 * Kept as a redirect rather than deleted. "Mine" is a scope on Requisitions
 * now, not a section, but this URL has been in the nav and may be bookmarked or
 * linked from a notification, and a 404 is a worse answer than the list they
 * were asking for.
 */
export default function MyRequisitionsPage(): never {
  permanentRedirect('/workforce/recruitment/requisitions?mine=1')
}
