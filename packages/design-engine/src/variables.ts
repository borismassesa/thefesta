/** Dynamic field catalogue for Insert → Dynamic Field. */

export type VariableCategory =
  | 'event'
  | 'couple'
  | 'client'
  | 'guest'
  | 'entrance'
  | 'rsvp'
  | 'contact'
  | 'custom'

export type VariableField = {
  path: string
  role: string
  label: string
  category: VariableCategory
  sample: string
  longSample?: string
  shortSample?: string
}

export const VARIABLE_FIELDS: VariableField[] = [
  {
    path: 'couple.groom_name',
    role: 'groom_name',
    label: 'Groom name',
    category: 'couple',
    sample: 'Moses',
  },
  {
    path: 'couple.bride_name',
    role: 'bride_name',
    label: 'Bride name',
    category: 'couple',
    sample: 'Dayness',
  },
  {
    path: 'couple.display_names',
    role: 'couple_names',
    label: 'Couple names',
    category: 'couple',
    sample: 'Moses & Dayness',
  },
  {
    path: 'event.date',
    role: 'event_date',
    label: 'Event date',
    category: 'event',
    sample: '08 August 2026',
  },
  {
    path: 'event.venue',
    role: 'venue',
    label: 'Venue',
    category: 'event',
    sample: 'Sala Sala',
  },
  {
    path: 'event.church',
    role: 'church',
    label: 'Church',
    category: 'event',
    sample: 'St. Joseph Cathedral',
  },
  {
    path: 'guest.full_name',
    role: 'guest_name',
    label: 'Guest full name',
    category: 'guest',
    sample: 'Mr & Mrs Ngando',
    shortSample: 'Amina',
    longSample: 'Prof. Dr. Emmanuel Christopher Mwakyusa & Family',
  },
  {
    path: 'guest.display_name',
    role: 'guest_name',
    label: 'Guest display name',
    category: 'guest',
    sample: 'Mr & Mrs Ngando',
    longSample: 'Prof. Dr. Emmanuel Christopher Mwakyusa & Family',
  },
  {
    path: 'guest.title',
    role: 'guest_title',
    label: 'Guest title',
    category: 'guest',
    sample: 'Mr & Mrs',
  },
  {
    path: 'guest.ticket_type',
    role: 'ticket_type',
    label: 'Ticket type',
    category: 'guest',
    sample: 'Single Entry',
  },
  {
    path: 'guest.pass_id',
    role: 'pass_id',
    label: 'Pass ID',
    category: 'entrance',
    sample: 'MS26-K7DP-Q4',
  },
  {
    path: 'guest.admission_token',
    role: 'admission_qr',
    label: 'Admission token (QR)',
    category: 'entrance',
    sample: 'opuspass:admission:preview',
  },
  {
    path: 'rsvp.status',
    role: 'rsvp_status',
    label: 'RSVP status',
    category: 'rsvp',
    sample: 'Accepted',
  },
  {
    path: 'contact.phone',
    role: 'contact_phone',
    label: 'Contact phone',
    category: 'contact',
    sample: '+255 700 000 000',
  },
]

export const VARIABLE_CATEGORIES: { id: VariableCategory; label: string }[] = [
  { id: 'event', label: 'Event' },
  { id: 'couple', label: 'Couple' },
  { id: 'client', label: 'Client' },
  { id: 'guest', label: 'Guest' },
  { id: 'entrance', label: 'Entrance Pass' },
  { id: 'rsvp', label: 'RSVP' },
  { id: 'contact', label: 'Contact' },
  { id: 'custom', label: 'Custom Fields' },
]

export function fieldsForCategory(category: VariableCategory): VariableField[] {
  return VARIABLE_FIELDS.filter((f) => f.category === category)
}

export function getVariableByPath(path: string): VariableField | undefined {
  return VARIABLE_FIELDS.find((f) => f.path === path)
}

import {
  createRegistrySampleData,
  enrichCardData,
  resolveCardField,
} from './field-registry'

/** Resolve `{{path}}` tokens and plain content against a data bag. */
export function resolveTemplateString(
  content: string,
  data: Record<string, unknown>,
): string {
  const enriched = enrichCardData(data)
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const resolved = resolveCardField(enriched, path)
    return resolved
  })
}

export function getByPath(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = data
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export type TestDataPreset = {
  key: string
  label: string
  data: Record<string, unknown>
}

export const TEST_DATA_PRESETS: TestDataPreset[] = [
  {
    key: 'example',
    label: 'Example guest',
    data: enrichCardData({
      ...createRegistrySampleData(),
      guest: {
        ...((createRegistrySampleData().guest as Record<string, unknown>) ?? {}),
        full_name: 'Mr & Mrs Ngando',
        display_name: 'Mr & Mrs Ngando',
        title: 'Mr & Mrs',
        ticket_type: 'single',
      },
    }),
  },
  {
    key: 'longest',
    label: 'Longest guest name',
    data: enrichCardData({
      ...createRegistrySampleData(),
      guest: {
        ...((createRegistrySampleData().guest as Record<string, unknown>) ?? {}),
        full_name: 'Prof. Dr. Emmanuel Christopher Mwakyusa & Family',
        display_name: 'Prof. Dr. Emmanuel Christopher Mwakyusa & Family',
        title: 'Prof. Dr.',
        ticket_type: 'double',
      },
      event: {
        ...((createRegistrySampleData().event as Record<string, unknown>) ?? {}),
        venue: 'Sala Sala Gardens & Conference Centre',
      },
    }),
  },
  {
    key: 'shortest',
    label: 'Shortest guest name',
    data: enrichCardData({
      ...createRegistrySampleData(),
      guest: {
        ...((createRegistrySampleData().guest as Record<string, unknown>) ?? {}),
        full_name: 'Jo',
        display_name: 'Jo',
        title: '',
        ticket_type: 'single',
      },
    }),
  },
  {
    key: 'single',
    label: 'Single entry',
    data: enrichCardData({
      ...createRegistrySampleData(),
      guest: {
        ...((createRegistrySampleData().guest as Record<string, unknown>) ?? {}),
        full_name: 'Mama Mwakugile',
        display_name: 'Mama Mwakugile',
        title: 'Mama',
        ticket_type: 'single',
      },
    }),
  },
  {
    key: 'double',
    label: 'Double entry',
    data: enrichCardData({
      ...createRegistrySampleData(),
      guest: {
        ...((createRegistrySampleData().guest as Record<string, unknown>) ?? {}),
        full_name: 'Mr & Mrs Baraka Kisau',
        display_name: 'Mr & Mrs Baraka Kisau',
        title: 'Mr & Mrs',
        ticket_type: 'double',
      },
    }),
  },
]

/** Built-in stress cases for template preflight. */
export function stressTestGuests(): Record<string, unknown>[] {
  return [
    TEST_DATA_PRESETS.find((p) => p.key === 'example')!.data,
    TEST_DATA_PRESETS.find((p) => p.key === 'longest')!.data,
    TEST_DATA_PRESETS.find((p) => p.key === 'shortest')!.data,
    TEST_DATA_PRESETS.find((p) => p.key === 'single')!.data,
    TEST_DATA_PRESETS.find((p) => p.key === 'double')!.data,
    {
      ...TEST_DATA_PRESETS[0].data,
      guest: {
        full_name: 'Prof. Christopher Mwakyusa & Dr. Anastasia Christopher Mwakyusa',
        display_name: 'Prof. Christopher Mwakyusa & Dr. Anastasia Christopher Mwakyusa',
        title: 'Prof.',
        ticket_type: 'double',
        pass_id: 'MS26-X1',
        admission_token: 'opuspass:admission:x1',
      },
    },
  ]
}
