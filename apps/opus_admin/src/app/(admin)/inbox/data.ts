import type { InboxItem, SourceMeta } from './types'

export const SOURCE_META: Record<string, SourceMeta> = {
  booking_inquiry: {
    key: 'booking_inquiry',
    label: 'Booking inquiry',
    accent: '#C9A0DC',
    tint: '#F0DFF6',
    text: '#7E5896',
  },
  vendor_application: {
    key: 'vendor_application',
    label: 'Vendor application',
    accent: '#F5A623',
    tint: '#FEF3DB',
    text: '#8A5A09',
  },
  review_flag: {
    key: 'review_flag',
    label: 'Review flag',
    accent: '#E0457B',
    tint: '#FCE4EC',
    text: '#9B1D4C',
  },
  client_support: {
    key: 'client_support',
    label: 'Client support',
    accent: '#4A90E2',
    tint: '#E1ECF9',
    text: '#205A9E',
  },
  vendor_support: {
    key: 'vendor_support',
    label: 'Vendor support',
    accent: '#2FB5A3',
    tint: '#DFF5F1',
    text: '#0F6B60',
  },
  payout_dispute: {
    key: 'payout_dispute',
    label: 'Payout dispute',
    accent: '#E97B2A',
    tint: '#FCE6D4',
    text: '#8F3F05',
  },
  refund_request: {
    key: 'refund_request',
    label: 'Refund request',
    accent: '#E15656',
    tint: '#FCDDDD',
    text: '#921E1E',
  },
  system_alert: {
    key: 'system_alert',
    label: 'System alert',
    accent: '#7A7A7A',
    tint: '#EFEFEF',
    text: '#3F3F3F',
  },
}

const now = Date.now()
const m = (mins: number) => new Date(now - mins * 60_000).toISOString()
const h = (hrs: number) => new Date(now - hrs * 3_600_000).toISOString()
const d = (days: number) => new Date(now - days * 86_400_000).toISOString()

export const DEMO_INBOX: InboxItem[] = [
  {
    id: 'inq-001',
    source: 'booking_inquiry',
    subject: 'Full wedding — 180 guests at Ngare Sero (Dec 2026)',
    preview:
      'Hi OpusFesta team, we’d love your help planning a destination wedding in Arusha. Budget is around TZS 45M…',
    sender: {
      name: 'Zawadi Mushi',
      handle: 'zawadi.mushi@gmail.com',
      role: 'client',
      avatarColor: '#F0DFF6',
      initials: 'ZM',
    },
    receivedAt: m(8),
    status: 'new',
    priority: 'high',
    assignee: null,
    unread: true,
    starred: true,
    tags: ['Arusha', 'destination'],
    related: { type: 'client', id: 'cl-8821', label: 'Zawadi & Baraka' },
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Zawadi Mushi',
          handle: 'zawadi.mushi@gmail.com',
          role: 'client',
          avatarColor: '#F0DFF6',
          initials: 'ZM',
        },
        at: m(8),
        body: `Hi OpusFesta team,

We’d love your help planning a destination wedding in Arusha around 12 December 2026. Guest count is roughly 180 and our ceremony-and-reception budget is TZS 45M excluding attire.

Key asks:
• Venue — Ngare Sero or something similar
• Full décor + catering (halal + vegetarian options)
• Photo + film package
• Logistics for 40 out-of-town guests

Could we schedule a discovery call this week? I’ve attached our moodboard and a rough guest list.

Thanks,
Zawadi`,
        attachments: [
          {
            id: 'att-zm-1',
            name: 'moodboard-zawadi-baraka.jpg',
            kind: 'image',
            mime: 'image/jpeg',
            size: 1_488_220,
            url: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=80',
            thumbUrl:
              'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=240&h=240&fit=crop&q=70',
          },
          {
            id: 'att-zm-2',
            name: 'venue-inspiration-ngare-sero.jpg',
            kind: 'image',
            mime: 'image/jpeg',
            size: 962_014,
            url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1200&q=80',
            thumbUrl:
              'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=240&h=240&fit=crop&q=70',
          },
          {
            id: 'att-zm-3',
            name: 'guest-list-draft.xlsx',
            kind: 'sheet',
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 89_234,
          },
          {
            id: 'att-zm-4',
            name: 'event-brief.pdf',
            kind: 'pdf',
            mime: 'application/pdf',
            size: 412_880,
          },
        ],
      },
    ],
  },
  {
    id: 'app-014',
    source: 'vendor_application',
    subject: 'New vendor application — Flora Mara Studios (florist)',
    preview:
      'Application submitted with 12 portfolio images and NBC trading licence. Requires moderation before listing.',
    sender: {
      name: 'Flora Mara Studios',
      handle: 'hello@floramara.co.tz',
      role: 'vendor',
      avatarColor: '#FEF3DB',
      initials: 'FM',
    },
    receivedAt: m(42),
    status: 'new',
    priority: 'normal',
    assignee: null,
    unread: true,
    starred: false,
    tags: ['florist', 'Dar'],
    related: { type: 'vendor', id: 'vn-app-014', label: 'Flora Mara Studios' },
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Flora Mara Studios',
          handle: 'hello@floramara.co.tz',
          role: 'vendor',
          avatarColor: '#FEF3DB',
          initials: 'FM',
        },
        at: m(42),
        body: `Jambo,

Please find our application to join the OpusFesta marketplace as a florist based in Dar es Salaam.

We’ve attached portfolio images plus our licences and a sample quote sheet.

Looking forward to your review.`,
        attachments: [
          {
            id: 'att-fm-1',
            name: 'portfolio-oria-wedding.jpg',
            kind: 'image',
            mime: 'image/jpeg',
            size: 842_331,
            url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1200&q=80',
            thumbUrl:
              'https://images.unsplash.com/photo-1519741497674-611481863552?w=240&h=240&fit=crop&q=70',
          },
          {
            id: 'att-fm-2',
            name: 'portfolio-serengeti-retreat.jpg',
            kind: 'image',
            mime: 'image/jpeg',
            size: 1_204_998,
            url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1200&q=80',
            thumbUrl:
              'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=240&h=240&fit=crop&q=70',
          },
          {
            id: 'att-fm-3',
            name: 'NBC-trading-licence-2026.pdf',
            kind: 'pdf',
            mime: 'application/pdf',
            size: 324_112,
          },
          {
            id: 'att-fm-4',
            name: 'TRA-TIN-certificate.pdf',
            kind: 'pdf',
            mime: 'application/pdf',
            size: 198_004,
          },
          {
            id: 'att-fm-5',
            name: 'sample-quote-sheet.xlsx',
            kind: 'sheet',
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 74_211,
          },
        ],
      },
    ],
  },
  {
    id: 'rvw-209',
    source: 'review_flag',
    subject: '1★ review flagged on Serengeti Sound & Lights',
    preview:
      'Review reported by vendor as “factually incorrect — we were never contracted for this date”. Needs arbitration.',
    sender: {
      name: 'Auto-moderation',
      role: 'system',
      avatarColor: '#EFEFEF',
      initials: 'SYS',
    },
    receivedAt: h(2),
    status: 'open',
    priority: 'high',
    assignee: 'Neema K.',
    unread: true,
    starred: false,
    tags: ['arbitration'],
    related: { type: 'review', id: 'rv-0912', label: 'Serengeti Sound & Lights' },
    thread: [
      {
        id: 'msg-1',
        from: { name: 'Auto-moderation', role: 'system', avatarColor: '#EFEFEF', initials: 'SYS' },
        at: h(2),
        body: 'Vendor disputed review rv-0912 citing “no booking on the stated date”. Booking search returned no match for the reviewer’s email within 90 days of the claimed event.',
      },
      {
        id: 'msg-2',
        from: {
          name: 'Serengeti Sound & Lights',
          handle: 'ops@serengeti-sl.co.tz',
          role: 'vendor',
          avatarColor: '#DFF5F1',
          initials: 'SS',
        },
        at: h(1.5),
        body: 'Please remove this — we have no contract on file for Ms. Kapinga. Our CRM export for the past 90 days is attached.',
        attachments: [
          {
            id: 'att-ss-1',
            name: 'crm-export-90d.csv',
            kind: 'sheet',
            mime: 'text/csv',
            size: 44_118,
          },
          {
            id: 'att-ss-2',
            name: 'contract-register-Q4.pdf',
            kind: 'pdf',
            mime: 'application/pdf',
            size: 896_412,
          },
        ],
      },
    ],
  },
  {
    id: 'sup-441',
    source: 'client_support',
    subject: 'M-Pesa deposit shows paid but booking still pending',
    preview:
      'Paid TZS 500,000 deposit at 14:02 via Vodacom but the booking page still says “awaiting deposit”. Reference: VJ8A2K.',
    sender: {
      name: 'Amani Kileo',
      handle: '+255 744 812 019',
      role: 'client',
      avatarColor: '#E1ECF9',
      initials: 'AK',
    },
    receivedAt: h(3),
    status: 'in_progress',
    priority: 'urgent',
    assignee: 'David O.',
    unread: false,
    starred: true,
    tags: ['mpesa', 'deposit'],
    related: { type: 'booking', id: 'bk-33128', label: 'Booking #33128' },
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Amani Kileo',
          handle: '+255 744 812 019',
          role: 'client',
          avatarColor: '#E1ECF9',
          initials: 'AK',
        },
        at: h(3),
        body: 'I paid TZS 500,000 this afternoon via M-Pesa for booking #33128. The reference is VJ8A2K. The page still says awaiting deposit and I need confirmation before the vendor releases the date. Screenshot of the M-Pesa confirmation attached.',
        attachments: [
          {
            id: 'att-ak-1',
            name: 'mpesa-confirmation.jpg',
            kind: 'image',
            mime: 'image/jpeg',
            size: 318_440,
            url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&q=80',
            thumbUrl:
              'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=240&h=240&fit=crop&q=70',
          },
        ],
      },
      {
        id: 'msg-2',
        from: { name: 'David O.', role: 'system', avatarColor: '#F0DFF6', initials: 'DO' },
        at: h(2.5),
        internal: true,
        body: 'Internal — Vodacom webhook retried 3× with status=SUCCESS but our reconciliation job failed to match TillRef. Pulling logs.',
      },
    ],
  },
  {
    id: 'pay-057',
    source: 'payout_dispute',
    subject: 'Vendor disputing Oct payout amount (-TZS 180k)',
    preview:
      'Expected TZS 2,430,000 for October. Received TZS 2,250,000. Difference appears to be the promo discount on booking #32044.',
    sender: {
      name: 'Kilele Catering',
      handle: 'finance@kilele.co.tz',
      role: 'vendor',
      avatarColor: '#FCE6D4',
      initials: 'KC',
    },
    receivedAt: h(6),
    status: 'open',
    priority: 'normal',
    assignee: null,
    unread: true,
    starred: false,
    tags: ['payout', 'reconciliation'],
    related: { type: 'payout', id: 'po-oct-057', label: 'Payout · Oct · Kilele' },
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Kilele Catering',
          handle: 'finance@kilele.co.tz',
          role: 'vendor',
          avatarColor: '#FCE6D4',
          initials: 'KC',
        },
        at: h(6),
        body: 'Habari. The October payout is short by TZS 180,000 compared to our invoices. Please verify — we suspect the discount code on #32044 was not applied before commission. Statement PDF and reconciliation sheet attached.',
        attachments: [
          {
            id: 'att-kc-1',
            name: 'kilele-october-statement.pdf',
            kind: 'pdf',
            mime: 'application/pdf',
            size: 612_077,
          },
          {
            id: 'att-kc-2',
            name: 'reconciliation-Oct.xlsx',
            kind: 'sheet',
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 152_990,
          },
        ],
      },
    ],
  },
  {
    id: 'ref-022',
    source: 'refund_request',
    subject: 'Refund request — photographer no-show (Booking #32870)',
    preview:
      'Vendor did not arrive at the ceremony. Couple requesting full refund + compensation under the OpusFesta guarantee.',
    sender: {
      name: 'Grace Mwakyanjala',
      handle: 'grace.mwakyan@outlook.com',
      role: 'client',
      avatarColor: '#FCDDDD',
      initials: 'GM',
    },
    receivedAt: h(9),
    status: 'in_progress',
    priority: 'urgent',
    assignee: 'Neema K.',
    unread: false,
    starred: true,
    tags: ['refund', 'no-show', 'guarantee'],
    related: { type: 'refund', id: 'rf-22', label: 'Refund · #32870' },
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Grace Mwakyanjala',
          handle: 'grace.mwakyan@outlook.com',
          role: 'client',
          avatarColor: '#FCDDDD',
          initials: 'GM',
        },
        at: h(9),
        body: 'The photographer we booked never arrived on Saturday. We called 6 times, no response. We want a full refund and to know how OpusFesta will make this right.',
      },
    ],
  },
  {
    id: 'sup-442',
    source: 'vendor_support',
    subject: 'Availability calendar not syncing with Google',
    preview:
      'Turned on Google Calendar sync yesterday — new bookings are not appearing on my calendar. Is there an outage?',
    sender: {
      name: 'Asilia Events',
      handle: 'bookings@asiliaevents.co.tz',
      role: 'vendor',
      avatarColor: '#DFF5F1',
      initials: 'AE',
    },
    receivedAt: h(14),
    status: 'open',
    priority: 'normal',
    assignee: null,
    unread: false,
    starred: false,
    tags: ['calendar', 'integration'],
    related: { type: 'vendor', id: 'vn-201', label: 'Asilia Events' },
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Asilia Events',
          handle: 'bookings@asiliaevents.co.tz',
          role: 'vendor',
          avatarColor: '#DFF5F1',
          initials: 'AE',
        },
        at: h(14),
        body: 'Hi team, I connected Google Calendar yesterday evening. Two new bookings today and neither appeared. Is there an outage on your side?',
      },
    ],
  },
  {
    id: 'sys-014',
    source: 'system_alert',
    subject: 'Payment webhook failing — Airtel Money (3 retries)',
    preview:
      'Airtel Money webhook endpoint responded with 502 Bad Gateway on 3 consecutive retries since 09:14 EAT.',
    sender: {
      name: 'OpusFesta Monitor',
      role: 'system',
      avatarColor: '#EFEFEF',
      initials: 'OF',
    },
    receivedAt: d(1),
    status: 'resolved',
    priority: 'high',
    assignee: 'David O.',
    unread: false,
    starred: false,
    tags: ['airtel', 'webhook'],
    related: { type: 'booking', id: 'sys-14', label: 'Incident · WH-014' },
    thread: [
      {
        id: 'msg-1',
        from: { name: 'OpusFesta Monitor', role: 'system', avatarColor: '#EFEFEF', initials: 'OF' },
        at: d(1),
        body: 'Airtel Money webhook returned 502 on 3 retries starting 09:14 EAT. Pager sent to on-call (David O.).',
      },
      {
        id: 'msg-2',
        from: { name: 'David O.', role: 'system', avatarColor: '#F0DFF6', initials: 'DO' },
        at: d(0.9),
        internal: true,
        body: 'Resolved — rotated webhook cert and re-enqueued 14 pending events. All delivered successfully.',
      },
    ],
  },
  {
    id: 'inq-002',
    source: 'booking_inquiry',
    subject: 'Send-off ceremony — 60 guests Zanzibar (Feb 2027)',
    preview:
      'Looking for a lead planner + décor for a send-off in Zanzibar. Mostly Kanga theme. Budget flexible.',
    sender: {
      name: 'Upendo Mwinuka',
      handle: 'upendo@kilimogroup.com',
      role: 'client',
      avatarColor: '#F0DFF6',
      initials: 'UM',
    },
    receivedAt: d(2),
    status: 'open',
    priority: 'normal',
    assignee: 'Neema K.',
    unread: false,
    starred: false,
    tags: ['Zanzibar', 'send-off'],
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Upendo Mwinuka',
          handle: 'upendo@kilimogroup.com',
          role: 'client',
          avatarColor: '#F0DFF6',
          initials: 'UM',
        },
        at: d(2),
        body: 'We’re planning a send-off for 60 guests in Zanzibar in Feb 2027. Kanga theme throughout. Need a lead planner and full décor — budget is flexible for the right team.',
      },
    ],
  },
  {
    id: 'app-015',
    source: 'vendor_application',
    subject: 'New vendor application — Tanzanite Sound (DJ)',
    preview:
      'DJ duo based in Mwanza, 6 years experience. Portfolio includes 40+ weddings. Awaiting document verification.',
    sender: {
      name: 'Tanzanite Sound',
      handle: 'book@tanzanitesound.co.tz',
      role: 'vendor',
      avatarColor: '#FEF3DB',
      initials: 'TS',
    },
    receivedAt: d(3),
    status: 'open',
    priority: 'low',
    assignee: null,
    unread: false,
    starred: false,
    tags: ['DJ', 'Mwanza'],
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Tanzanite Sound',
          handle: 'book@tanzanitesound.co.tz',
          role: 'vendor',
          avatarColor: '#FEF3DB',
          initials: 'TS',
        },
        at: d(3),
        body: 'Application submitted. Six years of experience, 40+ weddings, based in Mwanza. Documents uploaded.',
      },
    ],
  },
  {
    id: 'arch-099',
    source: 'client_support',
    subject: 'How do I change the card on file?',
    preview: 'Answered — linked self-serve guide. Archiving.',
    sender: {
      name: 'Joyce Sanga',
      handle: 'joyce.sanga@yahoo.com',
      role: 'client',
      avatarColor: '#E1ECF9',
      initials: 'JS',
    },
    receivedAt: d(6),
    status: 'archived',
    priority: 'low',
    assignee: 'Neema K.',
    unread: false,
    starred: false,
    tags: ['billing'],
    thread: [
      {
        id: 'msg-1',
        from: {
          name: 'Joyce Sanga',
          handle: 'joyce.sanga@yahoo.com',
          role: 'client',
          avatarColor: '#E1ECF9',
          initials: 'JS',
        },
        at: d(6),
        body: 'How do I change the card I have on file for automatic instalments?',
      },
      {
        id: 'msg-2',
        from: { name: 'Neema K.', role: 'system', avatarColor: '#F0DFF6', initials: 'NK' },
        at: d(5.9),
        body: 'Hi Joyce — you can update it from Settings → Payment methods. Full guide here: opusfesta.help/change-card. Let us know if you run into any issues!',
      },
    ],
  },
]

// Unread count for the header's Messages badge. Derived from the same list
// the page renders, so the badge can never claim something /inbox does not
// show. Archived threads are excluded — they are out of the working set even
// if they were never opened.
//
// This is the one place to repoint when the inbox moves off DEMO_INBOX: swap
// the source here and the header follows.
export function getInboxUnreadCount(): number {
  return DEMO_INBOX.filter((i) => i.unread && i.status !== 'archived').length
}
