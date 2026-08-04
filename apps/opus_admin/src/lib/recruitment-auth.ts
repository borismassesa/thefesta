import { cache } from 'react'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  getCallerEmail,
  getCallerEmployeeId,
  getCallerPermissions,
  type PermissionKey,
} from '@/lib/admin-auth'
import { auditPermissionDenied } from '@/lib/audit-log'

export type RecruitmentEntityType =
  | 'requisition'
  | 'job'
  | 'candidate'
  | 'application'
  | 'interview'
  | 'assessment'
  | 'offer'

type RecruitmentAccessInput = {
  entityType?: RecruitmentEntityType
  entityId?: string
  allowedPermissions: readonly PermissionKey[]
}

const ORGANIZATION_WIDE_PERMISSIONS = new Set<PermissionKey>([
  'platform.admin',
  'recruitment.settings.manage',
  'workforce.recruitment_settings.write',
])

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export const getRecruitmentWorkspaceAccess = cache(async (): Promise<{
  employeeId: string | null
  organizationWide: boolean
}> => {
  const permissions = await getCallerPermissions()
  if (!permissions.has('workforce.recruitment.read')) {
    await deny('missing workforce.recruitment.read')
  }
  const organizationWide = [...ORGANIZATION_WIDE_PERMISSIONS].some((key) => permissions.has(key))
  const employeeId = await getCallerEmployeeId()
  if (!organizationWide && !employeeId) await deny('no linked employee identity')
  return { employeeId, organizationWide }
})

/**
 * Enforces both capability and record scope for recruitment server actions.
 *
 * A matching capability is necessary but does not grant company-wide access.
 * Non-platform administrators must also be the requisition owner/recruiter,
 * an assigned approver/reviewer/interviewer, or hold an active department,
 * requisition, or job team assignment.
 */
export async function requireRecruitmentAccess({
  entityType,
  entityId,
  allowedPermissions,
}: RecruitmentAccessInput): Promise<{ employeeId: string | null; organizationWide: boolean }> {
  const permissions = await getCallerPermissions()
  const hasCapability = allowedPermissions.some((key) => permissions.has(key))
  if (!hasCapability) {
    await deny(`missing one of [${allowedPermissions.join(', ')}]`)
  }

  const organizationWide = [...ORGANIZATION_WIDE_PERMISSIONS].some((key) => permissions.has(key))
  const employeeId = await getCallerEmployeeId()
  if (organizationWide) return { employeeId, organizationWide: true }

  if (!entityType || !entityId || !isUuid(entityId) || !employeeId) {
    await deny('missing or invalid resource scope')
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc('recruitment_employee_has_scope', {
    p_employee_id: employeeId,
    p_entity_type: entityType,
    p_entity_id: entityId,
  })

  if (error) {
    console.error('[recruitment-auth] scope lookup failed', {
      entityType,
      entityId,
      employeeId,
      code: (error as { code?: string }).code,
    })
    await deny('resource scope lookup failed')
  }
  if (data !== true) await deny(`outside assigned ${entityType} scope`)
  return { employeeId, organizationWide: false }
}

async function deny(reason: string): Promise<never> {
  const email = await getCallerEmail()
  void auditPermissionDenied('workforce.recruitment.scope', email, reason)
  throw new Error("You don't have access to this recruitment record.")
}
