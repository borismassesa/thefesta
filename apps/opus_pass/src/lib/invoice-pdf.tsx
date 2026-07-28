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
import type { StoredOrder } from '@/lib/cart-storage'
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

function ItemRow({ item }: { item: StoredOrder['items'][number] }) {
  const pill = tierPillColors(item)
  // react-pdf can only render remote PNG/JPG; guard so an unsupported format
  // (e.g. webp) or a relative path can never throw and break the whole invoice.
  const thumb = item.image && /^https?:\/\/.+\.(jpe?g|png)(\?|#|$)/i.test(item.image) ? item.image : null
  return (
    <View style={s.itemRow} wrap={false}>
      {thumb ? <Image style={s.itemThumb} src={thumb} /> : null}
      <View style={s.itemMain}>
        <Text style={s.itemName}>{item.name}</Text>
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
          <Text style={{ fontSize: 9, color: '#6b7280' }}>Delivered within 48-72 hours</Text>
        </View>
      </View>
      <View style={s.itemRight}>
        {item.guests != null ? (
          <View style={s.guestBlock}>
            <Text style={s.guestLabel}>Guests</Text>
            <Text style={s.guestPill}>{item.guests}</Text>
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
    ? { bg: '#fffbeb', border: '#fcd34d', fg: '#b45309', text: `${pay.provider} — verifying payment` }
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

export function InvoicePdf({ order }: { order: StoredOrder }) {
  const paidDate = formatDate(order.paidAt)
  const eventDate = order.eventDate ? formatDate(order.eventDate) : ''
  const verifying = order.paymentStatus === 'verifying'
  return (
    <Document title={`OpusFesta-Invoice-${order.ref}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Image style={s.logo} src={{ data: Buffer.from(INVOICE_LOGO_PNG_BASE64, 'base64'), format: 'png' }} />
          <View style={s.docTitle}>
            <Text style={s.h1}>INVOICE</Text>
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
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaGrid}>
            <View style={s.mi}>
              <Text style={s.label}>Order ID</Text>
              <Text style={s.val}>{order.ref}</Text>
            </View>
            {paidDate ? (
              <View style={s.mi}>
                <Text style={s.label}>{verifying ? 'Order date' : 'Payment date'}</Text>
                <Text>{paidDate}</Text>
              </View>
            ) : null}
            {paidDate ? (
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
          <View style={s.billedTo}>
            <Text style={s.label}>Billed to</Text>
            {order.contact.name ? (
              <View style={s.btRow}>
                <Text style={s.btVal}>{order.contact.name}</Text>
                <UserIcon />
              </View>
            ) : null}
            <View style={s.btRow}>
              <Text style={{ color: '#4b5563' }}>{order.contact.email}</Text>
              <MailIcon />
            </View>
            <View style={s.btRow}>
              <Text style={{ color: '#4b5563' }}>{order.contact.phone}</Text>
              <PhoneIcon />
            </View>
          </View>
        </View>

        <Text style={s.sectionLabel}>Order summary</Text>
        <View>
          {order.items.map((item, i) => (
            <ItemRow key={i} item={item} />
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
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Delivery</Text>
            <Text style={s.totalNum}>Free</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grand}>{verifying ? 'Total' : 'Total paid'}</Text>
            <Text style={s.grand}>{tzs(order.total)}</Text>
          </View>
        </View>

        {order.payment || order.paymentLabel ? (
          <View style={s.pay} wrap={false}>
            <Text style={s.label}>Payment method</Text>
            {order.payment ? (
              <PaymentCard order={order} />
            ) : (
              <Text>{order.paymentLabel}</Text>
            )}
          </View>
        ) : null}

        <Text style={s.footer} wrap={false}>
          Thank you for choosing OpusPass. Your invitation will be prepared and activated within
          48-72 hours. We look forward to being part of your special day.
        </Text>

        <Text style={s.supportNote} wrap={false}>
          <Text style={{ fontFamily: 'Helvetica-Bold', color: BRAND }}>Need changes? </Text>
          Message us on WhatsApp at{' '}
          <Text style={{ fontFamily: 'Helvetica-Bold', color: '#1a1a1a' }}>+255 799 202 171</Text> within
          48-72 hours of delivery — one free round of revisions is included.
        </Text>

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
