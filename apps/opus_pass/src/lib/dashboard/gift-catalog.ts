import type { GiftRegistryCategory } from './types'

/** A ready-made gift the couple can add to their registry in one tap. Mirrors the
 *  public registry shop (opus_website /registry) but kept self-contained here so
 *  the dashboard has no cross-app dependency. Adding one creates a real
 *  GiftRegistryItem pre-filled from these fields. */
export type CatalogGift = {
  id: string
  title: string
  description: string
  image: string
  priceLabel: string
  category: GiftRegistryCategory
  shopName: string
  shopLocation: string
  /** Set for real vendor products (from fetchCatalogProducts) — enables the
   *  paid "Buy this gift" flow and product_id dedupe. Absent for static demo
   *  entries, which remain add-by-claim only. */
  productId?: string
  priceTzs?: number
}

const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`

export const GIFT_CATALOG: CatalogGift[] = [
  // Kitchen
  {
    id: 'cat-cookware-set',
    title: 'Cast-iron 3-piece cookware set',
    description: 'A registry favourite — hard-wearing cast-iron pots that last a lifetime.',
    image: u('photo-1556909212-d5b604d0c90d'),
    priceLabel: 'TZS 850,000',
    category: 'Kitchen',
    shopName: 'Kilimanjaro Kitchenware',
    shopLocation: 'Arusha',
  },
  {
    id: 'cat-stand-mixer',
    title: '12-speed countertop stand mixer',
    description: 'For the baker in the family — mixes, kneads and whisks with ease.',
    image: u('photo-1578985545062-69928b1d9587'),
    priceLabel: 'TZS 620,000',
    category: 'Kitchen',
    shopName: 'Dar Design House',
    shopLocation: 'Dar es Salaam',
  },
  {
    id: 'cat-knife-set',
    title: "Stainless steel chef's knife set",
    description: 'A full block of precision knives for the new kitchen.',
    image: u('photo-1593618998160-e34014e67546'),
    priceLabel: 'TZS 210,000',
    category: 'Kitchen',
    shopName: 'Kilimanjaro Kitchenware',
    shopLocation: 'Arusha',
  },
  // Tabletop
  {
    id: 'cat-dinner-set',
    title: '12-piece stoneware dinnerware set',
    description: 'Everyday plates and bowls for hosting your first dinners together.',
    image: u('photo-1562050344-f7ad946cee35'),
    priceLabel: 'TZS 320,000',
    category: 'Tabletop',
    shopName: 'Bagamoyo Ceramics',
    shopLocation: 'Bagamoyo',
  },
  {
    id: 'cat-wine-glasses',
    title: 'Hand-blown wine glasses, set of 6',
    description: 'Delicate, balanced glasses for celebrations at home.',
    image: u('photo-1613477581402-306fa9dc6b95'),
    priceLabel: 'TZS 180,000',
    category: 'Tabletop',
    shopName: 'Coastal Linen Studio',
    shopLocation: 'Zanzibar',
  },
  {
    id: 'cat-cheese-board',
    title: 'Marble and brass cheese board',
    description: 'A statement serving board for guests and slow weekends.',
    image: u('photo-1630527152680-500b5453fb04'),
    priceLabel: 'TZS 95,000',
    category: 'Tabletop',
    shopName: 'Dar Design House',
    shopLocation: 'Dar es Salaam',
  },
  // Bed & Bath
  {
    id: 'cat-cotton-sheets',
    title: 'Egyptian cotton sheet set, queen',
    description: 'Soft, breathable sheets for a hotel-quality bedroom.',
    image: u('photo-1601276174812-63280a55656e'),
    priceLabel: 'TZS 240,000',
    category: 'Bed & Bath',
    shopName: 'Coastal Linen Studio',
    shopLocation: 'Zanzibar',
  },
  {
    id: 'cat-towel-bundle',
    title: 'Plush bath towel bundle, 6-piece',
    description: 'Thick, absorbent towels in a matching his-and-hers set.',
    image: u('photo-1620626011761-996317b8d101'),
    priceLabel: 'TZS 130,000',
    category: 'Bed & Bath',
    shopName: 'Highland Living',
    shopLocation: 'Moshi',
  },
  // Home
  {
    id: 'cat-robot-vacuum',
    title: 'Cordless robot vacuum',
    description: 'Keeps the new home spotless — schedule it and forget it.',
    image: u('photo-1603618000208-d6b3d1eab0d5'),
    priceLabel: 'TZS 780,000',
    category: 'Home',
    shopName: 'Mwanza Home Market',
    shopLocation: 'Mwanza',
  },
  {
    id: 'cat-table-lamps',
    title: 'Ceramic table lamp pair',
    description: 'Warm bedside lighting — a matched pair for either side.',
    image: u('photo-1612179518346-cf36e6695c6c'),
    priceLabel: 'TZS 260,000',
    category: 'Home',
    shopName: 'Highland Living',
    shopLocation: 'Moshi',
  },
  {
    id: 'cat-area-rug',
    title: 'Handwoven area rug, 5x7',
    description: 'A textured centrepiece to ground the living room.',
    image: u('photo-1759722665629-29df6ee4f9a5'),
    priceLabel: 'TZS 410,000',
    category: 'Home',
    shopName: 'Tanga Trading Co.',
    shopLocation: 'Tanga',
  },
  // Weekend
  {
    id: 'cat-picnic-backpack',
    title: 'Insulated picnic backpack',
    description: 'Everything for a coast day out — cooler-lined and ready to pack.',
    image: u('photo-1603477849227-705c424d1d80'),
    priceLabel: 'TZS 120,000',
    category: 'Weekend',
    shopName: 'Serengeti Home Co.',
    shopLocation: 'Dar es Salaam',
  },
  {
    id: 'cat-hammock',
    title: 'Two-person camping hammock',
    description: 'For lazy weekends away as a couple.',
    image: u('photo-1551523713-c1473aa01d9f'),
    priceLabel: 'TZS 85,000',
    category: 'Weekend',
    shopName: 'Serengeti Home Co.',
    shopLocation: 'Dar es Salaam',
  },
  // Experiences & Gift Cards
  {
    id: 'cat-honeymoon-fund',
    title: 'Honeymoon fund — Zanzibar',
    description: 'Let guests contribute toward the honeymoon — any amount helps.',
    image: u('photo-1603477849227-705c424d1d80'),
    priceLabel: 'Any amount',
    category: 'Experiences & Gift Cards',
    shopName: 'OpusFesta',
    shopLocation: 'Cash fund',
  },
  {
    id: 'cat-spa-day',
    title: 'Couples spa day',
    description: 'A relaxing day for two before or after the big day.',
    image: u('photo-1544161515-4ab6ce6db874'),
    priceLabel: 'TZS 300,000',
    category: 'Experiences & Gift Cards',
    shopName: 'OpusFesta',
    shopLocation: 'Experience',
  },
  {
    id: 'cat-dhow-cruise',
    title: 'Sunset dhow cruise for two',
    description: 'A memory to share instead of a thing to own.',
    image: u('photo-1507525428034-b723cf961d3e'),
    priceLabel: 'TZS 150,000',
    category: 'Experiences & Gift Cards',
    shopName: 'OpusFesta',
    shopLocation: 'Experience',
  },
]
