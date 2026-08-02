type LeaveDatabaseError = {
  code?: string | null
}

export function throwLeaveDatabaseError(error: LeaveDatabaseError, fallbackMessage: string): never {
  if (error.code === '23514') {
    throw new Error('That leave type or status is not available yet. Refresh the page and choose another option.')
  }
  throw new Error(fallbackMessage)
}
