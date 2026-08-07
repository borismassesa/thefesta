/**
 * Every word the check-in reports print.
 *
 * Exists from day one rather than "when Swahili is needed", because the
 * expensive mistake is not translating late — it is discovering that English
 * has been hard-coded inside SVG chart components, empty states, status pills
 * and failure summaries, which is exactly where it hides from a later sweep.
 *
 * ONE language per document. Bilingual side-by-side would double every label
 * and undo the design. The default follows the event/account language and the
 * couple may override it at download.
 *
 * Wording rules that are not stylistic:
 *
 *  - "Additional entry attempts safely blocked", never "duplicate" or
 *    "fraudulent". The ledger's `exhausted` covers both a re-scan and a request
 *    for more seats than remain, and cannot tell them apart, so the report must
 *    not imply anyone tried anything.
 *  - Invitations and guests are separate words throughout. A Double Entry card
 *    is one invitation and two people.
 *  - Unknowns are named, never folded into success or failure.
 */

export type ReportLocale = 'en' | 'sw'

export interface ReportStrings {
  // Document chrome
  eventReport: string
  checkinReport: string
  auditReport: string
  statusLive: string
  statusClosed: string
  statusFinal: string
  statusInternal: string

  // Head meta
  metaEvent: string
  metaDate: string
  metaVenue: string
  metaGenerated: string
  metaVersion: string
  metaFinalized: string
  asideHosts: string

  // Cover
  coverTitle: string
  coverAnd: string

  // Summary
  summaryHeading: string
  confirmedInvitations: string
  confirmedSeats: string
  guestsAdmitted: string
  attendanceRate: string
  /** Tile labels are capped at roughly 14 characters. A 4-up tile is ~97pt
   *  wide and react-pdf hyphenates anything longer, so "Confirmed Invitations"
   *  renders as "CONFIRMED INVITA-TIONS". The full wording lives in the
   *  surrounding prose instead. */
  tileInvitations: string
  tileSeats: string
  tileAdmitted: string
  tileAttendance: string
  tileEntryPoints: string
  tileTeam: string
  tileManual: string
  summarySubtitle: string
  blockedHeadline: string
  invitationBreakdown: string
  singleEntry: string
  doubleEntry: string
  ofSeats: (n: number) => string
  ofInvitations: (n: number) => string

  // Arrival story
  arrivalHeading: string
  arrivalSubtitle: (minutes: number) => string
  firstGuestArrived: string
  lastGuestArrived: string
  peakArrivalPeriod: string
  arrivalEmpty: string

  // Check-in performance
  performanceHeading: string
  entryPointsUsed: string
  teamMembers: string
  attemptsBlocked: string
  manualAdmissions: string
  performanceExplainer: string
  doorsHeading: string

  // Invitation health
  deliveryHeading: string
  confirmedDelivered: string
  deliverySubtitle: (sent: number, noReceipt: number) => string
  deliveryRead: string
  deliveryFailed: string
  deliveryEmpty: string

  // Appendix
  appendixHeading: string
  colGuest: string
  colPass: string
  colTicket: string
  colStatus: string
  colArrived: string
  colTable: string
  colDoor: string
  statusAdmitted: string
  statusPartial: string
  statusNotArrived: string
  unassigned: string
  timeNotRecorded: string
  primaryOfficer: string
  appendixEmpty: string

  // Closing
  closingHeading: string
  closingBody: string

  // Shared
  notRecorded: string
  notYetMeasured: string
}

const en: ReportStrings = {
  eventReport: 'EVENT REPORT',
  checkinReport: 'CHECK-IN REPORT',
  auditReport: 'AUDIT REPORT',
  statusLive: 'LIVE',
  statusClosed: 'CLOSED',
  statusFinal: 'FINAL',
  statusInternal: 'INTERNAL',

  metaEvent: 'Event',
  metaDate: 'Date',
  metaVenue: 'Venue',
  metaGenerated: 'Generated',
  metaVersion: 'Report version',
  metaFinalized: 'Finalized',
  asideHosts: 'Hosted by',

  coverTitle: 'Wedding Check-in Report',
  coverAnd: 'and',

  summaryHeading: 'Event Summary',
  confirmedInvitations: 'Confirmed Invitations',
  confirmedSeats: 'Confirmed Seats',
  guestsAdmitted: 'Guests Admitted',
  attendanceRate: 'Attendance Rate',
  tileInvitations: 'Invitations',
  tileSeats: 'Seats',
  tileAdmitted: 'Admitted',
  tileAttendance: 'Attendance',
  tileEntryPoints: 'Entry Points',
  tileTeam: 'Door Team',
  tileManual: 'Manual',
  summarySubtitle: 'Invitations confirmed, seats they cover, and who came through the door',
  blockedHeadline: 'Additional entry attempts safely blocked',
  invitationBreakdown: 'Invitation Types',
  singleEntry: 'Single Entry',
  doubleEntry: 'Double Entry',
  ofSeats: (n) => `of ${n} seats`,
  ofInvitations: (n) => `of ${n} invitations`,

  arrivalHeading: 'Arrival Story',
  arrivalSubtitle: (m) => `Guests admitted per ${m} minutes`,
  firstGuestArrived: 'First Guest Arrived',
  lastGuestArrived: 'Last Guest Arrived',
  peakArrivalPeriod: 'Peak Arrival Period',
  arrivalEmpty: 'No guests were admitted at any door.',

  performanceHeading: 'Check-in Performance',
  entryPointsUsed: 'Entry Points Used',
  teamMembers: 'Check-in Team Members',
  attemptsBlocked: 'Additional Entry Attempts Safely Blocked',
  manualAdmissions: 'Manual Admissions',
  performanceExplainer:
    'OpusPass automatically prevented admissions beyond the valid ticket allowance.',
  doorsHeading: 'Guests admitted at each entrance',

  deliveryHeading: 'Invitation Health',
  confirmedDelivered: 'Confirmed Delivered',
  deliverySubtitle: (sent, noReceipt) =>
    `Of ${sent} invitations sent · ${noReceipt} have no delivery receipt`,
  deliveryRead: 'Opened by the guest',
  deliveryFailed: 'Could not be delivered',
  deliveryEmpty: 'No invitations were sent through OpusPass for this event.',

  appendixHeading: 'Guest Admission Record',
  colGuest: 'Guest',
  colPass: 'Pass',
  colTicket: 'Ticket',
  colStatus: 'Status',
  colArrived: 'Arrived',
  colTable: 'Table',
  colDoor: 'Door',
  statusAdmitted: 'Admitted',
  statusPartial: 'Partly in',
  statusNotArrived: 'Not arrived',
  unassigned: 'Unassigned',
  timeNotRecorded: 'Not recorded',
  primaryOfficer: 'Primary check-in officer',
  appendixEmpty: 'No guests have confirmed attendance for this event.',

  closingHeading: 'Thank you for choosing OpusPass',
  closingBody:
    'We were honoured to help manage guest access for your celebration. This report is a permanent record of who joined you, and can be kept for your own reference.',

  notRecorded: 'Not recorded',
  notYetMeasured: 'Not yet measured',
}

const sw: ReportStrings = {
  eventReport: 'RIPOTI YA TUKIO',
  checkinReport: 'RIPOTI YA MAPOKEZI',
  auditReport: 'RIPOTI YA UKAGUZI',
  statusLive: 'INAENDELEA',
  statusClosed: 'IMEFUNGWA',
  statusFinal: 'YA MWISHO',
  statusInternal: 'YA NDANI',

  metaEvent: 'Tukio',
  metaDate: 'Tarehe',
  metaVenue: 'Mahali',
  metaGenerated: 'Imetolewa',
  metaVersion: 'Toleo la ripoti',
  metaFinalized: 'Imekamilishwa',
  asideHosts: 'Wenyeji',

  coverTitle: 'Ripoti ya Mapokezi ya Harusi',
  coverAnd: 'na',

  summaryHeading: 'Muhtasari wa Tukio',
  confirmedInvitations: 'Mialiko Iliyothibitishwa',
  confirmedSeats: 'Nafasi Zilizothibitishwa',
  guestsAdmitted: 'Wageni Walioingia',
  attendanceRate: 'Kiwango cha Mahudhurio',
  tileInvitations: 'Mialiko',
  tileSeats: 'Nafasi',
  tileAdmitted: 'Walioingia',
  tileAttendance: 'Mahudhurio',
  tileEntryPoints: 'Malango',
  tileTeam: 'Wahudumu',
  tileManual: 'Kwa Mkono',
  summarySubtitle: 'Mialiko iliyothibitishwa, nafasi zake, na waliopita langoni',
  blockedHeadline: 'Majaribio ya ziada ya kuingia yaliyozuiwa',
  invitationBreakdown: 'Aina za Mialiko',
  singleEntry: 'Mtu Mmoja',
  doubleEntry: 'Watu Wawili',
  ofSeats: (n) => `kati ya nafasi ${n}`,
  ofInvitations: (n) => `kati ya mialiko ${n}`,

  arrivalHeading: 'Mtiririko wa Kuwasili',
  arrivalSubtitle: (m) => `Wageni walioingia kila dakika ${m}`,
  firstGuestArrived: 'Mgeni wa Kwanza',
  lastGuestArrived: 'Mgeni wa Mwisho',
  peakArrivalPeriod: 'Kipindi cha Msongamano',
  arrivalEmpty: 'Hakuna mgeni aliyeingia katika lango lolote.',

  performanceHeading: 'Utendaji wa Mapokezi',
  entryPointsUsed: 'Malango Yaliyotumika',
  teamMembers: 'Wahudumu wa Mapokezi',
  attemptsBlocked: 'Majaribio ya Ziada ya Kuingia Yaliyozuiwa',
  manualAdmissions: 'Waliopokelewa kwa Mkono',
  performanceExplainer:
    'OpusPass ilizuia kiotomatiki kuingia kunakozidi idadi halali ya tiketi.',
  doorsHeading: 'Wageni walioingia kwa kila lango',

  deliveryHeading: 'Hali ya Mialiko',
  confirmedDelivered: 'Imethibitishwa Kufika',
  deliverySubtitle: (sent, noReceipt) =>
    `Kati ya mialiko ${sent} iliyotumwa · ${noReceipt} haina uthibitisho wa kufika`,
  deliveryRead: 'Imesomwa na mgeni',
  deliveryFailed: 'Haikuweza kufikishwa',
  deliveryEmpty: 'Hakuna mialiko iliyotumwa kupitia OpusPass kwa tukio hili.',

  appendixHeading: 'Kumbukumbu ya Wageni',
  colGuest: 'Mgeni',
  colPass: 'Pasi',
  colTicket: 'Tiketi',
  colStatus: 'Hali',
  colArrived: 'Aliwasili',
  colTable: 'Meza',
  colDoor: 'Lango',
  statusAdmitted: 'Ameingia',
  statusPartial: 'Ameingia kwa sehemu',
  statusNotArrived: 'Hakuwasili',
  unassigned: 'Hajapangiwa',
  timeNotRecorded: 'Haijarekodiwa',
  primaryOfficer: 'Mhudumu mkuu wa mapokezi',
  appendixEmpty: 'Hakuna mgeni aliyethibitisha kuhudhuria tukio hili.',

  closingHeading: 'Asante kwa kuchagua OpusPass',
  closingBody:
    'Tulifurahi kusaidia kusimamia mapokezi ya wageni katika sherehe yenu. Ripoti hii ni kumbukumbu ya kudumu ya waliojiunga nanyi, na mnaweza kuihifadhi kwa marejeo yenu.',

  notRecorded: 'Haijarekodiwa',
  notYetMeasured: 'Bado haijapimwa',
}

const DICTIONARIES: Record<ReportLocale, ReportStrings> = { en, sw }

export function reportStrings(locale: ReportLocale = 'en'): ReportStrings {
  return DICTIONARIES[locale] ?? en
}
