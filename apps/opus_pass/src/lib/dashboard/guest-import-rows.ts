/**
 * Pure parsing helpers shared by the browser importer and the
 * `bulkImportGuests` server action.
 *
 * This module must stay free of browser APIs (no `DOMParser`,
 * `DecompressionStream`, `File`) so the server action can import it. The
 * browser-only spreadsheet reader lives in `./import-spreadsheet` and pulls
 * `parseCsv` from here.
 */

import { MAX_TICKET_PARTY } from './types'

export interface GuestImportRow {
  full_name: string
  email: string | null
  phone: string | null
  max_party_size: number
}

export interface GuestImportParse {
  rows: GuestImportRow[]
  /** Ticket values we didn't recognize, in first-seen order. Each of these was
   * imported as a Single, which the UI surfaces so the coercion isn't silent. */
  unrecognizedTickets: string[]
}

/** Ticket labels that mean "two seats". Everything else imports as a Single. */
const DOUBLE_TICKETS: ReadonlySet<string> = new Set(['double', 'couple', 'mbili', 'wawili'])
const SINGLE_TICKETS: ReadonlySet<string> = new Set(['single', 'moja', 'peke', 'one'])

export interface TicketSize {
  size: number
  /** False when a non-empty value matched no known label — the caller reports
   * it rather than letting the Single default pass unnoticed. */
  recognized: boolean
}

export function importedTicketSize(ticketType: string | undefined): TicketSize {
  const value = ticketType?.trim().toLowerCase() ?? ''
  // A blank ticket column is a legitimate "not specified", not a typo.
  if (!value) return { size: 1, recognized: true }
  if (DOUBLE_TICKETS.has(value)) return { size: MAX_TICKET_PARTY, recognized: true }
  if (SINGLE_TICKETS.has(value)) return { size: 1, recognized: true }
  return { size: 1, recognized: false }
}

/**
 * Parse the importer's human-editable line format into structured rows.
 *
 * The text is read as CSV rather than split on bare commas: a guest name may
 * legitimately contain one ("Ngando, Jr."), and a naive split would shift every
 * later field, dropping the phone and silently downgrading the ticket.
 */
export function parseGuestImportRows(text: string): GuestImportParse {
  const unrecognized: string[] = []
  const rows: GuestImportRow[] = []

  for (const cells of parseCsv(text.replace(/\r\n?/g, '\n'))) {
    const [full_name, email, phone, ticketType] = cells.map((cell) => cell.trim())
    if (!full_name) continue
    const ticket = importedTicketSize(ticketType)
    if (!ticket.recognized) {
      const label = (ticketType ?? '').trim()
      if (label && !unrecognized.includes(label)) unrecognized.push(label)
    }
    rows.push({
      full_name,
      email: email || null,
      phone: phone || null,
      max_party_size: ticket.size,
    })
  }

  return { rows, unrecognizedTickets: unrecognized }
}

/**
 * Render one row back into the editable line format, quoting any field that
 * carries a comma or quote so {@link parseGuestImportRows} reads it back
 * unchanged. Trailing empty fields are dropped to keep short rows tidy.
 */
export function formatImportLine(fields: string[]): string {
  const trimmed = [...fields]
  while (trimmed.length > 1 && trimmed[trimmed.length - 1] === '') trimmed.pop()
  return trimmed.map(quoteField).join(', ')
}

function quoteField(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/** Parse RFC-4180-ish CSV. Tolerates quoted fields and `""` escapes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0))
}
