/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Lets call sites use `catch (err)` (typed `unknown` under strict mode)
 * instead of `catch (err: any)`.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (typeof err === 'string') return err

  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }

  return fallback
}
