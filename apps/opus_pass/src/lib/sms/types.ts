import type { SmsPurpose } from './purpose'
import type { SmsEncoding } from './segments'

/**
 * Result of an SMS send attempt.
 *
 * These values cross the server/client boundary — `sendPledgeReminderSms` and
 * friends are server actions whose result is rendered in the dashboard — so
 * this shape carries only small, non-sensitive scalars. The provider's raw
 * response body deliberately has no home here; it goes to structured server
 * logs instead (see `logBeemExchange`), where it cannot reach a browser.
 */
export interface SmsSendResult {
  ok: boolean
  error?: string
  /** True when handled by the dry-run stub (no live gateway for this purpose). */
  dryRun?: boolean
  /** Which implementation handled it — `'stub'` or `'beem'`. */
  provider?: string
  /** Gateway's own identifier for the send, for support and reconciliation. */
  requestId?: string
  /** Gateway's application-level status code, distinct from the HTTP status. */
  providerCode?: number
  /** HTTP status of the gateway call; absent when no call was made. */
  httpStatus?: number
  /** Billable segments the body worked out to — what we are actually charged
   *  for. Present even on an encoding rejection, so a composer can show the
   *  cost of the message that was refused. */
  segments?: number
  encoding?: SmsEncoding
}

/** A pledge-link nudge sent by text message. */
export interface SmsLinkSend {
  to: string
  contactFirstName: string
  coupleName: string
  /** Absolute pledge URL to include in the message body. */
  link: string
}

export interface SmsProvider {
  readonly name: string
  /** True when a real gateway is configured (else dry-run stub). */
  readonly live: boolean
  /** The surface this instance was resolved for — see `getSmsProvider`. */
  readonly purpose: SmsPurpose
  sendLinkRequest(send: SmsLinkSend): Promise<SmsSendResult>
  /** Free-form text — used for reminder nudges, whose content (owing amount,
   *  due date) varies per pledge and doesn't fit the fixed link-request shape. */
  sendText(to: string, body: string): Promise<SmsSendResult>
}
