import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import ShopHeader from '@/components/shop/ShopHeader'
import ShopProductGrid from '@/components/shop/ShopProductGrid'
import { getShopProducts, getShopVendorBySlug, getShopVendors } from '@/lib/products-db'

// A gift-shop seller's public page. Product vendors are excluded from
// /vendors/[slug] (that directory is service vendors only), so this is their
// only public profile and the destination for "More from <seller>" on a PDP.

type Params = Promise<{ slug: string }>

export const revalidate = 600

export async function generateStaticParams() {
  const shops = await getShopVendors('gift_shop')
  return shops.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const shop = await getShopVendorBySlug(slug, 'gift_shop')
  if (!shop) return { title: 'Shop | OpusFesta Registry' }
  return {
    title: `${shop.name} | OpusFesta Registry`,
    description:
      shop.description ??
      `Shop gifts from ${shop.name} in ${shop.location}, Tanzania on the OpusFesta wedding gift registry.`,
  }
}

export default async function RegistryShopPage({ params }: { params: Params }) {
  const { slug } = await params
  const shop = await getShopVendorBySlug(slug, 'gift_shop')
  if (!shop) notFound()

  const products = await getShopProducts({ vertical: 'gift_shop', vendorId: shop.id, limit: 60 })

  return (
    <>
      <Navbar />
      <main className="bg-white font-sans text-gray-900">
        <ShopHeader shop={shop} backHref="/registry/shops" backLabel="Registry shops" />
        <ShopProductGrid products={products} shopName={shop.name} />
      </main>
      <Footer />
    </>
  )
}
