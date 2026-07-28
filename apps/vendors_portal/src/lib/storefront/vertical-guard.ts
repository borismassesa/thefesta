import 'server-only'

import { redirect } from 'next/navigation'
import { getCurrentVendor } from '../vendor'
import { sellsProducts, type VendorVertical } from '../onboarding/verticals'

// Route-level counterpart to the per-vertical nav. Hiding a tab in the sidebar
// stops it being *found*, not being *reached*: a bookmark, a stale link or a
// hand-typed URL still lands on the page. These guards make the two agree, so
// a gift shop can't open a booking calendar that will never have a booking in
// it, and a service vendor can't open a Products page they can't list on.

/** The active vendor's vertical, or 'service' when there is no live vendor. */
export async function currentVendorVertical(): Promise<VendorVertical> {
  const state = await getCurrentVendor()
  return state.kind === 'live' ? state.vendor.vertical : 'service'
}

/** Whether the active vendor sells goods rather than booked time. */
export async function currentVendorSellsProducts(): Promise<boolean> {
  return sellsProducts(await currentVendorVertical())
}

/**
 * Send product vendors away from a service-only page. `to` is where they land;
 * default is the dashboard, which every vertical has.
 */
export async function redirectProductVendors(to = '/dashboard'): Promise<void> {
  if (await currentVendorSellsProducts()) redirect(to)
}

/** Send service vendors away from a product-only page. */
export async function redirectServiceVendors(to = '/dashboard'): Promise<void> {
  if (!(await currentVendorSellsProducts())) redirect(to)
}
