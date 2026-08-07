import { View, Text, Image, Svg, Path, Rect, Circle, Defs, LinearGradient, Stop, StyleSheet } from '@react-pdf/renderer'
import { INVOICE_LOGO_PNG_BASE64 } from '@/lib/invoice-logo'

/**
 * Shared OpusPass/OpusFesta PDF branding — the same top logo and bottom
 * letterhead used on invoices, factored out so any @react-pdf/renderer
 * document (seating plans, receipts, ...) gets identical branding without
 * copy-pasting it. Deliberately NOT wired into invoice-pdf.tsx itself —
 * that document is live/payment-critical, so it keeps its own inline copy
 * rather than risk a regression from a shared-code refactor.
 *
 * Host documents should use page padding of paddingTop: 48, paddingHorizontal:
 * 44, paddingBottom: 104 (matching the invoice) so the fixed-position
 * letterhead lines up with the page's left/right edges and content never
 * overlaps it.
 */
const BRAND = '#5c2d8c'

export const PDF_PAGE_PADDING = { paddingTop: 48, paddingHorizontal: 44, paddingBottom: 104 } as const

const s = StyleSheet.create({
  logo: { height: 30, width: 93 },
  letterhead: { position: 'absolute', left: 44, right: 44, bottom: 26 },
  lhCols: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, paddingBottom: 12 },
  lhBlock: { fontSize: 7.5, lineHeight: 1.55, color: '#6b7280', flex: 1 },
  lhName: { fontFamily: 'Helvetica-Bold', color: BRAND },
  lhSocial: { flex: 1, alignItems: 'flex-end', gap: 5 },
  lhSocialLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.7, color: '#9ca3af', textTransform: 'uppercase' },
  lhBar: { height: 4, borderRadius: 2, backgroundColor: BRAND },
})

const social = { width: 15, height: 15, viewBox: '0 0 24 24' } as const
const stroke = (color: string) =>
  ({ stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }) as const

function InstagramIcon() {
  return (
    <Svg {...social}>
      <Defs>
        <LinearGradient id="ig" x1="1" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#feda75" />
          <Stop offset="0.45" stopColor="#d62976" />
          <Stop offset="1" stopColor="#4f5bd5" />
        </LinearGradient>
      </Defs>
      <Rect width={24} height={24} rx={6} fill="url(#ig)" />
      <Rect x={6.2} y={6.2} width={11.6} height={11.6} rx={3.6} {...stroke('#fff')} />
      <Circle cx={12} cy={12} r={2.9} {...stroke('#fff')} />
      <Circle cx={16.1} cy={7.9} r={1.05} fill="#fff" />
    </Svg>
  )
}
function FacebookIcon() {
  return (
    <Svg {...social}>
      <Circle cx={12} cy={12} r={12} fill="#1877F2" />
      <Path
        d="M13.7 12.6h1.8l.3-2.3h-2.1V8.9c0-.66.22-1.1 1.16-1.1h1.02V5.74c-.18-.02-.92-.08-1.78-.08-1.76 0-2.96 1.07-2.96 3.05v1.59H9.2v2.3h1.94V18h2.56z"
        fill="#fff"
      />
    </Svg>
  )
}
function TikTokIcon() {
  return (
    <Svg {...social}>
      <Rect width={24} height={24} rx={6} fill="#010101" />
      <Path
        d="M16.9 8.7a3.65 3.65 0 0 1-2.6-1.1v5.2a3.85 3.85 0 1 1-3.85-3.85c.18 0 .35.02.52.05v2.05a1.85 1.85 0 1 0 1.33 1.77V5.5h1.98a3.66 3.66 0 0 0 2.62 3.05z"
        fill="#fff"
      />
    </Svg>
  )
}
function LinkedInIcon() {
  return (
    <Svg {...social}>
      <Rect width={24} height={24} rx={5} fill="#0A66C2" />
      <Circle cx={7.6} cy={7.7} r={1.35} fill="#fff" />
      <Rect x={6.35} y={9.9} width={2.5} height={7.1} fill="#fff" />
      <Path
        d="M10.7 9.9h2.4v1c.42-.72 1.25-1.22 2.3-1.22 1.78 0 2.7 1.1 2.7 3.05V17h-2.5v-3.55c0-.92-.33-1.55-1.16-1.55-.7 0-1.1.47-1.28.93-.07.16-.08.39-.08.62V17h-2.5z"
        fill="#fff"
      />
    </Svg>
  )
}

/** Top logo — drop into a document's first row. */
export function PdfLogo() {
  return <Image style={s.logo} src={{ data: Buffer.from(INVOICE_LOGO_PNG_BASE64, 'base64'), format: 'png' }} />
}

// ---------------------------------------------------------------- document head

/**
 * The invoice's head, shared.
 *
 * Logo left; document title and a status pill right-aligned; a grid of
 * label/value pairs beneath. Mirrors invoice-pdf.tsx exactly — 21pt title at
 * 2.4 letter-spacing, a 999-radius pill, 8pt uppercase labels — so a report and
 * an invoice from OpusPass are recognisably the same stationery.
 *
 * The invoice deliberately keeps its own inline copy of this (see the note at
 * the top of this file): it is live and payment-critical, and a shared-code
 * refactor there buys nothing worth the regression risk. This exists for the
 * documents that come after it.
 */
export type PdfDocumentStatus = 'live' | 'closed' | 'final' | 'internal'

/**
 * The pill carries the same weight here as PAID does on an invoice: nobody may
 * mistake figures that are still moving for figures that are settled.
 *
 * `internal` is an AUDIENCE marker, not a lifecycle state. The event lifecycle
 * is live -> closed -> final and nothing else.
 */
const STATUS_STYLES: Record<PdfDocumentStatus, { label: string; bg: string; border: string; fg: string }> = {
  live: { label: 'LIVE', bg: '#fffbeb', border: '#fcd34d', fg: '#b45309' },
  closed: { label: 'CLOSED', bg: '#f3f4f6', border: '#d1d5db', fg: '#4b5563' },
  final: { label: 'FINAL', bg: '#ecfdf5', border: '#6ee7b7', fg: '#047857' },
  internal: { label: 'INTERNAL', bg: '#f5f3ff', border: '#c4b5fd', fg: BRAND },
}

const head = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 },
  docTitle: { alignItems: 'flex-end' },
  h1: { fontSize: 21, letterSpacing: 2.4, fontFamily: 'Helvetica-Bold' },
  pill: {
    marginTop: 7,
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 20, marginBottom: 26 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 280, gap: 11 },
  mi: { width: 126 },
  miWide: { width: 280 },
  label: { fontSize: 8, letterSpacing: 0.7, color: '#9ca3af', marginBottom: 2, textTransform: 'uppercase' },
  val: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  right: { alignItems: 'flex-end' },
  rightLabel: { fontSize: 8, letterSpacing: 0.7, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase' },
  rightVal: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  rightSub: { fontSize: 9, color: '#6b7280', marginTop: 2 },
})

export interface PdfDocumentHeadProps {
  /** e.g. "EVENT REPORT". Set in the caller's language, not here. */
  title: string
  status: PdfDocumentStatus
  /** Overrides the pill's default word, for a translated document. */
  statusLabel?: string
  /** Label/value pairs. Entries with an empty value are dropped, so a report
   *  for an event with no venue does not print an empty cell.
   *
   *  `wide` spans the whole grid. A 126pt cell hyphenates a long value
   *  mid-word ("Nyumbani kwa Mama See-ta"), and breaking a proper noun is
   *  exactly the detail that makes a document read as machine output. */
  meta?: { label: string; value: string | null | undefined; wide?: boolean }[]
  /** Right-hand block, where the invoice puts "billed to". */
  aside?: { label: string; value: string; sub?: string | null }
}

export function PdfDocumentHead({ title, status, statusLabel, meta = [], aside }: PdfDocumentHeadProps) {
  const tone = STATUS_STYLES[status]
  const shown = meta.filter((m) => Boolean(m.value?.toString().trim()))
  return (
    <>
      <View style={head.top}>
        <PdfLogo />
        <View style={head.docTitle}>
          <Text style={head.h1}>{title}</Text>
          <Text
            style={[
              head.pill,
              { backgroundColor: tone.bg, borderColor: tone.border, color: tone.fg },
            ]}
          >
            {statusLabel ?? tone.label}
          </Text>
        </View>
      </View>

      {shown.length > 0 || aside ? (
        <View style={head.meta}>
          <View style={head.metaGrid}>
            {shown.map((m) => (
              <View key={m.label} style={m.wide ? head.miWide : head.mi}>
                <Text style={head.label}>{m.label}</Text>
                <Text style={head.val}>{m.value}</Text>
              </View>
            ))}
          </View>
          {aside ? (
            <View style={head.right}>
              <Text style={head.rightLabel}>{aside.label}</Text>
              <Text style={head.rightVal}>{aside.value}</Text>
              {aside.sub ? <Text style={head.rightSub}>{aside.sub}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  )
}

/** Bottom-of-page branded footer — company address, contact, and socials, same as the invoice. */
export function PdfLetterhead() {
  return (
    <View style={s.letterhead} fixed>
      <View style={s.lhCols}>
        <View style={s.lhBlock}>
          <Text style={s.lhName}>OpusFesta Company Limited</Text>
          <Text>Samaki Wabichi Annex, Mbezi Beach</Text>
          <Text>P.O.Box 7787 Dar es Salaam, Tanzania</Text>
        </View>
        <View style={[s.lhBlock, { alignItems: 'center' }]}>
          <Text style={s.lhName}>www.opusfesta.com</Text>
          <Text>info@opusfesta.com  |  +255 799 202 171</Text>
        </View>
        <View style={s.lhSocial}>
          <Text style={s.lhSocialLabel}>Follow us</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <InstagramIcon />
            <FacebookIcon />
            <TikTokIcon />
            <LinkedInIcon />
          </View>
        </View>
      </View>
      <View style={s.lhBar} />
    </View>
  )
}
