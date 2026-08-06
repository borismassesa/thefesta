import { checkTanzanianPhone, maskPhone } from './phone'
import { redactProviderResponse } from './redact'
import { analyzeSmsLength, describeUnsupportedCharacters } from './segments'
import type { SmsPurpose } from './purpose'
import type { SmsLinkSend, SmsProvider, SmsSendResult } from './types'

/**
 * Beem Africa SMS gateway (https://apisms.beem.africa/v1/send).
 *
 * Credentials are injected through the constructor rather than read from
 * `process.env` in here, which is why this module carries no `server-only`
 * marker: nothing sensitive is baked into it, and the request payload, auth
 * header, timeout and error handling can all be asserted in a unit test. Env
 * reading — the part that must never reach a client bundle — lives in
 * `./config`, which is `server-only`. Provider selection lives in `./index`.
 *
 * Deliberately narrow for the first release: send only. No delivery-status
 * mapping, no inbound handling, no retry queue and no message table, because
 * we have not yet seen a real Beem response or callback and would be designing
 * persistence against guesses. Each send logs a sanitized summary including the
 * response's field *names*, which is what designing that persistence needs.
 *
 * TECHNICAL DEBT: `sendLinkRequest` composes a message body in here, which
 * makes this transport class carry pledge-specific business copy. The right
 * shape is a transport that only knows `sendText`, with each surface composing
 * its own text. Do NOT extend the pattern — an invitation or entrance-code
 * surface must build its own body and call `sendText`, not add `sendInvitation`
 * or `sendEntranceCode` methods here.
 */

export interface BeemConfig {
  apiKey: string
  secretKey: string
  /** Registered alphanumeric sender name, max 11 chars (e.g. `OpusPass`). */
  senderId: string
  baseUrl: string
  timeoutMs: number
  /** One-off live-validation switch: log the whole (redacted) response body.
   *  Off by default and meant to be turned back off once the payload shape is
   *  captured in a fixture. See `readBeemConfig`. */
  debugResponse: boolean
}

/** Beem's documented send-endpoint response. Fields are optional because the
 *  exact shape is unconfirmed against a live account — see the module note. */
interface BeemSendResponse {
  successful?: boolean
  request_id?: string | number
  code?: number
  message?: string
  [key: string]: unknown
}

/** GSM 7-bit. Unicode (encoding 1) would halve the per-segment budget; we do
 *  not select it implicitly, so a caller sending non-GSM text sees it in the
 *  gateway response rather than silently paying double. */
const ENCODING_GSM7 = 0

export interface BeemSendPayload {
  source_addr: string
  encoding: number
  schedule_time: string
  message: string
  recipients: { recipient_id: string; dest_addr: string }[]
}

/** Build the wire payload. Pure, so the exact bytes we send are testable. */
export function buildBeemPayload(
  senderId: string,
  message: string,
  recipients: { recipientId: string; phone: string }[],
): BeemSendPayload {
  return {
    source_addr: senderId,
    encoding: ENCODING_GSM7,
    schedule_time: '',
    message,
    recipients: recipients.map((r) => ({ recipient_id: r.recipientId, dest_addr: r.phone })),
  }
}

/** HTTP Basic with the API key as username and the secret key as password. */
export function beemAuthHeader(apiKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${secretKey}`, 'utf8').toString('base64')}`
}

export class BeemSmsProvider implements SmsProvider {
  readonly name = 'beem'
  readonly live = true
  readonly purpose: SmsPurpose
  private cfg: BeemConfig

  constructor(cfg: BeemConfig, purpose: SmsPurpose) {
    this.cfg = cfg
    this.purpose = purpose
  }

  /**
   * One recipient per call, matching the `SmsProvider` interface as it stands.
   * Batch sending is a later concern and belongs with the queue, not here.
   */
  private async send(to: string, body: string): Promise<SmsSendResult> {
    // Numbers are never echoed back in these strings: they reach the dashboard.
    const phone = checkTanzanianPhone(to)
    if (!phone.sendable) {
      const error =
        phone.rejection === 'unsupported_prefix'
          ? 'Number is not on a mobile prefix we can send to'
          : 'Not a valid Tanzanian mobile number'
      return { ok: false, provider: this.name, error }
    }
    const dest = phone.canonical!

    if (!body.trim()) {
      return { ok: false, provider: this.name, error: 'Message body is empty' }
    }

    // Release-1 contract: GSM-7 only. We send `encoding: 0` unconditionally,
    // and Beem's behaviour for non-GSM content under that flag is unconfirmed
    // — it might reject, transliterate, or substitute replacement characters,
    // and if it silently switched to UCS-2 the segment budget would drop from
    // 160 characters to 70 and the bill would more than double. Refusing is
    // the only option here whose outcome we actually know. Lift this once a
    // live account has told us what encoding 1 does.
    const analysis = analyzeSmsLength(body)
    if (analysis.encoding !== 'gsm7') {
      return {
        ok: false,
        provider: this.name,
        // Rendered with code points, never raw: the offenders are usually
        // invisible, and a raw newline here would land in a log line.
        error:
          'Message contains characters that require Unicode SMS: ' +
          describeUnsupportedCharacters(analysis.unsupportedCharacters),
        segments: analysis.segments,
        encoding: analysis.encoding,
      }
    }

    // Beem's `recipient_id` is its per-recipient handle in the response. A real
    // identifier makes support and reconciliation possible; `1` would not.
    const payload = buildBeemPayload(this.cfg.senderId, body, [
      { recipientId: `${this.purpose}:${dest}`, phone: dest },
    ])

    let res: Response
    let raw: string
    try {
      res = await fetch(`${this.cfg.baseUrl}/v1/send`, {
        method: 'POST',
        headers: {
          Authorization: beemAuthHeader(this.cfg.apiKey, this.cfg.secretKey),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      })
      raw = await res.text()
    } catch (e) {
      // Never surface the thrown error verbatim: a fetch failure can quote the
      // full request URL, and future config could put credentials in it.
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      const error = timedOut ? `Gateway timed out after ${this.cfg.timeoutMs}ms` : 'Gateway unreachable'
      this.log({ dest, bodyLength: body.length, error, httpStatus: null, parsed: null, raw: null })
      return { ok: false, provider: this.name, error }
    }

    let parsed: BeemSendResponse | null = null
    try {
      parsed = JSON.parse(raw) as BeemSendResponse
    } catch {
      // Left null — an unparseable body is itself worth seeing in the log.
    }

    this.log({ dest, bodyLength: body.length, error: null, httpStatus: res.status, parsed, raw })

    const requestId = parsed?.request_id != null ? String(parsed.request_id) : undefined
    const base: SmsSendResult = {
      ok: false,
      provider: this.name,
      httpStatus: res.status,
      requestId,
      providerCode: typeof parsed?.code === 'number' ? parsed.code : undefined,
      segments: analysis.segments,
      encoding: analysis.encoding,
    }

    if (!res.ok) {
      return { ...base, error: this.safeError(parsed?.message) || `Gateway returned HTTP ${res.status}` }
    }
    // A 2xx is acceptance of the job, not delivery to a handset. Delivery state
    // arrives on a callback we have not built yet, so nothing downstream may
    // read this as "delivered".
    if (parsed?.successful === false) {
      return { ...base, error: this.safeError(parsed.message) || 'Gateway rejected the message' }
    }
    return { ...base, ok: true }
  }

  /**
   * The gateway's own error text, made safe to hand onwards.
   *
   * `error` is rendered in the dashboard and returned over HTTP, and a gateway
   * that rejects a bad `Authorization` header may quote it back at us. Passing
   * the message straight through would put live credentials on a couple's
   * screen; masking recipients likewise keeps one guest's number out of an
   * error shown about another.
   */
  private safeError(message: string | undefined): string {
    if (!message?.trim()) return ''
    return redactProviderResponse(message.trim(), [this.cfg.apiKey, this.cfg.secretKey])
  }

  /**
   * Log the exchange.
   *
   * The default is a fixed, sanitized set of scalars — never the response body.
   * A provider response can carry recipient numbers, routing detail, echoed
   * request fields and, in an auth error, our own credentials; redacting known
   * secrets is not a defence against fields we have not seen yet, which by
   * definition is all of them. `responseKeys` gives us the shape (the thing we
   * actually need in order to design persistence) without the values.
   *
   * Full-body capture exists for the one-off live validation pass and is off
   * unless `SMS_BEEM_DEBUG_RESPONSE_ENABLED=true`. It is still redacted, and
   * it is meant to be switched back off as soon as the payload shape has been
   * written down in a fixture.
   */
  private log(entry: {
    dest: string
    bodyLength: number
    error: string | null
    httpStatus: number | null
    parsed: BeemSendResponse | null
    raw: string | null
  }): void {
    const line: Record<string, unknown> = {
      provider: this.name,
      purpose: this.purpose,
      senderId: this.cfg.senderId,
      // Never the body itself: it carries guest names, venues and pass codes.
      bodyLength: entry.bodyLength,
      recipientCount: 1,
      destination: maskPhone(entry.dest),
      httpStatus: entry.httpStatus,
      requestId: entry.parsed?.request_id != null ? String(entry.parsed.request_id) : null,
      providerCode: typeof entry.parsed?.code === 'number' ? entry.parsed.code : null,
      successful: typeof entry.parsed?.successful === 'boolean' ? entry.parsed.successful : null,
      responseKeys: entry.parsed ? Object.keys(entry.parsed).sort() : null,
      error: entry.error,
    }

    if (this.cfg.debugResponse && entry.raw !== null) {
      line.debugResponse = redactProviderResponse(entry.raw, [this.cfg.apiKey, this.cfg.secretKey])
    }

    console.warn('[sms:beem] send', line)
  }

  async sendText(to: string, body: string): Promise<SmsSendResult> {
    return this.send(to, body)
  }

  async sendLinkRequest(send: SmsLinkSend): Promise<SmsSendResult> {
    // Kept short on purpose. Beem bills per segment, so every extra line is a
    // charge on every recipient.
    const body =
      `Habari ${send.contactFirstName}. ${send.coupleName} wanaomba mchango wako. ` +
      `Tafadhali fungua: ${send.link}`
    return this.send(send.to, body)
  }
}
