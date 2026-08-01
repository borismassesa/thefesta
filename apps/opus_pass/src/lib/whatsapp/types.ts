// Shared WhatsApp types — provider-agnostic so the rest of the app never
// depends on Meta's wire format directly.

/** Quick-reply button payload prefixes (carried in the template button payload
 *  so an inbound tap maps back to the exact guest, independent of phone). */
export const BTN = {
  RSVP_YES: 'rsvp_yes',
  RSVP_NO: 'rsvp_no',
  VIEW_LOCATION: 'view_location',
} as const

export type ButtonKind = (typeof BTN)[keyof typeof BTN]

/**
 * Canonical WhatsApp invitation template spec — the single source of truth for
 * what must be submitted to Meta for approval. Quick-reply button TEXT is fixed
 * in the approved template (not sent per-message); the dynamic payload carries
 * the guest token for webhook mapping. Order matters: button index 0/1/2.
 */
export const INVITE_TEMPLATE = {
  /** Header is an IMAGE: the card the couple paid for. */
  header: 'IMAGE' as const,
  /** Body placeholders, in order: {{1}} guest first name, {{2}} couple name,
   *  {{3}} event category (Swahili noun, e.g. "harusi"). This is the EXACT
   *  approved body of `opuspass_send_invites` (fetched from Meta 2026-07-04) —
   *  the in-app preview renders it verbatim, so keep it in sync with Meta. */
  body: 'Habari *{{1}}*,\nUmealikwa kwa furaha kuhudhuria *{{3}}* ya *{{2}}*. Tunatarajia uwepo wako katika siku hii maalum.\nTafadhali thibitisha ujio wako hapa chini 👇',
  /** Footer text fixed in the approved template. */
  footer: 'Sent by OpusPass',
  /** Quick-reply buttons, in index order, with the exact approved labels. */
  buttons: [
    { index: 0, payload: BTN.RSVP_YES, label: 'Asante, Nitafika' },
    { index: 1, payload: BTN.RSVP_NO, label: 'Sitafika, Ninaudhuru' },
    { index: 2, payload: BTN.VIEW_LOCATION, label: 'View Location' },
  ],
} as const

/**
 * Contact Collector template spec — invites a saved contact to fill in their
 * own details via the couple's public collector form. The button is a
 * DYNAMIC WEBSITE URL (not a quick reply): Meta requires the template's URL
 * to be configured as `https://opuspass.opusfesta.com/collect/{{1}}` and the
 * send-time parameter supplies just the token, which Meta appends in place
 * of that placeholder.
 */
export const COLLECTOR_TEMPLATE = {
  header: 'IMAGE' as const,
  /** Body placeholders: {{1}} contact first name, {{2}} couple name. */
  body: 'Habari *{{1}}* 💚\nTunatengeneza orodha ya wageni kwa *{{2}}* na tungependa kupata mawasiliano yako.\nBonyeza hapa chini kujaza fomu fupi 👇',
  cta: { type: 'URL', label: 'Jaza Fomu' },
} as const

/**
 * Pledge template spec — invites a saved contact to make a contribution via
 * the couple's public pledge page. Same dynamic-URL button shape as
 * COLLECTOR_TEMPLATE, pointed at `/pledge/{{1}}`.
 */
export const PLEDGE_TEMPLATE = {
  header: 'IMAGE' as const,
  /** Body placeholders: {{1}} contact first name, {{2}} couple name. */
  body: 'Habari *{{1}}* 💚\n*{{2}}* wanaandaa harusi yao na wangependa mchango wako.\nBonyeza hapa chini kuweka kiasi utakachochangia 👇',
  cta: { type: 'URL', label: 'Changia Sasa' },
} as const

/**
 * Entrance-pass template spec — a one-way delivery to a guest who has already
 * confirmed "attending": their name, the event, and a ticket image with a
 * scannable QR baked in. No buttons (nothing to reply to) and no invite
 * credit is consumed sending it, unlike INVITE_TEMPLATE.
 *
 * Submitted to Meta as `opuspass_entrance_pass` (Swahili) — awaiting approval
 * before WHATSAPP_TEMPLATE_NAME_ENTRANCE_PASS can be set.
 */
export const ENTRANCE_PASS_TEMPLATE = {
  header: 'IMAGE' as const,
  /** Body placeholders, in order: {{1}} guest name, {{2}} event category
   *  (Swahili noun, e.g. "Harusi"), {{3}} couple name, {{4}} date,
   *  {{5}} time, {{6}} venue. */
  body:
    '🎉 Tiketi yako ya Kuingia iko Tayari!\n\n' +
    'Habari {{1}},\n\n' +
    'Umefanikiwa kuthibitishwa kuhudhuria:\n\n' +
    '*{{2}}* ya *{{3}}*\n\n' +
    '📅 {{4}}\n' +
    '🕣 {{5}}\n' +
    '📍 {{6}}\n\n' +
    'Tafadhali onyesha tiketi hii yenye Msimbo wa QR kwenye lango la kuingilia ili kuthibitisha uhalali wa tiketi yako na kuruhusiwa kuingia kwenye tukio.\n\n' +
    'Tunatarajia kusherehekea pamoja nawe. Karibu sana!',
  footer: 'Sent by OpusPass',
  buttons: [] as const,
} as const

/**
 * Thank-you template spec — a one-way, post-event message to guests who
 * confirmed "attending". Header is an IMAGE like INVITE_TEMPLATE: the
 * couple's chosen card design (from the invitation catalog) or a generic
 * banner when none is picked — no buttons (nothing to reply to).
 *
 * Draft copy — Boris to finalize wording and submit as `opuspass_thank_you`
 * for Meta approval before WHATSAPP_TEMPLATE_NAME_THANK_YOU can be set.
 */
export const THANK_YOU_TEMPLATE = {
  header: 'IMAGE' as const,
  /** Body placeholders, in order: {{1}} guest first name, {{2}} couple name,
   *  {{3}} event category (Swahili noun, e.g. "harusi"). */
  body:
    'Habari {{1}} 💚\n\n' +
    'Asante kwa kuwa sehemu ya *{{3}}* ya *{{2}}*. Uwepo wako uliifanya siku hiyo kuwa maalum zaidi.\n\n' +
    'Tunakushukuru kwa mapenzi na baraka zenu.',
  footer: 'Sent by OpusPass',
  buttons: [] as const,
} as const

/** A business-initiated post-event thank-you delivery, sent to guests who
 *  confirmed "attending". */
export interface ThankYouSend {
  /** Recipient in E.164-ish digits (e.g. 255712345678). */
  to: string
  /** Guest first name interpolated into the template body ({{1}}). */
  guestFirstName: string
  /** Couple/honoree name interpolated into the template body ({{2}}). */
  coupleName: string
  /** Event category (Swahili noun, e.g. "harusi") interpolated ({{3}}). */
  eventCategory: string
  /** Absolute URL of the couple's chosen card design, or a generic banner
   *  when none is picked yet (template image header). */
  headerImageUrl: string
  /** Template language code, e.g. 'sw' or 'en'. */
  languageCode?: string
}

/** A business-initiated entrance-pass delivery, sent after RSVP confirms. */
export interface EntrancePassSend {
  /** Recipient in E.164-ish digits (e.g. 255712345678). */
  to: string
  /** Guest name interpolated into the template body ({{1}}). */
  guestName: string
  /** Event category (Swahili noun, e.g. "Harusi") interpolated ({{2}}). */
  eventCategory: string
  /** Couple/honoree name interpolated into the template body ({{3}}). */
  coupleName: string
  /** Formatted event date interpolated into the template body ({{4}}). */
  dateLabel: string
  /** Formatted event time interpolated into the template body ({{5}}). */
  timeLabel: string
  /** Venue interpolated into the template body ({{6}}). */
  venue: string
  /** Absolute URL of the generated ticket image (template image header). */
  headerImageUrl: string
  /** Template language code, e.g. 'sw' or 'en'. */
  languageCode?: string
}

/** Which link-request template to send. */
export type LinkRequestKind = 'collector' | 'pledge' | 'card_details'

/** A business-initiated "here's a link, please fill it in" send. */
export interface LinkSend {
  /** Recipient in E.164-ish digits (e.g. 255712345678). */
  to: string
  /** First name interpolated into the template body ({{1}}). */
  contactFirstName: string
  /** Couple/honoree name interpolated into the template body ({{2}}). */
  coupleName: string
  /** Absolute URL of a generic OpusPass banner image (template image header). */
  headerImageUrl: string
  /** The collector/pledge/card-details token — the dynamic URL button suffix. */
  token: string
  /** Optional event scope for collector/pledge pages. When present, the
   *  dynamic URL suffix becomes `<token>?event=<eventId>` so guests land on
   *  the event-specific card/page instead of the account-level fallback. */
  eventId?: string | null
  /** Template language code, e.g. 'sw' or 'en'. */
  languageCode?: string
}

/** A business-initiated invitation send. */
export interface InviteSend {
  /** Recipient in E.164-ish digits (e.g. 255712345678). */
  to: string
  /** First name interpolated into the template body ({{1}}). */
  guestFirstName: string
  /** Couple/honoree name interpolated into the template body ({{2}}). */
  coupleName: string
  /** Event category (Swahili noun, e.g. "harusi") interpolated into the template body ({{3}}). */
  eventCategory: string
  /** Absolute URL of the card the couple PAID FOR (template image header). */
  headerImageUrl: string
  /** Guest public_token, embedded in each button payload for webhook mapping. */
  token: string
  /** Which event this invite is for — embedded in the button payload so a
   *  reply can be scoped to the exact event tapped, not guessed from "most
   *  recent send" (the token alone is per-guest, not per-event: one guest
   *  invited to 2+ events reuses the same token for every send). */
  eventId?: string
  /** Template language code, e.g. 'sw' or 'en'. */
  languageCode?: string
}

/** Result of a send attempt. */
export interface SendResult {
  ok: boolean
  /** WhatsApp message id (wamid) when sent. */
  wamid?: string
  error?: string
  /** True when handled by the dry-run stub (no live account yet). */
  dryRun?: boolean
}

/** A parsed inbound button tap from the webhook. */
export interface InboundButton {
  /** Sender msisdn. */
  from: string
  /** WhatsApp message id of the inbound event (idempotency key). */
  wamid: string
  kind: ButtonKind
  /** Guest token parsed from the button payload, when present. */
  token: string | null
  /** Which event this tap's original invite was sent for, when present —
   *  authoritative (see InviteSend.eventId); older sends predate this and
   *  carry no eventId, so callers must still handle null. */
  eventId: string | null
}

export interface WhatsAppProvider {
  readonly name: string
  /** True when real credentials are configured (else dry-run stub). */
  readonly live: boolean
  sendInvite(send: InviteSend): Promise<SendResult>
  sendEntrancePass(send: EntrancePassSend): Promise<SendResult>
  sendLinkRequest(kind: LinkRequestKind, send: LinkSend): Promise<SendResult>
  sendThankYou(send: ThankYouSend): Promise<SendResult>
  sendText(to: string, body: string): Promise<SendResult>
}
