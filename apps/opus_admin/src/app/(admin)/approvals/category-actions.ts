'use server'

// Owner/admin management of the approval request-type catalog.
//
// Adding a request type used to mean editing a hardcoded array AND writing a
// migration to widen a CHECK constraint. These actions replace both.
//
// GATE: owner or admin, checked server-side on every call. The module's own
// `requireApprovalsAccess` is far too broad here — it lets anyone with
// finance.read or workforce.read in, and defining what the whole company can
// request is not that job.

import { revalidatePath } from 'next/cache'
import { getAdminAccessRole } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { logDbError } from '@/lib/log-safe'
import { recordAuditEvent } from '@/lib/audit-log'
import { listApprovalCategories } from './queries'
import type { ApprovalCategory, ApprovalField, ApprovalGroupKey } from './types'

export type CategoryActionResult =
  | { ok: true; categories: ApprovalCategory[] }
  | { ok: false; error: string }

const ICON_KEYS = [
  'Plane', 'PackageOpen', 'FileCheck2', 'FileSignature',
  'Wallet', 'Car', 'UserPlus', 'ShoppingCart', 'FileText',
] as const

const GROUP_KEYS: ApprovalGroupKey[] = [
  'travel', 'finance', 'procurement', 'hr', 'legal', 'workplace',
]

const FIELD_KINDS = ['text', 'textarea', 'date', 'date-range', 'number', 'amount', 'list'] as const

export type CategoryInput = {
  key?: string
  label: string
  blurb: string
  group: string
  accent: string
  tint: string
  iconKey: string
  fields: ApprovalField[]
  sortOrder?: number
}

async function requireCatalogAdmin(): Promise<string | null> {
  const role = await getAdminAccessRole()
  if (role !== 'owner' && role !== 'admin') {
    return 'Only an owner or admin can manage request types.'
  }
  return null
}

/** Lowercase, hyphenated, no leading digit-only weirdness. Matches the DB CHECK. */
export async function slugify(label: string): Promise<string> {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function validate(input: CategoryInput): string | null {
  if (!input.label.trim()) return 'Name is required.'
  if (!GROUP_KEYS.includes(input.group as ApprovalGroupKey)) return 'Pick a section.'
  if (!ICON_KEYS.includes(input.iconKey as (typeof ICON_KEYS)[number])) return 'Pick an icon.'
  for (const hex of [input.accent, input.tint]) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return 'Colours must be 6-digit hex, e.g. #5B2D8E.'
  }
  if (input.fields.length === 0) return 'Add at least one field, or the form will be empty.'

  const seen = new Set<string>()
  for (const f of input.fields) {
    if (!f.id.trim()) return 'Every field needs an id.'
    if (!/^[a-z0-9][a-z0-9-]*$/.test(f.id)) {
      return `Field id "${f.id}" must be lowercase letters, numbers and hyphens.`
    }
    if (!f.label.trim()) return `Field "${f.id}" needs a label.`
    if (!FIELD_KINDS.includes(f.kind)) return `Field "${f.id}" has an unknown type.`
    // Two fields sharing an id would silently overwrite each other in the
    // request's `fields` map, losing whatever the requester typed.
    if (seen.has(f.id)) return `Two fields share the id "${f.id}".`
    seen.add(f.id)
  }
  return null
}

function toRow(input: CategoryInput) {
  return {
    label: input.label.trim(),
    blurb: input.blurb.trim(),
    group_key: input.group,
    accent: input.accent.toUpperCase(),
    tint: input.tint.toUpperCase(),
    icon_key: input.iconKey,
    fields: input.fields.map((f) => ({
      id: f.id.trim(),
      label: f.label.trim(),
      kind: f.kind,
      required: f.required === true,
      ...(f.placeholder?.trim() ? { placeholder: f.placeholder.trim() } : {}),
    })),
    sort_order: input.sortOrder ?? 100,
  }
}

export async function createApprovalCategory(input: CategoryInput): Promise<CategoryActionResult> {
  const denied = await requireCatalogAdmin()
  if (denied) return { ok: false, error: denied }
  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }

  const key = (input.key?.trim() || (await slugify(input.label)))
  if (!/^[a-z0-9][a-z0-9-]*$/.test(key)) {
    return { ok: false, error: 'Could not derive a valid key from that name.' }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('approval_categories').insert({ key, ...toRow(input) })
  if (error) {
    logDbError('approval_category.insert', error, { key })
    // 23505 is the only failure a user can act on; everything else is ours.
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'A request type with that name already exists.'
          : 'Could not create the request type.',
    }
  }

  void recordAuditEvent({
    eventType: 'approval_category.created',
    severity: 'info',
    message: `Request type "${input.label.trim()}" created`,
    targetResource: `approval_categories:${key}`,
  })
  revalidatePath('/approvals')
  return { ok: true, categories: await listApprovalCategories(true) }
}

export async function updateApprovalCategory(
  key: string,
  input: CategoryInput,
): Promise<CategoryActionResult> {
  const denied = await requireCatalogAdmin()
  if (denied) return { ok: false, error: denied }
  const invalid = validate(input)
  if (invalid) return { ok: false, error: invalid }

  const supabase = createSupabaseAdminClient()
  // The key is never updated. Requests reference it, and while the FK is
  // ON UPDATE CASCADE, renaming a key that appears in URLs and favourites
  // would break more than it fixes.
  const { error } = await supabase.from('approval_categories').update(toRow(input)).eq('key', key)
  if (error) {
    logDbError('approval_category.update', error, { key })
    return { ok: false, error: 'Could not save the request type.' }
  }

  void recordAuditEvent({
    eventType: 'approval_category.updated',
    severity: 'info',
    message: `Request type "${input.label.trim()}" updated`,
    targetResource: `approval_categories:${key}`,
  })
  revalidatePath('/approvals')
  return { ok: true, categories: await listApprovalCategories(true) }
}

/**
 * Retire or restore a type. Deliberately not a delete: the FK is ON DELETE
 * RESTRICT, so a type with requests cannot be removed anyway, and a type
 * without them is still referenced by anyone's favourites. Retiring stops it
 * being offered while every existing request keeps resolving its label.
 */
export async function setApprovalCategoryActive(
  key: string,
  active: boolean,
): Promise<CategoryActionResult> {
  const denied = await requireCatalogAdmin()
  if (denied) return { ok: false, error: denied }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('approval_categories').update({ active }).eq('key', key)
  if (error) {
    logDbError('approval_category.set_active', error, { key })
    return { ok: false, error: 'Could not change the request type.' }
  }

  void recordAuditEvent({
    eventType: active ? 'approval_category.restored' : 'approval_category.retired',
    severity: 'info',
    message: `Request type "${key}" ${active ? 'restored' : 'retired'}`,
    targetResource: `approval_categories:${key}`,
  })
  revalidatePath('/approvals')
  return { ok: true, categories: await listApprovalCategories(true) }
}
