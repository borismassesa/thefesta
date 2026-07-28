'use client'

import Image from 'next/image'
import { MapPin, Pencil, Plus, Store, Tag } from 'lucide-react'
import type { CatalogGift } from '@/lib/dashboard/gift-catalog'

/** One ready-made shop gift in the unified registry grid. Adding it turns it into a
 *  real GiftRegistryItem, so the card swaps to the couple's own (editable) card. */
export default function CatalogGiftCard({
  gift,
  onAdd,
  onEdit,
  busy,
}: {
  gift: CatalogGift
  onAdd: (gift: CatalogGift) => Promise<void>
  /** Opens the full add form pre-filled from the catalog gift (quantity, most wanted, note, …). */
  onEdit: (gift: CatalogGift) => void
  busy: boolean
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
      <div className="relative aspect-square w-full shrink-0 bg-black/[0.04]">
        <Image
          src={gift.image}
          alt={gift.title}
          fill
          sizes="(min-width: 1280px) 220px, (min-width: 640px) 30vw, 45vw"
          className="object-cover"
        />
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1A1A1A]/60 shadow-sm">
          Shop
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug text-[#1A1A1A]">{gift.title}</h3>
        <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#1A1A1A]">
          <Tag className="h-3.5 w-3.5 shrink-0 text-[#1A1A1A]/40" />
          {gift.priceLabel}
        </p>
        <div className="mt-1.5 flex flex-col gap-0.5 text-[11px] text-[#1A1A1A]/50">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Store className="h-3 w-3 shrink-0" />
            <span className="truncate">{gift.shopName}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{gift.shopLocation}</span>
          </span>
        </div>
        <div className="flex-1" />
        <div className="mt-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAdd(gift)}
            disabled={busy}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1A1A1A] px-3 text-xs font-semibold text-white transition-colors hover:bg-black/80 disabled:opacity-70"
          >
            <Plus className="h-3.5 w-3.5" /> {busy ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => onEdit(gift)}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-black/[0.12] px-3 text-xs font-semibold text-[#1A1A1A]/70 transition-colors hover:bg-black/[0.04]"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>
    </div>
  )
}
