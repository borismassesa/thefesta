import { hasPermission } from '@/lib/admin-auth'
import DigitalCardsNavTabsView, { type SectionTab } from './DigitalCardsNavTabsView'

// The Digital Cards product surface, split by what you are actually doing:
//
//   Catalogue             the cards we sell. One card, one page, with its
//                         artwork, its layer mapping and its typefaces on it.
//   Personalisation Queue the per-order work of personalising a catalogue card
//                         someone bought.
//   Custom Card Studio    bespoke cards made from a brief rather than from the
//                         catalogue.
//
// Two fulfilment paths to the same customer outcome (a finished card for a
// couple), so they are tabs of one product rather than separate modules — even
// though they remain separate implementations underneath.
//
// Naming, deliberately:
//   "Catalogue" not "Cards", because a couple's finished card is also a card,
//   and the old label claimed both.
//   "Personalisation Queue" not "Card Designer", because this surface
//   substitutes a couple's details into already-mapped artwork. It is not a
//   drawing tool, and the old name promised one.
//   "Custom Card Studio" not "Commission Studio", because "commission" reads
//   as a fee in a sidebar that also lists payouts and payments.
//
// ── Why this is a server component ──────────────────────────────────────────
// The tabs no longer share one permission. Catalogue and Personalisation Queue
// are digitalcards.read; Custom Card Studio is commissions.read. A list would
// show a content editor a Studio tab that bounces them to "/", and show a
// studio operator two tabs they cannot open. So the set is resolved per caller
// here and handed to a client component that only renders it.

/** Where a caller lands when they open Digital Cards without naming a tab. */
export const DIGITAL_CARDS_TABS = {
  catalogue: '/opus-pass/digital-cards/cards',
  personalisation: '/opus-pass/digital-cards/designer',
  // Still under /opus-pass/commissions. Navigation moved; the route did not.
  customStudio: '/opus-pass/commissions',
} as const

/**
 * The tabs this caller may actually open.
 *
 * Exported so the section's root route can redirect to the first one rather
 * than assuming the catalogue — a studio operator has no digitalcards.read and
 * would otherwise be bounced off the product they were sent to.
 */
export async function visibleDigitalCardsTabs(): Promise<SectionTab[]> {
  const [canReadCatalogue, canReadStudio] = await Promise.all([
    hasPermission('digitalcards.read'),
    hasPermission('commissions.read'),
  ])

  const tabs: SectionTab[] = []
  if (canReadCatalogue) {
    tabs.push(
      { label: 'Catalogue', icon: 'catalogue', href: DIGITAL_CARDS_TABS.catalogue },
      { label: 'Personalisation Queue', icon: 'personalisation', href: DIGITAL_CARDS_TABS.personalisation },
    )
  }
  if (canReadStudio) {
    tabs.push({
      label: 'Custom Card Studio',
      icon: 'studio',
      href: DIGITAL_CARDS_TABS.customStudio,
      // The Studio's own pages live outside this URL prefix, so the active
      // test cannot be derived from the href alone.
      activePaths: ['/opus-pass/commissions'],
    })
  }
  return tabs
}

export default async function DigitalCardsNavTabs() {
  const tabs = await visibleDigitalCardsTabs()
  // One tab is not a tab bar. A caller who can reach exactly one surface is
  // shown no chrome rather than a single permanently-selected control.
  if (tabs.length < 2) return null
  return <DigitalCardsNavTabsView tabs={tabs} />
}
