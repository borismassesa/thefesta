import 'server-only'
import type { BeemConfig } from './beem'

/**
 * Beem credentials, read server-side only.
 *
 * `server-only` is the guard that keeps these out of a client bundle if a
 * component ever imports down this path by accident. None of these vars may
 * ever be given a `NEXT_PUBLIC_` prefix — that prefix inlines the value into
 * JavaScript served to every visitor.
 */

const DEFAULT_BASE_URL = 'https://apisms.beem.africa'
const DEFAULT_TIMEOUT_MS = 15_000

/** Only an explicit `true` opts in, matching `purpose.ts`. */
export function envFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

/**
 * Returns the config only when every required value is present, else null so
 * the caller falls back to the dry-run stub. A half-configured gateway must
 * not produce a "live" provider that fails on every send.
 */
export function readBeemConfig(): BeemConfig | null {
  const apiKey = process.env.SMS_BEEM_API_KEY?.trim()
  const secretKey = process.env.SMS_BEEM_SECRET_KEY?.trim()
  const senderId = process.env.SMS_BEEM_SENDER_ID?.trim()
  if (!apiKey || !secretKey || !senderId) return null

  const timeout = Number(process.env.SMS_BEEM_TIMEOUT_MS)
  return {
    apiKey,
    secretKey,
    senderId,
    baseUrl: (process.env.SMS_BEEM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
    // Temporary: for the one-off live-validation pass only. See `BeemSmsProvider.log`.
    debugResponse: envFlag(process.env.SMS_BEEM_DEBUG_RESPONSE_ENABLED),
  }
}

/**
 * Which credentials are present, without revealing any of them.
 *
 * Live behaviour now depends on several environment variables across two
 * independent switches, which is exactly the shape that produces "why is it
 * still sending dry runs" confusion in a deploy. This lets an admin health
 * check answer that question without spending an SMS to find out.
 */
export function readBeemConfigPresence(): {
  credentialsPresent: boolean
  senderIdPresent: boolean
  debugResponseEnabled: boolean
} {
  return {
    credentialsPresent: Boolean(
      process.env.SMS_BEEM_API_KEY?.trim() && process.env.SMS_BEEM_SECRET_KEY?.trim(),
    ),
    senderIdPresent: Boolean(process.env.SMS_BEEM_SENDER_ID?.trim()),
    debugResponseEnabled: envFlag(process.env.SMS_BEEM_DEBUG_RESPONSE_ENABLED),
  }
}
