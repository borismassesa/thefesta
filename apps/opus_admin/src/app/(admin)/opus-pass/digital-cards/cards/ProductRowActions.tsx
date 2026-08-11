'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteDigitalCardProduct } from './actions'

type Props = {
  id: string
  name: string
}

export default function ProductRowActions({ id, name }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // opus_pass is mounted under basePath '/opuspass'.
  const opusPassUrl = `${process.env.NEXT_PUBLIC_OPUS_PASS_URL ?? 'http://localhost:3008'}`

  const handleDelete = () => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    startTransition(async () => {
      await deleteDigitalCardProduct(id)
      router.refresh()
    })
  }

  return (
    <div className={cn('flex items-center justify-end gap-0.5', pending && 'opacity-60')}>
      <Link
        href={`/opus-pass/digital-cards/cards/${id}`}
        title="Edit"
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </Link>
      <a
        href={`${opusPassUrl}/digital-cards/p/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        title="View on site"
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
      <button data-opus-button="control"
        type="button"
        onClick={handleDelete}
        title="Delete card"
        aria-label="Delete card"
        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
