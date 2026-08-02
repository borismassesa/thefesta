import type { DecimalString, GrowthKpiHealth, GrowthMetricDirection } from './types'

export type GrowthStatusInput = {
  direction: GrowthMetricDirection
  targetValue?: DecimalString | null
  lowerBound?: DecimalString | null
  upperBound?: DecimalString | null
  currentActual?: DecimalString | null
  periodStart: string
  periodEndExclusive: string
  asOfDate: string
  blocked?: boolean
  completed?: boolean
  thresholds?: {
    aheadRatio?: number
    atRiskRatio?: number
    behindRatio?: number
  }
}

export type GrowthStatusResult = {
  status: GrowthKpiHealth
  actualProgress: number | null
  expectedProgress: number | null
  variance: number | null
  forecast: number | null
  forecastConfidence: 'linear' | 'unavailable'
  reasonUnavailable: string | null
  calculatedAt: string
  asOfDate: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function dateAtUtcDay(value: string): number {
  return new Date(`${value}T00:00:00Z`).getTime()
}

function numberOrNull(value: DecimalString | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function periodProgress(start: string, endExclusive: string, asOf: string): number | null {
  const startMs = dateAtUtcDay(start)
  const endMs = dateAtUtcDay(endExclusive)
  const asOfMs = dateAtUtcDay(asOf)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(asOfMs) || endMs <= startMs) return null
  if (asOfMs < startMs) return 0
  if (asOfMs >= endMs) return 1
  return clamp01((asOfMs - startMs + DAY_MS) / (endMs - startMs))
}

function noForecast(reason: string, input: GrowthStatusInput, status: GrowthKpiHealth, expectedProgress: number | null = null): GrowthStatusResult {
  return {
    status,
    actualProgress: null,
    expectedProgress,
    variance: null,
    forecast: null,
    forecastConfidence: 'unavailable',
    reasonUnavailable: reason,
    calculatedAt: new Date().toISOString(),
    asOfDate: input.asOfDate,
  }
}

export function calculateGrowthKpiStatus(input: GrowthStatusInput): GrowthStatusResult {
  if (input.blocked) return noForecast('Metric is blocked.', input, 'blocked')
  if (input.completed) return noForecast('Metric is completed.', input, 'completed')

  const elapsed = periodProgress(input.periodStart, input.periodEndExclusive, input.asOfDate)
  if (elapsed === null) return noForecast('Period boundaries are invalid.', input, 'no_data')
  if (elapsed === 0) return noForecast('Period has not started.', input, 'not_started', 0)
  if (input.direction === 'informational') return noForecast('Informational metrics do not forecast against a target.', input, 'no_data', elapsed)

  const actual = numberOrNull(input.currentActual)
  if (actual === null) return noForecast('No current actual is available.', input, 'no_data', elapsed)

  const thresholds = {
    aheadRatio: input.thresholds?.aheadRatio ?? 1.1,
    atRiskRatio: input.thresholds?.atRiskRatio ?? 0.85,
    behindRatio: input.thresholds?.behindRatio ?? 0.6,
  }

  if (input.direction === 'target_range') {
    const lower = numberOrNull(input.lowerBound)
    const upper = numberOrNull(input.upperBound)
    if (lower === null || upper === null || lower > upper) {
      return noForecast('Target range bounds are unavailable or invalid.', input, 'no_data', elapsed)
    }
    const midpoint = (lower + upper) / 2
    const variance = actual < lower ? actual - lower : actual > upper ? actual - upper : 0
    const status: GrowthKpiHealth =
      actual >= lower && actual <= upper
        ? 'on_track'
        : Math.abs(actual - midpoint) <= Math.abs(upper - lower)
          ? 'at_risk'
          : 'behind'
    return {
      status,
      actualProgress: null,
      expectedProgress: null,
      variance,
      forecast: null,
      forecastConfidence: 'unavailable',
      reasonUnavailable: 'Target ranges are evaluated against bounds, not a linear forecast.',
      calculatedAt: new Date().toISOString(),
      asOfDate: input.asOfDate,
    }
  }

  const target = numberOrNull(input.targetValue)
  if (target === null) return noForecast('Target value is unavailable.', input, 'no_data', elapsed)
  if (target === 0) return noForecast('Zero target makes progress and forecast undefined.', input, actual === 0 ? 'on_track' : 'no_data', elapsed)

  if (input.direction === 'higher_is_better') {
    const expectedActual = target * elapsed
    const actualProgress = actual / target
    const expectedProgress = elapsed
    const variance = actual - expectedActual
    const forecast = elapsed > 0 ? actual / elapsed : null
    const ratio = expectedActual === 0 ? null : actual / expectedActual
    const status: GrowthKpiHealth =
      ratio === null
        ? 'no_data'
        : ratio >= thresholds.aheadRatio
          ? 'ahead'
          : ratio >= 1
            ? 'on_track'
            : ratio >= thresholds.atRiskRatio
              ? 'at_risk'
              : 'behind'
    return {
      status,
      actualProgress,
      expectedProgress,
      variance,
      forecast,
      forecastConfidence: 'linear',
      reasonUnavailable: null,
      calculatedAt: new Date().toISOString(),
      asOfDate: input.asOfDate,
    }
  }

  const expectedAllowed = target * elapsed
  const actualProgress = actual / target
  const expectedProgress = elapsed
  const variance = expectedAllowed - actual
  const forecast = elapsed > 0 ? actual / elapsed : null
  const ratio = expectedAllowed === 0 ? null : actual / expectedAllowed
  const status: GrowthKpiHealth =
    ratio === null
      ? 'no_data'
      : ratio <= 1
        ? 'on_track'
        : ratio <= 1 / thresholds.atRiskRatio
          ? 'at_risk'
          : 'behind'

  return {
    status,
    actualProgress,
    expectedProgress,
    variance,
    forecast,
    forecastConfidence: 'linear',
    reasonUnavailable: null,
    calculatedAt: new Date().toISOString(),
    asOfDate: input.asOfDate,
  }
}
