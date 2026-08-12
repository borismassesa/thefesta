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
  /** Start time as the door should read it, already in the event's zone. */
  eventTime: string | null
  venue: string | null
  doorLabel: string
  /** Raw 8-character token. Formatted for display by this module. */
  code: string
  expiresAt: string
  /** Absolute opus_pass /entrance-card-scanner link, or empty when env is unset. */
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

/** Every event this product serves runs on Tanzanian local time, and the
 *  server does not: without this the expiry would be stated in UTC. */
const EVENT_TIME_ZONE = 'Africa/Dar_es_Salaam'

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d
    .toLocaleString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: EVENT_TIME_ZONE,
    })
    // en-GB emits a lowercase meridiem; the door reads these on a phone at a
    // glance, so match the uppercase AM/PM used everywhere else.
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
}

/**
 * The event, one line per fact, each led by its own icon.
 *
 * Emoji rather than images or SVG: an image needs a host and is blocked by
 * default in most clients, and Gmail strips inline SVG, either of which would
 * leave the list bulletless. Emoji renders on every device that opens this.
 */
const DETAIL_ICONS = {
  event: '🎉',
  venue: '📍',
  date: '📅',
  time: '🕒',
} as const

export function composeAccessCodeEmail(msg: AccessCodeMessage): ComposedEmail {
  const display = formatScannerAccessCode(msg.code)
  const greeting = msg.recipientName?.trim() ? `Hi ${msg.recipientName.trim()},` : 'Hello,'
  const expiry = formatExpiry(msg.expiresAt)

  // Rows are dropped rather than shown empty: a door email with "Time: -" is
  // worse than one that simply doesn't claim to know.
  const details: Array<{ icon: string; label: string; value: string }> = [
    { icon: DETAIL_ICONS.event, label: 'Event', value: msg.eventName },
    ...(msg.venue ? [{ icon: DETAIL_ICONS.venue, label: 'Venue', value: msg.venue }] : []),
    ...(msg.eventDate ? [{ icon: DETAIL_ICONS.date, label: 'Date', value: msg.eventDate }] : []),
    ...(msg.eventTime ? [{ icon: DETAIL_ICONS.time, label: 'Time', value: msg.eventTime }] : []),
  ]

  const text = [
    greeting,
    '',
    'You are the staff member on duty at the entrance for this event:',
    ...details.map((d) => `${d.icon} ${d.label}: ${d.value}`),
    '',
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
  <p style="font-size:15px;line-height:1.5;margin:0 0 14px">
    You are the staff member on duty at the entrance for this event:
  </p>

  <!-- A table, not <ul>: list markers and padding are the first things email
       clients rewrite, and the icon has to stay level with its line. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 20px">
    <tbody>
${details
  .map(
    (d) => `      <tr>
        <td style="width:26px;font-size:16px;line-height:22px;vertical-align:top;padding:0 10px 8px 0">${d.icon}</td>
        <td style="font-size:15px;line-height:22px;color:#111827;padding:0 0 8px">${escapeHtml(d.value)}</td>
      </tr>`
  )
  .join('\n')}
    </tbody>
  </table>

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
