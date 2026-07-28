// Customizable public pledge page config ("CMS"). Pure data + helpers, safe to
// import from both the server query layer and client components (the editor and
// the public form). Stored as a single JSONB blob on couple_profiles.pledge_page;
// every field is optional and falls back to the locale's PLEDGE_PAGE_DEFAULTS.
//
// NOTE: only the built-in DEFAULT copy is bilingual today. A couple's own
// customized text (typed into the customize editor) is stored as one plain
// string and always renders as-is regardless of the guest's chosen locale —
// making that bilingual too would mean adding an EN/SW pair to the customize
// editor's fields, which is a separate, larger change.

import { DEFAULT_LOCALE, type Locale } from '@/lib/cms/localized'

export type PledgeCoverTone = 'cream' | 'sage' | 'blush' | 'lavender' | 'charcoal'

/** A cover can be an uploaded photo OR a short video — both stored in the
 *  same `coverImageUrl` field; this tells the guest-facing renderers which
 *  element to use based on the file extension. */
export function isVideoCoverUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)($|\?)/i.test(url)
}

/** 'short_answer' is free text; 'multiple_choice' asks the guest to pick one of `options`. */
export type CollectorQuestionKind = 'short_answer' | 'multiple_choice'

export interface CollectorQuestionOption {
  id: string
  label: string
}

/** One custom question the couple adds to their Contact Collector form, on
 *  top of the fixed name/WhatsApp/email fields. */
export interface CollectorQuestion {
  id: string
  prompt: string
  kind: CollectorQuestionKind
  required: boolean
  /** Only meaningful for 'multiple_choice'. */
  options: CollectorQuestionOption[]
}

export interface PledgePageConfig {
  eyebrow?: string
  headingLine2?: string
  intro?: string
  buttonLabel?: string
  privacyNote?: string
  /** Arbitrary accent hex used for the CTA and small flourishes. */
  accent?: string
  coverTone?: PledgeCoverTone
  /** Optional cover background image URL (overrides the tone gradient). Legacy
   *  pre-multi-event field — don't read this directly off the raw stored
   *  config; go through resolveEventCover() below, which prefers the matching
   *  eventCovers entry and falls back to this field only for couples who
   *  have never used the per-event picker at all (set a cover before
   *  per-event covers existed and haven't touched it since). */
  coverImageUrl?: string | null
  /** True when coverImageUrl is a fully pre-designed template (names/date/venue
   *  already baked into the artwork) — suppresses the text overlay so nothing
   *  doubles up. False/unset means coverImageUrl is a plain photo backdrop. */
  coverIsFullTemplate?: boolean
  /** Per-event cover overrides, keyed by event id (or EVENTLESS_COVER_KEY for
   *  couples with no events). A couple's pledge page can be shared across many
   *  events (via ?event=<id> on the link), each wanting its own card — this is
   *  what actually makes the "Pledge Card Templates" picker per-event instead
   *  of clobbering every event with the same cover. */
  eventCovers?: Record<string, { coverImageUrl: string | null; coverIsFullTemplate: boolean }>
  /** Custom questions asked on the Contact Collector form, in display order.
   *  Legacy top-level field — see eventContent below for the per-event
   *  scoped version couples on the per-event flow actually read from. */
  questions?: CollectorQuestion[]
  /** Per-event Contact Collector content — cover, wording, and questions —
   *  keyed by event id (or EVENTLESS_COVER_KEY for couples with no events).
   *  Each event gets its own independent collector page instead of sharing
   *  one generic page: a couple's Kitchen Party and Send-off can look and
   *  ask for completely different things. Mirrors eventCovers, but scopes
   *  every editable field, not just the cover. */
  eventContent?: Record<string, CollectorEventContent>
  /** Per-event Save the Date dashboard selection. Stored here because this
   * config JSON is explicitly allowed to evolve without schema changes. */
  saveDateTemplates?: Record<string, SaveDateTemplateSelection>
}

export interface SaveDateTemplateSelection {
  id: string
  name: string
  imageUrl: string
}

/** One event's worth of Contact Collector content — everything the customize
 *  editor lets a couple change for their guests' contact-collection page. */
export interface CollectorEventContent {
  headingLine2?: string
  intro?: string
  buttonLabel?: string
  privacyNote?: string
  coverImageUrl?: string | null
  coverIsFullTemplate?: boolean
  questions?: CollectorQuestion[]
}

/** Map key used for eventCovers when there's no selected event (couples with
 *  zero events, or a legacy single-event setup that predates event scoping). */
export const EVENTLESS_COVER_KEY = '_default'

/** Resolve the cover that applies to a specific event from the couple's raw
 *  stored pledge_page config. Falls back to the legacy top-level
 *  coverImageUrl/coverIsFullTemplate fields when there's no per-event entry
 *  yet AND the couple has never used the per-event picker at all — those
 *  fields predate per-event covers, and couples who set a custom cover
 *  before per-event scoping shipped still have it saved only there (no
 *  eventCovers entry, no backfill migration). Without this fallback their
 *  cover would silently revert to the default gradient.
 *
 *  Once a couple has at least one eventCovers entry, though, they're on the
 *  per-event flow — a *different* event that lacks its own entry is a
 *  genuinely new/unconfigured event, not a legacy single-event setup, and
 *  must NOT inherit the legacy field's now-unrelated cover (that field could
 *  hold a design applied to a since-superseded event, or nothing meaningful
 *  at all). Regression guard: this previously leaked a stale/foreign cover
 *  — with a real, guest-shareable pledge link — onto brand-new events. */
export function resolveEventCover(
  stored: PledgePageConfig | null | undefined,
  eventId: string | null,
): { coverImageUrl: string | null; coverIsFullTemplate: boolean } {
  const key = eventId ?? EVENTLESS_COVER_KEY
  const cover = stored?.eventCovers?.[key]
  if (cover) return { coverImageUrl: cover.coverImageUrl ?? null, coverIsFullTemplate: Boolean(cover.coverIsFullTemplate) }
  const hasAnyEventCover = Boolean(stored?.eventCovers && Object.keys(stored.eventCovers).length > 0)
  if (!hasAnyEventCover && stored?.coverImageUrl) {
    return { coverImageUrl: stored.coverImageUrl, coverIsFullTemplate: Boolean(stored.coverIsFullTemplate) }
  }
  return { coverImageUrl: null, coverIsFullTemplate: false }
}

/** Resolve the Contact Collector content — cover, wording, and questions —
 *  that applies to one event from the couple's raw stored collector_page
 *  config. Mirrors resolveEventCover's fallback/guard logic exactly, but
 *  across every editable field instead of just the cover:
 *
 *   - a matching eventContent entry wins outright;
 *   - if the couple has never used the per-event editor at all, fall back
 *     to the legacy top-level fields (pre-dates event scoping — don't lose
 *     a couple's existing customization the day this ships);
 *   - once they're on the per-event flow, a *different*, unconfigured event
 *     gets nothing here (all fields undefined) rather than silently
 *     inheriting another event's wording/cover/questions — the caller's
 *     resolveCollectorPage() then fills every blank from the locale's
 *     built-in defaults, same as a couple who never customized anything. */
export function resolveCollectorEventContent(
  stored: PledgePageConfig | null | undefined,
  eventId: string | null,
): CollectorEventContent {
  const key = eventId ?? EVENTLESS_COVER_KEY
  const content = stored?.eventContent?.[key]
  if (content) return content

  const hasAnyEventContent = Boolean(stored?.eventContent && Object.keys(stored.eventContent).length > 0)
  if (hasAnyEventContent) {
    return {
      headingLine2: undefined,
      intro: undefined,
      buttonLabel: undefined,
      privacyNote: undefined,
      coverImageUrl: undefined,
      coverIsFullTemplate: undefined,
      questions: undefined,
    }
  }

  return {
    headingLine2: stored?.headingLine2,
    intro: stored?.intro,
    buttonLabel: stored?.buttonLabel,
    privacyNote: stored?.privacyNote,
    coverImageUrl: stored?.coverImageUrl,
    coverIsFullTemplate: stored?.coverIsFullTemplate,
    questions: stored?.questions,
  }
}

type PledgePageTextDefaults = Pick<
  PledgePageConfig,
  'eyebrow' | 'headingLine2' | 'intro' | 'buttonLabel' | 'privacyNote'
> &
  Record<'eyebrow' | 'headingLine2' | 'intro' | 'buttonLabel' | 'privacyNote', string>

/** `{couple}` in privacyNote is replaced with the couple's name at render time. */
const PLEDGE_PAGE_TEXT_DEFAULTS: Record<Locale, PledgePageTextDefaults> = {
  en: {
    eyebrow: 'To celebrate the wedding of',
    headingLine2: 'Would Love Your Support',
    intro:
      'Pledge what you’d like to give, and by when. A date helps them plan. They’ll take care of the rest, and what you share here is seen only by them.',
    buttonLabel: 'Send my pledge',
    privacyNote: 'Your pledge goes straight to {couple}. We’ll never use your details for anything else.',
  },
  sw: {
    eyebrow: 'Kusherehekea harusi ya',
    headingLine2: 'Wangependa Msaada Wako',
    intro:
      'Ahidi utakachotoa, na utalipa lini. Tarehe inawasaidia kupanga. Wao watashughulikia mengine, na unachoshiriki hapa kinaonekana na wao pekee.',
    buttonLabel: 'Tuma ahadi yangu',
    privacyNote: 'Ahadi yako inakwenda moja kwa moja kwa {couple}. Hatutatumia taarifa zako kwa jambo lingine lolote.',
  },
}

/** Contact Collector page defaults (same shape, collector-flavoured copy). */
const COLLECTOR_PAGE_TEXT_DEFAULTS: Record<Locale, PledgePageTextDefaults> = {
  en: {
    eyebrow: 'To celebrate the wedding of',
    headingLine2: 'Would Love Your Details',
    intro:
      'Drop your contact details so they can send you the invitation and live RSVP link. Your information stays private.',
    buttonLabel: 'Send my details',
    privacyNote: 'Your details go straight to {couple}. We’ll never use them for anything else.',
  },
  sw: {
    eyebrow: 'Kusherehekea harusi ya',
    headingLine2: 'Wangependa Taarifa Zako',
    intro:
      'Weka taarifa zako za mawasiliano ili waweze kukutumia mwaliko na kiungo cha RSVP. Taarifa zako zitabaki faragha.',
    buttonLabel: 'Tuma taarifa zangu',
    privacyNote: 'Taarifa zako zinakwenda moja kwa moja kwa {couple}. Hatutazitumia kwa jambo lingine lolote.',
  },
}

/** Shared (locale-independent) defaults for the pledge page. */
const PLEDGE_PAGE_SHARED_DEFAULTS = {
  accent: '#C9A0DC',
  coverTone: 'cream' as PledgeCoverTone,
  coverImageUrl: null as string | null,
  coverIsFullTemplate: false,
  questions: [] as CollectorQuestion[],
}

/** Shared (locale-independent) defaults for the collector page. */
const COLLECTOR_PAGE_SHARED_DEFAULTS = {
  accent: '#C9A0DC',
  coverTone: 'sage' as PledgeCoverTone,
  // No default cover image — an uncustomized collector page shows a plain
  // backdrop rather than a stand-in stock photo/template the couple never
  // chose (see CollectorForm's hasCover branch).
  coverImageUrl: null as string | null,
  coverIsFullTemplate: false,
  questions: [] as CollectorQuestion[],
}

/** English defaults — kept for callers that don't care about locale (e.g. the
 *  couple's own customize editor, which always authors/previews in English). */
export const PLEDGE_PAGE_DEFAULTS = { ...PLEDGE_PAGE_TEXT_DEFAULTS.en, ...PLEDGE_PAGE_SHARED_DEFAULTS }
export const COLLECTOR_PAGE_DEFAULTS = { ...COLLECTOR_PAGE_TEXT_DEFAULTS.en, ...COLLECTOR_PAGE_SHARED_DEFAULTS }

export type ResolvedPledgePage = typeof PLEDGE_PAGE_DEFAULTS

function mergeConfig(
  config: PledgePageConfig | null | undefined,
  textDefaults: PledgePageTextDefaults,
  sharedDefaults: typeof PLEDGE_PAGE_SHARED_DEFAULTS,
): ResolvedPledgePage {
  const c = config ?? {}
  // coverImageUrl needs undefined ("never customized — use the default
  // cover") to resolve differently from an explicit null ("couple removed
  // their cover — show the plain tone"). A bare `|| default` can't tell
  // those apart, which meant clicking "Remove" on the Collector's default
  // template image silently brought the same image right back.
  const coverImageUrl =
    c.coverImageUrl === undefined ? sharedDefaults.coverImageUrl : c.coverImageUrl?.trim() || null
  const coverIsFullTemplate =
    c.coverImageUrl === undefined
      ? sharedDefaults.coverIsFullTemplate
      : coverImageUrl
        ? Boolean(c.coverIsFullTemplate)
        : false
  return {
    eyebrow: c.eyebrow?.trim() || textDefaults.eyebrow,
    headingLine2: c.headingLine2?.trim() || textDefaults.headingLine2,
    intro: c.intro?.trim() || textDefaults.intro,
    buttonLabel: c.buttonLabel?.trim() || textDefaults.buttonLabel,
    privacyNote: c.privacyNote?.trim() || textDefaults.privacyNote,
    accent: c.accent?.trim() || sharedDefaults.accent,
    coverTone: c.coverTone || sharedDefaults.coverTone,
    coverImageUrl,
    coverIsFullTemplate,
    questions: c.questions ?? sharedDefaults.questions,
  }
}

/** Merge a stored (possibly partial / null) pledge config over the locale's defaults. */
export function resolvePledgePage(
  config: PledgePageConfig | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): ResolvedPledgePage {
  return mergeConfig(config, PLEDGE_PAGE_TEXT_DEFAULTS[locale], PLEDGE_PAGE_SHARED_DEFAULTS)
}

/** Merge a stored (possibly partial / null) collector config over the locale's defaults. */
export function resolveCollectorPage(
  config: PledgePageConfig | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): ResolvedPledgePage {
  return mergeConfig(config, COLLECTOR_PAGE_TEXT_DEFAULTS[locale], COLLECTOR_PAGE_SHARED_DEFAULTS)
}

export interface CoverToneStyle {
  label: string
  base: string
  gradient: string
  ink: string
  soft: string
  rule: string
  leaf: string
}

export const COVER_TONES: Record<PledgeCoverTone, CoverToneStyle> = {
  cream: {
    label: 'Cream',
    base: '#EAE1D2',
    gradient: 'linear-gradient(135deg,#F4EEE2,#EAE1D2,#DBCDB5)',
    ink: '#42392c',
    soft: '#8a7c63',
    rule: '#9a8a6e',
    leaf: '#9aa97c',
  },
  sage: {
    label: 'Sage',
    base: '#DDE4D3',
    gradient: 'linear-gradient(135deg,#EEF2E6,#DDE4D3,#C4D0B2)',
    ink: '#37402f',
    soft: '#6f7a5c',
    rule: '#7f8a64',
    leaf: '#8fa06e',
  },
  blush: {
    label: 'Blush',
    base: '#F3DFDC',
    gradient: 'linear-gradient(135deg,#FBEDEA,#F3DFDC,#E7C6C0)',
    ink: '#4a3531',
    soft: '#9a6f68',
    rule: '#b58a82',
    leaf: '#c39a86',
  },
  lavender: {
    label: 'Lavender',
    base: '#E7DAF0',
    gradient: 'linear-gradient(135deg,#F3E9FA,#E7DAF0,#D2BEE6)',
    ink: '#3a2f44',
    soft: '#7e6b90',
    rule: '#9a86ad',
    leaf: '#b39ac4',
  },
  charcoal: {
    label: 'Charcoal',
    base: '#2C2A33',
    gradient: 'linear-gradient(135deg,#3A3742,#2C2A33,#201E26)',
    ink: '#F4F1EC',
    soft: '#C9C3D2',
    rule: '#8b8597',
    leaf: '#9aa97c',
  },
}

/** Preset accent colors offered in the editor (couple can also pick any hex). */
export const ACCENT_SWATCHES = ['#C9A0DC', '#9FE870', '#E8A0B8', '#7EC8C0', '#E8C26A', '#1A1A1A']

/** postMessage channel between the customize editor and the previewed page. */
export const PLEDGE_PREVIEW_MESSAGE = 'opuspass-pledge-preview'
export const PLEDGE_PREVIEW_READY = 'opuspass-pledge-preview-ready'

/** One "how to pay" entry: provider + account/number + (optional) account name. */
export interface PledgePaymentMethod {
  label: string
  value: string
  name?: string
}

/** Common providers offered in the editor (the couple can also type any label). */
export const PAYMENT_PROVIDERS = [
  'M-Pesa',
  'Mixx by Yas',
  'Selcom Pesa',
  'Airtel Money',
  'HaloPesa',
  'CRDB Bank',
  'NMB Bank',
  'NBC Bank',
  'Bank transfer',
  'Cash',
] as const

/** Flatten structured methods into the legacy multi-line text (reminders/fallback). */
export function paymentMethodsToText(methods: PledgePaymentMethod[] | null | undefined): string {
  return (methods ?? [])
    .filter((m) => (m.label?.trim() || m.value?.trim()))
    .map((m) => {
      const head = [m.label?.trim(), m.value?.trim()].filter(Boolean).join(': ')
      return m.name?.trim() ? `${head} (${m.name.trim()})` : head
    })
    .join('\n')
}

/** Readable text color (#1A1A1A or white) for a given accent background. */
export function accentInk(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#1A1A1A'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#1A1A1A' : '#FFFFFF'
}
