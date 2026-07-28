import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import ShopHeader from '@/components/shop/ShopHeader'
import ShopProductGrid from '@/components/shop/ShopProductGrid'
import { getShopProducts, getShopVendorBySlug, getShopVendors } from '@/lib/products-db'

// An attire/rings seller's public page. Same shape as the registry shop page,
// but its products link to a PDP nested under the shop rather than under a
// browse category: the attire browse taxonomy (bridal-collection) still runs
// on its own curated catalogue, so real seller stock has no category route yet.

type Params = Promise<{ slug: string }>

export const revalidate = 600

export async function generateStaticParams() {
  const shops = await getShopVendors('attire_rings')
  return shops.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const shop = await getShopVendorBySlug(slug, 'attire_rings')
  if (!shop) return { title: 'Shop | OpusFesta' }
  return {
    title: `${shop.name} | OpusFesta Attire & Rings`,
    description:
      shop.description ??
      `Shop attire, jewellery and rings from ${shop.name} in ${shop.location}, Tanzania.`,
  }
}

export default async function AttireShopPage({ params }: { params: Params }) {
  const { slug } = await params
  const shop = await getShopVendorBySlug(slug, 'attire_rings')
  if (!shop) notFound()

  const products = await getShopProducts({ vertical: 'attire_rings', vendorId: shop.id, limit: 60 })

  return (
    <>
      <Navbar />
      <main className="bg-white font-sans text-gray-900">
        <ShopHeader
          shop={shop}
          backHref="/attire-and-rings/shops"
          backLabel="Attire & rings sellers"
        />
        <ShopProductGrid
          products={products}
          shopName={shop.name}
          productHref={(p) => `/attire-and-rings/shops/${shop.slug}/p/${p.id}`}
        />
      </main>
      <Footer />
    </>
  )
}
