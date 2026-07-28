'use client'

import { useState } from 'react'
import { Star, ChevronDown, ChevronRight, Search, Users } from 'lucide-react'
import type { ProductReview } from '@/lib/bridal-products'

const PAGE_SIZE = 4

/** Structural subset both bridal and registry products satisfy. */
type ReviewsProduct = {
  rating: string
  reviews: number
  gallery: string[]
  reviewSnippets: ProductReview[]
}

function authorColor(name: string) {
  const palette = ['#f59e0b', '#2D6A4F', '#5B2D8E', '#ea580c', '#0ea5e9']
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}
          fill="currentColor"
        />
      ))}
    </span>
  )
}

function ReviewText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const limit = 160
  const isLong = text.length > limit
  return (
    <p className="text-sm text-[#1A1A1A] leading-relaxed">
      {isLong && !expanded ? (
        <>
          {text.slice(0, limit).trimEnd()}…{' '}
          <button
            className="font-semibold underline underline-offset-2 text-[#1A1A1A]"
            onClick={() => setExpanded(true)}
          >
            Read more
          </button>
        </>
      ) : (
        text
      )}
    </p>
  )
}

export default function ProductReviewsSection({ product }: { product: ReviewsProduct }) {
  const allReviews: ProductReview[] = product.reviewSnippets
  const [sortBy, setSortBy] = useState<'top' | 'recent'>('top')
  const [filterStar, setFilterStar] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)

  const avg = allReviews.length
    ? allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length
    : Number(product.rating)

  const dist = [5, 4, 3, 2, 1].map((star) => {
    const count = allReviews.filter((r) => Math.round(r.rating) === star).length
    return {
      star,
      count,
      pct: allReviews.length ? Math.round((count / allReviews.length) * 100) : 0,
    }
  })

  const sorted = [...allReviews].sort((a, b) => {
    if (sortBy === 'top') return b.rating - a.rating
    // "recent" — fall back to original order (already chronological by index)
    return 0
  })
  const afterStar = filterStar
    ? sorted.filter((r) => Math.round(r.rating) === filterStar)
    : sorted
  const filtered = searchQuery.trim()
    ? afterStar.filter(
        (r) =>
          r.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.author.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : afterStar
  const shown = filtered.slice(0, visible)

  const reviewMedia = allReviews.flatMap((r) => r.media ?? [])
  const mediaStrip =
    reviewMedia.length > 0
      ? reviewMedia.slice(0, 8)
      : product.gallery.slice(0, 8).map((src) => ({ type: 'photo' as const, src }))

  // Everything below this line assumes a reviewed product: the summary card
  // averages to 5.0 when there's nothing to average, the distribution bars all
  // read 0%, and the media strip falls back to the product's own photos under
  // a "Review photos" heading. That's fine for the curated bridal catalogue,
  // which ships with snippets, but every seller-listed product starts at zero.
  if (allReviews.length === 0 && product.reviews === 0) {
    return (
      <section id="reviews" className="scroll-mt-28 border-t border-gray-200 pt-12">
        <h2 className="text-2xl font-bold mb-6">Reviews</h2>
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <p className="text-sm font-semibold text-[#1A1A1A]">No reviews yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Be the first to review this after it arrives.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="reviews" className="scroll-mt-28 border-t border-gray-200 pt-12">
      <h2 className="text-2xl font-bold mb-6">Reviews</h2>

      {/* Rating summary */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div className="flex flex-col sm:flex-row gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
          <div className="flex flex-col items-start gap-2 p-6 sm:w-52 shrink-0">
            <p className="text-4xl font-black text-[#1A1A1A]">
              {avg.toFixed(1)} <span className="text-base font-medium text-gray-400">out of 5.0</span>
            </p>
            <StarRow rating={avg} size={18} />
            <p className="text-sm text-gray-500">{product.reviews.toLocaleString()} reviews</p>
            <button
              type="button"
              className="mt-2 rounded-full bg-(--accent) px-4 py-2 text-sm font-semibold text-[#1A1A1A] hover:bg-(--accent-hover) transition-colors"
            >
              Write a review
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-3 p-6">
            {dist.map(({ star, pct }) => (
              <button
                key={star}
                type="button"
                onClick={() => setFilterStar(filterStar === star ? null : star)}
                className="flex items-center gap-3 group"
              >
                <span className="w-12 shrink-0 text-sm text-gray-600">{star} Star</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1A1A1A] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm text-gray-500">{pct}%</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-200 px-6 py-3 bg-gray-50">
          <Users size={16} className="shrink-0 text-gray-400" />
          <p className="text-xs text-gray-500">
            Your trust is our goal. Our community relies on honest reviews to help couples make confident decisions.
          </p>
        </div>
      </div>

      {/* Media strip */}
      {mediaStrip.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-bold text-[#1A1A1A] mb-3">Review photos &amp; videos</p>
          <div className="relative flex items-center gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
              {mediaStrip.map((item, i) => (
                <div key={i} className="relative h-24 w-24 shrink-0 rounded-xl overflow-hidden">
                  <img
                    src={item.type === 'video' ? item.poster ?? item.src : item.src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  {item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#1A1A1A]" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <ChevronRight size={16} className="text-[#1A1A1A]" />
            </button>
          </div>
        </div>
      )}

      {/* Source tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex items-end gap-8">
          <div className="flex flex-col items-start pb-3 border-b-2 border-[#1A1A1A]">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A1A1A]">
                <span className="text-[10px] font-black text-white tracking-tight">OF</span>
              </div>
              <span className="text-sm font-bold text-[#1A1A1A]">OpusFesta</span>
            </div>
            <p className="text-sm text-gray-500 pl-10">
              <span className="font-semibold text-[#1A1A1A]">{avg.toFixed(1)}/5</span>
              {' · '}
              {product.reviews.toLocaleString()} reviews
            </p>
          </div>

          <div className="flex flex-col items-start pb-3 opacity-60">
            <div className="flex items-center gap-2.5 mb-1">
              <svg className="h-8 w-8" viewBox="0 0 24 24" aria-label="Google">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span className="text-sm font-bold text-[#1A1A1A]">Google</span>
            </div>
            <p className="text-sm text-gray-500 pl-10">
              <span className="font-semibold text-[#1A1A1A]">4.3/5</span>
              {' · '}2,053 reviews
            </p>
          </div>
        </div>
      </div>

      {/* Search + sort */}
      {allReviews.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex gap-3">
            <div className="flex flex-1 items-stretch rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
              <input
                type="text"
                placeholder="Search reviews"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setVisible(PAGE_SIZE)
                }}
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:outline-none"
              />
              <button
                type="button"
                className="flex items-center justify-center bg-(--accent) px-4 text-[#1A1A1A] transition hover:bg-(--accent-hover)"
              >
                <Search size={16} />
              </button>
            </div>

            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'top' | 'recent')
                  setVisible(PAGE_SIZE)
                }}
                className="h-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-2.5 text-sm text-[#1A1A1A] focus:outline-none cursor-pointer"
              >
                <option value="top">Sort by: Top reviews</option>
                <option value="recent">Sort by: Most recent</option>
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 mr-1">Filter by rating:</span>
            {[5, 4, 3, 2, 1].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setFilterStar(filterStar === s ? null : s)
                  setVisible(PAGE_SIZE)
                }}
                className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={
                  filterStar === s
                    ? { backgroundColor: '#1A1A1A', color: '#fff', borderColor: '#1A1A1A' }
                    : { backgroundColor: '#fff', color: '#374151', borderColor: '#d1d5db' }
                }
              >
                <Star size={10} fill="currentColor" className="text-amber-400" />
                {s} star
              </button>
            ))}
            {(filterStar || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStar(null)
                  setSearchQuery('')
                  setVisible(PAGE_SIZE)
                }}
                className="ml-1 text-xs font-semibold text-gray-400 hover:text-[#1A1A1A] underline underline-offset-2 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {(filterStar || searchQuery.trim()) && (
            <p className="text-xs text-gray-400">
              {filtered.length} {filtered.length === 1 ? 'review' : 'reviews'} found
            </p>
          )}
        </div>
      )}

      {/* Review list */}
      {filtered.length ? (
        <div className="divide-y divide-gray-100">
          {shown.map((review) => (
            <article key={review.id} className="py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
                    style={{ backgroundColor: authorColor(review.author) }}
                  >
                    {review.author.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1A1A1A]">{review.author}</p>
                    <p className="text-xs text-gray-500">{review.city}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <StarRow rating={review.rating} size={13} />
                      <span className="text-sm font-bold text-[#1A1A1A]">{review.rating.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
                <p className="shrink-0 text-sm text-gray-400">{review.date}</p>
              </div>

              <div className="mt-3 ml-14">
                <ReviewText text={review.text} />

                {review.media && review.media.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {review.media.map((item, mi) => (
                      <div key={mi} className="relative h-20 w-20 rounded-lg overflow-hidden">
                        <img
                          src={item.type === 'video' ? item.poster ?? item.src : item.src}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        {item.type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90">
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#1A1A1A]" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {review.weddingDate && (
                  <p className="mt-2 text-xs text-gray-400">Wedding · {review.weddingDate}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-400">
          No reviews match your filters — try clearing them above.
        </div>
      )}

      {visible < filtered.length && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs text-gray-400 font-medium">
            Showing {Math.min(visible, filtered.length)} of {filtered.length} reviews
          </p>
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="group flex items-center gap-2 rounded-full bg-[#1A1A1A] px-8 py-3 text-sm font-bold text-white hover:bg-black/80 transition-all shadow-sm hover:shadow-md"
          >
            Read more reviews
            <ChevronDown size={15} className="transition-transform group-hover:translate-y-0.5" />
          </button>
        </div>
      )}
    </section>
  )
}
