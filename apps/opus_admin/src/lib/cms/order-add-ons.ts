// Reading what an order actually bought, per line item.
//
// An order line records its add-ons twice:
//
//   addOns      string[]  — display copy the customer saw ("25 premium printed cards")
//   addOnItems  object[]  — {code, label, qty, amount}, added 2026-07-29
//
// Only the strings exist on orders placed before that date, and they are not a
// reliable source: the quantity is a bare prefix, and the noun is a CMS title
// that has already drifted once (the 'paper-prints' add-on has shipped as both
// "Paper prints" and "Premium printed cards", so live orders contain both).
//
// So structured data is used whenever present, and parsing is a clearly-labelled
// fallback for the historical rows. Anything derived by parsing is flagged
// `inferred` so the UI can show the raw string next to the number — a print run
// is expensive to get wrong, and a designer should be able to eyeball it.

/** Stable CMS add-on ids (lib/cms/product-addons-faq.ts in opus_pass). */
export const ADD_ON_PRINTED_CARDS = 'paper-prints'
export const ADD_ON_DOOR_SCAN = 'door-scan'

export type OrderAddOn = {
  code: string
  label: string
  qty: number
  /**
   * Line amount in TZS. Absent on backfilled rows: a display label carries no
   * price, and a fabricated 0 would quietly zero out any sum built from these.
   * Read the order total for money.
   */
  amount?: number
}

export type OrderLineItem = {
  id?: string
  name?: string
  /** Package tier label at purchase, e.g. 'Signature'. */
  tier?: string | null
  /** Stable tier id: lite | classic | elegant | signature. */
  tierId?: string | null
  guests?: number | null
  addOns?: string[] | null
  addOnItems?: OrderAddOn[] | null
}

export type OrderLineQuantities = {
  /** Digital cards / OpusPass tickets on this line — one per guest. */
  digitalCards: number
  /** Physical cards to print. 0 when the couple bought none. */
  printedCards: number
  addOns: OrderAddOn[]
  /**
   * True when any add-on had to be recovered by parsing a display string.
   * Show the raw labels alongside the numbers when this is set.
   */
  inferred: boolean
  /** Labels that could not be understood at all. Never silently dropped. */
  unparsed: string[]
}

/**
 * Historical display labels → stable add-on code.
 *
 * Matched against the label with its leading quantity stripped and lowercased.
 * Deliberately an explicit list rather than fuzzy matching: a wrong guess here
 * becomes a wrong print run.
 */
const LABEL_ALIASES: Record<string, string> = {
  'paper prints': ADD_ON_PRINTED_CARDS,
  'paper print': ADD_ON_PRINTED_CARDS,
  'premium printed cards': ADD_ON_PRINTED_CARDS,
  'premium printed card': ADD_ON_PRINTED_CARDS,
  'printed cards': ADD_ON_PRINTED_CARDS,
  'on-site attendant': ADD_ON_DOOR_SCAN,
  'on-site scanning attendant': ADD_ON_DOOR_SCAN,
  'onsite attendant': ADD_ON_DOOR_SCAN,
  'door scan': ADD_ON_DOOR_SCAN,
}

/**
 * Split "25 premium printed cards" into a quantity and a code.
 *
 * Returns null when the noun isn't recognised — better to report it as unparsed
 * than to invent a code for it.
 */
export function parseAddOnLabel(raw: string): OrderAddOn | null {
  const label = raw.trim()
  if (!label) return null

  // Leading count, optionally with thousands separators: "1,200 paper prints".
  const match = /^(\d[\d,\s]*)\s+(.+)$/.exec(label)
  const qty = match ? Number(match[1].replace(/[,\s]/g, '')) : 1
  const noun = (match ? match[2] : label).trim().toLowerCase()

  const code = LABEL_ALIASES[noun]
  if (!code) return null
  if (!Number.isFinite(qty) || qty < 0) return null

  // No amount: a label carries no price, and inventing one would corrupt any
  // total built from these entries.
  return { code, label, qty }
}

/**
 * What one order line is actually for: how many digital cards, how many prints,
 * and which add-ons — from structured data where it exists.
 */
export function readOrderLine(item: OrderLineItem): OrderLineQuantities {
  const digitalCards = Number.isFinite(item.guests) ? Number(item.guests) : 0

  const structured = Array.isArray(item.addOnItems) ? item.addOnItems : []
  if (structured.length > 0) {
    return {
      digitalCards,
      printedCards: sumQty(structured, ADD_ON_PRINTED_CARDS),
      addOns: structured,
      inferred: false,
      unparsed: [],
    }
  }

  const labels = (Array.isArray(item.addOns) ? item.addOns : []).filter(Boolean)
  const parsed: OrderAddOn[] = []
  const unparsed: string[] = []
  for (const label of labels) {
    const addOn = parseAddOnLabel(label)
    if (addOn) parsed.push(addOn)
    else unparsed.push(label)
  }

  return {
    digitalCards,
    printedCards: sumQty(parsed, ADD_ON_PRINTED_CARDS),
    addOns: parsed,
    // Only claim inference when there was actually something to infer.
    inferred: labels.length > 0,
    unparsed,
  }
}

function sumQty(addOns: OrderAddOn[], code: string): number {
  return addOns
    .filter((a) => a.code === code)
    .reduce((total, a) => total + (Number.isFinite(a.qty) ? a.qty : 0), 0)
}

/** Roll several lines of one order into a single fulfilment total. */
export function readOrderTotals(items: OrderLineItem[]): OrderLineQuantities {
  const lines = items.map(readOrderLine)
  return {
    digitalCards: lines.reduce((n, l) => n + l.digitalCards, 0),
    printedCards: lines.reduce((n, l) => n + l.printedCards, 0),
    addOns: lines.flatMap((l) => l.addOns),
    inferred: lines.some((l) => l.inferred),
    unparsed: lines.flatMap((l) => l.unparsed),
  }
}
