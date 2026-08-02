/**
 * Custom Card Commission Service — the shared domain model.
 * Specs: OP-CCS-PRD-001, OP-CCS-TDD-001 §4.
 *
 * TDD §2 calls for a `packages/domain` workspace whose whole purpose is that
 * "both apps import the same transition table, so Admin cannot invent a state
 * OpusPass does not understand". This module is that source of truth; it lives
 * in `@opusfesta/lib` because that package is already the repo's shared-code
 * home and is already listed in `transpilePackages` for both OpusPass and
 * Admin. Standing up a second workspace would buy the same guarantee at the
 * cost of a lockfile regeneration, which has broken Vercel's Linux build here
 * before. The guarantee is what matters, not the directory name.
 *
 * IMPORTANT: this file MIRRORS the database. Postgres is the authority — a
 * transition is legal because `is_valid_card_transition()` says so, not
 * because this table says so. Everything here exists to let the UI decide what
 * to *offer*; the server decides what to *allow*.
 *
 * `scripts/check-commission-parity.ts` parses the migration and fails if the
 * two tables have drifted. Run it in CI, or at least before shipping a change
 * to either side.
 *
 * Pure TypeScript by design: no `server-only`, no Node built-ins, so client
 * components can import it freely.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Status
// ─────────────────────────────────────────────────────────────────────────────

export const CARD_ORDER_STATUSES = [
  // Gate 1: deposit
  'draft', 'awaiting_deposit', 'deposit_review', 'deposit_rejected', 'deposit_paid',
  // Production — every preview watermarked
  'intake_pending', 'queued', 'assigned', 'in_design', 'internal_qa',
  'client_review', 'revision_requested', 'approved',
  // Gate 2: balance
  'awaiting_balance', 'balance_review', 'balance_rejected', 'balance_overdue', 'settled',
  // Terminal / exceptional
  'delivered', 'closed', 'on_hold', 'cancelled', 'refunded', 'forfeited',
] as const

export type CardOrderStatus = (typeof CARD_ORDER_STATUSES)[number]

/** Statuses from which an order may still be cancelled or put on hold. */
export const PRE_SETTLED_STATUSES: readonly CardOrderStatus[] = CARD_ORDER_STATUSES.filter(
  (s) => !['settled', 'delivered', 'closed', 'cancelled', 'refunded', 'forfeited'].includes(s),
)

export function isTerminalStatus(status: CardOrderStatus): boolean {
  return status === 'closed' || status === 'refunded' || status === 'forfeited'
}

// ─────────────────────────────────────────────────────────────────────────────
//  The transition table
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors `is_valid_card_transition()` in
// supabase/migrations/20260730100002_card_commission_state_machine.sql.

export type Actor = 'customer' | 'designer' | 'finance' | 'admin' | 'system'

export type Transition = {
  from: CardOrderStatus
  to: CardOrderStatus
  /** Who may initiate it. The database does not enforce actor; the API layer does. */
  actors: readonly Actor[]
  /** Plain-language guard, for tooltips and for the reviewer of this file. */
  guard?: string
}

export const CARD_TRANSITIONS: readonly Transition[] = [
  // ── Gate 1: deposit ───────────────────────────────────────────────────────
  { from: 'draft', to: 'awaiting_deposit', actors: ['system'], guard: 'package + category + phone present' },
  { from: 'awaiting_deposit', to: 'deposit_review', actors: ['customer'], guard: 'Lipa Namba reference submitted' },
  { from: 'awaiting_deposit', to: 'deposit_paid', actors: ['system'], guard: 'Selcom verified AND deposit_satisfied()' },
  // Underpayment is NOT a failure. It is the normal case of someone sending
  // TSh 40,000 against a TSh 50,000 request: credit it, stay put, tell them
  // exactly what remains.
  { from: 'awaiting_deposit', to: 'awaiting_deposit', actors: ['system'], guard: 'verified but short — credit and notify the shortfall' },
  { from: 'deposit_review', to: 'deposit_paid', actors: ['finance'], guard: 'Finance verified AND deposit_satisfied()' },
  { from: 'deposit_review', to: 'deposit_rejected', actors: ['finance'], guard: 'note required' },
  { from: 'deposit_rejected', to: 'awaiting_deposit', actors: ['customer'] },

  // ── Production ────────────────────────────────────────────────────────────
  { from: 'deposit_paid', to: 'intake_pending', actors: ['system'], guard: 'brief link issued' },
  { from: 'intake_pending', to: 'queued', actors: ['customer', 'system'], guard: 'all required brief answers AND deposit_satisfied()' },
  { from: 'queued', to: 'assigned', actors: ['admin', 'system'], guard: 'designer active and under capacity' },
  { from: 'assigned', to: 'in_design', actors: ['designer'], guard: 'designer accepts' },
  { from: 'assigned', to: 'queued', actors: ['system'], guard: 'accept-SLA breach (max 2 bounces)' },
  { from: 'in_design', to: 'internal_qa', actors: ['designer'], guard: 'version uploaded and validator passed' },
  { from: 'internal_qa', to: 'in_design', actors: ['admin'], guard: 'QA rejects with notes' },
  { from: 'internal_qa', to: 'client_review', actors: ['admin'], guard: 'QA passes' },
  { from: 'client_review', to: 'approved', actors: ['customer', 'system'], guard: 'customer approves, or the auto-approve timer fires' },
  { from: 'client_review', to: 'revision_requested', actors: ['customer'], guard: 'at least one revision item' },
  { from: 'revision_requested', to: 'in_design', actors: ['customer', 'system'], guard: 'allowance remains (decrement), or a correction, or a top-up accepted' },

  // ── Gate 2: balance ───────────────────────────────────────────────────────
  // Automatic and unconditional. There is deliberately no path from approved
  // straight to delivered: approval releases the invoice, never the file.
  { from: 'approved', to: 'awaiting_balance', actors: ['system'], guard: 'automatic — sets balance_invoiced_at and balance_due_at' },
  { from: 'awaiting_balance', to: 'balance_review', actors: ['customer'], guard: 'Lipa Namba reference submitted' },
  { from: 'awaiting_balance', to: 'settled', actors: ['system'], guard: 'Selcom verified AND fully_settled()' },
  { from: 'awaiting_balance', to: 'awaiting_balance', actors: ['system'], guard: 'verified but short — credit and notify what remains' },
  { from: 'awaiting_balance', to: 'balance_overdue', actors: ['system'], guard: 'now() > balance_due_at' },
  { from: 'balance_review', to: 'settled', actors: ['finance'], guard: 'Finance verified AND fully_settled()' },
  { from: 'balance_review', to: 'balance_rejected', actors: ['finance'], guard: 'note required' },
  { from: 'balance_rejected', to: 'awaiting_balance', actors: ['customer'] },
  { from: 'balance_overdue', to: 'settled', actors: ['system', 'finance'], guard: 'late payment accepted' },
  { from: 'balance_overdue', to: 'forfeited', actors: ['system'], guard: 'forfeiture window elapsed; deposit retained' },
  // Recoverable: nothing is destroyed and the designer's work is never lost.
  { from: 'forfeited', to: 'settled', actors: ['finance'], guard: 'customer pays later; asset released normally' },

  // ── Delivery ──────────────────────────────────────────────────────────────
  { from: 'settled', to: 'delivered', actors: ['system'], guard: 'watermark stripped, published to event; requires event_id' },
  { from: 'delivered', to: 'closed', actors: ['system'], guard: '14 days, no dispute' },
  { from: 'delivered', to: 'on_hold', actors: ['system'], guard: 'chargeback — asset access revoked' },

  // ── Exceptional ───────────────────────────────────────────────────────────
  { from: 'cancelled', to: 'refunded', actors: ['finance'], guard: 'refund approved AND negative ledger row disbursed' },
  { from: 'cancelled', to: 'closed', actors: ['system'], guard: '0% entitlement, or a credit note was taken' },
]

const EXPLICIT = new Set(CARD_TRANSITIONS.map((t) => `${t.from}>${t.to}`))

/**
 * Mirror of `is_valid_card_transition(from, to)`.
 *
 * The two open-ended rules at the end are expressed as rules rather than ~30
 * enumerated pairs, exactly as in the SQL: enumerating them would say the same
 * thing thirty times and rot the moment a status is added.
 */
export function isValidCardTransition(from: CardOrderStatus, to: CardOrderStatus): boolean {
  if (EXPLICIT.has(`${from}>${to}`)) return true
  // Admin may cancel or hold anything that has not yet settled.
  if ((to === 'cancelled' || to === 'on_hold') && PRE_SETTLED_STATUSES.includes(from)) return true
  // Resuming from a hold returns to wherever the order was held from; the
  // database checks the specific target against held_from_status.
  if (from === 'on_hold' && to !== 'on_hold' && to !== 'draft') return true
  return false
}

/** Every status this order could legally move to right now. UI affordances only. */
export function allowedTransitions(from: CardOrderStatus, actor?: Actor): CardOrderStatus[] {
  return CARD_ORDER_STATUSES.filter((to) => {
    if (!isValidCardTransition(from, to)) return false
    if (!actor) return true
    const explicit = CARD_TRANSITIONS.find((t) => t.from === from && t.to === to)
    // Open-ended rules (cancel / hold / resume) are admin territory.
    if (!explicit) return actor === 'admin' || actor === 'system'
    return explicit.actors.includes(actor)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  The customer-facing stepper
// ─────────────────────────────────────────────────────────────────────────────
// PRD §7.9: "Both money steps are visible from the start, so the balance is
// never a surprise at the end." That is the whole reason Balance is its own
// step rather than being folded into delivery.

export const COMMISSION_STEPS = [
  'deposit', 'brief', 'design', 'review', 'balance', 'delivered',
] as const
export type CommissionStep = (typeof COMMISSION_STEPS)[number]

export type StepLabel = { en: string; sw: string }

export const COMMISSION_STEP_LABELS: Record<CommissionStep, StepLabel> = {
  deposit:   { en: 'Deposit',    sw: 'Malipo ya awali' },
  brief:     { en: 'Your brief', sw: 'Maelezo yako' },
  design:    { en: 'In design',  sw: 'Inabuniwa' },
  review:    { en: 'Your review', sw: 'Ukaguzi wako' },
  balance:   { en: 'Balance',    sw: 'Malipo ya mwisho' },
  delivered: { en: 'Delivered',  sw: 'Imekabidhiwa' },
}

const STEP_OF_STATUS: Record<CardOrderStatus, CommissionStep> = {
  draft: 'deposit',
  awaiting_deposit: 'deposit',
  deposit_review: 'deposit',
  deposit_rejected: 'deposit',
  deposit_paid: 'brief',
  intake_pending: 'brief',
  queued: 'design',
  assigned: 'design',
  in_design: 'design',
  internal_qa: 'design',
  client_review: 'review',
  revision_requested: 'design',
  approved: 'balance',
  awaiting_balance: 'balance',
  balance_review: 'balance',
  balance_rejected: 'balance',
  balance_overdue: 'balance',
  forfeited: 'balance',
  settled: 'delivered',
  delivered: 'delivered',
  closed: 'delivered',
  // Exceptional states keep the stepper where the order actually stopped; the
  // page shows an explicit banner rather than a misleading step.
  on_hold: 'design',
  cancelled: 'deposit',
  refunded: 'deposit',
}

export function stepForStatus(status: CardOrderStatus): CommissionStep {
  return STEP_OF_STATUS[status]
}

/** Whose turn it is. PRD §8: every screen answers "what happens next and who is holding it". */
export function responsibleParty(status: CardOrderStatus): Actor {
  switch (status) {
    case 'awaiting_deposit':
    case 'deposit_rejected':
    case 'intake_pending':
    case 'client_review':
    case 'awaiting_balance':
    case 'balance_rejected':
    case 'balance_overdue':
      return 'customer'
    case 'deposit_review':
    case 'balance_review':
      return 'finance'
    case 'assigned':
    case 'in_design':
    case 'revision_requested':
      return 'designer'
    case 'queued':
    case 'internal_qa':
    case 'on_hold':
      return 'admin'
    default:
      return 'system'
  }
}

export const CARD_ORDER_STATUS_LABELS: Record<CardOrderStatus, StepLabel> = {
  draft:              { en: 'Draft',                   sw: 'Rasimu' },
  awaiting_deposit:   { en: 'Awaiting deposit',        sw: 'Inasubiri malipo ya awali' },
  deposit_review:     { en: 'Checking your payment',   sw: 'Tunahakiki malipo yako' },
  deposit_rejected:   { en: 'Payment not matched',     sw: 'Malipo hayakupatikana' },
  deposit_paid:       { en: 'Deposit received',        sw: 'Malipo ya awali yamepokelewa' },
  intake_pending:     { en: 'Tell us about your card', sw: 'Tuambie kuhusu kadi yako' },
  queued:             { en: 'In the design queue',     sw: 'Kwenye foleni ya ubunifu' },
  assigned:           { en: 'Assigned to a designer',  sw: 'Imepewa mbunifu' },
  in_design:          { en: 'Being designed',          sw: 'Inabuniwa' },
  internal_qa:        { en: 'Internal check',          sw: 'Ukaguzi wa ndani' },
  client_review:      { en: 'Ready for your review',   sw: 'Tayari kwa ukaguzi wako' },
  revision_requested: { en: 'Changes requested',       sw: 'Mabadiliko yameombwa' },
  approved:           { en: 'Approved',                sw: 'Imeidhinishwa' },
  awaiting_balance:   { en: 'Balance due',             sw: 'Malipo ya mwisho yanadaiwa' },
  balance_review:     { en: 'Checking your payment',   sw: 'Tunahakiki malipo yako' },
  balance_rejected:   { en: 'Payment not matched',     sw: 'Malipo hayakupatikana' },
  balance_overdue:    { en: 'Balance overdue',         sw: 'Malipo yamechelewa' },
  settled:            { en: 'Paid in full',            sw: 'Imelipwa yote' },
  delivered:          { en: 'Delivered',               sw: 'Imekabidhiwa' },
  closed:             { en: 'Complete',                sw: 'Imekamilika' },
  on_hold:            { en: 'On hold',                 sw: 'Imesimamishwa' },
  cancelled:          { en: 'Cancelled',               sw: 'Imeghairiwa' },
  refunded:           { en: 'Refunded',                sw: 'Imerejeshwa' },
  forfeited:          { en: 'Archived — unpaid',       sw: 'Imehifadhiwa — haijalipwa' },
}

// ─────────────────────────────────────────────────────────────────────────────
//  Money
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentPurpose = 'deposit' | 'balance' | 'topup' | 'refund' | 'discount'
export type PaymentChannel = 'selcom_card' | 'selcom_mobile' | 'lipa_namba' | 'adjustment'
export type PaymentState = 'initiated' | 'pending_review' | 'verified' | 'rejected' | 'void'

/** Mirror of the `order_ledger` view. Every figure is derived, never stored. */
export type OrderLedger = {
  orderId: string
  totalTzs: number
  depositDueTzs: number
  /** Sum of discount rows. Negative or zero. */
  creditsTzs: number
  /** totalTzs + creditsTzs — what this customer must actually settle. */
  effectiveTotalTzs: number
  /** deposit + balance + topup + refund. Refunds are negative. */
  paidTzs: number
  depositPaidTzs: number
  outstandingTzs: number
}

/**
 * Gate 1. Mirrors `deposit_satisfied()`.
 *
 * The LEAST(...) floor is not defensive noise: a discount can legitimately drop
 * the effective total below a deposit figure that was snapshotted at the full
 * price, and without the floor such an order could pay everything it owes and
 * still never open the gate.
 */
export function depositSatisfied(ledger: OrderLedger): boolean {
  return ledger.depositPaidTzs >= Math.min(ledger.depositDueTzs, Math.max(ledger.effectiveTotalTzs, 0))
}

/** Gate 2. Mirrors `fully_settled()`. */
export function fullySettled(ledger: OrderLedger): boolean {
  return ledger.outstandingTzs <= 0
}

/** What the customer still owes right now, floored at zero for display. */
export function amountOutstanding(ledger: OrderLedger): number {
  return Math.max(ledger.outstandingTzs, 0)
}

/** How much more is needed to open Gate 1. Zero once the deposit is satisfied. */
export function depositShortfall(ledger: OrderLedger): number {
  const due = Math.min(ledger.depositDueTzs, Math.max(ledger.effectiveTotalTzs, 0))
  return Math.max(due - ledger.depositPaidTzs, 0)
}

/**
 * The deposit due at checkout. Never hard-code 50: `deposit_percent` is a
 * column precisely so a rush job or a corporate client can be set to 100% up
 * front without a code change (PRD §7.2.1).
 *
 * Rounded to whole shillings, matching the integer arithmetic in the database.
 */
export function computeDepositDue(priceTzs: number, depositPercent: number): number {
  return Math.floor((priceTzs * depositPercent) / 100)
}

/**
 * "TSh 250,000" — the format the PRD uses on every customer-facing commission
 * surface.
 *
 * Deliberately NOT the existing `formatTzs` from product-contracts, which
 * renders "TZS 250,000". The two prefixes are a real inconsistency in the
 * product, but resolving it means changing every price in the registry shop
 * and vendor storefronts, which is a separate decision from shipping this
 * feature. Matching the spec here and flagging the divergence is honest;
 * quietly rewriting product money to match would not be.
 */
export function formatTsh(amount: number): string {
  return `TSh ${Math.round(amount).toLocaleString('en-US')}`
}

// ─────────────────────────────────────────────────────────────────────────────
//  Packages and categories
// ─────────────────────────────────────────────────────────────────────────────

export type CardPackage = {
  id: string
  nameEn: string
  nameSw: string
  priceTzs: number
  depositPercent: number
  firstDraftHours: number
  /** null = unlimited under fair use. A number is a hard, server-enforced ceiling. */
  revisionsIncluded: number | null
  revisionsFairUse: number | null
  topupPriceTzs: number
  autoApproveDays: number
  active: boolean
  sortOrder: number
}

export type CardCategory = {
  id: string
  nameEn: string
  nameSw: string
  /** Categories whose cards carry a scannable entrance pass need a QR slot. */
  ticketed: boolean
  active: boolean
  sortOrder: number
}

export function revisionAllowanceLabel(pkg: CardPackage, locale: 'en' | 'sw'): string {
  if (pkg.revisionsIncluded === null) {
    const n = pkg.revisionsFairUse
    return locale === 'sw'
      ? `Marekebisho bila kikomo${n ? ` (matumizi ya haki: ${n})` : ''}`
      : `Unlimited revisions${n ? ` (fair use: ${n})` : ''}`
  }
  if (locale === 'sw') {
    return pkg.revisionsIncluded === 1 ? 'Marekebisho 1' : `Marekebisho ${pkg.revisionsIncluded}`
  }
  return pkg.revisionsIncluded === 1 ? '1 revision included' : `${pkg.revisionsIncluded} revisions included`
}

// ─────────────────────────────────────────────────────────────────────────────
//  Brief
// ─────────────────────────────────────────────────────────────────────────────

export type BriefFieldType = 'text' | 'longtext' | 'date' | 'color' | 'choice' | 'file'

export type BriefQuestion = {
  id: string
  categoryId: string
  key: string
  labelEn: string
  labelSw: string
  helpEn: string | null
  helpSw: string | null
  fieldType: BriefFieldType
  options: string[]
  required: boolean
  sortOrder: number
}

/** Upload limits from PRD §7.3. Enforced server-side; these values drive the UI copy. */
export const BRIEF_MAX_FILES = 10
export const BRIEF_MAX_FILE_BYTES = 15 * 1024 * 1024
export const BRIEF_ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
] as const

/** Which required questions are still unanswered. Mirrors the `queued` guard. */
export function missingRequiredAnswers(
  questions: readonly BriefQuestion[],
  answers: Record<string, unknown>,
): BriefQuestion[] {
  return questions.filter((q) => {
    if (!q.required) return false
    const v = answers[q.key]
    if (v === null || v === undefined) return true
    if (typeof v === 'string') return v.trim() === ''
    if (Array.isArray(v)) return v.length === 0
    return false
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  Refund entitlement
// ─────────────────────────────────────────────────────────────────────────────

/** Fault-based reasons bypass the tier table entirely at 100% (PRD §7.11.2). */
export const FAULT_REFUND_REASONS = [
  'opusfesta_fault', 'sla_breach', 'defective_deliverable', 'force_majeure',
] as const

export type RefundReason =
  | 'customer_cancelled' | 'event_cancelled' | 'event_postponed_declined'
  | 'opusfesta_fault' | 'sla_breach' | 'defective_deliverable'
  | 'force_majeure' | 'duplicate_payment' | 'other'

export function isFaultBasedRefund(reason: RefundReason): boolean {
  return (FAULT_REFUND_REASONS as readonly string[]).includes(reason)
}

/**
 * The PRD §7.11.1 tier table, for DISPLAY ONLY.
 *
 * `refund_entitlement(order_id)` in Postgres is the authority — this exists so
 * the cancel screen can quote a figure before the customer commits, and so the
 * quote and the outcome cannot disagree. Never write a refund amount from this.
 */
export type RefundAnchors = {
  approvedAt: string | null
  revisionRoundCount: number
  designVersionCount: number
  acceptedAt: string | null
  assignedAt: string | null
  briefCompletedAt: string | null
  status: CardOrderStatus
}

export function refundEntitlementPct(a: RefundAnchors): number {
  // Evaluated from most work done to least, so a status label that lags
  // reality cannot inflate entitlement.
  if (a.approvedAt) return 0
  if (a.revisionRoundCount >= 1) return 10
  if (a.designVersionCount >= 1) return 30
  if (a.acceptedAt) return 60
  if (a.assignedAt) return 80
  if (a.briefCompletedAt) return 90
  if (a.status === 'deposit_paid' || a.status === 'intake_pending') return 100
  return 0
}

/** Credit notes are offered at 110% of the refundable amount (PRD §7.11.3). */
export const CREDIT_NOTE_UPLIFT = 1.1

export function creditNoteValue(refundableTzs: number): number {
  return Math.floor(refundableTzs * CREDIT_NOTE_UPLIFT)
}

// ─────────────────────────────────────────────────────────────────────────────
//  Balance chase cadence
// ─────────────────────────────────────────────────────────────────────────────
// PRD §7.2.3. Because the work is already done at this point, this is where the
// money is genuinely at risk.

export type ChaseStep = { afterHours: number; action: string }

export const BALANCE_CHASE_NORMAL: readonly ChaseStep[] = [
  { afterHours: 0,        action: 'WhatsApp + SMS + email: approved, here is your balance and how to pay' },
  { afterHours: 24,       action: 'WhatsApp reminder' },
  { afterHours: 72,       action: 'SMS + email reminder, Ops notified' },
  { afterHours: 24 * 7,   action: 'balance_overdue — Ops calls the customer directly' },
  { afterHours: 24 * 21,  action: 'forfeited — deposit retained, order archived, asset not released' },
]

/** Compressed cadence when the event is within 14 days: 12h / 48h / 5 days. */
export const BALANCE_CHASE_URGENT: readonly ChaseStep[] = [
  { afterHours: 0,        action: 'WhatsApp + SMS + email: approved, here is your balance and how to pay' },
  { afterHours: 12,       action: 'WhatsApp reminder' },
  { afterHours: 48,       action: 'SMS + email reminder, Ops notified' },
  { afterHours: 24 * 5,   action: 'balance_overdue — Ops calls the customer directly' },
  { afterHours: 24 * 21,  action: 'forfeited — deposit retained, order archived, asset not released' },
]

export const EVENT_URGENCY_DAYS = 14

/**
 * A customer whose wedding is next week needs a phone call, not a fourth
 * WhatsApp message.
 */
export function chaseCadenceFor(eventDate: Date | null, now: Date = new Date()): readonly ChaseStep[] {
  if (!eventDate) return BALANCE_CHASE_NORMAL
  const days = (eventDate.getTime() - now.getTime()) / 86_400_000
  return days < EVENT_URGENCY_DAYS ? BALANCE_CHASE_URGENT : BALANCE_CHASE_NORMAL
}

/** Days from invoicing to balance_overdue. Mirrors the cascade in transition_order(). */
export function balanceDueDays(eventDate: Date | null, now: Date = new Date()): number {
  return chaseCadenceFor(eventDate, now) === BALANCE_CHASE_URGENT ? 5 : 7
}
