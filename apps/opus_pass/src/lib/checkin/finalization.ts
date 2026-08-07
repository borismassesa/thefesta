import 'server-only'
import { randomUUID } from 'node:crypto'
import { createDashboardClient } from '@/lib/dashboard/supabase'
import { buildCheckinReportModel } from './report-model'
import { CHECKIN_REPORT_MODEL_VERSION, type CheckinReportModel } from './report-model-core'

/**
 * The check-in lifecycle: close the gate, finalize the report, reopen either.
 *
 * The rule this file exists to enforce:
 *
 *   Finalization is a transactional creation of an immutable canonical
 *   snapshot. A Client Event Report exists IF AND ONLY IF an active finalized
 *   snapshot exists. Closure alone never creates or exposes a Client report.
 *
 * Every state transition is a database function, so the legal state machine
 * lives in one place and cannot be half-applied. This module's job is to build
 * the model, hand it over, and refuse to paper over disagreements.
 */

export class ReportDataIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportDataIntegrityError'
  }
}

/** LIVE -> CLOSED. Idempotent: a coordinator tapping twice on a bad connection
 *  should not see an error. */
export async function closeCheckin(eventId: string, actorUserId: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase.rpc('checkin_close_event', {
    p_event_id: eventId,
    p_actor: actorUserId,
  })
  if (error) throw new Error(`Could not close check-in: ${error.message}`)
}

/** CLOSED -> LIVE. Refused by the database once a report is final. */
export async function reopenCheckin(eventId: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase.rpc('checkin_reopen_event', { p_event_id: eventId })
  if (error) throw new Error(`Could not reopen check-in: ${error.message}`)
}

/**
 * CLOSED -> FINAL.
 *
 * The snapshot id and version are chosen HERE, before the model is built, so
 * the model can embed its own identity. A rendered report must never have to
 * join mutable event state to discover which version of reality it represents,
 * and pre-generating keeps the snapshots table append-only with no post-insert
 * patch to write the id back.
 *
 * The database function does the snapshot INSERT and the report_finalized_at
 * UPDATE in one transaction, so either both exist or neither does. The version
 * race is settled there too: two coordinators finalizing at once cannot both
 * land version 2, because the unique indexes reject the loser.
 */
export async function finalizeReport(
  eventId: string,
  actorUserId: string,
): Promise<CheckinReportModel> {
  const supabase = createDashboardClient()

  const { data: versionRows } = await supabase
    .from('checkin_report_snapshots')
    .select('version')
    .eq('event_id', eventId)
    .eq('report_type', 'client_final')
    .order('version', { ascending: false })
    .limit(1)
  const nextVersion = ((versionRows?.[0]?.version as number | undefined) ?? 0) + 1

  const snapshotId = randomUUID()

  const model = await buildCheckinReportModel(actorUserId, eventId)
  if (!model) throw new Error('Event not found')

  // Stamp the identity into the model itself before it is frozen.
  const frozen: CheckinReportModel = {
    ...model,
    finalization: {
      ...model.finalization,
      status: 'final',
      snapshotId,
      version: nextVersion,
      finalizedAt: new Date().toISOString(),
      finalizedBy: actorUserId,
    },
  }

  const { error } = await supabase.rpc('checkin_finalize_report', {
    p_event_id: eventId,
    p_snapshot_id: snapshotId,
    p_version: nextVersion,
    p_model_version: CHECKIN_REPORT_MODEL_VERSION,
    p_model_json: frozen,
    p_actor: actorUserId,
  })
  if (error) throw new Error(`Could not finalize the report: ${error.message}`)

  return frozen
}

/**
 * FINAL -> CLOSED.
 *
 * The active snapshot is superseded at REOPEN, not at the next finalization,
 * so a PDF never goes on presenting itself as the current record while
 * corrections are being made. The window between reopening and re-finalizing
 * deliberately has no client report at all.
 */
export async function reopenReport(eventId: string): Promise<void> {
  const supabase = createDashboardClient()
  const { error } = await supabase.rpc('checkin_reopen_report', { p_event_id: eventId })
  if (error) throw new Error(`Could not reopen the report: ${error.message}`)
}

/**
 * The snapshot a Client Event Report renders from, or null when there is none.
 *
 * Availability is the CONJUNCTION, never the timestamp alone:
 *
 *   clientReportAvailable = reportFinalizedAt !== null && activeSnapshot !== null
 *
 * If those two disagree — corruption, a failed historical migration — this
 * FAILS CLOSED with a data-integrity error. It must never regenerate from
 * current tables to paper over the gap: a report that silently reconstructs
 * itself from today's data is precisely the failure the snapshot exists to
 * prevent.
 */
export async function loadFinalizedReport(
  userId: string,
  eventId: string,
): Promise<{ model: CheckinReportModel; modelVersion: number; version: number } | null> {
  const supabase = createDashboardClient()

  const { data: event } = await supabase
    .from('wedding_events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .maybeSingle<Record<string, unknown>>()
  if (!event) return null

  const finalizedAt = typeof event.report_finalized_at === 'string' ? event.report_finalized_at : null

  const { data: snapshot } = await supabase
    .from('checkin_report_snapshots')
    .select('id, version, model_version, model_json')
    .eq('event_id', eventId)
    .eq('report_type', 'client_final')
    .is('superseded_at', null)
    .maybeSingle<{
      id: string
      version: number
      model_version: number
      model_json: CheckinReportModel
    }>()

  if (!finalizedAt && !snapshot) return null

  if (!finalizedAt || !snapshot) {
    throw new ReportDataIntegrityError(
      `Event ${eventId} has report_finalized_at=${finalizedAt ? 'set' : 'null'} but ` +
        `${snapshot ? 'an active snapshot' : 'no active snapshot'}. Refusing to render a ` +
        `client report from live tables.`,
    )
  }

  return {
    model: snapshot.model_json,
    modelVersion: snapshot.model_version,
    version: snapshot.version,
  }
}
