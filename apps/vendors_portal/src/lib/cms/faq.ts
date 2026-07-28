import { createSupabaseServerClient } from '@/lib/supabase-server'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

// What the render components receive: every translatable field already resolved
// to a flat string in the active locale.
export type FaqItem = {
  id: string
  q: string
  a: string
}

export type FaqContent = {
  eyebrow: string
  headline_line_1: string
  headline_line_2: string
  headline_line_3: string
  subheadline: string
  cta_label: string
  cta_href: string
  items: FaqItem[]
}

// What's stored in the DB: translatable fields may be `{ en, sw }` objects (or
// legacy plain strings). Resolved down to FaqContent at load time.
type StoredFaqItem = {
  id: string
  q: MaybeLocalized
  a: MaybeLocalized
}

type StoredFaqContent = {
  eyebrow: MaybeLocalized
  headline_line_1: MaybeLocalized
  headline_line_2: MaybeLocalized
  headline_line_3: MaybeLocalized
  subheadline: MaybeLocalized
  cta_label: MaybeLocalized
  cta_href: string
  items: StoredFaqItem[]
}

export const FAQ_FALLBACK: FaqContent = {
  eyebrow: '',
  headline_line_1: 'Everything',
  headline_line_2: 'you need',
  headline_line_3: 'to know.',
  subheadline: "Still have questions? Our vendor success team is one message away.",
  cta_label: 'Talk to our team',
  cta_href: '/sign-up',
  items: [
    {
      id: 'q1',
      q: 'Is it really free to join?',
      a: 'Yes. Creating your storefront, listing services, and receiving leads are free on the Starter plan. You only pay if you upgrade to Pro for advanced tools, or stop using OpusFesta. No setup fees, no credit card to start.',
    },
    {
      id: 'q2',
      q: 'How does OpusFesta send me leads?',
      a: 'Couples on OpusFesta filter by category, city, date, budget and style. When their criteria match your storefront, your profile shows in their results — and qualified enquiries land in your inbox.',
    },
    {
      id: 'q3',
      q: 'Do you take a commission on bookings?',
      a: 'On the Starter plan we charge a small service fee on bookings paid through OpusFesta. On Pro, you can switch to a flat monthly fee with 0% commission. Either way, the numbers are transparent before you ever sign up.',
    },
    {
      id: 'q4',
      q: 'How do payments work?',
      a: 'Couples can pay deposits and balances by mobile money (M-Pesa, Airtel) or card. Funds settle to your linked account on a weekly cycle. Auto-reminders chase the balance — you never have to.',
    },
    {
      id: 'q5',
      q: 'How long does it take to get verified?',
      a: 'Most storefronts are reviewed within 48-72 hours. We confirm your business details, portfolio quality, and a few sample reviews — then you go live with a verified badge that builds trust with couples.',
    },
    {
      id: 'q6',
      q: 'Can I import existing reviews and clients?',
      a: 'Yes. On Pro, you can import past clients to request reviews, and migrate Google or Facebook reviews into your OpusFesta profile so your social proof comes with you.',
    },
  ],
}

export async function loadFaqContent(locale: Locale = DEFAULT_LOCALE): Promise<FaqContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return FAQ_FALLBACK
  }
  try {
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content')
      .eq('page_key', 'vendors_home')
      .eq('section_key', 'faq')
      .maybeSingle()
    const stored = data?.content as Partial<StoredFaqContent> | undefined
    if (stored) {
      const items =
        Array.isArray(stored.items) && stored.items.length > 0
          ? stored.items.map((it) => ({
              id: it.id,
              q: resolveLocalized(it.q, locale),
              a: resolveLocalized(it.a, locale),
            }))
          : FAQ_FALLBACK.items
      // Preserve the original spread-fallback semantics: a key present in the
      // stored row wins (even when it resolves to an empty string); only a
      // TRULY-missing key falls back to FAQ_FALLBACK. Translatable fields are
      // resolved to the active locale (legacy plain strings render as-is).
      return {
        eyebrow: 'eyebrow' in stored ? resolveLocalized(stored.eyebrow, locale) : FAQ_FALLBACK.eyebrow,
        headline_line_1:
          'headline_line_1' in stored ? resolveLocalized(stored.headline_line_1, locale) : FAQ_FALLBACK.headline_line_1,
        headline_line_2:
          'headline_line_2' in stored ? resolveLocalized(stored.headline_line_2, locale) : FAQ_FALLBACK.headline_line_2,
        headline_line_3:
          'headline_line_3' in stored ? resolveLocalized(stored.headline_line_3, locale) : FAQ_FALLBACK.headline_line_3,
        subheadline:
          'subheadline' in stored ? resolveLocalized(stored.subheadline, locale) : FAQ_FALLBACK.subheadline,
        cta_label: 'cta_label' in stored ? resolveLocalized(stored.cta_label, locale) : FAQ_FALLBACK.cta_label,
        cta_href: stored.cta_href ?? FAQ_FALLBACK.cta_href,
        items,
      }
    }
    return FAQ_FALLBACK
  } catch {
    return FAQ_FALLBACK
  }
}
