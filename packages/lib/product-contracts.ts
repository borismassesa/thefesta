import { z } from "zod";

// Product commerce (Zola-style registry shop) — shared contracts.
// One source of truth for the `products` / `product_categories` rows that
// vendors_portal writes, opus_admin moderates, and opus_website + opus_pass
// read. Mirrors vendor-contracts.ts: Zod row schemas + passthrough, consumed
// via transpilePackages in each app.

export const PRODUCT_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ProductCategorySchema = z
  .object({
    slug: z.string(),
    label: z.string(),
    icon: z.string(),
    hero_image: z.string().nullable(),
    sort_order: z.number(),
    active: z.boolean(),
  })
  .passthrough();
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

export const ProductRecordSchema = z
  .object({
    id: z.string(),
    vendor_id: z.string(),
    category_slug: z.string().nullable(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    highlights: z.array(z.string()),
    /** TZS integer — no fractional money, no free-text prices. */
    price_tzs: z.number().int().positive(),
    compare_at_price_tzs: z.number().int().positive().nullable(),
    images: z.array(z.string()),
    /** null = untracked stock (always orderable). */
    stock_quantity: z.number().int().min(0).nullable(),
    made_to_order: z.boolean(),
    status: z.enum(PRODUCT_STATUSES),
    rejection_note: z.string().nullable(),
    published: z.boolean(),
    sort_order: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
export type ProductRecord = z.infer<typeof ProductRecordSchema>;

/** What the vendor edits — the writable subset of a product row. */
export const ProductInputSchema = z.object({
  category_slug: z.string().nullable(),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable(),
  highlights: z.array(z.string().max(160)).max(8),
  price_tzs: z.number().int().positive(),
  compare_at_price_tzs: z.number().int().positive().nullable(),
  images: z.array(z.string().url()).max(8),
  stock_quantity: z.number().int().min(0).nullable(),
  made_to_order: z.boolean(),
  published: z.boolean(),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

/** "TZS 1,250,000" — the one display format for product money. */
export function formatTzs(amount: number): string {
  return `TZS ${Math.round(amount).toLocaleString("en-US")}`;
}

/** URL-friendly product slug from a name ("Cast-iron pot set" → "cast-iron-pot-set"). */
export function productSlugOf(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Best-effort row parse: returns null instead of throwing on a bad row. */
export function mapProductRow(row: unknown): ProductRecord | null {
  const parsed = ProductRecordSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/** A product guests may see/buy: approved by admin AND published by the vendor. */
export function isLiveProduct(p: Pick<ProductRecord, "status" | "published">): boolean {
  return p.status === "approved" && p.published;
}
