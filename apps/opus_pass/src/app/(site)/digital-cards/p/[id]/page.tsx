import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadDigitalCardProduct, loadDigitalCardProducts } from '@/lib/cms/digital-cards-products'
import { loadPackagesContent } from '@/lib/cms/packages'
import { loadProductAddonsFaqContent } from '@/lib/cms/product-addons-faq'
import { getLocale } from '@/lib/cms/locale'
import ProductDetailClient from './ProductDetailClient'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params
  const product = await loadDigitalCardProduct(id)
  if (!product) return { title: 'Product not found | OpusFesta' }
  return {
    title: `${product.name} | OpusFesta`,
    description: `${product.name} — ${product.category}. Bilingual digital card, sent by WhatsApp or SMS.`,
  }
}

export default async function ProductDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const locale = await getLocale()
  const [product, allProducts, packages, addonsFaq] = await Promise.all([
    loadDigitalCardProduct(id, locale),
    loadDigitalCardProducts(locale),
    loadPackagesContent(locale),
    loadProductAddonsFaqContent(locale),
  ])
  if (!product) return notFound()
  return (
    <ProductDetailClient
      product={product}
      allProducts={allProducts}
      packages={packages}
      addonsFaq={addonsFaq}
    />
  )
}
