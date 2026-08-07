import {
  Document,
  Page,
  View,
  Text,
  Image,
  Svg,
  Path,
  Rect,
  Circle,
  Polyline,
  Defs,
  LinearGradient,
  Stop,
  StyleSheet,
} from '@react-pdf/renderer'
import { QUOTE_VALID_DAYS, type StoredOrder } from '@/lib/cart-storage'
import { MPESA_LIPA_NAMBA, MPESA_SEND_MONEY } from '@/lib/payments/lipa-namba'
import { INVOICE_LOGO_PNG_BASE64 } from '@/lib/invoice-logo'

const BRAND = '#5c2d8c'

const tzs = (n: number) =>
  `TZS ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function formatDate(iso: string, offsetDays = 0): string {
  // Parse date-only values (YYYY-MM-DD, e.g. the event date) as local time so
  // they don't drift a day across timezones; full timestamps parse as-is.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (offsetDays) d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    // Timestamps render in East Africa Time so the server's timezone (UTC on
    // Vercel) can't shift the date; date-only values already parsed as local.
    ...(dateOnly ? {} : { timeZone: 'Africa/Dar_es_Salaam' }),
  })
}

/** Payment timestamp pinned to East Africa Time so the server's timezone never shifts it. */
function formatPaidOn(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date}, ${time} EAT`
}

/**
 * TZS per card behind a line total, for the top-up line's "20 x TZS 1,500".
 * Uses the rate actually charged when the order recorded it; otherwise derives
 * it, and only when it divides exactly — a rounded rate that does not multiply
 * back to the total is worse than no rate at all on a document about money.
 */
function unitRate(item: StoredOrder['items'][number]): number | null {
  if (typeof item.pricePerGuest === 'number' && item.pricePerGuest > 0) return item.pricePerGuest
  const guests = item.guests ?? 0
  if (guests > 0 && item.total > 0 && item.total % guests === 0) return item.total / guests
  return null
}

/** Coloured tier pill — mirrors the classic/signature swatches used on the cart card. */
function tierPillColors(item: StoredOrder['items'][number]): { bg: string; fg: string } {
  const key = (item.tierId ?? item.tier ?? '').toLowerCase()
  if (key === 'classic') return { bg: '#EFE3FA', fg: '#6B4E8C' }
  if (key === 'elegant' || key === 'signature') return { bg: '#F5EACF', fg: '#8A6B1E' }
  return { bg: '#f3f4f6', fg: '#374151' }
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    paddingTop: 48,
    paddingHorizontal: 44,
    // Clears the fixed letterhead (~70pt incl. its bottom offset) on every page.
    paddingBottom: 104,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 },
  logo: { height: 30, width: 93 },
  docTitle: { alignItems: 'flex-end' },
  h1: { fontSize: 21, letterSpacing: 2.4, fontFamily: 'Helvetica-Bold' },
  docSubtitle: { marginTop: 3, fontSize: 9, letterSpacing: 1.4, color: BRAND, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  paid: {
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
  label: { fontSize: 8, letterSpacing: 0.7, color: '#9ca3af', marginBottom: 2, textTransform: 'uppercase' },
  val: { fontFamily: 'Helvetica-Bold' },
  billedTo: { alignItems: 'flex-end' },
  btRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, color: '#4b5563' },
  btVal: { fontFamily: 'Helvetica-Bold', color: '#1a1a1a' },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 0.7,
    color: '#9ca3af',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemThumb: { width: 34, height: 48, borderRadius: 3, objectFit: 'cover' },
  itemMain: { flex: 1 },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#111827' },
  itemSub: { fontSize: 9, color: '#6b7280', marginTop: 3 },
  itemMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 7 },
  itemMetaLabel: {
    width: 46,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    color: '#9ca3af',
    paddingTop: 2,
    textTransform: 'uppercase',
  },
  tierPill: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
    paddingVertical: 2.5,
    paddingHorizontal: 7,
    borderRadius: 3,
    textTransform: 'uppercase',
  },
  addonRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  addonIcon: { marginTop: 1 },
  addonLine: { fontSize: 9, color: '#4b5563', lineHeight: 1.5 },
  delivery: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, color: '#6b7280' },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  guestBlock: { alignItems: 'center', gap: 4 },
  guestLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4, color: '#9ca3af', textTransform: 'uppercase' },
  guestPill: {
    minWidth: 38,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    backgroundColor: '#fff',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    textAlign: 'center',
  },
  itemPrice: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827' },
  totals: { marginTop: 14, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  totalLabel: { color: '#4b5563', fontSize: 10.5 },
  totalNum: { fontFamily: 'Helvetica-Bold', fontSize: 10.5 },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 11,
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  grand: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  pay: { marginTop: 22, color: '#4b5563' },
  payCard: {
    marginTop: 8,
    width: 260,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  payBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 10,
  },
  payBadgeText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
  payRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 2.5 },
  payRowLabel: { width: 104, fontSize: 9, color: '#6b7280' },
  payRowVal: { flex: 1, fontSize: 9.5, color: '#111827' },
  payNote: { marginTop: 9, fontSize: 8.5, color: '#6b7280', lineHeight: 1.5 },
  footer: {
    marginTop: 34,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    fontSize: 9.5,
    color: '#9ca3af',
    lineHeight: 1.6,
    textAlign: 'center',
  },
  /**
   * A quotation puts its terms BESIDE the how-to-pay card, not below it.
   *
   * The invoice's closing blocks are centred, bottom-anchored and `wrap={false}`,
   * so on any document with more than one line item they don't fit in what is
   * left of the page and jump to a nearly empty page two. On an invoice that is
   * cosmetic. On a quotation those words are the terms — how long the price
   * holds, and that nothing is reserved — and terms that arrive on a page of
   * their own, detached from the prices they qualify, are terms someone can
   * reasonably say they never saw. The pay card is 260pt in a 507pt column, so
   * the space they move into was empty anyway.
   */
  quoteCols: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  quoteTerms: { flex: 1, marginTop: 8 },
  quoteTermsText: { fontSize: 8.5, color: '#6b7280', lineHeight: 1.55 },
  quoteSupport: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#faf7fd',
    borderWidth: 1,
    borderColor: '#ece3f5',
    fontSize: 8.5,
    color: '#6b7280',
    lineHeight: 1.55,
  },
  supportNote: {
    marginTop: 14,
    alignSelf: 'center',
    width: 360,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: '#faf7fd',
    borderWidth: 1,
    borderColor: '#ece3f5',
    fontSize: 8.5,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 1.55,
  },
  // Letterhead — pinned to the bottom of the page
  letterhead: { position: 'absolute', left: 44, right: 44, bottom: 26 },
  lhCols: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, paddingBottom: 12 },
  lhBlock: { fontSize: 7.5, lineHeight: 1.55, color: '#6b7280', flex: 1 },
  lhName: { fontFamily: 'Helvetica-Bold', color: BRAND },
  lhSocial: { flex: 1, alignItems: 'flex-end', gap: 5 },
  lhSocialLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.7, color: '#9ca3af', textTransform: 'uppercase' },
  lhBar: { height: 4, borderRadius: 2, backgroundColor: BRAND },
})

/* ── Small inline icons (ports of the lucide glyphs used on the HTML invoice) ── */

const iconProps = { width: 9, height: 9, viewBox: '0 0 24 24' } as const
const stroke = (color: string) =>
  ({ stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }) as const

const ClockIcon = () => (
  <Svg {...iconProps}>
    <Circle cx={12} cy={12} r={10} {...stroke('#6b7280')} />
    <Polyline points="12 6 12 12 16 14" {...stroke('#6b7280')} />
  </Svg>
)
const UserIcon = () => (
  <Svg {...iconProps}>
    <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" {...stroke('#9ca3af')} />
    <Circle cx={12} cy={7} r={4} {...stroke('#9ca3af')} />
  </Svg>
)
const MailIcon = () => (
  <Svg {...iconProps}>
    <Rect width={20} height={16} x={2} y={4} rx={2} {...stroke('#9ca3af')} />
    <Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" {...stroke('#9ca3af')} />
  </Svg>
)
const PhoneIcon = () => (
  <Svg {...iconProps}>
    <Path
      d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"
      {...stroke('#9ca3af')}
    />
  </Svg>
)

/* Brand-coloured social marks for the letterhead footer. */
const social = { width: 15, height: 15, viewBox: '0 0 24 24' } as const
const InstagramIcon = () => (
  <Svg {...social}>
    <Defs>
      <LinearGradient id="ig" x1="1" y1="1" x2="0" y2="0">
        <Stop offset="0" stopColor="#feda75" />
        <Stop offset="0.45" stopColor="#d62976" />
        <Stop offset="1" stopColor="#4f5bd5" />
      </LinearGradient>
    </Defs>
    <Rect width={24} height={24} rx={6} fill="url(#ig)" />
    <Rect x={6.2} y={6.2} width={11.6} height={11.6} rx={3.6} {...stroke('#fff')} strokeWidth={1.5} />
    <Circle cx={12} cy={12} r={2.9} {...stroke('#fff')} strokeWidth={1.5} />
    <Circle cx={16.1} cy={7.9} r={1.05} fill="#fff" />
  </Svg>
)
const FacebookIcon = () => (
  <Svg {...social}>
    <Circle cx={12} cy={12} r={12} fill="#1877F2" />
    <Path
      d="M13.7 12.6h1.8l.3-2.3h-2.1V8.9c0-.66.22-1.1 1.16-1.1h1.02V5.74c-.18-.02-.92-.08-1.78-.08-1.76 0-2.96 1.07-2.96 3.05v1.59H9.2v2.3h1.94V18h2.56z"
      fill="#fff"
    />
  </Svg>
)
const TikTokIcon = () => (
  <Svg {...social}>
    <Rect width={24} height={24} rx={6} fill="#010101" />
    <Path
      d="M16.9 8.7a3.65 3.65 0 0 1-2.6-1.1v5.2a3.85 3.85 0 1 1-3.85-3.85c.18 0 .35.02.52.05v2.05a1.85 1.85 0 1 0 1.33 1.77V5.5h1.98a3.66 3.66 0 0 0 2.62 3.05z"
      fill="#fff"
    />
  </Svg>
)
const LinkedInIcon = () => (
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

function ItemRow({
  item,
  topup,
  quotation,
}: {
  item: StoredOrder['items'][number]
  topup?: boolean
  quotation?: boolean
}) {
  const pill = tierPillColors(item)
  // react-pdf can only render remote PNG/JPG; guard so an unsupported format
  // (e.g. webp) or a relative path can never throw and break the whole invoice.
  const thumb = item.image && /^https?:\/\/.+\.(jpe?g|png)(\?|#|$)/i.test(item.image) ? item.image : null
  // A top-up line carries the parent card's name, so printed on its own it
  // reads as a second card the couple bought. Naming the quantity is the line.
  const rate = topup && item.guests ? unitRate(item) : null
  return (
    <View style={s.itemRow} wrap={false}>
      {thumb ? <Image style={s.itemThumb} src={thumb} /> : null}
      <View style={s.itemMain}>
        <Text style={s.itemName}>
          {topup && item.guests ? `${item.guests} extra digital cards` : item.name}
        </Text>
        {topup ? (
          <Text style={s.itemSub}>
            For {item.name}
            {rate ? ` · ${item.guests} x ${tzs(rate)}` : ''}
          </Text>
        ) : null}
        {item.tier ? (
          <View style={s.itemMetaRow}>
            <Text style={s.itemMetaLabel}>Package</Text>
            <Text style={[s.tierPill, { backgroundColor: pill.bg, color: pill.fg }]}>{item.tier}</Text>
          </View>
        ) : null}
        {item.addOns && item.addOns.length > 0 ? (
          <View style={s.itemMetaRow}>
            <Text style={s.itemMetaLabel}>Add-ons</Text>
            <View>
              {item.addOns.map((a, i) => (
                <View key={i} style={s.addonRow}>
                  <Svg width={8} height={8} viewBox="0 0 24 24" style={s.addonIcon}>
                    <Polyline points="20 6 9 17 4 12" fill="none" stroke={BRAND} strokeWidth={3} />
                  </Svg>
                  <Text style={s.addonLine}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View style={s.delivery}>
          <ClockIcon />
          <Text style={{ fontSize: 9, color: '#6b7280' }}>
            {topup
              ? 'Uses the design you already approved. No new design work.'
              : quotation
                ? // The clock starts at payment, not at the date on this page.
                  'Delivered within 48-72 hours of payment'
                : 'Delivered within 48-72 hours'}
          </Text>
        </View>
      </View>
      <View style={s.itemRight}>
        {item.guests != null ? (
          <View style={s.guestBlock}>
            <Text style={s.guestLabel}>{topup ? 'Added' : 'Guests'}</Text>
            <Text style={s.guestPill}>{topup ? `+${item.guests}` : item.guests}</Text>
          </View>
        ) : null}
        <Text style={s.itemPrice}>{tzs(item.total)}</Text>
      </View>
    </View>
  )
}

/**
 * Structured payment block — status badge plus scannable label/value rows,
 * instead of the legacy one-line "M-Pesa Lipa Namba … · … · Ref …" string.
 * The payer's phone stays off the invoice; the reference and paid-on time
 * are what customers need for support and verification.
 */
function PaymentCard({ order }: { order: StoredOrder }) {
  const pay = order.payment!
  const verifying = order.paymentStatus === 'verifying'
  const badge = verifying
    ? { bg: '#fffbeb', border: '#fcd34d', fg: '#b45309', text: `${pay.provider} · verifying payment` }
    : { bg: '#ecfdf5', border: '#6ee7b7', fg: '#047857', text: `Paid via ${pay.provider}` }
  const paidOn = formatPaidOn(order.paidAt)
  const rows: Array<{ label: string; value: string; bold?: boolean }> = []
  if (pay.businessNumber) rows.push({ label: 'Business number', value: pay.businessNumber })
  if (pay.cardLast4) rows.push({ label: 'Card', value: `•••• ${pay.cardLast4}` })
  if (pay.payerName) rows.push({ label: 'Paid by', value: pay.payerName })
  if (pay.reference) rows.push({ label: 'Reference', value: pay.reference, bold: true })
  if (paidOn) rows.push({ label: verifying ? 'Submitted on' : 'Paid on', value: paidOn })
  return (
    <View style={s.payCard}>
      <View style={[s.payBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
        <Svg width={11} height={11} viewBox="0 0 24 24">
          <Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" fill="none" stroke={badge.fg} strokeWidth={2} />
          <Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" fill="none" stroke={badge.fg} strokeWidth={2} />
          <Path d="M18 12a2 2 0 0 0 0 4h4v-4Z" fill="none" stroke={badge.fg} strokeWidth={2} />
        </Svg>
        <Text style={[s.payBadgeText, { color: badge.fg }]}>{badge.text}</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={s.payRow}>
          <Text style={s.payRowLabel}>{row.label}</Text>
          <Text style={row.bold ? [s.payRowVal, { fontFamily: 'Helvetica-Bold' }] : s.payRowVal}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

/**
 * Where the money goes, on a document raised before any of it has moved.
 *
 * Reuses the payment card's chrome so a quotation and its eventual invoice look
 * like the same family, but states instructions rather than a receipt.
 *
 * The numbers are imported rather than read off the order: they are OpusFesta's
 * own merchant details, identical on every quotation, and lipa-namba.ts exists
 * precisely so there is one copy of them. Both routes are listed because not
 * every payer's phone or bank app can reach a Lipa Namba till, and the payer
 * here is often not the person who built the cart.
 *
 * No card row: checkout hides card payment until Selcom is enabled
 * (CheckoutClient's visibleMethods), so offering it here would name a method
 * that does not exist yet.
 */
function HowToPay() {
  const rows: Array<{ label: string; value: string; bold?: boolean }> = [
    { label: 'M-Pesa Lipa Namba', value: MPESA_LIPA_NAMBA, bold: true },
    { label: 'M-Pesa', value: MPESA_SEND_MONEY, bold: true },
  ]
  return (
    // Narrower than the invoice's payment card: the terms sit beside it, and
    // the 28pt this gives back is what keeps that column off a hyphen.
    <View style={[s.payCard, { width: 232 }]}>
      <View style={[s.payBadge, { backgroundColor: '#f5f0fa', borderColor: '#d9c7ec' }]}>
        <Svg width={11} height={11} viewBox="0 0 24 24">
          <Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" fill="none" stroke={BRAND} strokeWidth={2} />
          <Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" fill="none" stroke={BRAND} strokeWidth={2} />
          <Path d="M18 12a2 2 0 0 0 0 4h4v-4Z" fill="none" stroke={BRAND} strokeWidth={2} />
        </Svg>
        <Text style={[s.payBadgeText, { color: BRAND }]}>Payment not yet received</Text>
      </View>
      {rows.map((row) => (
        <View key={row.label} style={s.payRow}>
          <Text style={s.payRowLabel}>{row.label}</Text>
          <Text style={row.bold ? [s.payRowVal, { fontFamily: 'Helvetica-Bold' }] : s.payRowVal}>
            {row.value}
          </Text>
        </View>
      ))}
      {/* No URL in here. This card is ~200pt wide and react-pdf hyphenates
          across line breaks, which split the domain as "opusfes-ta.com" — a
          broken address is worse than none, and the letterhead carries it. */}
      <Text style={s.payNote}>
        Pay to either number above, then send us the SMS on WhatsApp and we will raise the order.
      </Text>
    </View>
  )
}

/**
 * A top-up buys sending capacity on a card that is already designed, approved
 * and released. Everything this document says about production — a delivery
 * window, "prepared and activated within 48-72 hours", a free round of
 * revisions — describes work that a top-up does not commission, and printing it
 * on a top-up invoice promises the couple a delivery that will never happen.
 * So the production language is switched out wherever `topup` is set, and the
 * parent purchase is named so the invoice is legible on its own.
 */
export function InvoicePdf({ order }: { order: StoredOrder }) {
  const quotation = order.documentKind === 'quotation'
  const paidDate = formatDate(order.paidAt)
  const eventDate = order.eventDate ? formatDate(order.eventDate) : ''
  const verifying = order.paymentStatus === 'verifying'
  const topup = order.orderKind === 'topup'
  // Derived here, not passed: the validity window is a rule, and computing it
  // from the issue date in the document means the printed date can never
  // disagree with the rule the cart applied.
  const validUntil = quotation ? formatDate(order.paidAt, QUOTE_VALID_DAYS) : ''
  return (
    <Document title={`OpusFesta-${quotation ? 'Quotation' : 'Invoice'}-${order.ref}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Image style={s.logo} src={{ data: Buffer.from(INVOICE_LOGO_PNG_BASE64, 'base64'), format: 'png' }} />
          <View style={s.docTitle}>
            <Text style={s.h1}>{quotation ? 'QUOTATION' : 'INVOICE'}</Text>
            {topup ? <Text style={s.docSubtitle}>Top-up</Text> : null}
            {quotation ? (
              // Not the green PAID chip in another colour: this states what the
              // document is worth and until when, which is the one thing a
              // quotation has to carry that an invoice does not.
              <Text style={[s.paid, { backgroundColor: '#f5f0fa', borderColor: '#d9c7ec', color: BRAND }]}>
                {validUntil ? `VALID UNTIL ${validUntil.toUpperCase()}` : 'QUOTATION'}
              </Text>
            ) : (
              <Text
                style={[
                  s.paid,
                  verifying
                    ? { backgroundColor: '#fffbeb', borderColor: '#fcd34d', color: '#b45309' }
                    : { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7', color: '#047857' },
                ]}
              >
                {verifying ? 'PAYMENT VERIFYING' : 'PAID'}
              </Text>
            )}
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaGrid}>
            <View style={s.mi}>
              <Text style={s.label}>{quotation ? 'Quotation no.' : 'Order ID'}</Text>
              <Text style={s.val}>{order.ref}</Text>
            </View>
            {paidDate ? (
              <View style={s.mi}>
                <Text style={s.label}>
                  {quotation ? 'Quotation date' : verifying ? 'Order date' : 'Payment date'}
                </Text>
                <Text>{paidDate}</Text>
              </View>
            ) : null}
            {quotation ? (
              validUntil ? (
                <View style={s.mi}>
                  <Text style={s.label}>Valid until</Text>
                  <Text style={s.val}>{validUntil}</Text>
                </View>
              ) : null
            ) : topup ? (
              order.parentRef ? (
                <View style={s.mi}>
                  <Text style={s.label}>Added to order</Text>
                  <Text style={s.val}>{order.parentRef}</Text>
                </View>
              ) : null
            ) : paidDate ? (
              <View style={s.mi}>
                <Text style={s.label}>Delivery window</Text>
                <Text>{formatDate(order.paidAt, 2)} - {formatDate(order.paidAt, 3)}</Text>
              </View>
            ) : null}
            {eventDate ? (
              <View style={s.mi}>
                <Text style={s.label}>Event date</Text>
                <Text>{eventDate}</Text>
              </View>
            ) : null}
          </View>
          {/* Every line is guarded, and the block disappears entirely when
              nothing is known. A quotation is usually pulled from the cart
              before checkout has asked for any of this, and an empty "Billed
              to" with two bare icons reads as a document that failed to load. */}
          {order.contact.name || order.contact.email || order.contact.phone ? (
            <View style={s.billedTo}>
              <Text style={s.label}>{quotation ? 'Prepared for' : 'Billed to'}</Text>
              {order.contact.name ? (
                <View style={s.btRow}>
                  <Text style={s.btVal}>{order.contact.name}</Text>
                  <UserIcon />
                </View>
              ) : null}
              {order.contact.email ? (
                <View style={s.btRow}>
                  <Text style={{ color: '#4b5563' }}>{order.contact.email}</Text>
                  <MailIcon />
                </View>
              ) : null}
              {order.contact.phone ? (
                <View style={s.btRow}>
                  <Text style={{ color: '#4b5563' }}>{order.contact.phone}</Text>
                  <PhoneIcon />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text style={s.sectionLabel}>
          {quotation ? 'Quotation summary' : topup ? 'Top-up summary' : 'Order summary'}
        </Text>
        <View>
          {order.items.map((item, i) => (
            <ItemRow key={i} item={item} topup={topup} quotation={quotation} />
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Subtotal</Text>
            <Text style={s.totalNum}>{tzs(order.subtotal)}</Text>
          </View>
          {order.discount > 0 ? (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Discount</Text>
              <Text style={s.totalNum}>-{tzs(order.discount)}</Text>
            </View>
          ) : null}
          {/* Nothing is shipped or delivered on a top-up, so a "Delivery: Free"
              line would be inventing a fulfilment step that does not exist. */}
          {topup ? null : (
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Delivery</Text>
              <Text style={s.totalNum}>Free</Text>
            </View>
          )}
          <View style={s.grandRow}>
            <Text style={s.grand}>{quotation ? 'Total due' : verifying ? 'Total' : 'Total paid'}</Text>
            <Text style={s.grand}>{tzs(order.total)}</Text>
          </View>
        </View>

        {quotation ? (
          <View style={s.pay} wrap={false}>
            <Text style={s.label}>How to pay</Text>
            <View style={s.quoteCols}>
              <HowToPay />
              <View style={s.quoteTerms}>
                <Text style={s.quoteTermsText}>
                  This is a quotation, not a bill. The prices above are held until{' '}
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: '#1a1a1a' }}>
                    {validUntil || 'the date shown'}
                  </Text>
                  . Nothing is reserved and no card enters design until payment is received.
                </Text>
                {/* Kept short on purpose. This column is ~200pt wide and
                    react-pdf hyphenates whatever straddles a line break, which
                    turned a longer version of this sentence into "What-sApp". */}
                <Text style={s.quoteSupport}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND }}>
                    Need a change?{' '}
                  </Text>
                  WhatsApp{' '}
                  <Text style={{ fontFamily: 'Helvetica-Bold', color: '#1a1a1a' }}>
                    +255 799 202 171
                  </Text>{' '}
                  and quote this number. Guest counts and add-ons can still change.
                </Text>
              </View>
            </View>
          </View>
        ) : order.payment || order.paymentLabel ? (
          <View style={s.pay} wrap={false}>
            <Text style={s.label}>Payment method</Text>
            {order.payment ? (
              <PaymentCard order={order} />
            ) : (
              <Text>{order.paymentLabel}</Text>
            )}
          </View>
        ) : null}

        {/* Quotations say all of this beside the pay card instead (see
            quoteCols), so these two blocks are skipped entirely rather than
            rendered empty — s.footer carries a top rule that would otherwise
            print as a stray line across the page. */}
        {quotation ? null : (
          <>
        <Text style={s.footer} wrap={false}>
          {topup ? (
            verifying ? (
              <>
                Thank you. These cards are added to your event as soon as this payment is confirmed,
                usually within a few hours. Nothing else is being designed or delivered.
              </>
            ) : (
              <>
                Thank you. These cards have been added to your event and are ready to send now. They
                use the design you already approved, so there is nothing new to deliver.
              </>
            )
          ) : (
            <>
              Thank you for choosing OpusPass. Your invitation will be prepared and activated within
              48-72 hours. We look forward to being part of your special day.
            </>
          )}
        </Text>

        <Text style={s.supportNote} wrap={false}>
          {topup ? (
            <>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND }}>Questions? </Text>
              Message us on WhatsApp at{' '}
              <Text style={{ fontFamily: 'Helvetica-Bold', color: '#1a1a1a' }}>+255 799 202 171</Text>{' '}
              and quote this reference. A top-up adds sending capacity only. It does not change the
              card design.
            </>
          ) : (
            <>
              <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND }}>Need changes? </Text>
              Message us on WhatsApp at{' '}
              <Text style={{ fontFamily: 'Helvetica-Bold', color: '#1a1a1a' }}>+255 799 202 171</Text>{' '}
              within 48-72 hours of delivery. One free round of revisions is included.
            </>
          )}
        </Text>
          </>
        )}

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
      </Page>
    </Document>
  )
}
