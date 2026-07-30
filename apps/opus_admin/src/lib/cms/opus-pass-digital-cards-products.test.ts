import assert from 'node:assert/strict'
import test from 'node:test'
import { PRODUCT_CATEGORIES } from './opus-pass-digital-cards-products'
import { OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK } from './opus-pass-digital-cards-categories'

// PRODUCT_CATEGORIES values are stored verbatim in
// website_invitations_products.category, and the storefront routes a card to a
// category page by case-insensitive SUBSTRING match against that category's
// product_matchers. These tests pin that routing: a picklist value must land on
// a storefront category, and no storefront category may be unpopulatable.
// They use the admin-side mirror of the storefront categories (same
// product_matchers, no cross-app import).
//
// Note what this does NOT cover: whether the picklist matches the strings
// actually stored on live rows. That's the drift that broke the admin filter
// (the picklist said 'Wedding' / 'Save the Date'; every row said
// 'Wedding Invitations' / 'Save the Dates' — both route to the same storefront
// pages, so these assertions would have stayed green). Only the database knows
// that, so it's caught at runtime instead: the category filter counts every
// stored value and labels anything outside this list "off-taxonomy".

const categories = OPUS_PASS_DIGITAL_CARDS_CATEGORIES_FALLBACK.categories

/** Mirrors the storefront's matcher logic in opus_pass/src/data/digital-cards-categories.ts. */
function matchingSlugs(category: string): string[] {
  const haystack = category.toLowerCase()
  return categories
    .filter((c) => c.product_matchers.some((m) => haystack.includes(m.toLowerCase())))
    .map((c) => c.slug)
}

test('every card category reaches at least one storefront category page', () => {
  for (const category of PRODUCT_CATEGORIES) {
    const slugs = matchingSlugs(category)
    assert.ok(
      slugs.length > 0,
      `"${category}" matches no product_matchers — cards filed under it would be ` +
        `orphaned from every storefront category page.`,
    )
  }
})

test('every storefront category is reachable by some card category', () => {
  for (const { slug } of categories) {
    const reaching = PRODUCT_CATEGORIES.filter((c) => matchingSlugs(c).includes(slug))
    assert.ok(
      reaching.length > 0,
      `Storefront category "${slug}" can never be populated — no value in ` +
        `PRODUCT_CATEGORIES matches its product_matchers.`,
    )
  }
})

test('card categories are unique and free of stray whitespace', () => {
  const seen = new Set<string>()
  for (const category of PRODUCT_CATEGORIES) {
    assert.equal(category, category.trim(), `"${category}" has leading/trailing whitespace`)
    assert.ok(category.length > 0, 'category must not be empty')
    assert.ok(!seen.has(category), `"${category}" is listed twice`)
    seen.add(category)
  }
})
