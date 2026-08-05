import type { CardStatus } from '@/lib/dashboard/released-cards'

// How a production status reads to the couple who bought the card.
//
// Pure and deliberately outside the 'server-only' data module: both the gallery
// and the detail page are client components, and importing a server-only module
// from either would break the production build.
//
// The wording is the couple's, not ours. "in_design" is our word for a job on a
// designer's desk; theirs is "we are drawing it". The one status that asks
// something of them says so.

export type CardStatusMeta = {
  label: string
  /** Tailwind classes for the badge, light-mode dashboard palette. */
  className: string
  /** What the couple can do about it, if anything. */
  hint: string
}

const META: Record<CardStatus, CardStatusMeta> = {
  awaiting_info: {
    label: 'Needs your details',
    className: 'bg-amber-100 text-amber-900',
    hint: 'We need a few details from you before our designers can start.',
  },
  in_design: {
    label: 'Being designed',
    className: 'bg-sky-100 text-sky-900',
    hint: 'Our design team is working on this card now.',
  },
  in_review: {
    label: 'In review',
    className: 'bg-[#EFE4F5] text-[#5C3A73]',
    hint: 'Drawn and with our reviewers for a final check.',
  },
  ready: {
    label: 'Approved',
    className: 'bg-[#9FE870] text-[#14361f]',
    hint: 'Checked and locked. Ready to send to your guests.',
  },
  delivered: {
    label: 'Sent',
    className: 'bg-[#1A1A1A] text-white',
    hint: 'This card has gone out to your guests.',
  },
}

export function cardStatusMeta(status: CardStatus): CardStatusMeta {
  return META[status] ?? META.in_design
}

/** Statuses whose artwork is finished, so it can be shown and downloaded. */
export function isReleased(status: CardStatus): boolean {
  return status === 'ready' || status === 'delivered'
}

/** Order used by the gallery's status filter, earliest stage first. */
export const CARD_STATUS_ORDER: CardStatus[] = [
  'awaiting_info',
  'in_design',
  'in_review',
  'ready',
  'delivered',
]
