import 'server-only'

import { getCallerPermissions, requirePermission, type PermissionKey } from '@/lib/admin-auth'
import { dbErrorCode, logDbError } from '@/lib/log-safe'

export type ActionResult = { ok: true } | { ok: false; error: string }

export const GROWTH_ERROR = {
  denied: "You don't have permission to perform this Growth Tracker action.",
  save: 'Could not save the Growth Tracker record.',
  delete: 'Could not delete the Growth Tracker record.',
  stale: 'The Growth Tracker record no longer exists.',
  duplicate: 'A Growth Tracker record with these details already exists.',
} as const

export async function requireGrowthPermission(permission: PermissionKey): Promise<ActionResult | null> {
  try {
    await requirePermission(permission)
    return null
  } catch {
    return { ok: false, error: GROWTH_ERROR.denied }
  }
}

export async function requireAnyGrowthPermission(permissions: readonly PermissionKey[]): Promise<ActionResult | null> {
  const callerPermissions = await getCallerPermissions()
  if (permissions.some((permission) => callerPermissions.has(permission))) return null
  const permission = permissions[0] ?? 'growth.read'
  return requireGrowthPermission(permission)
}

export function logGrowthDbError(
  operation: string,
  error: unknown,
  context: Record<string, string | number | null | undefined> = {},
): void {
  logDbError(operation, error, context)
}

export function growthDbErrorMessage(error: unknown, fallback: string): string {
  if (dbErrorCode(error) === '23505') return GROWTH_ERROR.duplicate
  return fallback
}

export function missingGrowthRecord(): ActionResult {
  return { ok: false, error: GROWTH_ERROR.stale }
}
