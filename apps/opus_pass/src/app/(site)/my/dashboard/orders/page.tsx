import { getLocale } from '@/lib/cms/locale'
import { loadUiStrings } from '@/lib/cms/ui-strings'
import { getOrdersForDashboard } from '@/lib/dashboard/queries'
import { CardsSection } from '@/components/dashboard/CardsTabs'
import OrdersManager from './OrdersManager'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Orders',
}

export default async function OrdersPage() {
  const locale = await getLocale()
  const [strings, initialOrders] = await Promise.all([
    loadUiStrings('dashboard-orders', locale),
    getOrdersForDashboard(),
  ])
  return (
    <CardsSection title={strings.header_title} subtitle={strings.header_subtitle}>
      <OrdersManager strings={strings} initialOrders={initialOrders} />
    </CardsSection>
  )
}
