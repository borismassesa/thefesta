import { loadVendorEarnings } from './actions'
import { EarningsView } from './EarningsView'
import { redirectServiceVendors } from '@/lib/storefront/vertical-guard'

// Earnings — the vendor's real-time view of product sales. Product-selling
// vendors only; service vendors have no product earnings ledger yet and land
// back on the dashboard.
export default async function EarningsPage() {
  await redirectServiceVendors('/dashboard')

  const data = await loadVendorEarnings()

  // Next payout runs on the coming Monday. Computed server-side so the vendor
  // sees a concrete date, not a vague "weekly".
  const now = new Date()
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  const nextPayout = new Date(now)
  nextPayout.setDate(now.getDate() + daysUntilMonday)
  const nextPayoutLabel = nextPayout.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return <EarningsView data={data} nextPayoutLabel={nextPayoutLabel} />
}
