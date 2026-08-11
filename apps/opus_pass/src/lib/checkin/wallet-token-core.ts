/**
 * Pure shape rules for the guest's wallet-management capability.
 *
 * Kept outside wallet-tokens.ts so public route guards can reject malformed
 * values before importing any database or keyring code.
 */

export const WALLET_TOKEN_PREFIX = 'WMT1'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,88}$/

/** Accept only exactly what OpusPass mints. */
export function isWalletTokenShape(input: unknown): input is string {
  if (typeof input !== 'string') return false
  if (!input.startsWith(`${WALLET_TOKEN_PREFIX}:`)) return false
  return TOKEN_PATTERN.test(input.slice(WALLET_TOKEN_PREFIX.length + 1))
}
