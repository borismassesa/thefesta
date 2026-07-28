import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import RegistryPdpHero from '@/components/registry/RegistryPdpHero'
import ProductReviewsSection from '@/components/attire-and-rings/ProductReviewsSection'
import ShopProductGrid from '@/components/shop/ShopProductGrid'
import {
  getShopProductById,
  getShopProductParams,
  getShopProducts,
  getShopVendorBySlug,
} from '@/lib/products-db'

// Product detail for an attire/rings seller's stock. Reuses RegistryPdpHero:
// despite the name it renders a plain product (gallery, price, "Add to cart"),
// and the cart it adds to is the shared product bag that checks out in
// OpusPass — the same rails the registry uses.

type Params = Promise<{ slug: string; id: string }>

export const revalidate = 600

export function generateStaticParams() {
  return getShopProductParams('attire_rings')
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  const product = await getShopProductById(id, 'attire_rings')
  if (!product) return { title: 'Attire & Rings | OpusFesta' }
  return { title: `${product.name} | OpusFesta`, description: product.description }
}

export default async function AttireShopProductPage({ params }: { params: Params }) {
  const { slug, id } = await params
  const [shop, product] = await Promise.all([
    getShopVendorBySlug(slug, 'attire_rings'),
    getShopProductById(id, 'attire_rings'),
  ])
  if (!shop || !product) notFound()
  // The URL's shop slug must be the product's actual seller, otherwise any
  // shop slug would render any seller's product under the wrong storefront.
  if (product.vendorId !== shop.id) notFound()

  const more = await getShopProducts({
    vertical: 'attire_rings',
    vendorId: shop.id,
    excludeId: product.id,
    limit: 5,
  })

  return (
    <>
      <Navbar />
      <main className="bg-white font-sans text-gray-900">
        <div className="mx-auto max-w-7xl px-4 pt-5 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500">
            <Link href="/attire-and-rings" className="hover:text-gray-900 hover:underline">
              Attire &amp; Rings
            </Link>
            <ChevronRight size={12} aria-hidden />
            <Link
              href={`/attire-and-rings/shops/${shop.slug}`}
              className="hover:text-gray-900 hover:underline"
            >
              {shop.name}
            </Link>
            <ChevronRight size={12} aria-hidden />
            <span className="truncate text-gray-900">{product.name}</span>
          </nav>
        </div>

        <RegistryPdpHero product={product} />

        <ProductReviewsSection product={product} />

        {more.length > 0 ? (
          <div className="border-t border-gray-100">
            <ShopProductGrid
              products={more}
              shopName={shop.name}
              productHref={(p) => `/attire-and-rings/shops/${shop.slug}/p/${p.id}`}
            />
          </div>
        ) : null}
      </main>
      <Footer />
    </>
  )
}
