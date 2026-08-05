import type { ReactElement } from 'react'
import type { EntrancePassData } from '@/lib/dashboard/queries'

/**
 * The OpusPass entrance-pass ticket, drawn from the designer's portrait
 * artwork (src/assets/svg/opuspass_entrance_tickets.svg). The static art
 * (background, ornaments, logo, perforation) ships as a pre-rasterized
 * template PNG (scripts/build-entrance-pass-template.mjs); this module
 * draws the per-event/per-guest data in the slots the sample content
 * occupied: category intro line, couple first names, date, venue,
 * SINGLE/DOUBLE party pill and the real check-in QR.
 *
 * Kept free of server-only imports so a plain script can render it with
 * sample data outside a request (fonts, template and QR come in as args).
 */

export const TICKET_WIDTH = 1300
export const TICKET_HEIGHT = 1881

// The designer's SVG is a 3251.85 x 4704.4 viewBox; every coordinate below
// is that geometry scaled by 1300 / 3251.85 ≈ 0.3998 — the same scale the
// template PNG is rasterized at, so the slots line up with the artwork.
const YELLOW = '#FFF24D'
const WHITE = '#FFFFFF'
const PURPLE = '#5C2D8D'

// The artwork's "The wedding of" line + flanking dashes were stripped from
// the template (they follow the event's category and language now); this is
// their measured slot.
const INTRO_ROW = { top: 410, height: 76, dashWidth: 75 }
const NAME_BAND = { top: 486, height: 292, sidePad: 60 }
const DATE_ROW = { top: 770, height: 110 }
const VENUE_ROW = { top: 916, height: 190, sidePad: 60 }
const PILL = { top: 1227, height: 87 }
// The QR card stays square (a stretched QR will not scan) but is smaller
// than the artwork's sample block, so the Pass ID below it has real room.
const QR_BOX = { top: 1386, size: 352, pad: 14 }

/** Tickets are only ever sold as Single or Double — those two words are
 *  the entire pill vocabulary. Anything above one is a Double; "Party of
 *  N" never appears on a ticket. */
export function partySizeLabel(partySize: number): string {
  return partySize === 1 ? 'SINGLE' : 'DOUBLE'
}

/** Shrink a line to fit its slot — `em` is the font's rough average glyph
 *  width in em for the script it renders. */
function fitFontSize(text: string, maxWidth: number, base: number, em: number, floor: number): number {
  const fitted = Math.floor(maxWidth / (em * Math.max(1, text.length)))
  return Math.max(floor, Math.min(base, fitted))
}

/** Static label copy per ticket language — the intro line itself arrives
 *  pre-localized in pass.introLabel. */
const LABELS = {
  en: { date: 'Date:', venue: 'Venue:', dateTbc: 'Date TBC', venueTbc: 'Venue TBC' },
  sw: { date: 'Tarehe:', venue: 'Mahali:', dateTbc: 'Tarehe itatangazwa', venueTbc: 'Mahali patatangazwa' },
} as const

export interface TicketInput {
  pass: Pick<EntrancePassData, 'coupleName' | 'dateLabel' | 'venue' | 'city' | 'partySize' | 'introLabel' | 'ticketLanguage'>
  /** Globally unique admission identifier, printed under the QR so a guest
   *  whose screen will not scan can read it out. Optional: a ticket rendered
   *  before 20260805000000 has none, and must still print. */
  passId?: string | null
  /** data: URI of public/entrance-pass/ticket-template.png */
  templateDataUri: string
  /** data: URL PNG of the guest's real check-in QR */
  qrDataUrl: string
}

export function buildTicketElement({ pass, templateDataUri, qrDataUrl, passId }: TicketInput): ReactElement {
  const labels = LABELS[pass.ticketLanguage] ?? LABELS.en

  const nameWidth = TICKET_WIDTH - NAME_BAND.sidePad * 2
  const nameSize = fitFontSize(pass.coupleName, nameWidth, 160, 0.46, 64)

  // Date only — the ticket never shows a time.
  const dateValue = pass.dateLabel || labels.dateTbc
  const dateSize = dateValue.length > 26 ? 46 : 56

  const venueValue = pass.venue || labels.venueTbc
  const cityValue = pass.city || ''
  // The city sits on its own second row, so the label + venue value must
  // stay on one line — size it to fit rather than let it wrap into the
  // city's row and overflow the slot. Without a city the venue keeps the
  // roomier two-line budget.
  const venueSize = cityValue
    ? fitFontSize(`${labels.venue} ${venueValue}`, TICKET_WIDTH - VENUE_ROW.sidePad * 2, 56, 0.54, 40)
    : venueValue.length > 56
      ? 46
      : 56

  const qrInner = QR_BOX.size - QR_BOX.pad * 2

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={templateDataUri} width={TICKET_WIDTH} height={TICKET_HEIGHT} style={{ position: 'absolute', inset: 0 }} alt="" />

      {/* Category intro line ("The sendoff of" / "Sendoff ya") with the
          artwork's flanking dashes, redrawn so the dashes hug whatever
          length the localized phrase has. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: INTRO_ROW.top,
          width: TICKET_WIDTH,
          height: INTRO_ROW.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 26,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: INTRO_ROW.dashWidth, height: 3, background: WHITE, opacity: 0.85 }} />
        <span style={{ fontFamily: 'Playfair Display', fontWeight: 700, fontSize: 58, color: WHITE }}>
          {pass.introLabel}
        </span>
        <div style={{ width: INTRO_ROW.dashWidth, height: 3, background: WHITE, opacity: 0.85 }} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: NAME_BAND.sidePad,
          top: NAME_BAND.top,
          width: nameWidth,
          height: NAME_BAND.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontFamily: 'Dancing Script', fontSize: nameSize, color: YELLOW, textAlign: 'center' }}>
          {pass.coupleName}
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: NAME_BAND.sidePad,
          top: DATE_ROW.top,
          width: nameWidth,
          height: DATE_ROW.height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          overflow: 'hidden',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSize: dateSize,
        }}
      >
        <span style={{ color: YELLOW }}>{labels.date}</span>
        <span style={{ color: WHITE }}>{dateValue}</span>
      </div>

      {/* Venue name on the first row, the city on its own second row beneath
          it — the whole block stays vertically centered in the slot whether
          or not a city is set. */}
      <div
        style={{
          position: 'absolute',
          left: VENUE_ROW.sidePad,
          top: VENUE_ROW.top,
          width: TICKET_WIDTH - VENUE_ROW.sidePad * 2,
          height: VENUE_ROW.height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          overflow: 'hidden',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSize: venueSize,
          lineHeight: 1.25,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, maxWidth: '100%' }}>
          <span style={{ color: YELLOW }}>{labels.venue}</span>
          {/* With a city on row two the venue is pre-sized to one line, so
              give it the full width; without one it may wrap inside 840. */}
          <div style={{ maxWidth: cityValue ? '100%' : 840, color: WHITE }}>{venueValue}</div>
        </div>
        {cityValue ? <span style={{ color: WHITE }}>{cityValue}</span> : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: PILL.top,
          width: TICKET_WIDTH,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: PILL.height,
            padding: '0 52px',
            background: WHITE,
            borderRadius: PILL.height / 2,
            fontFamily: 'Playfair Display',
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: 3,
            color: PURPLE,
          }}
        >
          {partySizeLabel(pass.partySize)}
        </div>
      </div>

      {/* The artwork's sample QR was white-on-purple; the real one sits on a
          white card instead — inverted (light-on-dark) QRs fail on common
          scanner stacks, and the card doubles as the quiet zone. */}
      <div
        style={{
          position: 'absolute',
          left: (TICKET_WIDTH - QR_BOX.size) / 2,
          top: QR_BOX.top,
          width: QR_BOX.size,
          height: QR_BOX.size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: WHITE,
          borderRadius: 24,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} width={qrInner} height={qrInner} alt="" />
      </div>

      {/* The Pass ID value, printed under the QR with no label.
          It is set to match the category intro line at the top of the card
          (same face, same 58px), so the ticket opens and closes on the same
          note instead of the code reading as fallback text in whatever font
          happened to be resolved.
          Without this the identifier is inert: it exists in the database and
          the scanner accepts it, but the guest has no way to know theirs. That
          is exactly what happened to entry_code, which has been generated and
          accepted since 20260721000003 and was never rendered anywhere.
          Grouped 4-and-4 because that is how people read a code aloud, and the
          separator is cosmetic — the scanner folds it away. */}
      {passId ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            // Anchored to the ticket's BOTTOM, not measured down from the QR,
            // so a change to the QR box can never push the identifier off the
            // card — the worst possible failure for a fallback identifier.
            top: TICKET_HEIGHT - 96,
            width: TICKET_WIDTH,
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'Playfair Display',
              fontWeight: 700,
              fontSize: 58,
              letterSpacing: 6,
              color: WHITE,
            }}
          >
            {passId.slice(0, 4)} {passId.slice(4)}
          </span>
        </div>
      ) : null}
    </div>
  )
}
