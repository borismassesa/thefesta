import type { MaybeLocalized } from '@/lib/cms/localized'

export type OpusPassFaqItem = {
  id: string
  question: MaybeLocalized
  answer: MaybeLocalized
}

export type OpusPassDigitalCardsFaqsContent = {
  heading: MaybeLocalized
  description: MaybeLocalized
  items: OpusPassFaqItem[]
}

export type OpusPassDigitalCardsFaqsRow = {
  id: string
  page_key: string
  section_key: string
  content: OpusPassDigitalCardsFaqsContent
  draft_content: OpusPassDigitalCardsFaqsContent | null
  is_published: boolean
  updated_at: string
}

export const OPUS_PASS_DIGITAL_CARDS_FAQS_FALLBACK: OpusPassDigitalCardsFaqsContent = {
  heading: 'Frequently asked questions',
  description: 'Everything you need to know about digital invitations, RSVPs, and paper add-ons.',
  items: [
    {
      id: 'how-it-works',
      question: 'How do digital wedding invitations work?',
      answer:
        "Pick a design, customise it with your names and date, and we'll generate a shareable link. Send the link to every guest by WhatsApp, SMS, or email in seconds — each guest gets a private RSVP page that feeds straight into your live dashboard.",
    },
    {
      id: 'see-sample',
      question: 'Can I see a sample before I commit?',
      answer:
        "Yes. Customise any design with your real names and date and we'll send you a free standard preview before you commit to a printed order. For digital orders, you can preview the live link with placeholder guest names first.",
    },
    {
      id: 'whats-included',
      question: "What's included free with every order?",
      answer:
        'Every order includes a matching wedding website with a bilingual RSVP page, a live guest list dashboard, and one round of free design revisions. No hidden fees — the matching paper suite, RSVP, and guest tracking are all part of the package.',
    },
    {
      id: 'paper-prints',
      question: 'Do you offer paper prints too?',
      answer:
        'Yes. Paper prints are available as a premium add-on — most couples opt for digital invites with a smaller print run for elders, VIPs, and head-table seating. Foil and letterpress finishes are also available for special pieces.',
    },
    {
      id: 'payment',
      question: 'What payment methods do you accept?',
      answer:
        'M-Pesa, Airtel Money, Tigo Pesa, and major bank cards. You can pay in full or split into two instalments, with the second due before any paper goes to print.',
    },
    {
      id: 'turnaround',
      question: 'How quickly will my order be ready?',
      answer:
        'Digital invitations are ready within 48-72 hours once you approve the proof. Paper add-ons are printed in Bagamoyo and ship in 3–5 working days anywhere in Tanzania.',
    },
  ],
}
