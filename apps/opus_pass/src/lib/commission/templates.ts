import { formatTsh } from '@opusfesta/lib'

/**
 * Commission notification content, in both languages.
 * Specs: OP-CCS-PRD-001 §7.8, §8.
 *
 * One module holds every message this feature sends, for four reasons:
 *
 *  1. Bilingual is not optional. Most buyers here read Kiswahili on a phone,
 *     and a payment reminder they cannot read is a payment that does not
 *     arrive. Keeping both languages side by side makes a missing translation
 *     visible instead of silently falling back to English.
 *  2. WhatsApp templates need pre-approval from Meta, per language, and the
 *     PARAMETER ORDER is frozen once approved. Declaring that order here, next
 *     to the copy, is what stops a later edit quietly shifting {{2}} and
 *     sending someone else's name.
 *  3. SMS costs money per segment and is the fallback when WhatsApp is
 *     unavailable, so the SMS bodies are written short on purpose rather than
 *     truncated later.
 *  4. Support needs to know exactly what a customer was told. One module means
 *     one answer.
 *
 * See docs/OP-CCS-whatsapp-templates.md for what to register in Meta.
 */

export type Locale = 'en' | 'sw'

/** Every variable any template may reference. All optional — templates take what they need. */
export type TemplateVars = {
  order_no?: string
  buyer_name?: string
  amount_tzs?: number
  outstanding_tzs?: number
  shortfall_tzs?: number
  event_name?: string
  link?: string
  note?: string
  designer_name?: string
  days?: number
}

export type RenderedMessage = {
  /** SMS and WhatsApp body, and the email/bell body. */
  body: string
  /** Email subject and bell title. */
  title: string
  /** Meta template name — null when this event has no WhatsApp template. */
  whatsappTemplate: string | null
  /**
   * Positional parameters for the Meta template, in the exact order the
   * approved template expects. Changing this order without re-approving the
   * template sends the right words in the wrong places.
   */
  whatsappParams: string[]
}

function tsh(n: number | undefined): string {
  return formatTsh(n ?? 0)
}

/**
 * Render one notification.
 *
 * Returns null for an unknown event type rather than sending something
 * generic: a message the team cannot trace back to a trigger is worse than no
 * message, and the dispatcher marks these dead so they surface in Admin.
 */
export function renderCommissionMessage(
  eventType: string,
  locale: Locale,
  vars: TemplateVars,
): RenderedMessage | null {
  const sw = locale === 'sw'
  const name = vars.buyer_name?.split(' ')[0] ?? ''
  const ref = vars.order_no ?? ''

  switch (eventType) {
    // ── Gate 1 ────────────────────────────────────────────────────────────
    case 'order.created':
      return {
        title: sw ? 'Hifadhi oda yako ya kadi' : 'Save your card order',
        body: sw
          ? `Habari ${name}. Asante kwa kuagiza kadi yako maalum (${ref}). Fungua kiungo hiki kuhifadhi oda kwenye akaunti yako na kujaza maelezo: ${vars.link ?? ''}`
          : `Hi ${name}. Thank you for commissioning your custom card (${ref}). Open this link to save the order to your account and fill in your brief: ${vars.link ?? ''}`,
        whatsappTemplate: 'claim_your_order',
        whatsappParams: [name, ref, vars.link ?? ''],
      }

    case 'deposit.verified':
    case 'deposit.approved':
      return {
        title: sw ? 'Malipo ya awali yamethibitishwa' : 'Deposit confirmed',
        body: sw
          ? `Asante ${name}. Tumepokea malipo yako ya awali kwa oda ${ref}. Kazi ya ubunifu inaanza mara tu utakapokamilisha maelezo yako: ${vars.link ?? ''}`
          : `Thank you ${name}. We have received your deposit for order ${ref}. Design work begins as soon as your brief is complete: ${vars.link ?? ''}`,
        whatsappTemplate: 'deposit_confirmed',
        whatsappParams: [name, ref, vars.link ?? ''],
      }

    case 'payment.submitted':
      return {
        title: sw ? 'Tunahakiki malipo yako' : 'We are checking your payment',
        body: sw
          ? `Asante. Tumepokea kumbukumbu yako ya malipo kwa oda ${ref}. Timu yetu ya fedha huhakiki ndani ya saa 4 za kazi na utapata ujumbe mara itakapothibitishwa.`
          : `Thank you. We have your payment reference for order ${ref}. Our finance team checks these within 4 working hours and you will hear from us as soon as it is confirmed.`,
        whatsappTemplate: null,
        whatsappParams: [],
      }

    // The shortfall is the entire message. A customer who sent TSh 40,000
    // against TSh 125,000 needs the number, not an apology.
    case 'payment.short':
      return {
        title: sw ? 'Malipo hayajakamilika' : 'Your payment is short',
        body: sw
          ? `Tumepokea malipo yako kwa oda ${ref}, lakini bado kuna ${tsh(vars.shortfall_tzs)} inayohitajika. Malipo uliyofanya yamehifadhiwa. Lipa kiasi kilichobaki hapa: ${vars.link ?? ''}`
          : `We received your payment for order ${ref}, but ${tsh(vars.shortfall_tzs)} is still needed. What you have paid is credited and safe. Pay the remainder here: ${vars.link ?? ''}`,
        whatsappTemplate: 'deposit_shortfall',
        whatsappParams: [ref, tsh(vars.shortfall_tzs), vars.link ?? ''],
      }

    case 'payment.rejected':
      return {
        title: sw ? 'Malipo hayakupatikana' : 'We could not match your payment',
        body: sw
          ? `Kwa oda ${ref}: hatukuweza kupata malipo yenye kumbukumbu uliyotoa. ${vars.note ?? ''} Tafadhali angalia namba ya muamala na ujaribu tena: ${vars.link ?? ''}`
          : `For order ${ref}: we could not find a payment matching the reference you gave. ${vars.note ?? ''} Please check the transaction ID and try again: ${vars.link ?? ''}`,
        whatsappTemplate: null,
        whatsappParams: [],
      }

    // ── Brief and production ──────────────────────────────────────────────
    case 'brief.reminder':
      return {
        title: sw ? 'Tunasubiri maelezo yako' : 'We are waiting on your brief',
        body: sw
          ? `Habari ${name}. Mbunifu wako yuko tayari kuanza oda ${ref}, lakini tunahitaji maelezo yako kwanza. Inachukua dakika chache tu: ${vars.link ?? ''}`
          : `Hi ${name}. Your designer is ready to start order ${ref}, but we need your brief first. It only takes a few minutes: ${vars.link ?? ''}`,
        whatsappTemplate: 'card_request_information',
        whatsappParams: [name, ref, vars.link ?? ''],
      }

    case 'task.assigned':
      return {
        title: 'New commission assigned',
        body: `Order ${ref} has been assigned to you${vars.designer_name ? ` (${vars.designer_name})` : ''}. Accept it within 2 hours or it returns to the queue: ${vars.link ?? ''}`,
        whatsappTemplate: 'task_assigned',
        whatsappParams: [vars.designer_name ?? '', ref, vars.link ?? ''],
      }

    case 'task.accept_breach':
      return {
        title: 'Commission not accepted in time',
        body: `Order ${ref} was assigned but not accepted within 2 hours. It has bounced back to the queue and may need a manual assignment.`,
        whatsappTemplate: null,
        whatsappParams: [],
      }

    // ── Review ────────────────────────────────────────────────────────────
    case 'version.ready':
      return {
        title: sw ? 'Kadi yako iko tayari kukaguliwa' : 'Your card is ready to review',
        body: sw
          ? `Habari ${name}. Rasimu ya kadi yako (${ref}) iko tayari. Iangalie, kisha uidhinishe au uombe mabadiliko: ${vars.link ?? ''}`
          : `Hi ${name}. The first look at your card (${ref}) is ready. Take a look, then approve it or ask for changes: ${vars.link ?? ''}`,
        whatsappTemplate: 'card_ready_for_review',
        whatsappParams: [name, ref, vars.link ?? ''],
      }

    case 'revision.opened':
      return {
        title: 'Changes requested',
        body: `The customer has requested changes on order ${ref}. Their notes are on the task: ${vars.link ?? ''}`,
        whatsappTemplate: null,
        whatsappParams: [],
      }

    // ── Gate 2 ────────────────────────────────────────────────────────────
    // The most commercially important message in the feature: the work is
    // done and this is what gets it paid for.
    case 'order.approved':
      return {
        title: sw ? 'Imeidhinishwa. Salio linadaiwa' : 'Approved. Your balance is due',
        body: sw
          ? `Asante ${name}. Umeidhinisha kadi yako (${ref}). Salio la ${tsh(vars.outstanding_tzs)} likilipwa, faili lako kamili hutolewa mara moja: ${vars.link ?? ''}`
          : `Thank you ${name}. You have approved your card (${ref}). Pay the balance of ${tsh(vars.outstanding_tzs)} and your full-resolution files are released immediately: ${vars.link ?? ''}`,
        whatsappTemplate: 'balance_due',
        whatsappParams: [name, ref, tsh(vars.outstanding_tzs), vars.link ?? ''],
      }

    case 'balance.reminder':
      return {
        title: sw ? 'Salio lako bado linadaiwa' : 'Your balance is still outstanding',
        body: sw
          ? `Habari ${name}. Kadi yako (${ref}) iko tayari na inakusubiri. Salio ni ${tsh(vars.outstanding_tzs)}. Lipa hapa ili kupata faili lako: ${vars.link ?? ''}`
          : `Hi ${name}. Your card (${ref}) is finished and waiting for you. The balance is ${tsh(vars.outstanding_tzs)}. Pay here to get your files: ${vars.link ?? ''}`,
        whatsappTemplate: 'balance_reminder',
        whatsappParams: [name, ref, tsh(vars.outstanding_tzs), vars.link ?? ''],
      }

    case 'balance.overdue':
      return {
        title: sw ? 'Salio limechelewa' : 'Your balance is overdue',
        body: sw
          ? `Habari ${name}. Salio la oda ${ref} (${tsh(vars.outstanding_tzs)}) limechelewa. Tutakupigia simu, lakini unaweza kulipa sasa hapa: ${vars.link ?? ''}`
          : `Hi ${name}. The balance on order ${ref} (${tsh(vars.outstanding_tzs)}) is overdue. We will call you, but you can settle it now here: ${vars.link ?? ''}`,
        whatsappTemplate: 'balance_reminder',
        whatsappParams: [name, ref, tsh(vars.outstanding_tzs), vars.link ?? ''],
      }

    case 'balance.settled':
      return {
        title: sw ? 'Imelipwa yote. Asante!' : 'Paid in full. Thank you!',
        body: sw
          ? `Asante ${name}. Oda ${ref} imelipwa yote na kadi yako iko tayari kupakuliwa sasa: ${vars.link ?? ''}`
          : `Thank you ${name}. Order ${ref} is paid in full and your card is ready to download now: ${vars.link ?? ''}`,
        whatsappTemplate: 'balance_settled',
        whatsappParams: [name, ref, vars.link ?? ''],
      }

    // ── Delivery ──────────────────────────────────────────────────────────
    case 'order.delivered':
      return {
        title: sw ? 'Kadi yako iko tayari kutumwa' : 'Your card is ready to share',
        body: sw
          ? `Kadi yako (${ref}) sasa iko kwenye tukio lako${vars.event_name ? ` la ${vars.event_name}` : ''}. Unaweza kuituma kwa wageni wako kupitia WhatsApp: ${vars.link ?? ''}`
          : `Your card (${ref}) is now on your event${vars.event_name ? ` ${vars.event_name}` : ''}. You can send it to your guests over WhatsApp: ${vars.link ?? ''}`,
        whatsappTemplate: 'card_send_to_guest',
        whatsappParams: [ref, vars.link ?? ''],
      }

    case 'order.forfeited':
      // Written to keep the door open. Forfeiture retains the deposit but
      // destroys nothing, and a customer who pays next month should still get
      // their card — saying so is both true and better for recovery.
      return {
        title: sw ? 'Oda yako imehifadhiwa' : 'Your order has been archived',
        body: sw
          ? `Habari ${name}. Hatujapokea salio la oda ${ref}, kwa hivyo tumeihifadhi. Kazi yako haijapotea: ukilipa ${tsh(vars.outstanding_tzs)} wakati wowote, tutakupa kadi yako mara moja: ${vars.link ?? ''}`
          : `Hi ${name}. We have not received the balance on order ${ref}, so it has been archived. Your card is not lost: pay ${tsh(vars.outstanding_tzs)} at any time and we will release it straight away: ${vars.link ?? ''}`,
        whatsappTemplate: 'balance_reminder',
        whatsappParams: [name, ref, tsh(vars.outstanding_tzs), vars.link ?? ''],
      }

    default:
      return null
  }
}

/**
 * The WhatsApp templates this feature needs approved in Meta Business Manager,
 * with their parameter contract.
 *
 * PRD §11 flags that five of these are new and that Meta approval is the long
 * pole. Keeping the list in code means the dispatcher can check at runtime
 * whether a template it is about to use has been registered, rather than
 * discovering the gap when a send fails.
 */
export const REQUIRED_WHATSAPP_TEMPLATES = [
  { name: 'claim_your_order',        params: ['first_name', 'order_no', 'link'] },
  { name: 'deposit_confirmed',       params: ['first_name', 'order_no', 'link'] },
  { name: 'deposit_shortfall',       params: ['order_no', 'shortfall', 'link'] },
  { name: 'card_request_information', params: ['first_name', 'order_no', 'link'] },
  { name: 'task_assigned',           params: ['designer_name', 'order_no', 'link'] },
  { name: 'card_ready_for_review',   params: ['first_name', 'order_no', 'link'] },
  { name: 'balance_due',             params: ['first_name', 'order_no', 'amount', 'link'] },
  { name: 'balance_reminder',        params: ['first_name', 'order_no', 'amount', 'link'] },
  { name: 'balance_settled',         params: ['first_name', 'order_no', 'link'] },
  { name: 'card_send_to_guest',      params: ['order_no', 'link'] },
] as const

export type RequiredTemplate = (typeof REQUIRED_WHATSAPP_TEMPLATES)[number]
