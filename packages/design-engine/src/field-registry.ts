/**
 * OpusFesta Card Field Registry
 *
 * Layers bind to stable semantic keys (field_key / path), never to display text.
 * Source = customer/event data, Derived = computed, Template = designer static copy.
 */

function getByPath(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = data
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export type FieldKind = 'source' | 'derived' | 'template'

export type CardType = 'invitation' | 'save_the_date' | 'contribution' | 'pass'

export type RegistryEventType =
  | 'wedding'
  | 'send_off'
  | 'kitchen_party'
  | 'bridal_shower'
  | 'generic'

export type FieldGroup =
  | 'card'
  | 'host'
  | 'guest'
  | 'honoree'
  | 'couple'
  | 'content'
  | 'date'
  | 'ceremony'
  | 'reception'
  | 'venue'
  | 'dress'
  | 'rsvp'
  | 'contribution'
  | 'pass'
  | 'media'
  | 'religious'

export type FieldDataType =
  | 'string'
  | 'date'
  | 'time'
  | 'number'
  | 'color_list'
  | 'contact_list'
  | 'payment_list'
  | 'image'

export type FieldScope = 'guest' | 'order' | 'template'

export type FieldPlacement = {
  /** Vertical position as fraction of artboard height (0–1). */
  yFrac: number
  fontSize: number
  fontWeight?: number
  height?: number
  widthFrac?: number
}

export type CardFieldDef = {
  /** Stable semantic key used by the designer (also the preferred binding path). */
  key: string
  /** Nested path in the personalization data bag. */
  path: string
  label: string
  group: FieldGroup
  kind: FieldKind
  dataType: FieldDataType
  /** Guest (per recipient), Order (per event), or Template (static wording). */
  scope: FieldScope
  /** Show in the primary invitation field sheet. */
  inventory: boolean
  /** Required before guest send for invitation cards. */
  requiredForSend?: boolean
  /** Default insert placement on the artboard. */
  placement?: FieldPlacement
  /** Which card types can use this field. */
  cardTypes: CardType[] | 'all'
  /** Which event types can use this field. */
  eventTypes: RegistryEventType[] | 'all'
  sample: string
  longSample?: string
  /** Legacy delivery / mapper role. */
  role?: string
  /** Older paths that still resolve to this field. */
  aliases?: string[]
  /** Static designer wording (kind === 'template'). */
  templateText?: string
}

export const FIELD_SCOPE_LABELS: Record<FieldScope, string> = {
  guest: 'Guest',
  order: 'Order',
  template: 'Template',
}

export const CARD_TYPES: { id: CardType; label: string }[] = [
  { id: 'invitation', label: 'Invitation' },
  { id: 'save_the_date', label: 'Save the date' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'pass', label: 'Pass' },
]

export const REGISTRY_EVENT_TYPES: { id: RegistryEventType | 'all'; label: string }[] = [
  { id: 'all', label: 'All events' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'send_off', label: 'Send-Off' },
  { id: 'kitchen_party', label: 'Kitchen Party' },
  { id: 'bridal_shower', label: 'Bridal Shower' },
  { id: 'generic', label: 'Generic' },
]

export const FIELD_GROUPS: { id: FieldGroup; label: string }[] = [
  { id: 'card', label: 'Card' },
  { id: 'host', label: 'Host' },
  { id: 'guest', label: 'Guest' },
  { id: 'honoree', label: 'Honouree' },
  { id: 'couple', label: 'Couple' },
  { id: 'content', label: 'Content' },
  { id: 'date', label: 'Date & time' },
  { id: 'ceremony', label: 'Ceremony' },
  { id: 'reception', label: 'Reception' },
  { id: 'venue', label: 'Venue' },
  { id: 'dress', label: 'Dress code' },
  { id: 'rsvp', label: 'RSVP' },
  { id: 'contribution', label: 'Contribution' },
  { id: 'pass', label: 'Pass' },
  { id: 'media', label: 'Media' },
  { id: 'religious', label: 'Religious' },
]

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  source: 'Source',
  derived: 'Derived',
  template: 'Template',
}

const ALL_EVENTS: RegistryEventType[] = [
  'wedding',
  'send_off',
  'kitchen_party',
  'bridal_shower',
  'generic',
]

function defaultScope(partial: {
  kind: FieldKind
  group: FieldGroup
  scope?: FieldScope
}): FieldScope {
  if (partial.scope) return partial.scope
  if (partial.kind === 'template') return 'template'
  if (partial.group === 'guest' || partial.group === 'pass') return 'guest'
  return 'order'
}

function defaultInventory(partial: { group: FieldGroup; dataType: FieldDataType; inventory?: boolean }) {
  if (partial.inventory != null) return partial.inventory
  if (partial.dataType === 'image') return false
  return !['card', 'pass', 'media', 'contribution', 'religious'].includes(partial.group)
}

function f(
  partial: Omit<CardFieldDef, 'scope' | 'inventory'> &
    Partial<Pick<CardFieldDef, 'scope' | 'inventory' | 'requiredForSend' | 'placement'>>,
): CardFieldDef {
  return {
    ...partial,
    scope: defaultScope(partial),
    inventory: defaultInventory(partial),
  }
}

/** Master registry — visual design binds to these keys, not free-form labels. */
export const CARD_FIELD_REGISTRY: CardFieldDef[] = [
  // —— Card ——
  f({
    key: 'card_type',
    path: 'card.card_type',
    label: 'Card type',
    group: 'card',
    kind: 'source',
    dataType: 'string',
    cardTypes: 'all',
    eventTypes: 'all',
    sample: 'invitation',
  }),
  f({
    key: 'event_type',
    path: 'card.event_type',
    label: 'Event type',
    group: 'card',
    kind: 'source',
    dataType: 'string',
    cardTypes: 'all',
    eventTypes: 'all',
    sample: 'wedding',
  }),
  f({
    key: 'language',
    path: 'card.language',
    label: 'Language',
    group: 'card',
    kind: 'source',
    dataType: 'string',
    cardTypes: 'all',
    eventTypes: 'all',
    sample: 'en',
  }),
  f({
    key: 'invitation_title',
    path: 'card.invitation_title',
    label: 'Invitation title',
    group: 'card',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'Wedding Invitation',
    longSample: 'Mwaliko wa Kitchen Party',
  }),
  f({
    key: 'card_title',
    path: 'card.card_title',
    label: 'Card title',
    group: 'card',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['save_the_date', 'contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'Save The Date',
    longSample: 'Mchango wa Kitchen Party',
  }),

  // —— Host ——
  f({
    key: 'host_intro',
    path: 'host.intro',
    label: 'Host intro',
    group: 'host',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'contribution', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: 'The family of',
    longSample: 'Familia ya',
    role: 'hosts_intro',
    aliases: ['hosts.intro'],
    requiredForSend: true,
    placement: { yFrac: 0.12, fontSize: 26, fontWeight: 400, height: 44 },
  }),
  f({
    key: 'host_names',
    path: 'host.names',
    label: 'Host names',
    group: 'host',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'contribution', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: 'Mr & Mrs Emmanuel Mrema',
    longSample: 'Mr. & Mrs. Mwijarwa',
    role: 'hosts_names',
    aliases: ['host.name', 'hosts.names'],
    requiredForSend: true,
    placement: { yFrac: 0.16, fontSize: 28, fontWeight: 500, height: 48 },
  }),
  f({
    key: 'host_location',
    path: 'host.location',
    label: 'Host location',
    group: 'host',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['kitchen_party', 'bridal_shower', 'generic'],
    sample: 'Bunju B - Sokoni',
  }),

  // —— Guest ——
  f({
    key: 'guest_title',
    path: 'guest.title',
    label: 'Guest title',
    group: 'guest',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'contribution', 'pass'],
    eventTypes: ALL_EVENTS,
    sample: 'Mr & Mrs',
    role: 'guest_title',
  }),
  f({
    key: 'guest_name',
    path: 'guest.full_name',
    label: 'Guest name',
    group: 'guest',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'contribution', 'pass', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: 'Mr & Mrs Praygod Mangi',
    longSample: 'Prof. Dr. Emmanuel Christopher Mwakyusa & Family',
    role: 'guest_name',
    aliases: ['guest.guest_name', 'guest.display_name'],
    requiredForSend: true,
    placement: { yFrac: 0.24, fontSize: 44, fontWeight: 600, height: 80 },
  }),

  // —— Honoree ——
  f({
    key: 'honoree_name',
    path: 'honoree.name',
    label: 'Honouree name',
    group: 'honoree',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date', 'contribution'],
    eventTypes: ['send_off', 'kitchen_party', 'bridal_shower', 'generic'],
    sample: 'Dorice Mwihava',
    longSample: 'Dr. Esther John',
    role: 'honoree_name',
  }),
  f({
    key: 'honoree_first_name',
    path: 'honoree.first_name',
    label: 'Honouree first name',
    group: 'honoree',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ['bridal_shower', 'send_off', 'kitchen_party'],
    sample: 'Sophia',
  }),
  f({
    key: 'honoree_photo',
    path: 'honoree.photo',
    label: 'Honouree photo',
    group: 'media',
    kind: 'source',
    dataType: 'image',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ['bridal_shower', 'send_off'],
    sample: '',
  }),

  // —— Couple ——
  f({
    key: 'couple_display_name',
    path: 'couple.display_names',
    label: 'Couple display name',
    group: 'couple',
    kind: 'derived',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date', 'pass', 'contribution'],
    eventTypes: ['wedding', 'generic'],
    sample: 'Joseph & Noela',
    longSample: 'Joseph Mrema & Noela Riwia',
    role: 'couple_names',
    requiredForSend: true,
    placement: { yFrac: 0.38, fontSize: 56, fontWeight: 600, height: 90 },
  }),
  f({
    key: 'groom_first_name',
    path: 'couple.groom_first_name',
    label: 'Groom first name',
    group: 'couple',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date', 'pass'],
    eventTypes: ['wedding', 'generic'],
    sample: 'Joseph',
    role: 'groom_name',
    aliases: ['couple.groom_name'],
    placement: { yFrac: 0.36, fontSize: 42, fontWeight: 600, height: 64 },
  }),
  f({
    key: 'bride_first_name',
    path: 'couple.bride_first_name',
    label: 'Bride first name',
    group: 'couple',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date', 'pass'],
    eventTypes: ['wedding', 'bridal_shower', 'kitchen_party', 'generic'],
    sample: 'Noela',
    role: 'bride_name',
    aliases: ['couple.bride_name'],
    placement: { yFrac: 0.42, fontSize: 42, fontWeight: 600, height: 64 },
  }),
  f({
    key: 'groom_last_name',
    path: 'couple.groom_last_name',
    label: 'Groom last name',
    group: 'couple',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ['wedding'],
    sample: 'Mrema',
    inventory: false,
  }),
  f({
    key: 'bride_last_name',
    path: 'couple.bride_last_name',
    label: 'Bride last name',
    group: 'couple',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ['wedding'],
    sample: 'Riwia',
    inventory: false,
  }),

  // —— Content / template phrases ——
  f({
    key: 'invitation_phrase',
    path: 'content.invitation_phrase',
    label: 'Invitation phrase',
    group: 'content',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'cordially invites',
    templateText: 'cordially invites',
    longSample: 'wanayo furaha kukualika',
  }),
  f({
    key: 'event_intro',
    path: 'content.event_intro',
    label: 'Event intro',
    group: 'content',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: 'to the wedding ceremony of their beloved children',
    templateText: 'to the wedding ceremony of their beloved children',
    longSample: 'kwenye sherehe ya Send-Off ya binti yao mpendwa',
  }),
  f({
    key: 'message',
    path: 'content.message',
    label: 'Message',
    group: 'content',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['save_the_date', 'contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'We will be more than happy to see you',
  }),
  f({
    key: 'closing_message',
    path: 'content.closing_message',
    label: 'Closing message',
    group: 'content',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['contribution', 'invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'Asante sana na Mungu Akubariki!',
    templateText: 'Asante sana na Mungu Akubariki!',
  }),

  // —— Date ——
  f({
    key: 'event_date',
    path: 'event.date',
    label: 'Event date',
    group: 'date',
    kind: 'source',
    dataType: 'date',
    cardTypes: 'all',
    eventTypes: ALL_EVENTS,
    sample: '08 August 2026',
    role: 'event_date',
    requiredForSend: true,
    placement: { yFrac: 0.5, fontSize: 28, fontWeight: 500, height: 48 },
  }),
  f({
    key: 'event_day',
    path: 'event.day',
    label: 'Event day',
    group: 'date',
    kind: 'source',
    dataType: 'string',
    cardTypes: 'all',
    eventTypes: ALL_EVENTS,
    sample: 'Saturday',
    longSample: 'Jumamosi',
  }),
  f({
    key: 'event_time',
    path: 'event.time',
    label: 'Event time',
    group: 'date',
    kind: 'source',
    dataType: 'time',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: '2:00 PM',
    longSample: '12:00 jioni',
  }),
  f({
    key: 'formatted_event_date',
    path: 'event.formatted_date',
    label: 'Formatted event date',
    group: 'date',
    kind: 'derived',
    dataType: 'string',
    cardTypes: 'all',
    eventTypes: ALL_EVENTS,
    sample: 'Saturday, 08 August 2026',
  }),

  // —— Ceremony ——
  f({
    key: 'ceremony_label',
    path: 'ceremony.label',
    label: 'Ceremony label',
    group: 'ceremony',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding'],
    sample: 'Service At',
    templateText: 'Service At',
  }),
  f({
    key: 'ceremony_venue',
    path: 'ceremony.venue',
    label: 'Ceremony venue',
    group: 'ceremony',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'pass'],
    eventTypes: ['wedding', 'generic'],
    sample: 'St. Joseph Cathedral',
    role: 'church',
    aliases: ['event.church'],
    requiredForSend: true,
    placement: { yFrac: 0.56, fontSize: 22, fontWeight: 400, height: 40 },
  }),
  f({
    key: 'ceremony_time',
    path: 'ceremony.time',
    label: 'Ceremony time',
    group: 'ceremony',
    kind: 'source',
    dataType: 'time',
    cardTypes: ['invitation'],
    eventTypes: ['wedding'],
    sample: '2:00 PM',
  }),
  f({
    key: 'ceremony_address',
    path: 'ceremony.address',
    label: 'Ceremony address',
    group: 'ceremony',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding'],
    sample: '',
  }),

  // —— Reception ——
  f({
    key: 'reception_label',
    path: 'reception.label',
    label: 'Reception label',
    group: 'reception',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding'],
    sample: 'Reception to follow',
    templateText: 'Reception to follow',
  }),
  f({
    key: 'reception_venue',
    path: 'reception.venue',
    label: 'Reception venue',
    group: 'reception',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding', 'generic'],
    sample: 'Hall 361',
    role: 'venue',
    aliases: ['event.venue'],
    requiredForSend: true,
    placement: { yFrac: 0.6, fontSize: 22, fontWeight: 400, height: 40 },
  }),
  f({
    key: 'reception_location',
    path: 'reception.location',
    label: 'Reception location',
    group: 'reception',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding'],
    sample: 'Mwenge JKT',
  }),
  f({
    key: 'reception_time',
    path: 'reception.time',
    label: 'Reception time',
    group: 'reception',
    kind: 'source',
    dataType: 'time',
    cardTypes: ['invitation'],
    eventTypes: ['wedding'],
    sample: '6:00 PM',
  }),
  f({
    key: 'formatted_venue',
    path: 'venue.formatted',
    label: 'Formatted venue',
    group: 'venue',
    kind: 'derived',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: 'Hall 361 – Mwenge JKT',
  }),

  // —— Venue (generic / send-off / kitchen / shower) ——
  f({
    key: 'venue_name',
    path: 'venue.name',
    label: 'Venue name',
    group: 'venue',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ALL_EVENTS,
    sample: 'Mlimani City Hall',
    aliases: ['event.venue'],
  }),
  f({
    key: 'venue_address',
    path: 'venue.address',
    label: 'Venue address',
    group: 'venue',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ['kitchen_party', 'bridal_shower', 'send_off', 'generic'],
    sample: 'Mtaa wa Zion, Nyumba No.4',
  }),
  f({
    key: 'venue_city',
    path: 'venue.city',
    label: 'Venue city',
    group: 'venue',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'save_the_date', 'contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'Dar es Salaam',
  }),

  // —— Dress ——
  f({
    key: 'dress_code_label',
    path: 'dress.label',
    label: 'Dress code label',
    group: 'dress',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'Dress Code',
    templateText: 'Dress Code',
    longSample: 'Rangi za Sherehe',
  }),
  f({
    key: 'dress_code_text',
    path: 'dress.text',
    label: 'Dress code text',
    group: 'dress',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'Orange, Peach, Beige & Brown',
  }),
  f({
    key: 'dress_code_colors',
    path: 'dress.colors_line',
    label: 'Dress code colours',
    group: 'dress',
    kind: 'derived',
    dataType: 'color_list',
    cardTypes: ['invitation'],
    eventTypes: ALL_EVENTS,
    sample: '#C45C26, #F5C6A5, #F5E6D3, #8B5E3C',
  }),

  // —— RSVP ——
  f({
    key: 'rsvp_label',
    path: 'rsvp.label',
    label: 'RSVP label',
    group: 'rsvp',
    kind: 'template',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'RSVP To',
    templateText: 'RSVP To',
    longSample: 'Mawasiliano',
    placement: { yFrac: 0.72, fontSize: 16, fontWeight: 400, height: 28 },
  }),
  f({
    key: 'contact_1',
    path: 'rsvp.contact_1',
    label: 'Contact 1',
    group: 'rsvp',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'contribution'],
    eventTypes: ALL_EVENTS,
    sample: '+255 700 000 000',
    role: 'contact_1',
    requiredForSend: true,
    placement: { yFrac: 0.76, fontSize: 22, fontWeight: 500, height: 36 },
  }),
  f({
    key: 'contact_2',
    path: 'rsvp.contact_2',
    label: 'Contact 2',
    group: 'rsvp',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation', 'contribution'],
    eventTypes: ALL_EVENTS,
    sample: '+255 700 000 111',
    role: 'contact_2',
    placement: { yFrac: 0.8, fontSize: 22, fontWeight: 500, height: 36 },
  }),
  f({
    key: 'rsvp_contacts_line',
    path: 'rsvp.contacts_line',
    label: 'RSVP contacts (combined)',
    group: 'rsvp',
    kind: 'derived',
    dataType: 'contact_list',
    cardTypes: ['invitation', 'contribution'],
    eventTypes: ALL_EVENTS,
    sample: '+255 700 000 000 · +255 700 000 111',
    role: 'contact_phone',
    aliases: ['contact.phone'],
    inventory: false,
  }),

  // —— Contribution ——
  f({
    key: 'contribution_intro',
    path: 'contribution.intro',
    label: 'Contribution intro',
    group: 'contribution',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'Kuwa tunatarajia kufanya...',
  }),
  f({
    key: 'contribution_message',
    path: 'contribution.message',
    label: 'Contribution message',
    group: 'contribution',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'Uwepo wako ni wa muhimu sana...',
  }),
  f({
    key: 'minimum_contribution',
    path: 'contribution.minimum',
    label: 'Minimum contribution',
    group: 'contribution',
    kind: 'source',
    dataType: 'number',
    cardTypes: ['contribution'],
    eventTypes: ALL_EVENTS,
    sample: '100000',
  }),
  f({
    key: 'currency',
    path: 'contribution.currency',
    label: 'Currency',
    group: 'contribution',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'TZS',
  }),
  f({
    key: 'payment_methods_line',
    path: 'contribution.payment_methods_line',
    label: 'Payment methods',
    group: 'contribution',
    kind: 'derived',
    dataType: 'payment_list',
    cardTypes: ['contribution'],
    eventTypes: ALL_EVENTS,
    sample: 'Airtel Money 0700 000 111 · Beatrice Matillya',
  }),

  // —— Pass ——
  f({
    key: 'ticket_type',
    path: 'guest.ticket_type',
    label: 'Ticket type',
    group: 'pass',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['pass', 'invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'double',
    role: 'ticket_type',
  }),
  f({
    key: 'ticket_label',
    path: 'guest.ticket_label',
    label: 'Ticket label',
    group: 'pass',
    kind: 'derived',
    dataType: 'string',
    cardTypes: ['pass', 'invitation'],
    eventTypes: ALL_EVENTS,
    sample: 'DOUBLE',
  }),
  f({
    key: 'pass_id',
    path: 'guest.pass_id',
    label: 'Pass ID',
    group: 'pass',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['pass'],
    eventTypes: ALL_EVENTS,
    sample: 'MS26-K7DP-Q4',
    role: 'pass_id',
  }),
  f({
    key: 'qr_code',
    path: 'guest.admission_token',
    label: 'QR / admission token',
    group: 'pass',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['pass'],
    eventTypes: ALL_EVENTS,
    sample: 'opuspass:admission:preview',
    role: 'admission_qr',
  }),

  // —— Media ——
  f({
    key: 'primary_photo',
    path: 'media.primary_photo',
    label: 'Primary photo',
    group: 'media',
    kind: 'source',
    dataType: 'image',
    cardTypes: ['save_the_date', 'invitation'],
    eventTypes: ALL_EVENTS,
    sample: '',
  }),
  f({
    key: 'couple_photo',
    path: 'media.couple_photo',
    label: 'Couple photo',
    group: 'media',
    kind: 'source',
    dataType: 'image',
    cardTypes: ['invitation', 'save_the_date'],
    eventTypes: ['wedding'],
    sample: '',
  }),

  // —— Religious ——
  f({
    key: 'bible_verse_reference',
    path: 'religious.verse_reference',
    label: 'Bible verse reference',
    group: 'religious',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding', 'generic'],
    sample: '3 John 1:2',
  }),
  f({
    key: 'bible_verse_text',
    path: 'religious.verse_text',
    label: 'Bible verse text',
    group: 'religious',
    kind: 'source',
    dataType: 'string',
    cardTypes: ['invitation'],
    eventTypes: ['wedding', 'generic'],
    sample: 'Beloved, I pray that you may prosper in all things...',
  }),
]

export function getFieldByKey(key: string): CardFieldDef | undefined {
  return CARD_FIELD_REGISTRY.find((f) => f.key === key || f.path === key || f.aliases?.includes(key))
}

export function filterCardFields(opts: {
  cardType?: CardType | 'all'
  eventType?: RegistryEventType | 'all'
  kind?: FieldKind | 'all'
  query?: string
}): CardFieldDef[] {
  const q = opts.query?.trim().toLowerCase() ?? ''
  return CARD_FIELD_REGISTRY.filter((field) => {
    if (opts.cardType && opts.cardType !== 'all') {
      if (field.cardTypes !== 'all' && !field.cardTypes.includes(opts.cardType)) return false
    }
    if (opts.eventType && opts.eventType !== 'all') {
      if (field.eventTypes !== 'all' && !field.eventTypes.includes(opts.eventType)) return false
    }
    if (opts.kind && opts.kind !== 'all' && field.kind !== opts.kind) return false
    if (!q) return true
    return (
      field.key.toLowerCase().includes(q) ||
      field.label.toLowerCase().includes(q) ||
      field.path.toLowerCase().includes(q) ||
      (field.role?.toLowerCase().includes(q) ?? false)
    )
  })
}

function asString(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === 'string') return v
        if (v && typeof v === 'object') {
          const row = v as Record<string, unknown>
          if (row.provider && row.account_number) {
            return `${row.provider} ${row.account_number}${row.account_name ? ` · ${row.account_name}` : ''}`
          }
          if (row.name && row.phone) return `${row.name} ${row.phone}`
          if (row.phone) return String(row.phone)
        }
        return String(v)
      })
      .filter(Boolean)
      .join(' · ')
  }
  return String(value)
}

/** Resolve a semantic field against a data bag (source + derived). */
export function resolveCardField(
  data: Record<string, unknown>,
  keyOrPath: string,
): string {
  const field = getFieldByKey(keyOrPath)

  if (field?.kind === 'template') {
    const override = asString(getByPath(data, field.path))
    return override || field.templateText || field.sample
  }

  if (field?.kind === 'derived') {
    if (field.key === 'couple_display_name') {
      const existing = asString(getByPath(data, field.path))
      if (existing) return existing
      const groom =
        asString(getByPath(data, 'couple.groom_first_name')) ||
        asString(getByPath(data, 'couple.groom_name'))
      const bride =
        asString(getByPath(data, 'couple.bride_first_name')) ||
        asString(getByPath(data, 'couple.bride_name'))
      if (groom && bride) return `${groom} & ${bride}`
      return existing || field.sample
    }
    if (field.key === 'formatted_event_date') {
      const existing = asString(getByPath(data, field.path))
      if (existing) return existing
      const day = asString(getByPath(data, 'event.day'))
      const date = asString(getByPath(data, 'event.date'))
      if (day && date) return `${day}, ${date}`
      return date || field.sample
    }
    if (field.key === 'formatted_venue') {
      const existing = asString(getByPath(data, field.path))
      if (existing) return existing
      const venue =
        asString(getByPath(data, 'reception.venue')) ||
        asString(getByPath(data, 'venue.name')) ||
        asString(getByPath(data, 'event.venue'))
      const loc =
        asString(getByPath(data, 'reception.location')) ||
        asString(getByPath(data, 'venue.city'))
      if (venue && loc) return `${venue} – ${loc}`
      return venue || field.sample
    }
    if (field.key === 'dress_code_colors') {
      const line = asString(getByPath(data, 'dress.colors_line'))
      if (line) return line
      return asString(getByPath(data, 'dress.colors')) || field.sample
    }
    if (field.key === 'rsvp_contacts_line') {
      const line = asString(getByPath(data, 'rsvp.contacts_line'))
      if (line) return line
      const contacts = getByPath(data, 'rsvp.contacts')
      if (contacts) return asString(contacts)
      return asString(getByPath(data, 'contact.phone')) || field.sample
    }
    if (field.key === 'payment_methods_line') {
      const line = asString(getByPath(data, 'contribution.payment_methods_line'))
      if (line) return line
      return asString(getByPath(data, 'contribution.payment_methods')) || field.sample
    }
    if (field.key === 'ticket_label') {
      const existing = asString(getByPath(data, field.path))
      if (existing) return existing
      const type = asString(getByPath(data, 'guest.ticket_type'))
      return type ? type.toUpperCase() : field.sample
    }
  }

  if (field) {
    const direct = asString(getByPath(data, field.path))
    if (direct) return direct
    for (const alias of field.aliases ?? []) {
      const via = asString(getByPath(data, alias))
      if (via) return via
    }
    return field.sample
  }

  return asString(getByPath(data, keyOrPath))
}

/** Enrich a data bag with derived values so compile/personalize stay path-based. */
export function enrichCardData(data: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(data)

  const setPath = (path: string, value: string) => {
    const parts = path.split('.')
    let cur: Record<string, unknown> = next
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!
      const child = cur[part]
      if (!child || typeof child !== 'object') cur[part] = {}
      cur = cur[part] as Record<string, unknown>
    }
    cur[parts[parts.length - 1]!] = value
  }

  for (const field of CARD_FIELD_REGISTRY.filter((x) => x.kind === 'derived')) {
    setPath(field.path, resolveCardField(next, field.key))
  }

  // Keep legacy couple.* names filled for older bindings.
  const groomFirst = asString(getByPath(next, 'couple.groom_first_name'))
  const brideFirst = asString(getByPath(next, 'couple.bride_first_name'))
  if (groomFirst && !asString(getByPath(next, 'couple.groom_name'))) {
    setPath('couple.groom_name', groomFirst)
  }
  if (brideFirst && !asString(getByPath(next, 'couple.bride_name'))) {
    setPath('couple.bride_name', brideFirst)
  }

  return next
}

/** Rich example bag matching the master schema (plus legacy nested keys). */
export function createRegistrySampleData(): Record<string, unknown> {
  return {
    card: {
      card_type: 'invitation',
      event_type: 'wedding',
      language: 'en',
      invitation_title: 'Wedding Invitation',
      card_title: 'Save The Date',
    },
    host: {
      intro: 'The family of',
      names: 'Mr & Mrs Emmanuel Mrema',
      location: 'Bunju B - Sokoni',
    },
    guest: {
      title: 'Mr & Mrs',
      full_name: 'Mr & Mrs Praygod Mangi',
      display_name: 'Mr & Mrs Praygod Mangi',
      ticket_type: 'double',
      ticket_label: 'DOUBLE',
      pass_id: 'MS26-K7DP-Q4',
      admission_token: 'opuspass:admission:example',
    },
    honoree: {
      name: 'Dorice Mwihava',
      first_name: 'Sophia',
      photo: '',
    },
    couple: {
      groom_first_name: 'Joseph',
      groom_last_name: 'Mrema',
      bride_first_name: 'Noela',
      bride_last_name: 'Riwia',
      groom_name: 'Joseph',
      bride_name: 'Noela',
      display_names: 'Joseph & Noela',
    },
    content: {
      invitation_phrase: 'cordially invites',
      event_intro: 'to the wedding ceremony of their beloved children',
      message: 'We will be more than happy to see you',
      closing_message: 'Asante sana na Mungu Akubariki!',
    },
    event: {
      date: '08 August 2026',
      day: 'Saturday',
      time: '2:00 PM',
      venue: 'Sala Sala',
      church: 'St. Joseph Cathedral',
      formatted_date: 'Saturday, 08 August 2026',
    },
    ceremony: {
      label: 'Service At',
      venue: 'St. Joseph Cathedral',
      time: '2:00 PM',
      address: '',
    },
    reception: {
      label: 'Reception to follow',
      venue: 'Hall 361',
      location: 'Mwenge JKT',
      time: '6:00 PM',
    },
    venue: {
      name: 'Mlimani City Hall',
      address: 'Mtaa wa Zion, Nyumba No.4',
      city: 'Dar es Salaam',
      formatted: 'Hall 361 – Mwenge JKT',
    },
    dress: {
      label: 'Dress Code',
      text: 'Orange, Peach, Beige & Brown',
      colors: ['#C45C26', '#F5C6A5', '#F5E6D3', '#8B5E3C'],
      colors_line: '#C45C26, #F5C6A5, #F5E6D3, #8B5E3C',
    },
    rsvp: {
      label: 'RSVP To',
      status: 'pending',
      contact_1: '+255 700 000 000',
      contact_2: '+255 700 000 111',
      contacts: [
        { name: 'Mama', phone: '+255 700 000 000' },
        { name: 'Baba', phone: '+255 700 000 111' },
      ],
      contacts_line: 'Mama +255 700 000 000 · Baba +255 700 000 111',
    },
    contact: { phone: '+255 700 000 000' },
    contribution: {
      intro: 'Kuwa tunatarajia kufanya kitchen party...',
      message: 'Uwepo wako ni wa muhimu sana kwa mafanikio ya sherehe hii.',
      minimum: 100000,
      currency: 'TZS',
      payment_methods: [
        {
          provider: 'Airtel Money',
          account_number: '0700 000 111',
          account_name: 'Beatrice Matillya',
          account_type: 'mobile_money',
        },
        {
          provider: 'NBC',
          account_number: '013456789',
          account_name: 'Beatrice Matillya',
          account_type: 'bank',
        },
      ],
      payment_methods_line:
        'Airtel Money 0700 000 111 · Beatrice Matillya · NBC 013456789 · Beatrice Matillya',
    },
    media: {
      primary_photo: '',
      couple_photo: '',
    },
    religious: {
      verse_reference: '3 John 1:2',
      verse_text: 'Beloved, I pray that you may prosper in all things and be in health...',
    },
  }
}

/** Primary invitation field sheet (excludes pass/QR, buried legacy contacts). */
export function inventoryFields(opts: {
  cardType?: CardType | 'all'
  eventType?: RegistryEventType | 'all'
  query?: string
  includePass?: boolean
}): CardFieldDef[] {
  const base = filterCardFields({
    cardType: opts.cardType,
    eventType: opts.eventType,
    query: opts.query,
  }).filter((f) => f.inventory || (opts.includePass && f.group === 'pass'))
  return base
}

export function fieldMatchesBinding(
  field: CardFieldDef,
  path: string | null | undefined,
  role?: string | null,
): boolean {
  if (!path && !role) return false
  if (path && (path === field.path || path === field.key || field.aliases?.includes(path))) {
    return true
  }
  if (role && (role === field.role || role === field.key)) return true
  return false
}

export function findLayersForField(
  elements: { id: string; type: string; binding?: { type?: string; path?: string | null; role?: string | null } | null }[],
  field: CardFieldDef,
): string[] {
  return elements
    .filter(
      (el) =>
        el.type === 'text' &&
        el.binding?.type === 'variable' &&
        fieldMatchesBinding(field, el.binding.path, el.binding.role),
    )
    .map((el) => el.id)
}

export function placementForField(
  field: CardFieldDef,
  page: { width: number; height: number },
): { x: number; y: number; width: number; height: number; fontSize: number; fontWeight: number } {
  const p = field.placement ?? {
    yFrac: 0.35,
    fontSize: 28,
    fontWeight: 500,
    height: 56,
    widthFrac: 0.8,
  }
  const widthFrac = p.widthFrac ?? 0.8
  const width = Math.round(page.width * widthFrac)
  const height = p.height ?? Math.max(40, Math.round(p.fontSize * 1.5))
  return {
    x: Math.round((page.width - width) / 2),
    y: Math.round(page.height * p.yFrac),
    width,
    height,
    fontSize: p.fontSize,
    fontWeight: p.fontWeight ?? 500,
  }
}

export type CoverageItem = {
  field: CardFieldDef
  bound: boolean
  layerIds: string[]
}

/** Ready-for-send checklist based on required invitation roles. */
export function coverageChecklist(
  elements: { id: string; type: string; binding?: { type?: string; path?: string | null; role?: string | null } | null }[],
  opts?: { cardType?: CardType | 'all'; eventType?: RegistryEventType | 'all' },
): CoverageItem[] {
  const required = inventoryFields({
    cardType: opts?.cardType ?? 'invitation',
    eventType: opts?.eventType ?? 'all',
  }).filter((f) => f.requiredForSend)
  return required.map((field) => {
    const layerIds = findLayersForField(elements, field)
    return { field, bound: layerIds.length > 0, layerIds }
  })
}

/** Deep-set a dotted path on a data bag (for live sample edits). */
export function setDataPath(
  data: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(data)
  const parts = path.split('.')
  let cur: Record<string, unknown> = next
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (!cur[part] || typeof cur[part] !== 'object') cur[part] = {}
    cur = cur[part] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
  return next
}
