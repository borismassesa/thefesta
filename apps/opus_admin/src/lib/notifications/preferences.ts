// Preference resolution, kept pure and separate from the emitter so it can be
// tested without a database. This is the code path that decides whether a
// person hears about something, so it is the last place that should only be
// exercisable end-to-end.

import type { NotificationChannel, NotificationPriority } from './types'

export type PreferenceRow = {
  employee_id: string
  // Matches workflow_events.event_type, or '*' for a blanket default.
  event_type: string
  bell_enabled: boolean
  email_enabled: boolean
  digest_frequency: string
}

export type PreferenceDecision = {
  deliver: boolean
  // True when a recorded preference said no and we sent anyway. Persisted on
  // the notification so "why did I get this?" has an answer in the data
  // rather than in someone's memory of the rules.
  bypassed: boolean
  bypassReason: string | null
}

// "Critical" is narrow on purpose. It is not a severity dial modules may reach
// for; it is the small set where a missed message causes harm that the
// recipient's inbox preference should not be able to cause:
//
//   - safety and security incidents
//   - payroll release
//   - a statutory or contractual legal deadline
//   - an action that blocks other people until this person moves
//
// A routine leave request or purchase order is 'high', not 'critical'. Nothing
// the Approvals module emits today is critical — see EVENT_PRESENTATION.
export const CRITICAL_BYPASS_REASON = 'critical_priority'

export function resolvePreference(
  rows: PreferenceRow[],
  employeeId: string,
  eventType: string,
  channel: NotificationChannel,
  priority: NotificationPriority,
): PreferenceDecision {
  const forEmployee = rows.filter((r) => r.employee_id === employeeId)
  // A preference recorded for this exact event beats the blanket '*' row.
  const row =
    forEmployee.find((r) => r.event_type === eventType) ??
    forEmployee.find((r) => r.event_type === '*')

  // ABSENT ROW MEANS ENABLED. Nobody is opted in by a migration, so treating
  // "no row" as "off" would silently deliver nothing at all.
  if (!row) return { deliver: true, bypassed: false, bypassReason: null }

  const wanted =
    channel === 'bell'
      ? row.bell_enabled
      : // 'off' silences email entirely. The digest values would defer it, but
        // no scheduler consumes them yet, so they deliver immediately rather
        // than being dropped on the floor.
        row.email_enabled && row.digest_frequency !== 'off'

  if (wanted) return { deliver: true, bypassed: false, bypassReason: null }

  // Critical overrides a recorded "no" on the bell only. Email is a channel
  // someone may legitimately have turned off at the mail-server level, and
  // forcing it there achieves nothing except noise.
  if (priority === 'critical' && channel === 'bell') {
    return { deliver: true, bypassed: true, bypassReason: CRITICAL_BYPASS_REASON }
  }

  return { deliver: false, bypassed: false, bypassReason: null }
}
