import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassGuestsFaqItem = {
  id: string
  // Translatable text — stored as { en, sw } (or a legacy plain string).
  question: MaybeLocalized
  answer: MaybeLocalized
}

export type OpusPassGuestsFaqsContent = {
  heading: MaybeLocalized
  description: MaybeLocalized
  items: OpusPassGuestsFaqItem[]
}

export type OpusPassGuestsFaqsRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassGuestsFaqsContent
  draft_content: OpusPassGuestsFaqsContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_GUESTS_FAQS_FALLBACK: OpusPassGuestsFaqsContent = {
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
