/**
 * The shape the create/edit form works in: every field a string, so it maps
 * 1:1 onto form inputs without null-juggling in the component. Both call sites
 * (the list rows and the per-couple console) build one of these, so there is a
 * single form for both.
 *
 * A plain module, not a server action file — the client components import the
 * type from here.
 */
export interface CoupleEditable {
  userId: string
  /** Display name, and what must be typed to confirm a delete. */
  coupleName: string
  partner1Name: string
  partner2Name: string
  email: string
  phone: string
  whatsappPhone: string
  city: string
  region: string
  /** yyyy-mm-dd, or '' — the profile's own date, never an event's start date. */
  weddingDate: string
  dateUndecided: boolean
  budgetRange: string
  guestCount: string
  canSignIn: boolean
}

export const BUDGET_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'under_5m', label: 'Under TZS 5M' },
  { value: '5m_15m', label: 'TZS 5M to 15M' },
  { value: '15m_30m', label: 'TZS 15M to 30M' },
  { value: '30m_50m', label: 'TZS 30M to 50M' },
  { value: 'over_50m', label: 'TZS 50M+' },
  { value: 'undisclosed', label: 'Prefer not to say' },
]

/** Trims an ISO timestamp or date to the yyyy-mm-dd a date input needs. */
export function toDateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}
