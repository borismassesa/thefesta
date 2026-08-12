/** Employee-facing labels for roster / work_mode values. */
export function humanizeShiftType(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[_-]+/g, ' ')
  const map: Record<string, string> = {
    office: 'In-office',
    remote: 'Remote',
    hybrid: 'Hybrid',
    field: 'Field',
    off: 'Day off',
    'on call': 'On call',
    'full day': 'Full day',
    'half day': 'Half day',
  }
  if (map[key]) return map[key]
  return raw
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Geolocation rule for a punch, given the schedule policy and the employee's
 * work arrangement for the day. Prefer `effectiveGeolocationMode` from
 * `@/lib/attendance/queries` on the server; this copy keeps Workspace UI free
 * of a server-only import path.
 */
export function effectiveGeolocationMode(
  scheduleMode: 'off' | 'optional' | 'required',
  workMode: string | null | undefined,
): 'off' | 'optional' | 'required' {
  const mode = (workMode ?? 'office').trim().toLowerCase()
  if (mode === 'remote') return 'off'
  if (mode === 'hybrid') return scheduleMode === 'off' ? 'off' : 'optional'
  if (mode === 'field') return scheduleMode === 'required' ? 'optional' : scheduleMode
  return scheduleMode
}
