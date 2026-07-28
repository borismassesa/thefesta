import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type DigitalCardsFaqItem = {
  id: string
  question: string
  answer: string
}

export type DigitalCardsFaqsContent = {
  heading: string
  description: string
  items: DigitalCardsFaqItem[]
}

export const DIGITAL_CARDS_FAQS_FALLBACK: DigitalCardsFaqsContent = {
  heading: 'Frequently asked questions',
  description: 'Everything you need to know about digital cards, RSVPs, and paper add-ons.',
  items: [
    { id: 'how-it-works', question: 'How do digital wedding cards work?', answer: "Pick a design, customise it with your names and date, and we'll generate a shareable link. Send the link to every guest by WhatsApp, SMS, or email in seconds — each guest gets a private RSVP page that feeds straight into your live dashboard." },
    { id: 'see-sample', question: 'Can I see a sample before I commit?', answer: "Yes. Customise any design with your real names and date and we'll send you a free standard preview before you commit to a printed order. For digital orders, you can preview the live link with placeholder guest names first." },
    { id: 'whats-included', question: "What's included free with every order?", answer: 'Every order includes a matching wedding website with a bilingual RSVP page, a live guest list dashboard, and one round of free design revisions. No hidden fees — the matching paper suite, RSVP, and guest tracking are all part of the package.' },
    { id: 'paper-prints', question: 'Do you offer paper prints too?', answer: 'Yes. Paper prints are available as a premium add-on — most couples opt for digital invites with a smaller print run for elders, VIPs, and head-table seating. Foil and letterpress finishes are also available for special pieces.' },
    { id: 'payment', question: 'What payment methods do you accept?', answer: 'M-Pesa, Airtel Money, Mixx by Yas, Selcom Pesa, Visa, and Mastercard. You can pay in full or split into two instalments, with the second due before any paper goes to print.' },
    { id: 'turnaround', question: 'How quickly will my order be ready?', answer: 'Digital cards are ready within 48-72 hours once you approve the proof. Paper add-ons are printed in Bagamoyo and ship in 3–5 working days anywhere in Tanzania.' },
  ],
}

// Stored shape: translatable fields (heading, description, and each item's
// question/answer) may be a localized { en, sw } object or a legacy plain
// string. The loader resolves each translatable field for `locale` and returns
// the flat DigitalCardsFaqsContent the render components already expect.
type StoredFaqItem = {
  id?: string
  question?: MaybeLocalized
  answer?: MaybeLocalized
}

type StoredFaqsContent = {
  heading?: MaybeLocalized
  description?: MaybeLocalized
  items?: StoredFaqItem[]
}

export async function loadDigitalCardsFaqsContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<DigitalCardsFaqsContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return DIGITAL_CARDS_FAQS_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-invitations')
      .eq('section_key', 'faqs')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredFaqsContent
      | undefined
    if (stored) {
      const F = DIGITAL_CARDS_FAQS_FALLBACK
      return {
        heading: resolveLocalized(stored.heading ?? F.heading, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        items:
          stored.items && Array.isArray(stored.items) && stored.items.length > 0
            ? stored.items.map((item, i) => ({
                id: item.id ?? `faq-${i}`,
                question: resolveLocalized(item.question, locale),
                answer: resolveLocalized(item.answer, locale),
              }))
            : F.items,
      }
    }
    return DIGITAL_CARDS_FAQS_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] digital-cards-faqs load failed', err)
    return DIGITAL_CARDS_FAQS_FALLBACK
  }
}
