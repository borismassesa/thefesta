import { resolveReadScope, type ReadScope } from '@/lib/workforce/approvals'
import type { CallerScope } from '@/lib/workforce/scope'

// Pure attendance access policy.
//
// NOTE ON NAMING: this surface is called "Timesheets" in the route and was
// historically a timesheet system. It is not one. Migration
// 066_remove_timesheet_system.sql (2026-02-15) deliberately removed the
// submission and approval infrastructure — weekly, department, project and
// utilisation summaries, and can_approve_timesheet(uuid, uuid). What remains
// is a read-only weekly grid DERIVED FROM TIME PUNCHES. There is no
// submission record, no status, no attestation and no approval.
//
// The reason for that removal is NOT recorded in the migration and has not
// been verified, so nothing here should be read as endorsing or reversing it.
// A future timesheet feature should start from product requirements and a
// review of that history, not from restoring dropped tables.
//
// The visible product language is therefore "Attendance". The route stays at
// /workforce/timesheets for link stability.

/** Org keys that grant the organisation-wide attendance view. */
export const ATTENDANCE_READ_KEYS = [
  'workforce.attendance.read',
  'workforce.attendance.admin',
] as const

/**
 * Correcting a punch is materially more powerful than reading one: it rewrites
 * the record of when somebody worked. Team visibility must NOT imply it.
 *
 * Kept separate from the read keys so a manager who can review their reports'
 * attendance cannot silently edit it.
 */
export const ATTENDANCE_ADMIN_KEY = 'workforce.attendance.admin'

export type AttendanceReadScope = ReadScope

export function attendanceReadScope(scope: CallerScope): AttendanceReadScope {
  return resolveReadScope(scope, ATTENDANCE_READ_KEYS)
}

/**
 * May this caller insert, edit or delete punches?
 *
 * Org-only, and deliberately NOT satisfied by team scope or by read access.
 * Legacy workforce.write expands into workforce.attendance.admin, so existing
 * correctors are unaffected.
 */
export function canCorrectAttendance(scope: CallerScope): boolean {
  return scope.permissions.has(ATTENDANCE_ADMIN_KEY)
}
