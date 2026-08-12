import { scannerGuestDisplayName } from '@opusfesta/lib'
import type { CheckinScanResult, ResolveCodeResult, ValidateSessionResult } from '@/types/scanner-checkin'

/**
 * Client for the door-scanner check-in API, served by apps/opus_pass
 * (`/api/checkin/*`) rather than Supabase directly.
 *
 * This deliberately does NOT talk to Supabase like a typical web app's data
 * layer. Verifying an entry pass requires CHECKIN_TOKEN_SECRET, and a secret
 * shipped to a browser can be extracted and used to forge passes — so all
 * verification stays server-side and this app only relays what it scanned. It
 * also means the access code, not a user account, is what authorizes a scan,
 * which is what lets hired staff scan from a shared link with no login.
 *
 * Same-origin `/api/checkin/*` on this app — no cross-app proxy. Door staff
 * open `/entrance-card-scanner` on OpusPass; the browser never leaves this origin.
 *
 * Ported from apps/opus_pass_mobile/src/lib/api/checkin.ts — same timeouts,
 * same error wording, same behaviour, so the door works the same on web.
 */

function checkinUrl(path: string): string {
  return `/api/checkin/${path}`
}

/**
 * Cap on any check-in request. Without it, a host that silently drops
 * packets spins for the browser's own timeout, and the attendant just sees a
 * spinner that never ends. Generous enough for venue networks, which are slow
 * but not minute-slow.
 */
const REQUEST_TIMEOUT_MS = 15000

/**
 * Cap for calls that cannot admit anybody.
 *
 * Longer than the admission one on purpose. The 15s cap is short because an
 * admission that may or may not have committed has to be resolved quickly by
 * a human standing at a door; nothing here has that problem, so giving up
 * early only costs the attendant a retry. The case that needs the headroom is
 * the first request to a cold server, which can sit well past 15s before
 * answering — the door then sees a failure against a server that was about to
 * reply, which is how a shift starts with "couldn't load arrivals" and a
 * healthy server.
 */
const NO_ADMISSION_TIMEOUT_MS = 40000

interface PostOptions {
  /**
   * True when this call cannot admit a guest, so a timeout can say plainly
   * that nobody was let in. /validate is included: it does stamp a last-used
   * time on the door code, but that is bookkeeping nobody has to reconcile at
   * the door. Never set it on submitScan or amend.
   */
  cannotAdmit?: boolean
}

async function postJson<T>(path: string, body: unknown, options: PostOptions = {}): Promise<T> {
  const url = checkinUrl(path)
  const cannotAdmit = options.cannotAdmit === true

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), cannotAdmit ? NO_ADMISSION_TIMEOUT_MS : REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    })
  } catch (err) {
    // A timeout is not the same failure as an unreachable host, and must not
    // claim nothing was recorded: the abort fires client-side, so the POST
    // may already have committed the check-in. Telling the attendant to look
    // before retrying is what stops a "why does it say already scanned".
    if (err instanceof Error && err.name === 'AbortError') {
      // A call that cannot admit anyone must not raise the alarm a
      // half-committed admission does. Telling an attendant to go and check a
      // guest who was never admitted is its own kind of wrong answer.
      throw new Error(
        cannotAdmit
          ? 'The server took too long to answer. Nobody was admitted. Try again.'
          : 'The server took too long to answer. This may still have gone through. Check the guest before scanning again.'
      )
    }
    // The request never landed: no network, server down, or a deployment
    // where the check-in API is not wired up.
    throw new Error('Can\'t reach the check-in service. Check the network and try again.')
  } finally {
    // A settled fetch no longer needs its abort timer; without this every
    // successful call leaves a timer waiting to abort a dead controller.
    clearTimeout(timer)
  }

  // These endpoints return a JSON body on failure too (401 for an expired
  // code, etc.), and that body carries the message worth showing the
  // attendant — so read it before deciding the request failed.
  const raw = await response.text().catch(() => '')
  try {
    return JSON.parse(raw) as T
  } catch {
    // Reached a server, but not this API: almost always an HTML error page
    // from an origin where these routes aren't deployed/proxied.
    throw new Error(`The server returned ${response.status}, not check-in data. Is the check-in API deployed?`)
  }
}

/** Exchange a typed access code for the event it belongs to. */
export function resolveAccessCode(token: string): Promise<ResolveCodeResult> {
  return postJson<ResolveCodeResult>('resolve', { token: token.trim() }, { cannotAdmit: true })
}

/** Confirm the access code is still valid and fetch the event + guest roster. */
export async function validateScannerSession(
  eventId: string,
  token: string
): Promise<ValidateSessionResult> {
  const result = await postJson<ValidateSessionResult>('validate', { eventId, token }, { cannotAdmit: true })
  if (!result.ok) return result
  return {
    ...result,
    roster: result.roster.map((guest) => ({
      ...guest,
      fullName: scannerGuestDisplayName(guest.fullName),
    })),
  }
}

export interface SubmitScanInput {
  eventId: string
  accessToken: string
  /** The raw scanned QR string. Omit for a manual override. */
  qrToken?: string
  /** Manual override: admit a guest picked from the roster. Needs manualReason. */
  invitationId?: string
  /** Manual override by the short code printed on the ticket. Needs manualReason. */
  entryCode?: string
  manualReason?: string
  /** How many of the party actually arrived. Server defaults to the whole
   *  remaining allowance. */
  checkedInPartySize?: number
  /**
   * Stable id for ONE admission attempt, reused when that attempt is retried.
   *
   * Check-in is a bounded counter server-side, so a retry after a lost
   * response would otherwise admit the same people a second time. The server
   * replays the original outcome for a request id it has already processed.
   * A genuinely new admission (the rest of a party arriving later) must use a
   * NEW id.
   */
  requestId?: string
  doorLabel?: string
  attendantName?: string
}

export async function submitScan(input: SubmitScanInput): Promise<CheckinScanResult> {
  const result = await postJson<CheckinScanResult>('scan', input)
  return result.guestName ? { ...result, guestName: scannerGuestDisplayName(result.guestName) } : result
}

export interface LookupInput {
  eventId: string
  accessToken: string
  /** Exactly one of these. */
  passId?: string
  entryCode?: string
}

export type LookupResult =
  | {
      status: 'found'
      identifierType: 'pass_id' | 'legacy_entry_code'
      invitationId: string
      passId: string | null
      entryCode: string | null
      guestName: string
      /** Null when the couple never recorded a number for this guest. */
      guestPhone: string | null
      groupTag: string | null
      isVip: boolean
      tableName: string | null
      rsvpStatus: string
      /** Whether the door will accept this guest. Read it rather than deriving
       *  it from `rsvpStatus`: an invitation is enough to be admitted now, so
       *  this is true for every guest the lookup finds. */
      admissible: boolean
      rsvpdPartySize: number
      alreadyAdmitted: number
      remainingAllowance: number
      firstCheckedInAt: string | null
    }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }

/**
 * Find one admission WITHOUT admitting anyone.
 *
 * Deliberately a different endpoint from submitScan rather than a flag on it:
 * a flag that suppresses the write is one typo away from an accidental
 * admission. This one cannot write. Admission is a separate submitScan call
 * the attendant makes after seeing who they are looking at.
 */
export async function lookupAdmission(input: LookupInput): Promise<LookupResult> {
  const result = await postJson<LookupResult>('lookup', input, { cannotAdmit: true })
  return result.status === 'found' ? { ...result, guestName: scannerGuestDisplayName(result.guestName) } : result
}

export interface AmendPartySizeInput {
  eventId: string
  accessToken: string
  qrToken?: string
  invitationId?: string
  /** The corrected total who arrived. 0 fully reverses the check-in. */
  checkedInPartySize: number
  /** Why the headcount changed. The server records it in the audit ledger and
   *  substitutes a generic reason when omitted. */
  reason?: string
  /** Stable id for one correction, reused across its retries. */
  requestId?: string
  doorLabel?: string
}

/**
 * Correct how many of an already-admitted party actually arrived.
 *
 * Separate from submitScan because check-in is first-scan-wins — re-scanning
 * a pass reports a duplicate and will not rewrite the headcount. See
 * apps/opus_pass/src/app/api/checkin/amend/route.ts.
 */
export async function amendPartySize(input: AmendPartySizeInput): Promise<CheckinScanResult> {
  const result = await postJson<CheckinScanResult>('amend', input)
  return result.guestName ? { ...result, guestName: scannerGuestDisplayName(result.guestName) } : result
}

export interface ReportLinkResult {
  ok: boolean
  path?: string
  error?: string
}

/**
 * Ask for a link to this event's check-in report PDF.
 *
 * Returns an absolute URL on THIS origin: next.config.ts also proxies
 * /api/checkin-report/* to opus_pass, so the signed path the server hands
 * back resolves through the same deployment the attendant is already using.
 */
export async function reportLink(eventId: string, accessToken: string): Promise<string> {
  const result = await postJson<ReportLinkResult>('report-link', { eventId, token: accessToken }, { cannotAdmit: true })
  if (!result.ok || !result.path) {
    throw new Error(result.error ?? "Couldn't prepare the report.")
  }
  return `${window.location.origin}${result.path}`
}
