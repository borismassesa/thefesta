// OF-ADM-EDITORIAL-001 — single article row. Title + meta share one column
// so long titles can use the full width; the meta line below carries
// category, author, date, and stats as middot-separated text. Status pill +
// kebab placeholder live in their own narrow columns so the row scans
// cleanly.

import Link from 'next/link'
import { Star } from 'lucide-react'
import StatusPill from '../../_shared/StatusPill'
import { categoryLabel } from '../../_shared/CategoryBadge'
import { formatRelativeTime } from '../../_shared/relativeTime'
import ArticleThumbnail from './ArticleThumbnail'
import PostsTableActions from '../PostsTableActions'

export type ArticleListEntry = {
  id: string
  slug: string
  title: string
  category: string
  authorName: string | null
  publishedAt: string
  updatedAt: string
  readTime: number
  published: boolean
  featured: boolean
  // 1-based slot on the public front page; null = featured but unranked,
  // or not featured at all (use `featured` to disambiguate).
  featuredRank: number | null
  heroSrc: string | null
  heroAlt: string | null
  heroType: 'image' | 'video'
}

// Pill shown beside the title for any article in the featured pool.
// Ranked picks (1..5) show the slot number; unranked shows just the
// star — communicating "in the pool, but no pinned slot yet."
function FeaturedBadge({ rank }: { rank: number | null }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200"
      title={rank ? `Front-page slot #${rank}` : 'In featured pool, no pinned slot'}
    >
      <Star className="h-3 w-3 fill-amber-500 stroke-amber-600" />
      {rank ? `#${rank}` : 'Front'}
    </span>
  )
}

function metaLine(entry: ArticleListEntry): string {
  const parts: string[] = [categoryLabel(entry.category)]
  if (entry.authorName) parts.push(`by ${entry.authorName}`)
  if (entry.published) {
    parts.push(formatRelativeTime(entry.publishedAt))
    parts.push(`${entry.readTime} min read`)
  } else {
    parts.push(`last edited ${formatRelativeTime(entry.updatedAt)}`)
  }
  return parts.join(' · ')
}

export default function ArticleRow({ entry }: { entry: ArticleListEntry }) {
  return (
    <div data-opus-table-header
      role="row"
      className="grid grid-cols-[64px_minmax(0,1fr)_120px_120px] items-center gap-3 border-b border-gray-100 bg-white px-4 py-3.5 transition-colors hover:bg-gray-50/60"
    >
      <ArticleThumbnail
        category={entry.category}
        heroSrc={entry.heroSrc}
        heroAlt={entry.heroAlt}
        heroType={entry.heroType}
      />

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/operations/articles/${entry.id}`}
            className="block min-w-0 truncate text-sm font-semibold text-gray-900 hover:text-[#7E5896]"
            title={entry.title || 'Untitled'}
          >
            {entry.title || 'Untitled'}
          </Link>
          {entry.featured && <FeaturedBadge rank={entry.featuredRank} />}
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500" title={metaLine(entry)}>
          {metaLine(entry)}
        </p>
      </div>

      <div role="cell" className="flex items-center">
        <StatusPill variant={entry.published ? 'published' : 'draft'} />
      </div>

      <div role="cell" className="flex items-center justify-end">
        <PostsTableActions
          id={entry.id}
          slug={entry.slug}
          published={entry.published}
          featured={entry.featured}
          featuredRank={entry.featuredRank}
        />
      </div>
    </div>
  )
}
