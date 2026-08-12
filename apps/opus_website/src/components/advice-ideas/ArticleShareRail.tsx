'use client'

import { useEffect, useState } from 'react'
import { Check, Heart, Link2, Mail, Share } from 'lucide-react'
import useArticleRailVisibility from '@/components/advice-ideas/useArticleRailVisibility'

const SITE_ORIGIN = 'https://opusfesta.com'

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.371-.272.298-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.04 21.785h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.889-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.99c-.003 5.45-4.437 9.884-9.886 9.884z" />
    </svg>
  )
}

export default function ArticleShareRail({
  title,
  slug,
}: {
  title: string
  slug: string
}) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(false)
  const visible = useArticleRailVisibility()

  const url = `${SITE_ORIGIN}/advice-and-ideas/${slug}`
  const text = `${title} — OpusFesta`
  const likeKey = `opusfesta:liked:${slug}`

  useEffect(() => {
    try {
      setLiked(localStorage.getItem(likeKey) === '1')
    } catch {
      // localStorage may be blocked in private mode — quietly default to false.
    }
  }, [likeKey])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Older Safari iOS over http blocks clipboard.writeText — quietly no-op.
    }
  }

  const shareArticle = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: text, url })
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }

    await copyLink()
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`
  const emailHref = `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`Thought you would like this:\n\n${url}`)}`

  const toggleLike = () => {
    const next = !liked
    setLiked(next)
    try {
      if (next) localStorage.setItem(likeKey, '1')
      else localStorage.removeItem(likeKey)
    } catch {
      // localStorage may be blocked — UI still updates locally.
    }
  }

  const btn =
    'flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:border-[var(--accent-hover)] hover:text-[var(--accent-hover)]'

  return (
    <aside
      aria-label="Share this article"
      className={`pointer-events-none fixed top-1/2 z-30 hidden -translate-y-1/2 transition-opacity duration-300 lg:block left-[max(16px,calc(50%-480px-40px-24px))] ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="pointer-events-auto flex flex-col items-center gap-3">
        <button data-opus-button="control"
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? 'Unsave from favourites' : 'Save to favourites'}
          className={`${btn} ${
            liked
              ? 'border-[var(--accent-hover)] text-[var(--accent-hover)]'
              : ''
          }`}
        >
          <Heart
            size={16}
            fill={liked ? 'currentColor' : 'none'}
            strokeWidth={liked ? 1.5 : 2}
          />
        </button>
        <button data-opus-button="control"
          type="button"
          onClick={shareArticle}
          aria-label="Share article"
          className={btn}
        >
          <Share size={16} />
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on WhatsApp"
          className={btn}
        >
          <WhatsAppIcon size={16} />
        </a>
        <a href={emailHref} aria-label="Share by email" className={btn}>
          <Mail size={16} />
        </a>
        <button data-opus-button="control"
          type="button"
          onClick={copyLink}
          aria-label={copied ? 'Link copied' : 'Copy link'}
          className={btn}
        >
          {copied ? <Check size={16} /> : <Link2 size={16} />}
        </button>
      </div>
    </aside>
  )
}
