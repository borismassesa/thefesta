'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Eye, EyeOff, Pencil, Star, Trash2 } from 'lucide-react'
import { deleteAdvicePost, togglePostFeatured, togglePostPublished } from './actions'
import ConfirmDialog from '../_shared/ConfirmDialog'

type Props = {
  id: string
  slug: string
  published: boolean
  featured: boolean
  featuredRank: number | null
}

export default function PostsTableActions({
  id,
  slug,
  published,
  featured,
  featuredRank,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()
  const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? ''

  const onTogglePublished = () =>
    startTransition(async () => {
      await togglePostPublished(id, !published)
      router.refresh()
    })

  const onToggleFeatured = () =>
    startTransition(async () => {
      await togglePostFeatured(id, !featured)
      router.refresh()
    })

  const onConfirmDelete = () => {
    startTransition(async () => {
      await deleteAdvicePost(id)
      setConfirmOpen(false)
      router.refresh()
    })
  }

  const featuredTitle = featured
    ? featuredRank
      ? `Remove from the front (currently slot #${featuredRank})`
      : 'Remove from the featured pool'
    : 'Add to the featured pool'

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <IconButton
          title={featuredTitle}
          onClick={onToggleFeatured}
          disabled={pending || !published}
          active={featured}
        >
          <Star
            className={`h-4 w-4 ${
              featured
                ? 'fill-amber-500 stroke-amber-600'
                : 'stroke-gray-500'
            }`}
          />
        </IconButton>
        <IconButton
          title={published ? 'Unpublish' : 'Publish'}
          onClick={onTogglePublished}
          disabled={pending}
        >
          {published ? (
            <EyeOff className="h-4 w-4 text-gray-500" />
          ) : (
            <Eye className="h-4 w-4 text-gray-500" />
          )}
        </IconButton>
        {websiteUrl && (
          <a
            href={`${websiteUrl}/advice-and-ideas/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on live site"
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <Link
          href={`/operations/articles/${id}`}
          title="Edit"
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <IconButton
          title="Delete"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          danger
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={onConfirmDelete}
        title="Delete this article?"
        body={
          <span>
            This will remove <span className="font-mono text-[12px] text-gray-800">/{slug}</span> and any
            references to it. This action can&rsquo;t be undone.
          </span>
        }
        confirmLabel="Delete article"
        cancelLabel="Keep it"
        variant="danger"
        pending={pending}
      />
    </>
  )
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  active?: boolean
}) {
  return (
    <button data-opus-button="danger" data-opus-button-size="medium"
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${
        danger
          ? 'text-gray-500 hover:bg-red-50 hover:text-red-600'
          : active
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}
