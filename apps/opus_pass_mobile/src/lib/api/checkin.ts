import Constants from 'expo-constants';
import { resolveApiOrigin } from '@/lib/api/apiOrigin';
import { publicOrigin } from '@/lib/share';
import type {
  CheckinScanResult,
  ResolveCodeResult,
  ValidateSessionResult,
} from '@/types/checkin';

/**
 * Client for the door-scanner check-in API, served by apps/opus_pass
 * (`/api/checkin/*`) rather than Supabase directly.
 *
 * This deliberately does NOT talk to Supabase like the rest of this app's
 * data layer. Verifying an entry pass requires CHECKIN_TOKEN_SECRET, and a
 * secret shipped inside an app bundle can be extracted and used to forge
 * passes — so all verification stays server-side and the app only relays
 * what it scanned. It also means the access code, not the couple's Clerk
 * session, is what authorizes a scan, which is what lets hired staff scan
 * without an account.
 */

function checkinUrl(path: string): string {
  const origin = resolveApiOrigin(
    publicOrigin(),
    Constants.expoConfig?.hostUri ?? '',
    __DEV__
  );
  return `${origin}/api/checkin/${path}`;
}

/**
 * Cap on any check-in request. Without it, a host that silently drops
 * packets — the classic case is a dev URL pointing at an IP from a previous
 * network — spins for the OS's TCP timeout, over a minute on iOS, and the
 * attendant just sees a spinner that never ends. Generous enough for venue
 * networks, which are slow but not minute-slow.
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Cap for calls that only READ.
 *
 * Longer than the writing one on purpose. The 15s cap is short because an
 * admission that may or may not have committed has to be resolved quickly by
 * a human; a lookup has nothing to resolve, so giving up early only costs the
 * attendant a retype. The case that needs the headroom is a first request to a
 * dev server, which compiles the route on demand and can sit well past 15s
 * before answering — the door then sees a failure against a server that was
 * about to reply.
 */
const READ_TIMEOUT_MS = 40000;

interface PostOptions {
  /** True when the call cannot change anything, so a timeout can promise
   *  nothing was recorded. Never set this on an admission. */
  readOnly?: boolean;
}

async function postJson<T>(path: string, body: unknown, options: PostOptions = {}): Promise<T> {
  const url = checkinUrl(path);
  const readOnly = options.readOnly === true;

  // AbortController + timer rather than AbortSignal.timeout: the static
  // helper isn't in Hermes, and this file runs on-device.
  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(),
    readOnly ? READ_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } catch (err) {
    // A timeout is not the same failure as an unreachable host, and must not
    // claim nothing was recorded: the abort fires client-side, so the POST
    // may already have committed the check-in. Telling the attendant to look
    // before retrying is what stops a "why does it say already scanned".
    if (err instanceof Error && err.name === 'AbortError') {
      // A read cannot have changed anything, so it must not raise the alarm a
      // half-committed admission does. Telling an attendant to go and check a
      // guest who was never admitted is its own kind of wrong answer.
      throw new Error(
        readOnly
          ? `${hostOf(url)} took too long to answer. Nothing was recorded. Try again.`
          : `${hostOf(url)} took too long to answer. This may still have gone through. Check the guest before scanning again.`
      );
    }
    // The request never landed: wrong network, server down, or a URL the
    // device can't route to. Naming the host is the whole point here — the
    // usual cause is the app pointing somewhere it can't reach, and a
    // generic "check your connection" hides exactly the detail needed.
    throw new Error(`Can't reach ${hostOf(url)}. Check the network and that the server is running.`);
  } finally {
    // A settled fetch no longer needs its abort timer; without this every
    // successful call leaves a timer waiting to abort a dead controller.
    clearTimeout(timer);
  }

  // These endpoints return a JSON body on failure too (401 for an expired
  // code, etc.), and that body carries the message worth showing the
  // attendant — so read it before deciding the request failed.
  const raw = await response.text().catch(() => '');
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Reached a server, but not this API: almost always a 404 HTML page from
    // an origin where these routes aren't deployed.
    throw new Error(
      `${hostOf(url)} returned ${response.status}, not check-in data. Is the check-in API deployed there?`
    );
  }
}

/** Host (and port) of a URL, for error messages — the full path adds noise. */
function hostOf(url: string): string {
  const match = /^https?:\/\/([^/]+)/.exec(url);
  return match ? match[1] : url;
}

/** Exchange a typed access code for the event it belongs to. */
export function resolveAccessCode(token: string): Promise<ResolveCodeResult> {
  return postJson<ResolveCodeResult>('resolve', { token: token.trim() }, { readOnly: true });
}

/** Confirm the access code is still valid and fetch the event + guest roster. */
export function validateScannerSession(
  eventId: string,
  token: string
): Promise<ValidateSessionResult> {
  return postJson<ValidateSessionResult>('validate', { eventId, token });
}

export interface SubmitScanInput {
  eventId: string;
  accessToken: string;
  /** The raw scanned QR string. Omit for a manual override. */
  qrToken?: string;
  /** Manual override: admit a guest picked from the roster. Needs manualReason. */
  invitationId?: string;
  /** Manual override by the short code printed on the ticket. Needs manualReason. */
  entryCode?: string;
  manualReason?: string;
  /** How many of the party actually arrived. Server defaults to the whole
   *  remaining allowance. */
  checkedInPartySize?: number;
  /**
   * Stable id for ONE admission attempt, reused when that attempt is retried.
   *
   * Check-in is a bounded counter server-side, so a retry after a lost
   * response would otherwise admit the same people a second time. The server
   * replays the original outcome for a request id it has already processed.
   * A genuinely new admission (the rest of a party arriving later) must use a
   * NEW id.
   */
  requestId?: string;
  doorLabel?: string;
  attendantName?: string;
}

export function submitScan(input: SubmitScanInput): Promise<CheckinScanResult> {
  return postJson<CheckinScanResult>('scan', input);
}

export interface LookupInput {
  eventId: string;
  accessToken: string;
  /** Exactly one of these. */
  passId?: string;
  entryCode?: string;
}

export type LookupResult =
  | {
      status: 'found';
      identifierType: 'pass_id' | 'legacy_entry_code';
      invitationId: string;
      passId: string | null;
      entryCode: string | null;
      guestName: string;
      /** Null when the couple never recorded a number for this guest. */
      guestPhone: string | null;
      groupTag: string | null;
      isVip: boolean;
      tableName: string | null;
      rsvpStatus: string;
      /** False when the guest is no longer attending — /scan would refuse. */
      admissible: boolean;
      rsvpdPartySize: number;
      alreadyAdmitted: number;
      remainingAllowance: number;
      firstCheckedInAt: string | null;
    }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string };

/**
 * Find one admission WITHOUT admitting anyone.
 *
 * Deliberately a different endpoint from submitScan rather than a flag on it:
 * a flag that suppresses the write is one typo away from an accidental
 * admission. This one cannot write. Admission is a separate submitScan call
 * the attendant makes after seeing who they are looking at.
 */
export function lookupAdmission(input: LookupInput): Promise<LookupResult> {
  return postJson<LookupResult>('lookup', input, { readOnly: true });
}

export interface AmendPartySizeInput {
  eventId: string;
  accessToken: string;
  qrToken?: string;
  invitationId?: string;
  /** The corrected total who arrived. 0 fully reverses the check-in. */
  checkedInPartySize: number;
  /** Why the headcount changed. The server records it in the audit ledger and
   *  substitutes a generic reason when omitted. */
  reason?: string;
  /** Stable id for one correction, reused across its retries. */
  requestId?: string;
  doorLabel?: string;
}

/**
 * Correct how many of an already-admitted party actually arrived.
 *
 * Separate from submitScan because check-in is first-scan-wins — re-scanning
 * a pass reports a duplicate and will not rewrite the headcount. See
 * apps/opus_pass/src/app/api/checkin/amend/route.ts.
 */
export function amendPartySize(input: AmendPartySizeInput): Promise<CheckinScanResult> {
  return postJson<CheckinScanResult>('amend', input);
}
