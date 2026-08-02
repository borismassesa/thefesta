import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase'
import { isMissingLeavePolicyTable } from './leave-policy-errors'
import type { LeavePolicy } from './types'

const FALLBACK_ANNUAL_ENTITLEMENT_DAYS = 28

export const FALLBACK_LEAVE_POLICIES: LeavePolicy[] = [
  { type: 'Annual', label: 'Annual leave', countsAgainstAnnualBalance: true, annualEntitlementDays: 28, active: true, displayOrder: 10 },
  { type: 'Sick', label: 'Sick leave', countsAgainstAnnualBalance: false, annualEntitlementDays: null, active: true, displayOrder: 20 },
  { type: 'Maternity', label: 'Maternity leave', countsAgainstAnnualBalance: false, annualEntitlementDays: null, active: true, displayOrder: 30 },
  { type: 'Paternity', label: 'Paternity leave', countsAgainstAnnualBalance: false, annualEntitlementDays: null, active: true, displayOrder: 40 },
  { type: 'Compassionate', label: 'Compassionate leave', countsAgainstAnnualBalance: false, annualEntitlementDays: null, active: true, displayOrder: 50 },
  { type: 'Unpaid', label: 'Unpaid leave', countsAgainstAnnualBalance: false, annualEntitlementDays: null, active: true, displayOrder: 80 },
]

type LeavePolicyRow = {
  leave_type: string
  label: string
  counts_against_annual_balance: boolean
  annual_entitlement_days: number | null
  active: boolean
  display_order: number
}

export async function getLeavePolicies(): Promise<LeavePolicy[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('workforce_leave_policies')
    .select('leave_type, label, counts_against_annual_balance, annual_entitlement_days, active, display_order')
    .order('display_order', { ascending: true })
    .returns<LeavePolicyRow[]>()

  if (error) {
    if (isMissingLeavePolicyTable(error)) return FALLBACK_LEAVE_POLICIES
    throw new Error(`[workforce] getLeavePolicies: ${error.message}`)
  }

  const policies = (data ?? []).map(mapLeavePolicy)
  return policies.length > 0 ? policies : FALLBACK_LEAVE_POLICIES
}

export function getAnnualLeaveEntitlementDays(policies: Pick<LeavePolicy, 'countsAgainstAnnualBalance' | 'annualEntitlementDays'>[]): number {
  return (
    policies.find((policy) => policy.countsAgainstAnnualBalance && policy.annualEntitlementDays)?.annualEntitlementDays ??
    FALLBACK_ANNUAL_ENTITLEMENT_DAYS
  )
}

function mapLeavePolicy(row: LeavePolicyRow): LeavePolicy {
  return {
    type: row.leave_type,
    label: row.label,
    countsAgainstAnnualBalance: row.counts_against_annual_balance,
    annualEntitlementDays: row.annual_entitlement_days,
    active: row.active,
    displayOrder: row.display_order,
  }
}
