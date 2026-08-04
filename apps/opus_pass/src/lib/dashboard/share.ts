import type { GuestContact } from './types'

/**
 * The app's public origin, used to build absolute links for sharing + OG tags.
 * opus_pass serves at the root of its own subdomain (no basePath).
 */
export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_OPUS_PASS_URL || 'https://opuspass.opusfesta.com').replace(/\/$/, '')
}

/** Salutations that aren't a guest's actual first name — skipped so a name
 *  like "Mr Boris Massesa" greets "Boris", not "Mr". Covers both English and
 *  Swahili honorifics, since guests are named by Tanzanian couples. */
const NAME_TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'rev', 'sir', 'madam', 'chief', 'eng', 'engr', 'capt',
  'mzee', 'bwana', 'bi', 'bibi', 'ndugu',
  // Joins a compound honorific: "Mr & Mrs Boris Massesa" must greet "Boris",
  // not "&". Only ever skipped BETWEEN titles, since the loop stops at the
  // first word that isn't in this set. Swahili's "na" is deliberately absent:
  // it would eat the real first name of a guest called "Na Mwangi".
  '&', 'and',
])

/** Index of the first word that isn't a leading title, or -1 if every word
 *  is a title (name is nothing but titles) or the input is empty. */
function skipTitles(words: string[]): number {
  let i = 0
  while (i < words.length - 1 && NAME_TITLES.has(words[i].replace(/\.$/, '').toLowerCase())) i++
  const word = words[i]
  if (!word || NAME_TITLES.has(word.replace(/\.$/, '').toLowerCase())) return -1
  return i
}

/** First given name from a full name, for greetings — skips leading titles
 *  (Mr/Mrs/Dr/Mzee/Bwana/...) and falls back to the full name if nothing
 *  usable remains (e.g. the name is nothing but titles). */
export function firstNameOf(name: string): string {
  const words = name.trim().split(/\s+/)
  const i = skipTitles(words)
  return i === -1 ? name : words[i]
}

/** Full name with any leading title stripped ("Mr Boris Massesa" ->
 *  "Boris Massesa"), for contexts that want the whole name but not the
 *  honorific — e.g. an entrance-pass ticket greeting. Falls back to the
 *  full input if nothing usable remains after stripping. */
export function fullNameOf(name: string): string {
  const trimmed = name.trim()
  const words = trimmed.split(/\s+/)
  const i = skipTitles(words)
  return i === -1 ? trimmed : words.slice(i).join(' ')
}

/** Slugify free text for a URL handle: lowercase, ASCII, dash-separated. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/&/g, ' na ') // "Asha & Juma" -> "asha na juma"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Build a public-invite slug base from the couple's first names ("asha-na-juma"). */
export function coupleSlugBase(partner1: string | null, partner2: string | null): string {
  const firstNames = [partner1, partner2].filter(Boolean).map((name) => firstNameOf(name as string))
  const base = slugify(firstNames.join(' na '))
  return base || 'harusi'
}

/** Strips a `reserveUniqueSlug` collision suffix ("asha-na-juma-3" ->
 *  "asha-na-juma") so a stored slug can be compared against a freshly
 *  computed `coupleSlugBase()` to tell whether it's gone stale. */
export function slugBaseOf(slug: string): string {
  return slug.replace(/-\d+$/, '')
}

/**
 * The slug base for whatever's actually shown as the registry hero title —
 * the couple's custom header override when they've set one (e.g. "Boris &
 * Jane"), otherwise their partner names. Mirrors GiftRegistryHero's own
 * header-or-names fallback so the public share link never drifts from what
 * guests actually see.
 */
export function heroSlugBase(header: string | null, partner1: string | null, partner2: string | null): string {
  const slug = header?.trim() ? slugify(header) : ''
  return slug || coupleSlugBase(partner1, partner2)
}

/**
 * Slug base for a single event's own public link ("jamila-send-off"). Unlike
 * coupleSlugBase this keeps the whole name rather than reducing to first
 * names — an event name like "Jamila Send-Off" needs to stay recognizable,
 * not collapse to "jamila".
 */
export function eventSlugBase(eventName: string): string {
  return slugify(eventName) || 'harusi'
}

/** The slug base for a per-event gift-registry link — the couple's custom
 *  header override for THIS event when set, otherwise the event's own name. */
export function eventHeroSlugBase(header: string | null, eventName: string): string {
  const slug = header?.trim() ? slugify(header) : ''
  return slug || eventSlugBase(eventName)
}

/**
 * Path to a single event's public invite — tied to one wedding_events row
 * (its own invite_slug/invite_sharing_enabled), not the couple account-wide.
 * Lives under /rsvp/ (not /rsvp/[token], which is the per-guest token flow)
 * so the URL reads as what it is to a guest, without colliding with that
 * route's dynamic segment.
 */
export function eventInvitePath(slug: string): string {
  return `/rsvp/event/${slug}`
}

/** Absolute event-invite URL given a runtime origin. */
export function eventInviteUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}${eventInvitePath(slug)}`
}

/** Public save-the-date alias for the event invite experience. */
export function saveDatePath(slug: string): string {
  return `/save-the-date/${slug}`
}

/** Absolute save-the-date URL given a runtime origin. */
export function saveDateUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}${saveDatePath(slug)}`
}

/**
 * Path to the couple's public guestbook — deliberately independent of the
 * wedding-website builder/publish state (unlike /w/<slug>), so guests can
 * leave a message even if the couple never builds or publishes a site.
 */
export function guestbookPath(slug: string): string {
  return `/guestbook/${slug}`
}

/** Absolute public-guestbook URL given a runtime origin. */
export function guestbookUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}${guestbookPath(slug)}`
}

/**
 * Path to the couple's public gift registry — shares the same public_slug /
 * public_sharing_enabled gate as the guestbook and invite hub, so there's no
 * separate "enable" step once the couple has turned public sharing on.
 */
export function giftRegistryPath(slug: string): string {
  return `/gift-registry/${slug}`
}

/** Absolute public-gift-registry URL given a runtime origin. */
export function giftRegistryUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, '')}${giftRegistryPath(slug)}`
}

/**
 * A gift's price is free text (couples can type "Any amount" for open
 * contributions), but when it's just digits we want "TZS" in front of it
 * without couples having to type the currency themselves, and to abbreviate
 * amounts of a million or more (10,000,000 → "TZS 10M") so card labels don't
 * wrap. Leaves anything that already states a currency beyond "TZS", or
 * isn't a plain number, untouched.
 */
export function formatGiftPrice(label: string | null | undefined): string | null {
  const trimmed = label?.trim()
  if (!trimmed) return null
  const withoutPrefix = trimmed.replace(/^tzs\s*/i, '')
  if (!/^[\d][\d,.\s]*$/.test(withoutPrefix)) return trimmed
  const numeric = Number(withoutPrefix.replace(/[,\s]/g, ''))
  if (!Number.isFinite(numeric)) return `TZS ${withoutPrefix}`
  if (numeric >= 1_000_000) {
    const millions = numeric / 1_000_000
    const roundedMillions = Math.round(millions * 10) / 10
    return `TZS ${Number.isInteger(roundedMillions) ? roundedMillions : roundedMillions.toFixed(1)}M`
  }
  return `TZS ${withoutPrefix}`
}

/** Bilingual (SW/EN) broadcast message for the public, forwardable invite link. */
export function publicInviteMessage(coupleNames: string, link: string): string {
  return (
    `Karibu kwenye harusi ya ${coupleNames}! 💚\n` +
    `Bonyeza kuona mwaliko na kuthibitisha ujio wako: ${link}\n` +
    `\n` +
    `You're invited to ${coupleNames}'s wedding! ` +
    `Tap to view the invitation and RSVP: ${link}`
  )
}

/** Long, human date for a DATE/ISO string, e.g. "12 July 2026". Empty if null. */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Entrance-pass ticket date, month-first, e.g. "December 12, 2026". Empty if
 *  null. Kept separate from formatLongDate (which reads day-first everywhere
 *  else in the app) so only the ticket carries this house style. Reads the
 *  date in East Africa Time via eatDateParts (same as formatLongDateSw) so a
 *  midnight-boundary event never prints a day early on Vercel's UTC runtime. */
export function formatTicketDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  const { day, month, year } = eatDateParts(d)
  return `${ENGLISH_MONTHS[month - 1]} ${day}, ${year}`
}

const SWAHILI_MONTHS = [
  'Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni',
  'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba',
]

// All OpusFesta events are Tanzanian weddings, so date/time in the couple's
// own wall clock always means East Africa Time — never the server's local
// zone. `starts_at` is written from the browser's local (EAT) time and
// stored as a UTC ISO string; this app runs on Vercel, where the server's
// `Date.prototype.get*` accessors read in UTC, not EAT. Reading the wrong
// zone here would print a wrong arrival time on a real entry ticket, so we
// always extract date/time parts through this explicitly EAT-zoned
// formatter rather than the ambient runtime zone.
const EAT_TIME_ZONE = 'Africa/Dar_es_Salaam'

export function eatDateParts(d: Date): { day: number; month: number; year: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EAT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') }
}

/** Long, human date in Swahili, e.g. "02 Oktoba 2026". Empty if null. */
export function formatLongDateSw(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return ''
  const { day, month, year } = eatDateParts(d)
  return `${String(day).padStart(2, '0')} ${SWAHILI_MONTHS[month - 1]} ${year}`
}

/**
 * Traditional East African "saa" time, e.g. a 20:30 (8:30pm) EAT start
 * becomes "Saa 2:30 Usiku" — the Swahili clock runs 6 hours behind the
 * standard one (Swahili "saa moja" = 7:00, since the day is reckoned from
 * sunrise), so the hour is shifted by 6 before relabeling. Always reads the
 * hour/minute in East Africa Time regardless of server timezone (see
 * eatDateParts above). Empty if iso has no time component.
 */
export function formatSwahiliTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const { hour, minute } = eatDateParts(d)
  const swahiliHour = ((hour - 6 + 12) % 12) || 12
  const period = hour >= 5 && hour < 12 ? 'Asubuhi' : hour >= 12 && hour < 16 ? 'Mchana' : hour >= 16 && hour < 19 ? 'Jioni' : 'Usiku'
  return `Saa ${swahiliHour}:${String(minute).padStart(2, '0')} ${period}`
}

/**
 * True if `iso` carries a real (non-midnight) time-of-day in East Africa
 * Time. Mirrors the same EAT-zoned reading formatSwahiliTime uses, so a
 * "no time set" event (stored as EAT midnight) isn't misread as having a
 * time just because the server's own timezone offset shifts it off 00:00.
 */
export function hasEatTimeComponent(iso: string | null | undefined): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const { hour, minute } = eatDateParts(d)
  return hour !== 0 || minute !== 0
}

/** Path (no origin) to a guest's public RSVP page. */
export function rsvpPath(token: string): string {
  return `/rsvp/${token}`
}

/** Absolute RSVP URL given a browser/runtime origin. */
export function rsvpUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}${rsvpPath(token)}`
}

/** Path to the couple's public Contact Collector page. The optional eventId
 *  routes guests to that event's own cover/wording/questions for multi-event
 *  couples — see resolveCollectorEventContent(). */
export function collectorPath(token: string, eventId?: string | null): string {
  return `/collect/${token}${eventId ? `?event=${eventId}` : ''}`
}

/** Absolute Contact Collector URL given a browser/runtime origin. */
export function collectorUrl(origin: string, token: string, eventId?: string | null): string {
  return `${origin.replace(/\/$/, '')}${collectorPath(token, eventId)}`
}

export function collectorShareMessage(coupleNames: string, link: string): string {
  return (
    `Habari! 💚 ${coupleNames} wanaweka orodha ya wageni wa harusi yao. ` +
    `Tafadhali tuma majina, namba na email yako kwa kubonyeza: ${link}\n` +
    `\n` +
    `Hi! ${coupleNames} are putting together their wedding guest list. ` +
    `Please share your contact details here: ${link}`
  )
}

/** Path to the couple's public self-pledge page. The optional eventId routes
 *  public pledges to a specific event for multi-event couples. */
export function pledgePath(token: string, eventId?: string | null): string {
  return `/pledge/${token}${eventId ? `?event=${eventId}` : ''}`
}

/** Absolute self-pledge URL given a browser/runtime origin. */
export function pledgeUrl(origin: string, token: string, eventId?: string | null): string {
  return `${origin.replace(/\/$/, '')}${pledgePath(token, eventId)}`
}

/** Bilingual (SW/EN) initial ask sent to invite someone to pledge. */
export function pledgeRequestMessage(coupleNames: string, link: string): string {
  return (
    `Habari! 💚 ${coupleNames} wanaandaa harusi yao na wangependa mchango wako. ` +
    `Tafadhali weka kiasi unachoweza kuchangia hapa: ${link}\n` +
    `\n` +
    `Hi! ${coupleNames} are preparing their wedding and would value your contribution. ` +
    `Please pledge what you can here: ${link}`
  )
}

/** Bilingual (SW/EN) follow-up reminder for a pledge that's still owing.
 *  Optionally appends the couple's "how to pay" instructions. */
export function pledgeReminderMessage(
  coupleNames: string,
  contributorName: string,
  amountLabel: string,
  dueLabel: string | null,
  paymentInstructions?: string | null,
): string {
  const firstName = firstNameOf(contributorName)
  const dueSw = dueLabel ? ` kabla ya ${dueLabel}` : ''
  const dueEn = dueLabel ? ` by ${dueLabel}` : ''
  const pay = paymentInstructions?.trim() ? `\n\nMalipo / How to pay:\n${paymentInstructions.trim()}` : ''
  return (
    `Habari ${firstName}! 💚 Ni kumbusho la upole kuhusu mchango wako wa ${amountLabel} ` +
    `kwa harusi ya ${coupleNames}${dueSw}. Asante sana kwa msaada wako!\n` +
    `\n` +
    `Hi ${firstName}! A gentle reminder about your pledge of ${amountLabel} ` +
    `for ${coupleNames}'s wedding${dueEn}. Thank you so much for your support!` +
    pay
  )
}

/** Collapse whitespace (Meta rejects newlines/tabs in params) and cap length. */
export function templateParam(value: string | undefined, fallback: string, max = 60): string {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim()
  return (clean || fallback).slice(0, max)
}

/**
 * Normalize a phone number to digits + leading country code for wa.me / sms.
 *
 * MUST agree exactly with public.opuspass_normalize_phone() (20260804160000),
 * which backs guest_contacts.phone_normalized and therefore the "one number,
 * one guest" unique index. phone-normalization-parity.test.ts holds both to
 * one fixture; change neither side alone.
 *
 * Strips every non-digit, not just a leading '+'. Keeping interior or trailing
 * '+' characters (as this did before) made "255757200767 (+ wife)" normalize
 * to "255757200767+" here but "255757200767" in the index, so the pre-insert
 * duplicate check cleared a guest the index then rejected with a raw 23505.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  // Tanzania local format 0XXXXXXXXX -> 255XXXXXXXXX
  if (digits.startsWith('0')) digits = `255${digits.slice(1)}`
  // Tanzania mobile typed without the leading 0 (7XXXXXXXX / 6XXXXXXXX).
  // Anything else must already carry its country code — we cannot guess one.
  if (/^[67]\d{8}$/.test(digits)) digits = `255${digits}`
  return digits || null
}

export function inviteMessage(
  coupleNames: string,
  guestName: string,
  rsvpLink: string
): string {
  const firstName = firstNameOf(guestName)
  return (
    `Karibu ${firstName}! 💚\n` +
    `${coupleNames} wanafurahi kukukaribisha kwenye harusi yao.\n` +
    `Tafadhali tujibu hapa: ${rsvpLink}\n` +
    `\n` +
    `Hi ${firstName}! ${coupleNames} would love to see you at their wedding. ` +
    `Please RSVP here: ${rsvpLink}`
  )
}

/** A gentle follow-up for guests who were invited but haven't replied yet. */
export function reminderMessage(
  coupleNames: string,
  guestName: string,
  rsvpLink: string
): string {
  const firstName = firstNameOf(guestName)
  return (
    `Habari ${firstName}! 💚\n` +
    `Ni ukumbusho mpole — ${coupleNames} bado wanasubiri jibu lako.\n` +
    `Tafadhali tujibu hapa: ${rsvpLink}\n` +
    `\n` +
    `Hi ${firstName}! Just a gentle reminder — ${coupleNames} would still love to know if you can make it. ` +
    `Please RSVP here: ${rsvpLink}`
  )
}

export function whatsappShareUrl(
  guest: Pick<GuestContact, 'whatsapp_phone' | 'phone' | 'full_name'>,
  message: string
): string {
  const phone = normalizePhone(guest.whatsapp_phone ?? guest.phone)
  const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(message)}`
}

export function smsShareUrl(
  guest: Pick<GuestContact, 'phone' | 'whatsapp_phone'>,
  message: string
): string {
  const phone = normalizePhone(guest.phone ?? guest.whatsapp_phone)
  return `sms:${phone ?? ''}?&body=${encodeURIComponent(message)}`
}

export function emailShareUrl(
  guest: Pick<GuestContact, 'email'>,
  subject: string,
  message: string
): string {
  return `mailto:${guest.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
}

/**
 * Split a stored guest name back into the title / first / last the edit form
 * shows.
 *
 * Imported guests only ever get `full_name` — `title`, `first_name` and
 * `last_name` are left null, and where they were backfilled it was done by
 * splitting on the first space. Neither knows what an honorific is, so one
 * roster ends up holding all of:
 *
 *   "Mr & Mrs Agapit"      -> first null,            last null
 *   "Mr & Mrs Alphayo"     -> first "Mr",            last "& Mrs Alphayo"
 *   "Mr & Mrs Amon Nkembo" -> first "Mr & Mrs Amon", last "Nkembo"
 *
 * The edit form then showed "Mr" as the guest's first name, and the only way
 * an admin could correct it was to set the Title dropdown — which is why
 * editing a guest felt like title was a required field.
 *
 * The split is always derived from `full_name`, never from the stored title /
 * first / last. Three reasons, all of them live on the Moses Seeta roster:
 *
 *  - The stored parts are frequently wrong ("Mr" as a first name), which is
 *    the complaint itself.
 *  - They are sometimes actively corrupt: "Mr & Mrs Msuya" is held as title
 *    "Mr & Mrs" / first "Msuya" / last "& Mrs Msuya", which adds back up to
 *    "Mr & Mrs Msuya & Mrs Msuya" — saving the form would rewrite the guest.
 *  - Checking whether the parts add up to full_name is not enough to tell the
 *    good from the bad: "Mr" + "& Mrs Alphayo" recomposes perfectly and is
 *    still the split that puts an honorific in the first-name box.
 *
 * Deriving is round-trip safe by construction: the pieces are taken from
 * full_name, so they always add back up to it. full_name is also what every
 * other surface already displays and sends, so it is the value to agree with.
 */
export function splitStoredGuestName(guest: {
  full_name?: string | null
  title?: string | null
  first_name?: string | null
  last_name?: string | null
}): { title: string; first: string; last: string } {
  const full = (guest.full_name ?? '').trim()
  if (!full) {
    return {
      title: (guest.title ?? '').trim(),
      first: (guest.first_name ?? '').trim(),
      last: (guest.last_name ?? '').trim(),
    }
  }

  const words = full.split(/\s+/)
  const start = skipTitles(words)
  // Every word is an honorific ("Mama"): keep it as the name rather than
  // leaving the guest nameless.
  if (start <= 0) {
    return start === 0
      ? { title: '', first: words[0] ?? '', last: words.slice(1).join(' ') }
      : { title: '', first: full, last: '' }
  }

  // Re-cased from the stored value so "MR & MRS" comes back as "Mr & Mrs" and
  // matches an option in the form's dropdown.
  const title = words
    .slice(0, start)
    .map((w) => (w === '&' ? '&' : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
  const rest = words.slice(start)
  return { title, first: rest[0] ?? '', last: rest.slice(1).join(' ') }
}
