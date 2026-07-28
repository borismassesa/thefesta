import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import { getEventsForCheckout } from '@/lib/dashboard/queries'
import CheckoutClient from './CheckoutClient'

// Reads the per-visitor locale cookie to resolve bilingual microcopy, so the
// page must render dynamically (never baked into a shared cache entry).
export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const locale = await getLocale()
  const [checkoutForm, checkoutPayment, checkoutSummary, events] = await Promise.all([
    loadUiStrings('checkout-form', locale),
    loadUiStrings('checkout-payment', locale),
    loadUiStrings('checkout-summary', locale),
    getEventsForCheckout(locale),
  ])
  return (
    <UIStringsProvider
      bundles={{
        'checkout-form': checkoutForm,
        'checkout-payment': checkoutPayment,
        'checkout-summary': checkoutSummary,
      }}
    >
      <CheckoutClient events={events} />
    </UIStringsProvider>
  )
}
