import { redirect } from 'next/navigation'
import { visibleDigitalCardsTabs } from './DigitalCardsNavTabs'

export const dynamic = 'force-dynamic'

/**
 * The section has no page of its own — it opens on the caller's first tab.
 *
 * Resolved per caller rather than hardcoded to the catalogue. Digital Cards is
 * now one sidebar entry covering two fulfilment paths under two different
 * permissions, so a studio operator (commissions.read, no cms.read) clicking it
 * would land on the catalogue and be bounced straight to "/" — the sidebar
 * would show them a product they could never open.
 */
export default async function OpusPassDigitalCardsRoot() {
  const [first] = await visibleDigitalCardsTabs()
  // No tab at all means no permission for any of them. Same destination the
  // individual pages use when their own gate fails.
  redirect(first?.href ?? '/')
}
