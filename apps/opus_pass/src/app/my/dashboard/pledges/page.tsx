import {
  getEvents,
  getPledges,
  pledgeStatsFrom,
  getGuestsWithInvitations,
  getCoupleProfile,
  coupleDisplayName,
  getMyPledgeToken,
  getMyPledgePageConfig,
  getEventPackageTierId,
  getPurchasedTemplateIds,
  type PledgeScope,
} from '@/lib/dashboard/queries'
import { getDashboardUser } from '@/lib/dashboard/auth'
import { resolveEventScope } from '@/lib/dashboard/event-scope'
import { EventChooser } from '@/components/dashboard/EventScope'
import { loadDashboardHero } from '@/lib/cms/dashboard-hero'
import { loadDashboardCopy } from '@/lib/cms/dashboard-copy'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { getWhatsAppProvider } from '@/lib/whatsapp'
import { getSmsProvider } from '@/lib/sms'
import { isEmailConfigured } from '@/lib/email'
import { loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import PledgesManager from './PledgesManager'

/** Only designs from this catalog category are offered as pledge-card templates. */
const PLEDGE_CARD_CATEGORY = 'Kadi za Michango'

/** No "Kadi za Michango" designs are in the catalog yet — Save the Date cards
 *  make a reasonable stand-in cover (portrait, name/date-forward) until real
 *  pledge-card designs are uploaded. Remove this fallback once they exist.
 *  Matches the live catalog's category value (plural — see CATEGORY_SW in
 *  lib/cms/digital-cards-products.ts). */
const PLEDGE_CARD_FALLBACK_CATEGORY = 'Save the Dates'

/** Safety cap on how many designs to offer as free pledge-card templates. */
const PLEDGE_CARD_CATALOG_SIZE = 10

export const dynamic = 'force-dynamic'

export default async function PledgesPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>
}) {
  const { event: eventParam } = await searchParams
  const locale = await getLocale()
  const [events, scopeStrings, hero] = await Promise.all([
    getEvents(),
    loadUiStrings('dashboard-event-scope', locale),
    loadDashboardHero('pledges', locale),
  ])

  // Multi-event couples pick which event's pledge book they're working on
  // before anything loads; the choice then follows them via ?event= + cookie.
  const scope = await resolveEventScope(events, eventParam)
  if (scope.needsChooser) {
    return (
      <div className="space-y-6">
        <EventChooser events={events} strings={scopeStrings} />
      </div>
    )
  }

  const selectedEventId = scope.selected?.id ?? null
  // Legacy pledges (recorded before events existed) surface under the
  // couple's OLDEST event (by created_at, not display sort order — sort
  // order/starts_at can change via the Events editor, which would otherwise
  // silently move where these pledges are visible) so no money disappears.
  const oldestEventId = events.length
    ? events.reduce((oldest, e) =>
        new Date(e.created_at).getTime() < new Date(oldest.created_at).getTime() ? e : oldest,
      ).id
    : null
  const pledgeScope: PledgeScope = selectedEventId
    ? { eventId: selectedEventId, includeUnassigned: selectedEventId === oldestEventId }
    : {}

  const [
    pledges,
    guests,
    profile,
    dashboardUser,
    pledgeToken,
    pledgePageConfig,
    copy,
    packageTierId,
    catalogProducts,
    purchasedTemplateIds,
    checkoutFormStrings,
    checkoutPaymentStrings,
  ] = await Promise.all([
    getPledges(pledgeScope),
    getGuestsWithInvitations(),
    getCoupleProfile(),
    getDashboardUser(),
    getMyPledgeToken(),
    getMyPledgePageConfig(selectedEventId),
    loadDashboardCopy('pledges', locale),
    selectedEventId ? getEventPackageTierId(selectedEventId) : Promise.resolve(null),
    loadDigitalCardProducts(locale),
    getPurchasedTemplateIds('pledge_card', selectedEventId),
    loadUiStrings('checkout-form', locale),
    loadUiStrings('checkout-payment', locale),
  ])
  // Only "Kadi za Michango" catalog designs are offered as ready-made pledge
  // page covers — Elegant/Signature couples can use any of these for free.
  // Falls back to Save the Date designs while the catalog has none yet.
  const michangoDesigns = catalogProducts.filter((p) => p.category === PLEDGE_CARD_CATEGORY && p.imageUrl)
  const pledgeCardSource = michangoDesigns.length
    ? michangoDesigns
    : catalogProducts.filter((p) => p.category === PLEDGE_CARD_FALLBACK_CATEGORY && p.imageUrl)
  const pledgeCardCatalog = pledgeCardSource
    .slice(0, PLEDGE_CARD_CATALOG_SIZE)
    .map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl! }))
  const stats = pledgeStatsFrom(pledges)
  const pledgedContactIds = new Set(pledges.map((p) => p.guest_contact_id))
  return (
    <PledgesManager
      initialPledges={pledges}
      stats={stats}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      selectedEventId={selectedEventId}
      scopeStrings={scopeStrings}
      contacts={guests.map((g) => ({
        id: g.id,
        full_name: g.full_name,
        phone: g.phone,
        whatsapp_phone: g.whatsapp_phone,
        email: g.email,
        max_party_size: g.max_party_size,
        pledgeInviteSentAt: g.pledge_invite_sent_at,
        hasPledged: pledgedContactIds.has(g.id),
      }))}
      coupleName={coupleDisplayName(profile)}
      paymentInstructions={profile?.pledge_payment_instructions ?? null}
      paymentMethods={profile?.pledge_payment_methods ?? []}
      goalAmount={profile?.pledge_goal_amount ?? null}
      weddingDate={profile?.wedding_date ?? null}
      hero={hero}
      pledgeToken={pledgeToken}
      pledgeCoverImageUrl={pledgePageConfig.coverImageUrl ?? null}
      pledgeCoverIsFullTemplate={pledgePageConfig.coverIsFullTemplate ?? false}
      packageTierId={packageTierId}
      pledgeCardCatalog={pledgeCardCatalog}
      purchasedTemplateIds={Array.from(purchasedTemplateIds)}
      contactEmail={dashboardUser?.email ?? ''}
      contactPhone={profile?.whatsapp_phone ?? null}
      checkoutFormStrings={checkoutFormStrings}
      checkoutPaymentStrings={checkoutPaymentStrings}
      copy={copy}
      whatsappLive={getWhatsAppProvider().live}
      emailLive={isEmailConfigured()}
      smsLive={getSmsProvider().live}
    />
  )
}
