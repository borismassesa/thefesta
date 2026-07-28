import {
  getEvents,
  getThankYouData,
  getMyThankYouCardConfig,
  getPurchasedTemplateIds,
  getCoupleProfile,
} from '@/lib/dashboard/queries'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import ThankYouView from './ThankYouView'

/** Only designs from this catalog category are offered as thank-you cards —
 *  same catalog + fallback the Pledges card picker uses (see
 *  apps/opus_pass/src/app/my/dashboard/pledges/page.tsx). */
const THANK_YOU_CARD_CATEGORY = 'Kadi za Michango'
const THANK_YOU_CARD_FALLBACK_CATEGORY = 'Save the Dates'
const THANK_YOU_CARD_CATALOG_SIZE = 10

export const dynamic = 'force-dynamic'

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const locale = await getLocale()

  // Multi-event couples pick which event they're thanking guests for before
  // the console loads; the choice then follows them via ?event= + cookie —
  // same pattern as every other event-scoped dashboard page.
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

  const selectedEventId = scope.selected?.id ?? null
  const [
    data,
    strings,
    cardConfig,
    catalogProducts,
    purchasedTemplateIds,
    profile,
    dashboardUser,
    checkoutFormStrings,
    checkoutPaymentStrings,
    scopeStrings,
  ] = await Promise.all([
    getThankYouData(selectedEventId ?? undefined, events),
    loadUiStrings('dashboard-thank-you', locale),
    getMyThankYouCardConfig(selectedEventId),
    loadDigitalCardProducts(locale),
    getPurchasedTemplateIds('thank_you_card', selectedEventId),
    getCoupleProfile(),
    getDashboardUser(),
    loadUiStrings('checkout-form', locale),
    loadUiStrings('checkout-payment', locale),
    loadUiStrings('dashboard-event-scope', locale),
  ])

  // Same fallback the Pledges card picker uses: no "Kadi za Michango" designs
  // yet, so Save the Date cards make a reasonable stand-in until real
  // thank-you-card designs are uploaded.
  const michangoDesigns = catalogProducts.filter((p) => p.category === THANK_YOU_CARD_CATEGORY && p.imageUrl)
  const cardSource = michangoDesigns.length
    ? michangoDesigns
    : catalogProducts.filter((p) => p.category === THANK_YOU_CARD_FALLBACK_CATEGORY && p.imageUrl)
  const cardCatalog = cardSource
    .slice(0, THANK_YOU_CARD_CATALOG_SIZE)
    .map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl! }))

  return (
    <ThankYouView
      data={data}
      strings={strings}
      coverImageUrl={cardConfig.coverImageUrl}
      coverIsFullTemplate={cardConfig.coverIsFullTemplate}
      templateId={cardConfig.templateId}
      templateName={cardConfig.templateName}
      cardCatalog={cardCatalog}
      purchasedTemplateIds={Array.from(purchasedTemplateIds)}
      contactEmail={dashboardUser?.email ?? ''}
      contactPhone={profile?.whatsapp_phone ?? null}
      checkoutFormStrings={checkoutFormStrings}
      checkoutPaymentStrings={checkoutPaymentStrings}
      scopeStrings={scopeStrings}
    />
  )
}
