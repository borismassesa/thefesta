import type { DigitalCardCategory } from '@/data/digital-cards-categories'

export type DigitalCardsStyleStripItem = {
  id: string
  label: string
  img: string
  alt: string
  href?: string
}

export type DigitalCardsStyleStripContent = {
  items: DigitalCardsStyleStripItem[]
}

/**
 * The catalog circle-strip mirrors the real invitation categories (the same
 * list behind /digital-cards/[category]) instead of a separately-managed CMS
 * section, so the chips always match the shoppable categories.
 */
export function styleStripFromCategories(
  categories: DigitalCardCategory[],
): DigitalCardsStyleStripContent {
  return {
    items: categories.map((c) => ({
      id: c.slug,
      label: c.label,
      img: c.img,
      alt: c.alt,
      href: `/digital-cards/${c.slug}`,
    })),
  }
}
