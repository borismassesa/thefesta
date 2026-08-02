import { isLeaveType, type LeaveType } from './leave-calculation'

// Validation of UNTRUSTED input. Pure, no I/O.
//
// Note what is absent by design: employeeId. No public Workspace boundary
// accepts one, so there is nothing here to validate it against. The server
// adds the resolved id after this runs. If a field named employeeId ever
// appears in this file, the IDOR invariant has been broken.

export type ParsedCreateInput = {
  type: LeaveType
  startDate: string
  endDate: string
  reason: string
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** ISO `YYYY-MM-DD` that is also a real calendar date. */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  // Round-trip catches values that parse but roll over, e.g. 2026-02-30.
  return d.toISOString().slice(0, 10) === value
}

const MAX_REASON = 500

export function parseCreateInput(raw: unknown): ParseResult<ParsedCreateInput> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Missing request details.' }
  }
  const o = raw as Record<string, unknown>

  if (typeof o.type !== 'string' || !isLeaveType(o.type)) {
    return { ok: false, error: 'Pick a known leave type.' }
  }
  if (!isValidIsoDate(o.startDate)) {
    return { ok: false, error: 'Pick a valid start date.' }
  }
  if (!isValidIsoDate(o.endDate)) {
    return { ok: false, error: 'Pick a valid end date.' }
  }

  // reason is NOT NULL in workforce_leave_requests, and the existing
  // Workforce submit path already requires 3 characters. Kept identical so
  // the two surfaces do not disagree about what counts as a valid request.
  const reason = typeof o.reason === 'string' ? o.reason.trim() : ''
  if (reason.length < 3) {
    return { ok: false, error: 'Give a short reason for the request.' }
  }
  if (reason.length > MAX_REASON) {
    return { ok: false, error: `Keep the reason under ${MAX_REASON} characters.` }
  }

  return {
    ok: true,
    value: { type: o.type, startDate: o.startDate, endDate: o.endDate, reason },
  }
}

/** A request id from the client. Only ever used to LOOK UP a row whose
 *  ownership is then verified server-side; never trusted on its own. */
export function parseRequestId(raw: unknown): ParseResult<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'Missing request reference.' }
  }
  return { ok: true, value: raw.trim() }
}
