// Approvals module — category catalog + approver roster. Requests
// themselves are persisted in Supabase (see queries.ts / actions.ts); this
// file holds only the static configuration the UI renders from.

import type {
  ApprovalApprover,
  ApprovalGroup,
  ApprovalGroupKey,
  ApprovalStatus,
} from './types'

// Create-tab sections, rendered in this order. Adding a category means
// tagging it with one of these keys — no layout change needed.
export const CATEGORY_GROUPS: ApprovalGroup[] = [
  {
    key: 'travel',
    label: 'Travel',
    blurb: 'Trips, rides and everything that moves people.',
    accent: '#1F5D8C',
    tint: '#E5F2FB',
  },
  {
    key: 'finance',
    label: 'Finance',
    blurb: 'Money leaving the business.',
    accent: '#166534',
    tint: '#E6F1E6',
  },
  {
    key: 'procurement',
    label: 'Procurement',
    blurb: 'Buying goods and services.',
    accent: '#5B2D8E',
    tint: '#EFE3F8',
  },
  {
    key: 'hr',
    label: 'People',
    blurb: 'Hiring, referrals and staff awards.',
    accent: '#7E5896',
    tint: '#F0DFF6',
  },
  {
    key: 'legal',
    label: 'Legal',
    blurb: 'Contracts and binding commitments.',
    accent: '#8A5A09',
    tint: '#FEF3DB',
  },
  {
    key: 'workplace',
    label: 'Workplace',
    blurb: 'Assets, loans and anything uncategorised.',
    accent: '#475569',
    tint: '#F1F5F9',
  },
]

export function findGroup(key: ApprovalGroupKey): ApprovalGroup {
  const match = CATEGORY_GROUPS.find((g) => g.key === key)
  if (!match) throw new Error(`Unknown approval group: ${key}`)
  return match
}

// Roster of internal approvers. Pinned to the live `workforce_employees`
// rows so the notification pipeline routes to real inboxes. When new
// approvers are onboarded the right move is to wire this to a Supabase
// lookup; until then, refresh by hand whenever an `employee_code` here
// is reissued.
//
// IMPORTANT: the "OpusFesta Owner" entry MUST route to
// `admin@opusfesta.com` — that's the email on the `admin_whitelist`
// owner row and the `workforce_employees` OF-001 record (clerk_user_id
// `user_3DFayJdYqd6LMyEnlM2e5Wm5R39`). Boris's personal Gmail
// (`bmmassesa@gmail.com`) is *not* the owner account and emails routed
// there will be missed.
export const APPROVER_ROSTER: ApprovalApprover[] = [
  {
    id: 'app_owner', // workforce_employees OF-001
    name: 'OpusFesta Owner',
    role: 'OpusFesta Owner',
    email: 'admin@opusfesta.com',
  },
  {
    id: 'app_ulumbi', // workforce_employees OF-002
    name: 'Ulumbi Samwel Dyamo',
    role: 'Finance and Accounts Assistant Manager',
    email: 'udyamo@gmail.com',
  },
  {
    id: 'app_timothy', // workforce_employees OF-003
    name: 'Timothy Mwamoto',
    role: 'Finance and Accounts Manager',
    email: 'timothymwamoto8@gmail.com',
  },
]

export function findApprover(id: string): ApprovalApprover | null {
  return APPROVER_ROSTER.find((a) => a.id === id) ?? null
}

export const APPROVAL_STATUSES: ApprovalStatus[] = [
  'To Submit',
  'Submitted',
  'Approved',
  'Refused',
]

// The request-type catalog moved to the approval_categories table so owner and
// admin can create types without a code change and a migration. Read it with
// listApprovalCategories() and pass it down; lookups live in catalog.ts and
// take the list explicitly, because a module-level cache would be shared
// across requests.
