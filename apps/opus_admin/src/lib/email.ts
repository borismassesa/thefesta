// Resend transactional email wrapper for opus_admin.
// Pattern mirrors apps/studio/lib/resend.ts so behavior stays consistent
// across apps. When RESEND_API_KEY is unset we no-op rather than throw, so
// the contributor-invite UI can fall back to a mailto: link.

import { Resend } from 'resend'
import { errorKind, logProviderError } from '@/lib/log-safe'

export class ResendConfigError extends Error {
  constructor() {
    super('Missing RESEND_API_KEY')
    this.name = 'ResendConfigError'
  }
}

export function hasResendConfig(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export function getResendConfigError(): ResendConfigError | null {
  return hasResendConfig() ? null : new ResendConfigError()
}

export function isResendConfigError(error: unknown): error is ResendConfigError {
  return error instanceof ResendConfigError
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
  attachments?: { filename: string; content: Buffer | string }[]
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

export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  if (!resend) {
    return { sent: false, reason: 'not_configured', error: new ResendConfigError().message }
  }
  try {
    const result = await resend.emails.send({
      from: payload.from || defaultFromAddress(),
      to: Array.isArray(payload.to) ? payload.to : [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
      ...(payload.cc ? { cc: payload.cc } : {}),
      ...(payload.bcc ? { bcc: payload.bcc } : {}),
      ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
    })
    if (result.error) {
      logProviderError('email.send', errorKind(result.error))
      return {
        sent: false,
        reason: 'send_failed',
        error: result.error.message ?? 'Unknown Resend error',
      }
    }
    return { sent: true, id: result.data?.id ?? null }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    logProviderError('email.send', errorKind(err))
    return { sent: false, reason: 'send_failed', error: message }
  }
}
