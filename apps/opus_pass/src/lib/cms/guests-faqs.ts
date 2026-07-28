import { draftMode } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase'
import { DEFAULT_LOCALE, resolveLocalized, type Locale, type MaybeLocalized } from './localized'

export type GuestsFaqItem = {
  id: string
  question: string
  answer: string
}

export type GuestsFaqsContent = {
  heading: string
  description: string
  items: GuestsFaqItem[]
}

export const GUESTS_FAQS_FALLBACK: GuestsFaqsContent = {
  heading: 'Questions, answered.',
  description: 'Everything you need to know about guests & RSVPs on OpusPass.',
  items: [
    {
      id: 'free',
      question: 'Is OpusPass really free for guest management?',
      answer:
        'Yes. Building your guest list, sending digital invites, and tracking RSVPs is completely free. We only charge for premium card designs or optional paper printing.',
    },
    {
      id: 'no-account',
      question: 'How do guests RSVP without an account?',
      answer:
        'Each guest gets a personal link by WhatsApp or SMS. They tap, see a beautiful RSVP page in English or Kiswahili, choose their reply, and that’s it — no app, no login.',
    },
    {
      id: 'paper',
      question: 'Can I send to a few guests by paper instead?',
      answer:
        'Of course. Choose any design from /digital-cards and order a small premium pack (50–500 cards). We print and deliver in Dar, Arusha and Mwanza. Digital + paper, one event.',
    },
    {
      id: 'older-guests',
      question: 'What if my guests are older and don’t use WhatsApp?',
      answer:
        'OpusPass falls back to SMS automatically. The same RSVP page works on any phone with a browser, including small entry-level Androids and feature phones.',
    },
    {
      id: 'planner',
      question: 'Can my planner see the RSVPs too?',
      answer:
        'Yes. You can share a read-only link with your wedding planner, family, or venue. They see live counts and meal picks without being able to change anything.',
    },
    {
      id: 'custom-questions',
      question: 'Does it support meal choices, plus-ones and kids?',
      answer:
        'Yes. You can add custom questions per event — meal picks, dietary needs, plus-one names, child counts, song requests. Replies land in your dashboard, filterable in one click.',
    },
  ],
}

// Stored shape: translatable fields may be a localized { en, sw } object or a
// legacy plain string; `id` stays scalar. The loader resolves each translatable
// field for `locale` and returns the flat GuestsFaqsContent the render
// components already expect — so no public component changes.
type StoredGuestsFaqItem = {
  id?: string
  question?: MaybeLocalized
  answer?: MaybeLocalized
}

type StoredGuestsFaqs = {
  heading?: MaybeLocalized
  description?: MaybeLocalized
  items?: StoredGuestsFaqItem[]
}

export async function loadGuestsFaqsContent(
  locale: Locale = DEFAULT_LOCALE
): Promise<GuestsFaqsContent> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return GUESTS_FAQS_FALLBACK
  }
  try {
    const { isEnabled: isDraft } = await draftMode()
    const supabase = createSupabaseServerClient()
    const { data } = await supabase
      .from('website_page_sections')
      .select('content, draft_content')
      .eq('page_key', 'opus-pass-guests')
      .eq('section_key', 'faqs')
      .maybeSingle()
    const stored = (isDraft ? data?.draft_content ?? data?.content : data?.content) as
      | StoredGuestsFaqs
      | undefined
    if (stored) {
      const F = GUESTS_FAQS_FALLBACK
      return {
        heading: resolveLocalized(stored.heading ?? F.heading, locale),
        description: resolveLocalized(stored.description ?? F.description, locale),
        items:
          stored.items && Array.isArray(stored.items) && stored.items.length > 0
            ? stored.items.map((item, i) => ({
                id: item.id ?? F.items[i]?.id ?? `faq-${i}`,
                question: resolveLocalized(item.question, locale),
                answer: resolveLocalized(item.answer, locale),
              }))
            : F.items,
      }
    }
    return GUESTS_FAQS_FALLBACK
  } catch (err) {
    console.error('[opus-pass cms] guests-faqs load failed', err)
    return GUESTS_FAQS_FALLBACK
  }
}
