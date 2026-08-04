import type { Department } from '../../workforce/_lib/types'

export type GrowthBusinessUnit = {
  id: string
  code: string
  name: string
  description: string
  defaultCurrencyCode: string
  isActive: boolean
  displayOrder: number
  archivedAt: string | null
}

export type GrowthPeriodType = 'month' | 'quarter' | 'year'
export type GrowthPeriodStatus = 'open' | 'locked' | 'closed'

export type GrowthPeriod = {
  id: string
  periodType: GrowthPeriodType
  startDate: string
  endDate: string
  label: string
  fiscalYear: number
  fiscalQuarter: number | null
  status: GrowthPeriodStatus
}

export type GrowthMeasurementUnit =
  | 'count'
  | 'currency'
  | 'percentage'
  | 'decimal'
  | 'days'
  | 'hours'
  | 'score'
  | 'ratio'

export type GrowthSourceMode = 'calculated' | 'manual' | 'hybrid'
export type GrowthMetricDirection = 'higher_is_better' | 'lower_is_better' | 'target_range' | 'informational'
export type GrowthAggregationMethod =
  | 'sum'
  | 'average'
  | 'weighted_average'
  | 'latest'
  | 'minimum'
  | 'maximum'
  | 'ratio'
  | 'percentage'
  | 'formula'
export type GrowthValueType = 'integer' | 'decimal' | 'currency' | 'percentage' | 'duration' | 'score' | 'ratio'
export type GrowthReviewFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'ad_hoc'
export type GrowthTargetStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'superseded' | 'archived'
export type GrowthActualOrigin = 'calculated' | 'manual_entry' | 'manual_override' | 'imported' | 'backfilled'
export type GrowthKpiHealth =
  | 'not_started'
  | 'no_data'
  | 'ahead'
  | 'on_track'
  | 'at_risk'
  | 'behind'
  | 'completed'
  | 'blocked'

export type DecimalString = string

export type GrowthScope = {
  businessUnitId: string | null
  department: Department | null
  employeeId: string | null
}

export type GrowthMetricDefinition = {
  id: string
  code: string
  name: string
  description: string
  businessUnitId: string | null
  department: Department | null
  ownerEmployeeId: string | null
  ownerName: string | null
  measurementUnit: GrowthMeasurementUnit
  sourceMode: GrowthSourceMode
  direction: GrowthMetricDirection
  aggregationMethod: GrowthAggregationMethod
  valueType: GrowthValueType
  defaultCurrencyCode: string | null
  calculationKey: string | null
  dataSourceKey: string | null
  reviewFrequency: GrowthReviewFrequency
  evidenceRequired: boolean
  isActive: boolean
  lockVersion: number
  archivedAt: string | null
}

export type GrowthMetricTarget = GrowthScope & {
  id: string
  metricDefinitionId: string
  periodId: string
  targetValue: DecimalString | null
  lowerBound: DecimalString | null
  upperBound: DecimalString | null
  status: GrowthTargetStatus
  isCurrent: boolean
  ownerEmployeeId: string | null
  submittedByEmployeeId: string | null
  approvedByEmployeeId: string | null
  submittedAt: string | null
  approvedAt: string | null
  effectiveFrom: string
  effectiveTo: string | null
  revisionNumber: number
  revisionReason: string | null
  supersedesTargetId: string | null
  lockVersion: number
}

export type GrowthMetricActual = GrowthScope & {
  id: string
  metricDefinitionId: string
  periodId: string
  asOfDate: string
  value: DecimalString
  originType: GrowthActualOrigin
  sourceSystem: string | null
  calculationVersion: string | null
  enteredByEmployeeId: string | null
  overrideReason: string | null
  supersedesActualId: string | null
  isCurrent: boolean
  createdAt: string
}

export type GrowthTargetEvent = {
  id: string
  targetId: string
  eventType: string
  actorEmployeeId: string | null
  oldStatus: GrowthTargetStatus | null
  newStatus: GrowthTargetStatus | null
  changeSummary: string
  reason: string | null
  createdAt: string
}
