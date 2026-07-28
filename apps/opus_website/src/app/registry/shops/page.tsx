import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import ShopCard from '@/components/shop/ShopCard'
import { getShopVendors } from '@/lib/products-db'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Registry Shops | OpusFesta',
  description:
    'Browse the Tanzanian sellers stocking the OpusFesta wedding gift registry — kitchen, home, décor and linen shops.',
}

export default async function RegistryShopsPage() {
  const shops = await getShopVendors('gift_shop')

  return (
    <>
      <Navbar />
      <main className="bg-white font-sans text-gray-900">
        <section className="border-b border-gray-200 bg-[#f7f4ee] px-4 pb-12 pt-10 md:pb-16 md:pt-14">
          <div className="mx-auto max-w-7xl text-center">
            <h1 className="mb-2 font-serif text-3xl font-medium leading-tight text-gray-900 md:text-4xl lg:text-5xl">
              Shops on the registry
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">
              Every gift on OpusFesta comes from a real Tanzanian seller. Browse them here, or start
              from a <Link href="/registry" className="underline underline-offset-4">category</Link>.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
          {shops.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {shops.map((shop) => (
                <ShopCard key={shop.id} shop={shop} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-20 text-center">
              <p className="text-base font-semibold text-gray-900">No shops listed yet</p>
              <p className="max-w-sm text-sm text-gray-600">
                We&apos;re onboarding sellers now. Check back soon.
              </p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  )
}
