import type { Treatment } from '@/components/guests/InvitationVisual'
import type { Product as BaseProduct } from '@/components/guests/productInfo'

// Catalog product — shared Product + visual treatment + optional designer/sample fields.
// Lives in a plain (non-'use client') module so both server and client components
// can import the dataset cleanly. Importing from a 'use client' file via a server
// component creates a client-reference proxy that doesn't materialise the values.
export type CatalogProduct = BaseProduct & {
  designer: string
  freeSample?: boolean
  treatment: Treatment
  /** Required for catalog products — TZS per digital card (the primary product). */
  digitalUnitPrice: number
}

// Digital prices tiered by design complexity:
//   • Photo / heritage / all-in-one premium: TZS 12,000–15,000 per card
//   • Standard wedding designs:              TZS 10,000–11,000 per card
//   • Save the dates / day-of paper:         TZS 7,000–9,000 per card
export const PRODUCTS: CatalogProduct[] = [
  { id: 'p1',  category: 'Wedding Invitations',          designer: 'Bagamoyo Press',     name: 'Botanical Frame Wedding Invitations',         priceWas: 199000, priceNow: 119000, digitalUnitPrice: 10000, freeSample: true,  swatches: ['#A6B89A','#F5DCE2','#FBF7F2','#1A1A1A','#7A1F2B'],     treatment: 'floral-border' },
  { id: 'p2',  category: 'Wedding Invitations',          designer: 'House of Mwakali',   name: 'Heritage Crown Karibu Invitations',           priceWas: 215000, priceNow: 129000, digitalUnitPrice: 12000, freeSample: true,  swatches: ['#7A1F2B','#C8A35C','#F5EFE3','#1A1A1A'],               treatment: 'cultural-red' },
  { id: 'p3',  category: 'All-in-One Wedding Invitations', designer: 'Studio Saba',      name: 'Modern Block All-in-one Invitations',                           priceNow: 132000, digitalUnitPrice: 11000, freeSample: false, swatches: ['#1A1A1A','#FBF7F2','#E8D9A7'],                          treatment: 'modern-block' },
  { id: 'p4',  category: 'Save the Dates',               designer: 'Mzimbazi Studio',    name: 'Arch Script Save the Date Cards',                               priceNow: 98000,  digitalUnitPrice: 8000,  freeSample: true,  swatches: ['#7A1F2B','#F5EFE3','#A6B89A'],                          treatment: 'arch-script' },

  { id: 'p5',  category: 'Engagement Invitations',       designer: 'Pwani Paper Co.',    name: 'Sage Panel Engagement Invitations',           priceWas: 165000, priceNow: 99000,  digitalUnitPrice: 10000, freeSample: true,  swatches: ['#A6B89A','#FBF7F2','#5C6B4D'],                          treatment: 'sage-panel' },
  { id: 'p6',  category: 'Wedding Invitations',          designer: 'Studio Saba',        name: 'Navy & Gold Classic Invitations',                               priceNow: 189000, digitalUnitPrice: 12000, freeSample: false, swatches: ['#1E2D54','#E8D9A7','#F5EFE3','#C8A35C'],                treatment: 'navy-gold' },
  { id: 'p7',  category: 'Wedding Invitations',          designer: 'Bagamoyo Press',     name: 'Minimal Line Modern Invitations',                               priceNow: 112000, digitalUnitPrice: 9000,  freeSample: true,  swatches: ['#FFFFFF','#1A1A1A','#A6B89A'],                          treatment: 'minimal-line' },
  { id: 'p8',  category: 'Bridal Shower Invitations',    designer: 'House of Mwakali',   name: 'Blush Frame Bridal Shower Invitations',       priceWas: 145000, priceNow: 87000,  digitalUnitPrice: 9000,  freeSample: true,  swatches: ['#F5DCE2','#A84F66','#7A1F2B','#FBF7F2'],                treatment: 'blush-frame' },

  { id: 'p9',  category: 'Save the Dates',               designer: 'Lake Manyara Press', name: 'Two of Us Photo Save the Date Cards',                           priceNow: 167000, digitalUnitPrice: 12000, freeSample: false, swatches: ['#1A1A1A','#F5EFE3','#A6B89A'],                          treatment: 'photo-overlay' },
  { id: 'p10', category: 'Wedding Invitations',          designer: 'Pwani Paper Co.',    name: 'Classic Serif Cream Invitations',             priceWas: 139000, priceNow: 83000,  digitalUnitPrice: 10000, freeSample: true,  swatches: ['#F5EFE3','#1A1A1A','#A6B89A','#C8A35C'],                treatment: 'classic-serif' },
  { id: 'p11', category: 'Save the Dates',               designer: 'Mzimbazi Studio',    name: 'Botanical Frame Save the Date Cards',                           priceNow: 92000,  digitalUnitPrice: 8000,  freeSample: true,  swatches: ['#A6B89A','#F5DCE2','#FBF7F2'],                          treatment: 'floral-border' },
  { id: 'p12', category: 'Reception Cards',              designer: 'Studio Saba',        name: 'Heritage Karibu Reception Cards',                               priceNow: 156000, digitalUnitPrice: 11000, freeSample: false, swatches: ['#7A1F2B','#C8A35C','#F5EFE3'],                          treatment: 'cultural-red' },

  { id: 'p13', category: 'Wedding Programmes',           designer: 'Bagamoyo Press',     name: 'Modern Block Wedding Programme',                                priceNow: 78000,  digitalUnitPrice: 7000,  freeSample: true,  swatches: ['#1A1A1A','#FBF7F2','#E8D9A7'],                          treatment: 'modern-block' },
  { id: 'p14', category: 'Menu Cards',                   designer: 'House of Mwakali',   name: 'Arch Script Reception Menu Cards',            priceWas: 89000,  priceNow: 53000,  digitalUnitPrice: 7000,  freeSample: true,  swatches: ['#7A1F2B','#F5EFE3','#A6B89A','#C8A35C'],                treatment: 'arch-script' },
  { id: 'p15', category: 'Thank You Cards',              designer: 'Pwani Paper Co.',    name: 'Sage Panel Thank You Cards',                                    priceNow: 56000,  digitalUnitPrice: 7000,  freeSample: false, swatches: ['#A6B89A','#FBF7F2','#5C6B4D'],                          treatment: 'sage-panel' },
  { id: 'p16', category: 'All-in-One Wedding Invitations', designer: 'Studio Saba',      name: 'Navy & Gold All-in-one Invitations',                            priceNow: 215000, digitalUnitPrice: 13000, freeSample: true,  swatches: ['#1E2D54','#E8D9A7','#F5EFE3'],                          treatment: 'navy-gold' },

  { id: 'p17', category: 'Save the Dates',               designer: 'Lake Manyara Press', name: 'Minimal Line Save the Date Cards',            priceWas: 88000,  priceNow: 53000,  digitalUnitPrice: 7000,  freeSample: true,  swatches: ['#FFFFFF','#1A1A1A','#A6B89A'],                          treatment: 'minimal-line' },
  { id: 'p18', category: 'Birthday Invitations',         designer: 'Mzimbazi Studio',    name: 'Blush Frame Sweet Sixteen Invitations',                         priceNow: 119000, digitalUnitPrice: 10000, freeSample: false, swatches: ['#F5DCE2','#A84F66','#7A1F2B'],                          treatment: 'blush-frame' },
  { id: 'p19', category: 'Wedding Invitations',          designer: 'Bagamoyo Press',     name: 'Two of Us Photo Wedding Invitations',                           priceNow: 198000, digitalUnitPrice: 15000, freeSample: true,  swatches: ['#1A1A1A','#F5EFE3','#7A1F2B'],                          treatment: 'photo-overlay' },
  { id: 'p20', category: 'Welcome Signs',                designer: 'House of Mwakali',   name: 'Classic Serif Welcome Sign Cards',            priceWas: 124000, priceNow: 74000,  digitalUnitPrice: 8000,  freeSample: true,  swatches: ['#F5EFE3','#1A1A1A','#C8A35C'],                          treatment: 'classic-serif' },
]

export function findProductById(id: string): CatalogProduct | undefined {
  return PRODUCTS.find((p) => p.id === id)
}
