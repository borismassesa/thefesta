const GROWTH_FOUNDATION_MISSING_CODES = new Set(['PGRST205', '42P01'])

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

export class GrowthFoundationsUnavailableError extends Error {
  constructor() {
    super('Canonical Growth foundations are unavailable in this database.')
    this.name = 'GrowthFoundationsUnavailableError'
  }
}

export function isMissingGrowthFoundationRelation(error: unknown): boolean {
  const code = errorCode(error)
  return code !== null && GROWTH_FOUNDATION_MISSING_CODES.has(code)
}

export function isGrowthFoundationsUnavailableError(
  error: unknown,
): error is GrowthFoundationsUnavailableError {
  return error instanceof GrowthFoundationsUnavailableError
}
