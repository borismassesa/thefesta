import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import Navbar from '@/components/navbar'
import Footer from '@/components/footer'
import ProductCard from '@/components/registry/ProductCard'
import { REGISTRY_CATEGORIES, getRegistryCategory, type RegistryCategory } from '@/lib/registry-categories'
import { getShopProducts } from '@/lib/products-db'

type Params = Promise<{ category: string }>

export const revalidate = 600

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params
  const cat = getRegistryCategory(category)
  if (!cat) return { title: 'Registry | OpusFesta' }
  return { title: `${cat.title} | OpusFesta Registry`, description: cat.tagline }
}

export function generateStaticParams() {
  return REGISTRY_CATEGORIES.map((c) => ({ category: c.slug }))
}

function FilterPill({ children }: { children: React.ReactNode }) {
  return (
    <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 transition hover:border-gray-400 hover:bg-gray-50">
      {children}
    </button>
  )
}

function RelatedRow({ items }: { items: RegistryCategory[] }) {
  if (items.length === 0) return null
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <h2 className="mb-5 text-lg font-semibold text-gray-900 md:text-xl">Explore related categories</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
        {items.map((c) => (
          <Link
            key={c.slug}
            href={`/registry/${c.slug}`}
            className="group flex items-stretch gap-4 rounded-lg border border-gray-200 bg-white p-2 transition-colors hover:border-gray-400 hover:shadow-sm"
          >
            <div className="aspect-square w-20 shrink-0 overflow-hidden rounded-md bg-gray-100 md:w-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.img} alt={c.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
            <span className="flex min-w-0 flex-1 items-center text-sm font-semibold leading-snug text-gray-900 group-hover:underline">
              {c.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function RegistryCategoryPage({ params }: { params: Params }) {
  const { category } = await params
  const cat = getRegistryCategory(category)
  if (!cat) notFound()

  const relatedCats = cat.related
    .map((slug) => getRegistryCategory(slug))
    .filter((c): c is RegistryCategory => Boolean(c))

  const products = await getShopProducts({ category: cat.slug, limit: 24 })

  return (
    <>
      <Navbar />

      <main className="bg-white font-sans text-gray-900">
        <section className="border-b border-gray-200 bg-[#f7f4ee] px-4 pb-12 pt-10 md:pb-16 md:pt-14">
          <div className="mx-auto max-w-7xl text-center">
            <h1 className="mb-2 text-3xl font-serif font-medium leading-tight text-gray-900 md:text-4xl lg:text-5xl">
              {cat.title}
            </h1>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-gray-600 md:text-base">{cat.tagline}</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pt-8 lg:px-8">
          <div className="hide-scrollbar -mx-4 flex items-center gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            <FilterPill>
              Price <ChevronDown size={14} />
            </FilterPill>
            <FilterPill>
              Brand <ChevronDown size={14} />
            </FilterPill>
            <FilterPill>
              Sort: Featured <ChevronDown size={14} />
            </FilterPill>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            {products.length > 0 ? (
              <>
                Showing <strong className="font-semibold text-gray-900">{products.length}</strong>{' '}
                <strong className="font-semibold text-gray-900">{cat.name.toLowerCase()}</strong> gifts for your registry.
              </>
            ) : (
              <>
                No <strong className="font-semibold text-gray-900">{cat.name.toLowerCase()}</strong> gifts listed yet.
              </>
            )}
          </p>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-12 pt-8 lg:px-8">
          {products.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-16 text-center">
              <p className="text-base font-semibold text-gray-900">Nothing here yet</p>
              <p className="max-w-sm text-sm text-gray-600">
                Our shops haven&apos;t added {cat.name.toLowerCase()} gifts yet. Check back soon, or explore another
                category.
              </p>
            </div>
          )}
        </section>

        <RelatedRow items={relatedCats} />
      </main>

      <Footer />
    </>
  )
}
