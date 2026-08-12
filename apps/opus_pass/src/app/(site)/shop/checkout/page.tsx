import { createSupabaseServerClient } from '@/lib/supabase'
import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { UIStringsProvider } from '@/components/providers/UIStringsProvider'
import ShopCheckoutClient, { type CheckoutLine } from './ShopCheckoutClient'

// Guest shop checkout for products browsed on opusfesta.com/registry. The cart
// is handed over in the URL (?items=<productId>:<qty>,…) so no cross-origin
// state is needed — we re-fetch every product server-side (authoritative price,
// name, image, live-status) and the payment runs here, same-origin, on the
// existing /api/payments rails. Not tied to any couple: a plain purchase
// shipped to the buyer's address.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Checkout — OpusFesta Shop' }

function parseItems(param?: string): { id: string; qty: number }[] {
  if (!param) return []
  const seen = new Map<string, number>()
  for (const chunk of param.split(',')) {
    const [id, q] = chunk.split(':')
    if (!id) continue
    const qty = Math.max(1, Math.min(20, parseInt(q ?? '1', 10) || 1))
    seen.set(id, (seen.get(id) ?? 0) + qty)
  }
  return [...seen.entries()].map(([id, qty]) => ({ id, qty }))
}

type ProductRow = {
  id: string
  name: string
  images: string[] | null
  price_tzs: number
  vendor: { business_name: string | null } | null
}

export default async function ShopCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>
}) {
  const { items } = await searchParams
  const parsed = parseItems(items)
  const ids = parsed.map((p) => p.id)

  const locale = await getLocale()
  const [checkoutForm, checkoutPayment] = await Promise.all([
    loadUiStrings('checkout-form', locale),
    loadUiStrings('checkout-payment', locale),
  ])

  let lines: CheckoutLine[] = []
  if (ids.length > 0) {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('products')
      .select('id, name, images, price_tzs, vendor:vendors!inner(business_name, onboarding_status)')
      .in('id', ids)
      .eq('status', 'approved')
      .eq('published', true)
      .eq('vendor.onboarding_status', 'active')
      .returns<ProductRow[]>()
    const byId = new Map((data ?? []).map((p) => [p.id, p]))
    lines = parsed
      .map((p): CheckoutLine | null => {
        const prod = byId.get(p.id)
        if (!prod) return null
        return {
          productId: prod.id,
          name: prod.name,
          image: (prod.images ?? [])[0] ?? '',
          priceTzs: prod.price_tzs,
          quantity: p.qty,
          shopName: prod.vendor?.business_name ?? null,
        }
      })
      .filter((l): l is CheckoutLine => l !== null)
  }

  return (
    <UIStringsProvider bundles={{ 'checkout-form': checkoutForm, 'checkout-payment': checkoutPayment }}>
      <ShopCheckoutClient lines={lines} />
    </UIStringsProvider>
  )
}
