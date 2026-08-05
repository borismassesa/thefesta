/**
 * The message a check-in coordinator receives when an admin assigns them a
 * door. Pure and directive-free (no 'server-only'), so the composer can be
 * unit-tested and imported from anywhere; the sending itself lives in the
 * check-in server actions.
 *
 * This message carries a live credential. Two consequences shape the copy:
 * the code is never repeated in the subject line (subjects leak into lock
 * screens and notification shades), and the body says plainly that it must
 * not be forwarded.
 */

import { formatScannerAccessCode } from './checkin-code'

export interface AccessCodeMessage {
  recipientName: string | null
  eventName: string
  eventDate: string | null
  venue: string | null
  doorLabel: string
  /** Raw 8-character token. Formatted for display by this module. */
  code: string
  expiresAt: string
  /** Absolute scanner link, or empty when NEXT_PUBLIC_OPUS_SCANNER_URL is unset. */
  link: string
}

export interface ComposedEmail {
  subject: string
  html: string
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function composeAccessCodeEmail(msg: AccessCodeMessage): ComposedEmail {
  const display = formatScannerAccessCode(msg.code)
  const greeting = msg.recipientName?.trim() ? `Hi ${msg.recipientName.trim()},` : 'Hello,'
  const where = [msg.venue, msg.eventDate].filter(Boolean).join(' · ')
  const expiry = formatExpiry(msg.expiresAt)

  const text = [
    greeting,
    '',
    `You are on the door for ${msg.eventName}${where ? ` (${where})` : ''}.`,
    `Your entrance: ${msg.doorLabel}`,
    '',
    `Access code: ${display}`,
    msg.link ? `Scanner link: ${msg.link}` : 'Open the scanner and enter the code on its home screen.',
    '',
    `This code stops working after ${expiry}.`,
    'It is yours alone. Please do not forward this message or share the code with anyone else.',
    '',
    'OpusPass',
  ].join('\n')

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
  <p style="font-size:15px;margin:0 0 16px">${escapeHtml(greeting)}</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 4px">
    You are on the door for <strong>${escapeHtml(msg.eventName)}</strong>${where ? ` (${escapeHtml(where)})` : ''}.
  </p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">
    Your entrance: <strong>${escapeHtml(msg.doorLabel)}</strong>
  </p>

  <div style="border:1px solid #7ec24a;background:#f4fdec;border-radius:12px;padding:20px;text-align:center;margin:0 0 20px">
    <p style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#3d6b1f;margin:0 0 8px">Access code</p>
    <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;font-weight:600;letter-spacing:.15em;margin:0;color:#111827">
      ${escapeHtml(display)}
    </p>
  </div>

  ${
    msg.link
      ? `<p style="text-align:center;margin:0 0 20px">
    <a href="${escapeHtml(msg.link)}" style="display:inline-block;background:#7E5896;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">Open the scanner</a>
  </p>`
      : `<p style="font-size:14px;line-height:1.5;margin:0 0 20px;color:#374151">Open the scanner and enter the code on its home screen.</p>`
  }

  <p style="font-size:13px;line-height:1.5;color:#6b7280;margin:0 0 6px">
    This code stops working after <strong>${escapeHtml(expiry)}</strong>.
  </p>
  <p style="font-size:13px;line-height:1.5;color:#6b7280;margin:0 0 20px">
    It is yours alone. Please do not forward this message or share the code with anyone else.
  </p>
  <p style="font-size:13px;color:#9ca3af;margin:0">OpusPass</p>
</div>`.trim()

  return {
    // Deliberately no code in the subject: it would surface on a lock screen.
    subject: `Door access for ${msg.eventName}`,
    html,
    text,
  }
}
