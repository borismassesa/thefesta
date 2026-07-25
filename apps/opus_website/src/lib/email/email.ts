import { Resend } from 'resend'

export class ResendConfigError extends Error {
  constructor() {
    super('Missing RESEND_API_KEY')
    this.name = 'ResendConfigError'
  }
}

export function hasResendConfig(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export type EmailPayload = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  cc?: string | string[]
  bcc?: string | string[]
}

export type EmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: 'not_configured' | 'send_failed'; error?: string }

export function isEmailConfigured(): boolean {
  return hasResendConfig()
}

function defaultFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'OpusFesta <admin@opusfesta.com>'
}

/** Strip CR, LF, and other ASCII control characters from email header fields to prevent header injection attacks */
function sanitizeHeaderField(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!resend) {
    return { sent: false, reason: 'not_configured', error: new ResendConfigError().message }
  }

  try {
    const result = await resend.emails.send({
      from: sanitizeHeaderField(payload.from || defaultFromAddress()),
      to: Array.isArray(payload.to) ? payload.to.map(sanitizeHeaderField) : [sanitizeHeaderField(payload.to)],
      subject: sanitizeHeaderField(payload.subject),
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo ? sanitizeHeaderField(payload.replyTo) : undefined,
      ...(payload.cc ? { cc: Array.isArray(payload.cc) ? payload.cc.map(sanitizeHeaderField) : [sanitizeHeaderField(payload.cc)] } : {}),
      ...(payload.bcc ? { bcc: Array.isArray(payload.bcc) ? payload.bcc.map(sanitizeHeaderField) : [sanitizeHeaderField(payload.bcc)] } : {}),
    })

    if (result.error) {
      console.error('[email] resend error:', result.error)
      return {
        sent: false,
        reason: 'send_failed',
        error: result.error.message ?? 'Unknown Resend error',
      }
    }

    return { sent: true, id: result.data?.id ?? null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    console.error('[email] exception:', message)
    return { sent: false, reason: 'send_failed', error: message }
  }
}
