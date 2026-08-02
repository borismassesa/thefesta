import { DEPARTMENTS, type Department } from '../../workforce/_lib/types'
import type {
  DecimalString,
  GrowthAggregationMethod,
  GrowthMetricDirection,
  GrowthPeriodType,
  GrowthScope,
  GrowthSourceMode,
} from './types'

const DECIMAL_RE = /^-?(?:0|[1-9]\d{0,19})(?:\.\d{1,10})?$/
const CODE_RE = /^[A-Z0-9_]{2,80}$/
const CURRENCY_RE = /^[A-Z]{3}$/
const CALCULATION_KEY_RE = /^[a-z][a-z0-9_.-]{1,120}$/
const UNSAFE_FORMULA_KEYS = new Set(['sql', 'javascript', 'js', 'code', 'expression', 'template'])

export const DEFAULT_ORGANIZATION_KEY = 'opusfesta'
export const DEFAULT_REPORTING_CURRENCY = 'TZS'

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export function normalizeBusinessUnitCode(value: string): ValidationResult<string> {
  const code = value.trim().toUpperCase()
  if (!CODE_RE.test(code)) {
    return { ok: false, error: 'Use 2-80 uppercase letters, numbers, or underscores for the code.' }
  }
  return { ok: true, value: code }
}

export function normalizeCurrencyCode(value: string | null | undefined): ValidationResult<string> {
  const code = (value || DEFAULT_REPORTING_CURRENCY).trim().toUpperCase()
  if (!CURRENCY_RE.test(code)) return { ok: false, error: 'Currency code must be a three-letter ISO code.' }
  return { ok: true, value: code }
}

export function normalizeOptionalText(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function nonEmptyText(value: FormDataEntryValue | string | null | undefined, label: string): ValidationResult<string> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, error: `${label} is required.` }
  }
  return { ok: true, value: value.trim() }
}

export function decimalString(value: FormDataEntryValue | string | number | null | undefined, label: string): ValidationResult<DecimalString> {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (raw.length === 0) return { ok: false, error: `${label} is required.` }
  if (!DECIMAL_RE.test(raw)) return { ok: false, error: `${label} must be a finite decimal value.` }
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be finite.` }
  return { ok: true, value: raw }
}

export function optionalDecimalString(value: FormDataEntryValue | string | number | null | undefined, label: string): ValidationResult<DecimalString | null> {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  return decimalString(value, label)
}

export function isDepartment(value: string | null | undefined): value is Department {
  return typeof value === 'string' && (DEPARTMENTS as readonly string[]).includes(value)
}

export function parseDepartment(value: FormDataEntryValue | string | null | undefined): ValidationResult<Department | null> {
  if (typeof value !== 'string' || value.trim() === '') return { ok: true, value: null }
  if (!isDepartment(value)) return { ok: false, error: 'Department is not one of the canonical Workforce departments.' }
  return { ok: true, value }
}

export function uuidOrNull(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildScopeIdentity(scope: GrowthScope): string {
  return [
    `bu=${scope.businessUnitId ?? 'org'}`,
    `dept=${scope.department ?? 'org'}`,
    `emp=${scope.employeeId ?? 'org'}`,
  ].join('|')
}

export function validateCalculationKey(value: string | null | undefined, label: string): ValidationResult<string | null> {
  const key = value?.trim() ?? ''
  if (!key) return { ok: true, value: null }
  if (!CALCULATION_KEY_RE.test(key)) return { ok: false, error: `${label} must be a safe calculation key.` }
  return { ok: true, value: key }
}

export function validateDeclarativeFormulaConfig(value: unknown): ValidationResult<Record<string, unknown>> {
  if (value === null || value === undefined || value === '') return { ok: true, value: {} }
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return { ok: false, error: 'Formula config must be valid JSON.' }
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Formula config must be a JSON object.' }
  }
  for (const key of Object.keys(parsed)) {
    if (UNSAFE_FORMULA_KEYS.has(key.toLowerCase())) {
      return { ok: false, error: 'Formula config cannot contain executable code fields.' }
    }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

export function validateMetricSource(
  sourceMode: GrowthSourceMode,
  aggregationMethod: GrowthAggregationMethod,
  calculationKey: string | null,
  dataSourceKey: string | null,
): ValidationResult<true> {
  if (aggregationMethod === 'formula' && !calculationKey) {
    return { ok: false, error: 'Formula metrics require a calculation key.' }
  }
  if (sourceMode !== 'manual' && !calculationKey && !dataSourceKey) {
    return { ok: false, error: 'Calculated and hybrid metrics require a data source key or calculation key.' }
  }
  return { ok: true, value: true }
}

export function validateTargetValues(
  direction: GrowthMetricDirection,
  targetValue: DecimalString | null,
  lowerBound: DecimalString | null,
  upperBound: DecimalString | null,
): ValidationResult<true> {
  if (direction === 'target_range') {
    if (lowerBound === null || upperBound === null) {
      return { ok: false, error: 'Target-range metrics require lower and upper bounds.' }
    }
    if (Number(lowerBound) > Number(upperBound)) {
      return { ok: false, error: 'Lower bound cannot be greater than upper bound.' }
    }
    return { ok: true, value: true }
  }
  if (targetValue === null) return { ok: false, error: 'Target value is required.' }
  return { ok: true, value: true }
}

export function canonicalPeriodBounds(
  periodType: GrowthPeriodType,
  startDate: string,
): ValidationResult<{ startDate: string; endDate: string; fiscalYear: number; fiscalQuarter: number | null; label: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, error: 'Start date must be YYYY-MM-DD.' }
  const [year, month, day] = startDate.split('-').map(Number)
  if (day !== 1) return { ok: false, error: 'Growth periods must start on the first day of the period.' }
  if (periodType === 'month') {
    const endMonth = month === 12 ? 1 : month + 1
    const endYear = month === 12 ? year + 1 : year
    return {
      ok: true,
      value: {
        startDate,
        endDate: `${endYear}-${String(endMonth).padStart(2, '0')}-01`,
        fiscalYear: year,
        fiscalQuarter: null,
        label: new Date(`${startDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      },
    }
  }
  if (periodType === 'quarter') {
    if (![1, 4, 7, 10].includes(month)) return { ok: false, error: 'Quarter periods must start in January, April, July, or October.' }
    const fiscalQuarter = Math.floor((month - 1) / 3) + 1
    const endMonthRaw = month + 3
    const endYear = endMonthRaw > 12 ? year + 1 : year
    const endMonth = endMonthRaw > 12 ? endMonthRaw - 12 : endMonthRaw
    return {
      ok: true,
      value: {
        startDate,
        endDate: `${endYear}-${String(endMonth).padStart(2, '0')}-01`,
        fiscalYear: year,
        fiscalQuarter,
        label: `Q${fiscalQuarter} ${year}`,
      },
    }
  }
  if (month !== 1) return { ok: false, error: 'Year periods must start on January 1.' }
  return {
    ok: true,
    value: {
      startDate,
      endDate: `${year + 1}-01-01`,
      fiscalYear: year,
      fiscalQuarter: null,
      label: `${year}`,
    },
  }
}
