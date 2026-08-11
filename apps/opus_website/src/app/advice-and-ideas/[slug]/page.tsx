import type { Metadata } from 'next'
import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowRight, Clock } from 'lucide-react'
import JsonLd from '@/components/JsonLd'
import ReadingProgress from '@/components/advice-ideas/ReadingProgress'
import ArticleToc from '@/components/advice-ideas/ArticleToc'
import SearchForm from '@/components/advice-ideas/SearchForm'
import ShareRow from '@/components/advice-ideas/ShareRow'
import ArticleShareRail from '@/components/advice-ideas/ArticleShareRail'
import AuthorCard from '@/components/advice-ideas/AuthorCard'
import CommentsSection from '@/components/advice-ideas/CommentsSection'
import {
  ADVICE_IDEAS_BASE_PATH,
  getAdviceIdeasSectionHref,
  heroThumb,
  type AdviceIdeasBlock,
  type AdviceIdeasBodySection,
  type AdviceIdeasPost,
  type AdviceIdeasRichTextMark,
  type AdviceIdeasRichTextNode,
} from '@/lib/advice-ideas'
import {
  getAuthorFromMap,
  loadAdviceIdeasAuthors,
  loadPublishedAdviceIdeasPosts,
} from '@/lib/advice-ideas-db'

// ISR instead of force-dynamic. Slugs are pre-rendered via generateStaticParams
// and busted on publish by the admin (POST /api/revalidate matches the
// article-slug pattern); the window below is just a safety net.
export const revalidate = 3600

export async function generateStaticParams() {
  const posts = await loadPublishedAdviceIdeasPosts()
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const posts = await loadPublishedAdviceIdeasPosts()
  const post = posts.find((p) => p.slug === slug)
  if (!post) return { title: 'Story not found | OpusFesta' }
  return {
    title: `${post.title} | OpusFesta`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      images: [{ url: heroThumb(post), alt: post.heroMedia.alt }],
      type: 'article',
    },
  }
}

export default async function AdviceIdeasDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const posts = await loadPublishedAdviceIdeasPosts()
  const post = posts.find((p) => p.slug === slug)
  if (!post) notFound()

  const related = posts
    .filter((p) => p.sectionId === post.sectionId && p.id !== post.id)
    .slice(0, 4)
  const fallbackRelated =
    related.length < 4
      ? posts
          .filter((p) => p.id !== post.id && !related.some((r) => r.id === p.id))
          .slice(0, 4 - related.length)
      : []
  const continueReading = [...related, ...fallbackRelated]

  const tocItems = post.body
    .filter((s) => s.heading)
    .map((s) => ({ id: s.id, label: s.heading as string }))

  const authors = await loadAdviceIdeasAuthors()
  const mappedAuthor = getAuthorFromMap(authors, post.author)
  const author = {
    ...mappedAuthor,
    role: mappedAuthor.role || post.authorRole,
    avatarUrl: mappedAuthor.avatarUrl || post.authorAvatarUrl,
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://opusfesta.com'

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: heroThumb(post),
    datePublished: post.date,
    author: { '@type': 'Person', name: author.name },
    publisher: {
      '@type': 'Organization',
      name: 'OpusFesta',
      logo: { '@type': 'ImageObject', url: `${base}/assets/logo/opusfesta-logo-black.png` },
    },
    url: `${base}/advice-and-ideas/${post.slug}`,
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: base },
      { '@type': 'ListItem', position: 2, name: 'Ideas & Advice', item: `${base}/advice-and-ideas` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${base}/advice-and-ideas/${post.slug}` },
    ],
  }

  return (
    <article className="bg-white text-[#1A1A1A]">
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />
      <ReadingProgress />
      <ArticleToc items={tocItems} />
      <ArticleShareRail title={post.title} slug={post.slug} />

      {/* Top row — breadcrumb + search, aligned with article column */}
      <div className="mx-auto flex max-w-[52rem] flex-col gap-3 pl-3 pr-4 pt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-4">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex flex-wrap items-center gap-x-2 text-[14px] text-gray-700">
            <li>
              <Link
                href={ADVICE_IDEAS_BASE_PATH}
                className="underline-offset-4 transition-colors hover:text-[var(--accent-hover)] hover:underline"
              >
                Ideas &amp; Advice
              </Link>
            </li>
            <li className="text-gray-300" aria-hidden>/</li>
            <li className="min-w-0 truncate">
              <Link
                href={getAdviceIdeasSectionHref(post.sectionId)}
                className="underline-offset-4 transition-colors hover:text-[var(--accent-hover)] hover:underline"
              >
                {post.category}
              </Link>
            </li>
          </ol>
        </nav>
        <div className="shrink-0">
          <Suspense fallback={null}>
            <SearchForm action={ADVICE_IDEAS_BASE_PATH} />
          </Suspense>
        </div>
      </div>

      {/* Article header */}
      <header className="mx-auto max-w-[52rem] pl-3 pr-4 pt-6 pb-8 sm:px-4 sm:pt-8">
        <Link
          href={getAdviceIdeasSectionHref(post.sectionId)}
          className="inline-block text-[13px] font-semibold text-[var(--accent-hover)] transition-colors hover:text-[#1A1A1A]"
        >
          {post.category}
        </Link>
        <h1 className="mt-3 text-[28px] font-bold leading-[1.15] tracking-[-0.015em] text-[#1A1A1A] sm:text-[34px] md:text-[40px]">
          {post.title}
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-gray-600 sm:text-[18px]">
          {post.excerpt}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-gray-500">
          <span className="inline-flex items-center gap-2 font-semibold text-[#1A1A1A]">
            <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#FAF7F2] text-[10px] font-bold uppercase tracking-wider text-[var(--accent-hover)]">
              {author.avatarUrl ? (
                <Image
                  src={author.avatarUrl}
                  alt=""
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              ) : (
                <span>{author.initials}</span>
              )}
            </span>
            {post.author}
          </span>
          <span className="text-gray-300" aria-hidden>·</span>
          <span>{post.authorRole}</span>
          <span className="text-gray-300" aria-hidden>·</span>
          <time>{post.date}</time>
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={12} className="text-gray-400" aria-hidden />
            {post.readTime}
          </span>
        </div>

        {/* Share — small horizontal version for mobile/tablet only */}
        <div className="mt-5 lg:hidden">
          <ShareRow title={post.title} slug={post.slug} />
        </div>
      </header>

      {/* Hero media */}
      <figure className="mx-auto max-w-[52rem] pl-3 pr-4 sm:px-4">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-gray-100">
          {post.heroMedia.type === 'video' ? (
            <video
              src={post.heroMedia.src}
              poster={post.heroMedia.poster}
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <Image
              src={post.heroMedia.src}
              alt={post.heroMedia.alt}
              fill
              priority
              sizes="(min-width: 768px) 800px, 100vw"
              className="object-cover"
            />
          )}
        </div>
      </figure>

      {/* Body */}
      <div className="mx-auto max-w-[52rem] pl-3 pr-4 pt-12 pb-16 sm:px-4">
        <div id="article-rail-start" aria-hidden className="h-px w-full" />
        <div id="article-body">
          {post.body.map((section, i) => (
            <ArticleSection key={section.id} section={section} index={i} />
          ))}
        </div>
        <div id="article-rail-end" aria-hidden className="h-px w-full" />

        {/* Foot of article — author + discussion (outside the share/TOC trigger) */}
        <div className="mt-14 border-t border-gray-200 pt-10">
          <AuthorCard author={author} />
        </div>

        <CommentsSection slug={post.slug} seed={post.seedComments} />
      </div>

      {/* Continue reading */}
      {continueReading.length > 0 && (
        <section className="border-t border-gray-200 bg-[#FAF7F2]">
          <div className="mx-auto max-w-6xl pl-3 pr-4 py-14 sm:px-4 sm:py-16">
            <div className="mb-8 flex items-end justify-between gap-4">
              <h2 className="text-xl font-bold tracking-tight text-[#1A1A1A] sm:text-2xl">
                More from {post.category}
              </h2>
              <Link
                href={ADVICE_IDEAS_BASE_PATH}
                className="hidden items-center gap-1.5 text-[13px] font-semibold text-[#1A1A1A] underline-offset-4 transition-colors hover:text-[var(--accent-hover)] hover:underline md:inline-flex"
              >
                Back to the hub
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {continueReading.map((p) => (
                <RelatedCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────
function ArticleSection({
  section,
  index,
}: {
  section: AdviceIdeasBodySection
  index: number
}) {
  return (
    <section id={section.id} className={index > 0 ? 'mt-12' : ''}>
      {section.label && (
        <p className="mb-2 text-[13px] font-semibold text-[var(--accent-hover)]">
          {section.label}
        </p>
      )}
      {section.heading && (
        <h2 className="mb-5 text-[22px] font-bold leading-[1.25] tracking-[-0.005em] text-[#1A1A1A] sm:text-[26px]">
          {section.heading}
        </h2>
      )}
      <div className="space-y-5">
        {section.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
    </section>
  )
}

// ─── Block renderer ──────────────────────────────────────────────────────
function BlockRenderer({ block }: { block: AdviceIdeasBlock }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p className="text-[16px] leading-[1.7] text-gray-700 sm:text-[17px]">
          <RichInline content={block.richText} fallback={block.text} />
        </p>
      )
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag
          className={`space-y-2.5 text-[16px] leading-[1.65] text-gray-700 sm:text-[17px] ${
            block.ordered ? 'list-decimal pl-6' : ''
          }`}
        >
          {block.items.map((item, i) => (
            <li
              key={i}
              className={
                block.ordered
                  ? 'pl-1 marker:font-semibold marker:text-[#1A1A1A]'
                  : 'relative pl-5 before:absolute before:left-0 before:top-[0.7em] before:h-[6px] before:w-[6px] before:rounded-full before:bg-[#1A1A1A]'
              }
            >
              {item}
            </li>
          ))}
        </Tag>
      )
    }
    case 'quote':
      return (
        <blockquote className="my-2 border-l-2 border-[var(--accent)] pl-5">
          <p className="text-[18px] italic leading-[1.5] text-[#1A1A1A] sm:text-[19px]">
            “{block.quote}”
          </p>
          {block.attribution && (
            <footer className="mt-2 text-[13px] text-gray-500">
              — {block.attribution}
            </footer>
          )}
        </blockquote>
      )
    case 'tip':
      return (
        <aside className="my-2 rounded-lg bg-[#FAF7F2] p-5">
          <p className="mb-1 text-[13px] font-semibold text-[var(--accent-hover)]">
            {block.title}
          </p>
          <p className="text-[15px] leading-[1.6] text-[#1A1A1A] sm:text-[16px]">
            {block.text}
          </p>
        </aside>
      )
    case 'subheading':
      return (
        <h3 className="mt-6 mb-1 text-[18px] font-bold leading-[1.3] text-[#1A1A1A] sm:text-[19px]">
          {block.text}
        </h3>
      )
    case 'image':
      return (
        <figure className="my-4 -mx-4 sm:mx-0">
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 sm:rounded-xl">
            <Image
              src={block.src}
              alt={block.alt}
              fill
              sizes="(min-width: 768px) 800px, 100vw"
              className="object-cover"
            />
          </div>
          {block.caption && (
            <figcaption className="mt-2 px-4 text-[13px] italic leading-relaxed text-gray-500 sm:px-0">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    case 'video':
      return (
        <figure className="my-4 -mx-4 sm:mx-0">
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 sm:rounded-xl">
            <video
              src={block.src}
              poster={block.poster}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
              aria-label={block.alt}
            />
          </div>
          {block.caption && (
            <figcaption className="mt-2 px-4 text-[13px] italic leading-relaxed text-gray-500 sm:px-0">
              {block.caption}
            </figcaption>
          )}
        </figure>
      )
    case 'gallery':
      return (
        <div className="my-4 grid grid-cols-2 gap-2 sm:gap-3">
          {block.items.map((item, i) => (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-lg bg-gray-100"
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                sizes="(min-width: 768px) 380px, 50vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )
  }
}

function RichInline({
  content,
  fallback,
}: {
  content?: AdviceIdeasRichTextNode[]
  fallback: string
}) {
  if (!content?.length) return <>{fallback}</>
  return (
    <>
      {content.map((node, index) => {
        if (node.type === 'hardBreak') return <br key={index} />
        let child: ReactNode = node.text ?? ''
        for (const mark of node.marks ?? []) {
          child = renderRichMark(mark, child, index)
        }
        return <span key={index}>{child}</span>
      })}
    </>
  )
}

function renderRichMark(
  mark: AdviceIdeasRichTextMark,
  child: ReactNode,
  key: number
): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{child}</strong>
    case 'italic':
      return <em key={key}>{child}</em>
    case 'underline':
      return <u key={key}>{child}</u>
    case 'strike':
      return <s key={key}>{child}</s>
    case 'code':
      return <code key={key} className="rounded bg-gray-100 px-1 py-0.5 text-[0.92em]">{child}</code>
    case 'superscript':
      return <sup key={key}>{child}</sup>
    case 'subscript':
      return <sub key={key}>{child}</sub>
    case 'highlight':
      return <mark key={key} className="rounded-sm bg-[#FAEEDA] px-0.5">{child}</mark>
    case 'link': {
      const href = safeHref(mark.attrs?.href)
      return href ? (
        <a key={key} href={href} className="font-medium text-[var(--accent-hover)] underline underline-offset-2">
          {child}
        </a>
      ) : child
    }
    default:
      return child
  }
}

function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const href = value.trim()
  if (!href) return null
  if (href.startsWith('/') || href.startsWith('#')) return href
  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? href : null
  } catch {
    return null
  }
}

// ─── Related card ────────────────────────────────────────────────────────
function RelatedCard({ post }: { post: AdviceIdeasPost }) {
  return (
    <Link
      href={`${ADVICE_IDEAS_BASE_PATH}/${post.slug}`}
      className="group flex h-full flex-col"
    >
      <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden rounded-lg bg-gray-100">
        <Image
          src={heroThumb(post)}
          alt={post.heroMedia.alt}
          fill
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </div>
      <p className="mb-1.5 text-[12px] font-semibold text-[var(--accent-hover)]">
        {post.category}
      </p>
      <h3 className="mb-1.5 text-[16px] font-bold leading-[1.3] text-[#1A1A1A] transition-all group-hover:underline underline-offset-2 decoration-2">
        {post.title}
      </h3>
      <p className="line-clamp-2 text-[13px] leading-relaxed text-gray-600">
        {post.excerpt}
      </p>
    </Link>
  )
}
