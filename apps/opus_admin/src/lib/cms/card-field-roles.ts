// The canonical field roles a digital card can expose, and how a specific
// piece of artwork maps onto them.
//
// Two separate naming systems have to meet here:
//
//   ROLE   — ours, stable, what the couple's form and the render pipeline use
//            ('guest_name', 'couple_name_1').
//   LAYER  — the designer's, whatever survived the SVG export
//            ('Bi._Fabiola_Thomas', 'couple_name_1_Image').
//
// Keeping them separate is what makes content-named layers usable without
// forcing a re-export: an admin maps 'Bi._Fabiola_Thomas' → 'guest_name' once
// per card and every order after that speaks in roles.
//
// See card-svg-fields.ts for reading the layers out of the artwork.

/**
 * How often a field's value changes — this drives how many renders an order
 * produces, so it is not cosmetic.
 *
 * 'guest'    — different on every printed card. One order of 50 guests renders
 *              50 SVGs that differ only in these fields.
 * 'order'    — the couple supplies it once; every card in the order shares it.
 * 'template' — fixed copy that belongs to the design, not the customer. Shown
 *              to the designer as editable but never asked of the couple.
 */
export type CardFieldScope = 'guest' | 'order' | 'template'

export type CardFieldRole = {
  key: string
  label: string
  scope: CardFieldScope
  /** Groups the couple's form into sections instead of one 23-field wall. */
  group: 'Hosts' | 'Couple' | 'Date' | 'Venue' | 'Contacts' | 'Design'
  /**
   * What sort of value this is. 'colour' is not cosmetic: a colour field is
   * written into the artwork as a `fill` attribute on a shape, not as text
   * content, so the renderer branches on it.
   */
  kind?: 'text' | 'date' | 'time' | 'colour'
  /** What belongs in this field, in the designer's and the couple's words. */
  hint?: string
  /** A real example, shown as the input's placeholder. */
  example?: string
}

/**
 * The reference schema, taken from the Opus Royal Ivory breakdown.
 *
 * Order matters: it's the reading order of the card, so a generated form runs
 * top-to-bottom the way the finished invitation does.
 */
export const CARD_FIELD_ROLES: CardFieldRole[] = [
  { key: 'hosts_intro', label: 'Hosts intro', scope: 'template', group: 'Hosts', hint: 'Fixed opening line above the hosts\' names. Part of the design, not asked of the couple.', example: 'Familia ya' },
  { key: 'hosts_names', label: 'Hosts names', scope: 'order', group: 'Hosts', hint: 'The parents or family hosting the wedding, as they should appear on the card.', example: 'Bw & Bi Ambukege Seeta' },
  { key: 'invite_line', label: 'Invitation line', scope: 'template', group: 'Hosts', hint: 'The "we are pleased to invite you" line. Fixed design copy.', example: 'Wanayo furaha kukualika/kuwaalika' },

  // The only per-guest field on the card. Everything else is per-order.
  { key: 'guest_name', label: 'Guest name', scope: 'guest', group: 'Hosts', hint: 'Different on every printed card. Taken from the couple\'s guest list at send time, never typed here.', example: 'Bi. Fabiola Thomas' },

  { key: 'event_intro_1', label: 'Event intro (line 1)', scope: 'template', group: 'Couple', hint: 'Fixed line introducing the occasion.', example: 'Kwenye sherehe ya' },
  { key: 'event_intro_2', label: 'Event intro (line 2)', scope: 'template', group: 'Couple', hint: 'Second fixed line describing the occasion.', example: 'Harusi ya watoto wao wapendwa' },
  { key: 'couple_name_1', label: 'Couple name 1', scope: 'order', group: 'Couple', hint: 'First partner\'s name in the large script, exactly as they want it spelled.', example: 'Moses Seeta' },
  { key: 'ampersand', label: 'Ampersand', scope: 'template', group: 'Couple', hint: 'The decorative symbol between the two names. Part of the design.', example: '&' },
  { key: 'couple_name_2', label: 'Couple name 2', scope: 'order', group: 'Couple', hint: 'Second partner\'s name in the large script, exactly as they want it spelled.', example: 'Dayness Mwandri' },

  { key: 'date_intro', label: 'Date intro', scope: 'template', group: 'Date', hint: 'Fixed lead-in before the date.', example: 'Itakayofanyika Jumamosi tarehe' },
  { key: 'date_day', label: 'Day', scope: 'order', group: 'Date', kind: 'date', hint: 'Day of the month only, as digits.', example: '08' },
  { key: 'date_month', label: 'Month', scope: 'order', group: 'Date', kind: 'date', hint: 'Month in words, matching the card\'s language.', example: 'AGOSTI' },
  { key: 'date_year', label: 'Year', scope: 'order', group: 'Date', kind: 'date', hint: 'Four-digit year.', example: '2026' },

  { key: 'venue_1_title', label: 'Ceremony title', scope: 'order', group: 'Venue', hint: 'What happens at the first venue, the ceremony.', example: 'Ibada ya Ndoa' },
  { key: 'venue_1_place', label: 'Ceremony venue', scope: 'order', group: 'Venue', hint: 'Name of the church or ceremony venue. Keep it short enough to fit one line.', example: 'KKKT Sala sala JUU' },
  { key: 'venue_1_time', label: 'Ceremony time', scope: 'order', group: 'Venue', kind: 'time', hint: 'Start time in the card\'s language, Swahili clock where used locally.', example: 'Saa 09:00 Alasiri' },
  { key: 'venue_2_title', label: 'Reception title', scope: 'order', group: 'Venue', hint: 'What happens at the second venue, usually the reception.', example: 'Sala sala M/Lami' },
  { key: 'venue_2_place', label: 'Reception venue', scope: 'order', group: 'Venue', hint: 'Reception venue, or a landmark that helps guests find it.', example: '(Kwa Mama Seeta)' },
  { key: 'venue_2_time', label: 'Reception time', scope: 'order', group: 'Venue', kind: 'time', hint: 'Reception start time.', example: 'Saa 12:00 Jioni' },

  { key: 'contact_heading', label: 'Contacts heading', scope: 'template', group: 'Contacts', hint: 'Fixed heading above the phone numbers.', example: 'MAWASILIANO' },
  { key: 'contact_1', label: 'Contact 1', scope: 'order', group: 'Contacts', hint: 'Name and phone number of the first person guests should call.', example: 'Bi. Suzan Seeta +255 755 000 850' },
  { key: 'contact_2', label: 'Contact 2', scope: 'order', group: 'Contacts', hint: 'Second contact person. Leave blank if the couple only wants one.', example: 'Anita Isaac +255 756 089 282' },

  // The five RANGI chips. A swatch is a filled shape, which makes it the one
  // thing on this card that needs no font work to become dynamic — just a
  // `fill` on a vector shape. See card-render.ts.
  { key: 'palette_1', label: 'Colour 1', scope: 'order', group: 'Design', kind: 'colour', hint: 'First colour of the wedding palette, shown as a chip under RANGI.', example: '#7A1F2B' },
  { key: 'palette_2', label: 'Colour 2', scope: 'order', group: 'Design', kind: 'colour', hint: 'Second colour of the palette.', example: '#C8A35C' },
  { key: 'palette_3', label: 'Colour 3', scope: 'order', group: 'Design', kind: 'colour', hint: 'Third colour of the palette.', example: '#A6B89A' },
  { key: 'palette_4', label: 'Colour 4', scope: 'order', group: 'Design', kind: 'colour', hint: 'Fourth colour of the palette.', example: '#F5DCE2' },
  { key: 'palette_5', label: 'Colour 5', scope: 'order', group: 'Design', kind: 'colour', hint: 'Fifth colour of the palette.', example: '#F5EFE3' },

  { key: 'palette_heading', label: 'Palette heading', scope: 'template', group: 'Design', hint: 'Fixed heading above the colour swatches.', example: 'RANGI' },
]

export const CARD_FIELD_ROLE_KEYS: readonly string[] = CARD_FIELD_ROLES.map((r) => r.key)

export function cardFieldRole(key: string): CardFieldRole | undefined {
  return CARD_FIELD_ROLES.find((r) => r.key === key)
}

/** Roles the couple is asked for, in form order. Excludes fixed template copy. */
export function customerSuppliedRoles(): CardFieldRole[] {
  return CARD_FIELD_ROLES.filter((r) => r.scope !== 'template')
}

/**
 * One card's artwork mapped onto the roles.
 *
 * `layerIds` is a list because a single role can be spread across several
 * layers — Opus Royal Ivory's date intro exports as three separate text layers
 * ('Itakayofanyika', 'Jumamosi', 'tarehe') that together read as one sentence.
 */
export type CardFieldBinding = {
  role: string
  layerIds: string[]
  /**
   * How the value is written into the artwork. Carried on the binding rather
   * than looked up from the role so the renderer stays a pure function of what
   * it is handed.
   */
  kind?: 'text' | 'colour'
  /**
   * True when those layers are embedded bitmaps rather than text, so the field
   * cannot be personalised until the artwork is re-exported. Recorded rather
   * than omitted, so the Card Designer can show *why* a field is unavailable.
   */
  rasterised?: boolean
}

/**
 * Opus Royal Ivory — the reference binding, confirmed against the live export.
 *
 * The six rasterised entries are the gold script and gold display numerals.
 * Illustrator appends '_Image' to a layer it flattens on export, which is why
 * every blocked layer here carries that suffix and no surviving text layer
 * does: the script font wasn't embeddable, so those layers became PNGs.
 *
 * They are the couple's names and the wedding date — the two things that must
 * change on every order — so this card cannot fulfil an order until it is
 * re-exported with the font embedded.
 */
export const OPUS_ROYAL_IVORY_BINDINGS: CardFieldBinding[] = [
  { role: 'hosts_intro', layerIds: ['Familia_ya'] },
  { role: 'hosts_names', layerIds: ['Bw_Bi_Ambukege_Seeta_'] },
  { role: 'invite_line', layerIds: ['invite_line-2'] },
  { role: 'guest_name', layerIds: ['Bi._Fabiola_Thomas'] },
  { role: 'event_intro_1', layerIds: ['Kwenye_sherehe_ya'] },
  { role: 'event_intro_2', layerIds: ['Harusi_ya_watoto_wao_wapendwa'] },
  { role: 'couple_name_1', layerIds: ['couple_name_1_Image'], rasterised: true },
  { role: 'ampersand', layerIds: ['ampersand_Image'], rasterised: true },
  { role: 'couple_name_2', layerIds: ['couple_name_2_Image'], rasterised: true },
  { role: 'date_intro', layerIds: ['Itakayofanyika', 'Jumamosi', 'tarehe'] },
  { role: 'date_day', layerIds: ['date_day_Image'], rasterised: true },
  { role: 'date_month', layerIds: ['date_month_Image'], rasterised: true },
  { role: 'date_year', layerIds: ['date_year_Image'], rasterised: true },
  { role: 'venue_1_title', layerIds: ['Ibada_ya_Ndoa'] },
  { role: 'venue_1_place', layerIds: ['KKKT_Sala_sala_JUU'] },
  { role: 'venue_1_time', layerIds: ['Saa_09:00_Alasiri'] },
  { role: 'venue_2_title', layerIds: ['Sala_sala_M_Lami'] },
  { role: 'venue_2_place', layerIds: ['_Kwa_Mama_Seeta_'] },
  { role: 'venue_2_time', layerIds: ['Saa_12:00_Jioni'] },
  { role: 'contact_heading', layerIds: ['MAWASILIANO_'] },
  { role: 'contact_1', layerIds: ['contact_1-2'] },
  { role: 'contact_2', layerIds: ['Anita_Isaac_255_756_089_282'] },
  { role: 'palette_heading', layerIds: ['RANGI'] },
  { role: 'palette_1', layerIds: ['palette_swatch_1_Image'], kind: 'colour', rasterised: true },
  { role: 'palette_2', layerIds: ['palette_swatch_2_Image'], kind: 'colour', rasterised: true },
  { role: 'palette_3', layerIds: ['palette_swatch_3_Image'], kind: 'colour', rasterised: true },
  { role: 'palette_4', layerIds: ['palette_swatch_4_Image'], kind: 'colour', rasterised: true },
  { role: 'palette_5', layerIds: ['palette_swatch_5_Image'], kind: 'colour', rasterised: true },
]

export type RequestableField = {
  role: CardFieldRole
  /** The artwork layers this field writes into. */
  layerIds: string[]
  /**
   * Set when the field exists on the card but can't be filled. The designer
   * sees the reason rather than the field silently missing from the form.
   */
  blockedReason?: 'rasterised' | 'unmapped'
}

/**
 * The fields a designer can ask a couple for on a specific card.
 *
 * Three exclusions, each deliberate:
 *   - 'template' scope is fixed design copy ("Familia ya"), never a question.
 *   - 'guest' scope (guest_name) differs on every printed card, so it comes
 *     from the event's guest list at render time, not from one form answer.
 *   - roles the artwork has no layer for aren't on this card at all.
 *
 * Fields bound only to bitmaps are returned WITH a reason instead of being
 * dropped, so the designer can see that the card is asking for something it
 * cannot yet display.
 */
export function requestableFields(bindings: CardFieldBinding[]): RequestableField[] {
  const byRole = new Map(bindings.map((b) => [b.role, b]))

  return CARD_FIELD_ROLES.filter((role) => role.scope === 'order')
    .map((role) => {
      const binding = byRole.get(role.key)
      if (!binding || binding.layerIds.length === 0) {
        return { role, layerIds: [], blockedReason: 'unmapped' as const }
      }
      return {
        role,
        layerIds: binding.layerIds,
        ...(binding.rasterised ? { blockedReason: 'rasterised' as const } : {}),
      }
    })
    .filter((field) => field.blockedReason !== 'unmapped')
}

export type BindingReadiness = {
  /** Roles bound to live text — fillable today. */
  ready: string[]
  /** Roles bound only to bitmaps — need the artwork re-exported. */
  blocked: string[]
  /** Roles with no layer at all in this artwork. */
  unbound: string[]
  /** False when any role the CUSTOMER supplies is blocked or unbound. */
  canFulfilOrders: boolean
}

/**
 * Whether a card can actually take an order.
 *
 * Template-scope copy being stuck is survivable — it never changes anyway. A
 * blocked 'order' or 'guest' field is not: the couple would be asked for a
 * value the designer then cannot place.
 */
export function assessBindings(bindings: CardFieldBinding[]): BindingReadiness {
  const byRole = new Map(bindings.map((b) => [b.role, b]))
  const ready: string[] = []
  const blocked: string[] = []
  const unbound: string[] = []

  for (const role of CARD_FIELD_ROLES) {
    const binding = byRole.get(role.key)
    if (!binding || binding.layerIds.length === 0) unbound.push(role.key)
    else if (binding.rasterised) blocked.push(role.key)
    else ready.push(role.key)
  }

  const customerKeys = new Set(customerSuppliedRoles().map((r) => r.key))
  const canFulfilOrders = ![...blocked, ...unbound].some((key) => customerKeys.has(key))

  return { ready, blocked, unbound, canFulfilOrders }
}
