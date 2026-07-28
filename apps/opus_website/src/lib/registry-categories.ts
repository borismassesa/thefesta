export type RegistryCategory = {
  slug: string
  name: string
  title: string
  tagline: string
  img: string
  related: string[]
}

// Slugs are kept in lock-step with the product_categories table seed
// (migration 20260724000001) so a product's category_slug always resolves to
// a browse page here. Labels/taglines/images stay curated on the website side.
const KITCHEN_IMG = 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=400&q=80'
const PLACE_SETTING_IMG = 'https://images.unsplash.com/photo-1630527152680-500b5453fb04?auto=format&fit=crop&w=400&q=80'
const BED_LINEN_IMG = 'https://images.unsplash.com/photo-1601276174812-63280a55656e?auto=format&fit=crop&w=400&q=80'
const SOFA_IMG = 'https://images.unsplash.com/photo-1759722665629-29df6ee4f9a5?auto=format&fit=crop&w=400&q=80'
const COCONUT_BEACH_IMG = 'https://images.unsplash.com/photo-1551523713-c1473aa01d9f?auto=format&fit=crop&w=400&q=80'
const GIFT_BOX_IMG = 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=400&q=80'

export const REGISTRY_CATEGORIES: RegistryCategory[] = [
  {
    slug: 'kitchen-dining',
    name: 'Kitchen & Dining',
    title: 'Kitchen & Dining Essentials',
    tagline: 'Cookware, small appliances, and everyday dinnerware for the home you’re building together.',
    img: KITCHEN_IMG,
    related: ['tabletop-bar', 'home-decor', 'bed-bath'],
  },
  {
    slug: 'tabletop-bar',
    name: 'Tabletop & Bar',
    title: 'Tabletop & Bar',
    tagline: 'Glassware, serveware, and bar essentials for hosting your first dinner parties.',
    img: PLACE_SETTING_IMG,
    related: ['kitchen-dining', 'home-decor', 'gifts-keepsakes'],
  },
  {
    slug: 'bed-bath',
    name: 'Bed & Bath',
    title: 'Bed & Bath',
    tagline: 'Soft sheets, plush towels, and everything for a hotel-quality bedroom and bath.',
    img: BED_LINEN_IMG,
    related: ['home-decor', 'kitchen-dining', 'tabletop-bar'],
  },
  {
    slug: 'home-decor',
    name: 'Home & Décor',
    title: 'Home & Décor',
    tagline: 'Statement furniture and decorative pieces to make your first home feel like yours.',
    img: SOFA_IMG,
    related: ['bed-bath', 'kitchen-dining', 'tabletop-bar'],
  },
  {
    slug: 'outdoor-weekend',
    name: 'Outdoor & Weekend',
    title: 'Outdoor & Weekend',
    tagline: 'Gear for weekend getaways, picnics, and time outdoors as a couple.',
    img: COCONUT_BEACH_IMG,
    related: ['gifts-keepsakes', 'home-decor', 'kitchen-dining'],
  },
  {
    slug: 'gifts-keepsakes',
    name: 'Gifts & Keepsakes',
    title: 'Gifts & Keepsakes',
    tagline: 'Thoughtful gift-boxed pieces and keepsakes guests love to give.',
    img: GIFT_BOX_IMG,
    related: ['home-decor', 'tabletop-bar', 'outdoor-weekend'],
  },
]

export function getRegistryCategory(slug: string): RegistryCategory | undefined {
  return REGISTRY_CATEGORIES.find((c) => c.slug === slug)
}
