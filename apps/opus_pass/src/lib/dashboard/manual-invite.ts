/**
 * The invitation as a message the COUPLE sends from their own WhatsApp.
 *
 * Separate from the SMS text, and from the approved Meta template, because it
 * is a different thing again: a person-to-person WhatsApp message, typed by the
 * couple's own handset. That is precisely why it arrives — it is not a business
 * template, so the quality pacing (131049), the delivery experiments (130472)
 * and the broad undeliverable bucket (131026) that stop the Business API do not
 * apply to it. Nothing here touches the Meta template.
 *
 * WHAT IT CANNOT DO. A wa.me link prefills TEXT ONLY. There is no way to attach
 * the card image to a deep link, so the caller downloads the guest's PNG first
 * and the sender attaches it by hand in WhatsApp. The message says so, and the
 * RSVP link is included as the safety net for when they forget: the card is on
 * that page to download.
 *
 * It also cannot carry quick-reply buttons — those exist only in Business API
 * templates. The RSVP link replaces them, and lands on the same form that the
 * template's buttons ultimately drive.
 */

export interface ManualInviteInput {
  /** The guest as they are addressed, e.g. "Mr & Mrs Mrindoko". */
  guestName: string
  /** Hosts as printed on the card, e.g. "Bw & Bi Ambukege Seeta". */
  hostsNames: string
  /** Couple line, e.g. "Moses Seeta & Dayness Mwandri". */
  coupleName: string
  /** Swahili event noun, e.g. "harusi". */
  eventCategory: string
  /** Swahili long date with weekday, e.g. "Jumamosi, 08 Agosti 2026". */
  dateLabel: string
  /** The guest's personal RSVP page. */
  rsvpUrl: string
  /** Maps link for the venue. Null when the couple has set no coordinates. */
  locationUrl: string | null
  /** Human location, used when there is no maps link to give. */
  locationLabel: string
  /** The guest's 8-character admission identifier. */
  passId: string | null
  /** Somebody to ring, already formatted "Name: +255…". Null when unset. */
  helpContact: string | null
}

const clean = (v: string | null | undefined): string => (v ?? '').trim().replace(/\s+/g, ' ')

export function buildManualInvite(input: ManualInviteInput): string {
  const lines: string[] = []
  const hosts = clean(input.hostsNames)
  const couple = clean(input.coupleName)
  const category = clean(input.eventCategory) || 'sherehe'
  const date = clean(input.dateLabel)

  lines.push(`Habari ${input.guestName.trim()},`)
  lines.push('')

  // Who is sending, and what they are sending. Named explicitly because this
  // arrives from a personal number the guest may not have saved.
  const sender = hosts ? `Familia ya ${hosts}` : couple
  const what = couple ? `kadi yako ya mwaliko wa ${category} ya ${couple}` : `kadi yako ya mwaliko wa ${category}`
  lines.push(date ? `${sender} inakutumia ${what}, itakayofanyika ${date}.` : `${sender} inakutumia ${what}.`)

  lines.push('')
  lines.push('Tafadhali thibitisha ushiriki wako hapa:')
  lines.push(input.rsvpUrl)

  // A maps link when there is one, the written location when there is not —
  // never a heading with nothing under it.
  const location = clean(input.locationUrl ?? '') || clean(input.locationLabel)
  if (location) {
    lines.push('')
    lines.push('Mahali na maelekezo:')
    lines.push(location)
  }

  if (input.passId) {
    lines.push('')
    lines.push(`Pass ID yako ni: ${input.passId}`)
  }

  const help = clean(input.helpContact ?? '')
  if (help) {
    lines.push('')
    lines.push(`Kwa msaada, wasiliana na ${help}.`)
  }

  // The closing line does real work: it is what tells the guest the image in
  // this chat is theirs to keep, and it is the only prompt they get to save it.
  lines.push('')
  lines.push('Tafadhali hifadhi kadi iliyoambatanishwa kwa matumizi ya siku ya tukio.')

  return lines.join('\n')
}

/**
 * The couple's own WhatsApp, opened on this guest's chat with the text ready.
 *
 * `phone` must already be normalised to digits with the country code — wa.me
 * rejects a leading plus and cannot guess a country.
 */
export function manualWhatsAppUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
}
