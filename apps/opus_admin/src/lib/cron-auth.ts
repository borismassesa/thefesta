import { timingSafeEqual } from 'node:crypto'

/** Verify a server-only cron bearer without leaking partial-match timing. */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!authorization || !secret) return false
  const supplied = Buffer.from(authorization)
  const expected = Buffer.from(`Bearer ${secret}`)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
