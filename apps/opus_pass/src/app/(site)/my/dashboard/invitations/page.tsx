import { getEvents, getSendInvitesData } from '@/lib/dashboard/queries'
import { countCardsNeedingDetails } from '@/lib/dashboard/card-details'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { loadDashboardCopy } from '@/lib/cms/dashboard-copy'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { formatLongDate } from '@/lib/dashboard/share'
import SendInvitesView, { type ProductionEta } from './SendInvitesView'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

/**
 * Where the order sits inside its promised turnaround.
 *
 * Null whenever we cannot say honestly: no payment date, or no turnaround
 * configured in the CMS. `late` is not an error state, just the truth that the
 * window has passed, so the caption can stop counting days it no longer knows.
 */
function buildProductionEta(placedAt: string | null, turnaroundSetting: string): ProductionEta | null {
  const days = Number.parseInt((turnaroundSetting ?? '').trim(), 10)
  if (!placedAt || !Number.isFinite(days) || days <= 0) return null

  const start = new Date(placedAt)
  if (Number.isNaN(start.getTime())) return null

  const due = new Date(start.getTime() + days * DAY_MS)
  const elapsedDays = Math.floor((Date.now() - start.getTime()) / DAY_MS)
  const late = Date.now() > due.getTime()

  return {
    day: Math.min(Math.max(elapsedDays + 1, 1), days),
    total: days,
    // Floored at 6% so day one still reads as started rather than as nothing.
    pct: late ? 100 : Math.min(100, Math.max(6, (elapsedDays / days) * 100)),
    dueLabel: formatLongDate(due.toISOString()),
    late,
  }
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tab?: string }>
}) {
  const { event: eventParam, tab } = await searchParams
  const locale = await getLocale()

  // Multi-event couples pick which event they're sending for before the
  // send console loads; the choice then follows them via ?event= + cookie.
  const events = await getEvents()
  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser) {
    const scopeStrings = await loadUiStrings('dashboard-event-scope', locale)
    return (
      <div className="space-y-6">
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }

  const [data, strings, scopeStrings, rsvpsCopy, catalogProducts, cardsNeedingDetails] =
    await Promise.all([
      getSendInvitesData(scope.selected?.id, events),
      loadUiStrings('dashboard-send', locale),
      loadUiStrings('dashboard-event-scope', locale),
      loadDashboardCopy('rsvps', locale),
      loadDigitalCardProducts(locale),
      // While a card is in production the couple's own missing details are
      // usually what the designer is waiting on, so the waiting state needs to
      // know whether anything is still blank on their cards.
      countCardsNeedingDetails(),
    ])
  // Production countdown. Computed here rather than in the client component so
  // the day number is fixed at render: "now" on the server and "now" in the
  // browser are not the same instant, and a hydrating mismatch on a visible
  // number is worse than no number at all.
  //
  // Deliberately opt-in: with no turnaround configured there is no due date
  // anywhere in this flow, and inventing one would be a delivery promise we
  // have not made. Blank or 0 simply hides the bar.
  const productionEta = buildProductionEta(
    data.event.productionOrder?.placedAt ?? null,
    strings.card_turnaround_days,
  )

  const saveDateTemplates = catalogProducts
    .filter((product) => (product.imageUrl || product.designs?.[0]) && product.category.toLowerCase().includes('save the date'))
    .map((product) => ({
      id: product.id,
      name: product.name,
      imageUrl: (product.imageUrl || product.designs?.[0])!,
    }))

  return (
    <SendInvitesView
      data={data}
      strings={strings}
      scopeStrings={scopeStrings}
      rsvpsCopy={rsvpsCopy}
      saveDateTemplates={saveDateTemplates}
      initialTab={tab}
      pendingCardDetails={cardsNeedingDetails}
      productionEta={productionEta}
    />
  )
}
