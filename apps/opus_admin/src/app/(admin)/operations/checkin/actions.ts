'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission, getCallerEmail } from '@/lib/admin-auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateScannerAccessToken } from '@/lib/checkin-tokens'
import { accessCodeExpiry, type AccessCodeValidity } from '@/lib/checkin-code'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { composeAccessCodeEmail } from '@/lib/checkin-access-email'

export interface AttendantAssignment {
  id: string
  doorLabel: string
  attendantName: string
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export type AssignAttendantResult =
  | { ok: true; token: string; link: string; expiresAt: string; linkWarning?: string; delivery?: DeliveryResult }
  | { ok: false; error: string }

export type RevokeAttendantResult = { ok: true } | { ok: false; error: string }

/** Outcome of handing the code to the coordinator, reported alongside the
 *  code itself so the admin knows whether they still need to relay it. */
export type DeliveryResult =
  | { channel: 'email'; sent: true; to: string }
  | { channel: 'email'; sent: false; to: string; error: string }

export type SendAccessCodeResult = { ok: true } | { ok: false; error: string }

/** Deliberately loose: real addresses this rejects are worse than odd ones it
 *  lets through, since Resend reports a hard failure either way. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Every event this product serves runs on Tanzanian local time. */
const EVENT_TIME_ZONE = 'Africa/Dar_es_Salaam'

interface AccessCodeDelivery {
  eventId: string
  to: string
  recipientName: string | null
  doorLabel: string
  code: string
  expiresAt: string
  link: string
}

/**
 * Email a door code to the person working that door.
 *
 * The raw token is never stored (only its hash), so it can only travel from
 * the caller who just minted it — which is why `code` is a parameter rather
 * than something this can look up. That makes the permission check the whole
 * of the authorization story: anyone who can call this already holds a code
 * they were shown, and can only send it onward.
 */
async function deliverAccessCode(d: AccessCodeDelivery): Promise<DeliveryResult> {
  const to = d.to.trim()
  if (!isEmailConfigured()) {
    return { channel: 'email', sent: false, to, error: 'Email is not configured (RESEND_API_KEY is unset)' }
  }

  const supabase = createSupabaseAdminClient()
  const { data: event } = await supabase
    .from('wedding_events')
    .select('name, starts_at, venue_name, city')
    .eq('id', d.eventId)
    .maybeSingle<{ name: string; starts_at: string | null; venue_name: string | null; city: string | null }>()

  const message = composeAccessCodeEmail({
    recipientName: d.recipientName,
    eventName: event?.name ?? 'your event',
    // Pinned to Dar es Salaam: the server runs in UTC, so an evening event
    // would otherwise be emailed to the door with the previous day's date.
    eventDate: event?.starts_at
      ? new Date(event.starts_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: EVENT_TIME_ZONE })
      : null,
    eventTime: event?.starts_at
      // en-US for the 12-hour clock the door reads it in ("4:00 PM").
      ? new Date(event.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: EVENT_TIME_ZONE })
      : null,
    venue: [event?.venue_name, event?.city].filter(Boolean).join(', ') || null,
    doorLabel: d.doorLabel,
    code: d.code,
    expiresAt: d.expiresAt,
    link: d.link,
  })

  const result = await sendEmail({ to, subject: message.subject, html: message.html, text: message.text })
  const callerEmail = await getCallerEmail()
  // The code itself is never logged — only that a delivery was attempted,
  // to whom, and by whom.
  console.warn('[opuspass-checkin] access code delivery', {
    eventId: d.eventId,
    to,
    door: d.doorLabel,
    sent: result.sent,
    by: callerEmail,
  })

  return result.sent
    ? { channel: 'email', sent: true, to }
    : { channel: 'email', sent: false, to, error: result.error ?? result.reason }
}

/**
 * Send an already-minted code on to a coordinator. Used by the reveal card
 * when the address wasn't known at assign time, or the first send bounced.
 */
export async function sendAccessCode(input: {
  eventId: string
  to: string
  attendantName: string
  doorLabel: string
  code: string
  expiresAt: string
  link: string
}): Promise<SendAccessCodeResult> {
  await requirePermission('opuspass.checkin')
  const to = input.to.trim()
  if (!EMAIL_RE.test(to)) return { ok: false, error: 'Enter a valid email address' }

  const delivery = await deliverAccessCode({
    eventId: input.eventId,
    to,
    recipientName: input.attendantName,
    doorLabel: input.doorLabel,
    code: input.code,
    expiresAt: input.expiresAt,
    link: input.link,
  })
  return delivery.sent ? { ok: true } : { ok: false, error: delivery.error }
}

/**
 * Assign a named attendant to an OpusPass event's door and mint their
 * scanner link. Mirrors apps/opus_pass's generateScannerAccessToken()
 * (couple self-serve), but issued with assigned_by='admin' and an
 * authoritative attendant_name — see the schema note in
 * supabase/migrations/20260630000002_opuspass_checkin_admin_attendants.sql.
 *
 * scanner_access_tokens.user_id is NOT NULL and must be the event's owning
 * couple (that's who the owner-only RLS policy checks) — admin is acting
 * ON BEHALF OF the couple here, not as a separate identity, so the couple's
 * own dashboard (DoorStaffAccessCard, LiveAttendance) sees and can revoke
 * admin-assigned attendants alongside their own, which is the correct
 * behavior for "it's still their event."
 */
export async function assignAttendant(
  eventId: string,
  attendantName: string,
  doorLabel: string,
  validity: AccessCodeValidity = 'event',
  /** Optional: email the code straight to the coordinator working this door. */
  deliverToEmail?: string,
): Promise<AssignAttendantResult> {
  await requirePermission('opuspass.checkin')
  const name = attendantName.trim()
  if (!name) return { ok: false, error: 'Attendant name is required' }
  const deliverTo = deliverToEmail?.trim() || ''
  // Validated before the token is minted: a typo should cost nothing, not
  // leave a live unusable credential on the event.
  if (deliverTo && !EMAIL_RE.test(deliverTo)) return { ok: false, error: 'Enter a valid email address' }

  const supabase = createSupabaseAdminClient()

  const { data: event, error: eventErr } = await supabase
    .from('wedding_events')
    .select('id, user_id, starts_at, ends_at')
    .eq('id', eventId)
    .maybeSingle<{ id: string; user_id: string; starts_at: string | null; ends_at: string | null }>()
  if (eventErr) return { ok: false, error: eventErr.message }
  if (!event) return { ok: false, error: 'Event not found' }

  const { rawToken, tokenHash } = generateScannerAccessToken()
  const expiresAt = accessCodeExpiry(validity, event.starts_at, event.ends_at)

  const { error } = await supabase.from('scanner_access_tokens').insert({
    user_id: event.user_id,
    event_id: eventId,
    door_label: doorLabel.trim() || 'Main Gate',
    token_hash: tokenHash,
    expires_at: expiresAt,
    attendant_name: name,
    assigned_by: 'admin',
  })
  if (error) return { ok: false, error: error.message }

  const callerEmail = await getCallerEmail()
  console.warn('[opuspass-checkin] admin assigned attendant', { eventId, attendantName: name, by: callerEmail })

  // Absolute share links must land on opus_pass's /entrance-card-scanner UI
  // (not this admin origin). Prefer NEXT_PUBLIC_OPUS_SCANNER_URL (includes that
  // path prefix); fall back to NEXT_PUBLIC_OPUS_PASS_URL + /entrance-card-scanner.
  // Relative fallbacks are forbidden — they break when pasted into WhatsApp/SMS.
  const passOrigin = (process.env.NEXT_PUBLIC_OPUS_PASS_URL || '').replace(/\/$/, '')
  const scannerOrigin = (
    process.env.NEXT_PUBLIC_OPUS_SCANNER_URL ||
    (passOrigin ? `${passOrigin}/entrance-card-scanner` : '')
  ).replace(/\/$/, '')
  const link = scannerOrigin ? `${scannerOrigin}/event/${eventId}?token=${encodeURIComponent(rawToken)}` : ''
  if (!scannerOrigin) {
    console.error(
      '[opuspass-checkin] NEXT_PUBLIC_OPUS_SCANNER_URL (or NEXT_PUBLIC_OPUS_PASS_URL) is not set — cannot build an absolute scanner link',
    )
  }

  // Delivery failure never fails the assignment: the code is already minted
  // and valid, and the reveal card can still hand it over. The outcome rides
  // back so the admin knows whether they still have to relay it themselves.
  const delivery = deliverTo
    ? await deliverAccessCode({
        eventId,
        to: deliverTo,
        recipientName: name,
        doorLabel: doorLabel.trim() || 'Main Gate',
        code: rawToken,
        expiresAt,
        link,
      })
    : undefined

  revalidatePath(`/operations/checkin/${eventId}`)
  return {
    ok: true,
    token: rawToken,
    link,
    expiresAt,
    delivery,
    ...(scannerOrigin
      ? {}
      : {
          linkWarning:
            'Scanner URL is not configured — set NEXT_PUBLIC_OPUS_SCANNER_URL or NEXT_PUBLIC_OPUS_PASS_URL, then reassign.',
        }),
  }
}

export async function listAttendants(eventId: string): Promise<AttendantAssignment[]> {
  await requirePermission('opuspass.checkin')
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('scanner_access_tokens')
    .select('id, door_label, attendant_name, expires_at, revoked_at, last_used_at, created_at, assigned_by')
    .eq('event_id', eventId)
    .eq('assigned_by', 'admin')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    doorLabel: r.door_label as string,
    attendantName: (r.attendant_name as string | null) ?? 'Unnamed',
    expiresAt: r.expires_at as string,
    revokedAt: r.revoked_at as string | null,
    lastUsedAt: r.last_used_at as string | null,
    createdAt: r.created_at as string,
  }))
}

export async function revokeAttendant(tokenId: string, eventId: string): Promise<RevokeAttendantResult> {
  await requirePermission('opuspass.checkin')
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('scanner_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('assigned_by', 'admin')
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/operations/checkin/${eventId}`)
  return { ok: true }
}
