// Server-side log lines for the card release pipeline.
//
// Until now this pipeline wrote none. A release that half happened left no
// trace anywhere: the reviewer got one sentence on screen, and that sentence
// was the entire record. Whether the release row survived, whether the storage
// object was rolled back, whether the order tracker moved, all of it was
// unknowable an hour later.
//
// Codes and identifiers only, the same rule opus_pass keeps in
// prepare-guest-asset.ts. A card's field_values hold the couple's names and
// their contact details, so no value from a card ever reaches a log line.
//
// A Postgres error's `message` IS included: it names the constraint or relation
// and is what makes a failure diagnosable. `details` and `hint` are the parts
// that quote the offending row ("Key (x)=(value) already exists"), so they are
// deliberately never read here.

export type ReleaseFailureCode =
  // freezeCardRelease reads
  | 'design_read'
  | 'product_read'
  | 'order_read'
  | 'event_read'
  // releaseApprovedDesign writes
  | 'release_pointer_read'
  | 'release_insert'
  | 'release_status_write'
  | 'release_raced'
  | 'release_supersede'
  // rollback
  | 'rollback_release_row'
  | 'rollback_release_object'
  // order stage sync
  | 'order_stage_read'
  | 'order_stage_empty'
  | 'order_stage_write'
  // history
  | 'design_event_write'

export type ReleaseLogIds = {
  designId?: string
  orderId?: string
  releaseId?: string
}

/** Shape shared by PostgrestError and StorageError. Both are `{ message }` at minimum. */
export type LoggableError = { message?: string | null; code?: string | null } | null | undefined

/**
 * The log line, as a value.
 *
 * Split from the writing of it so the redaction rule above is testable: a test
 * can assert what a line contains without capturing console output.
 */
export function formatReleaseFailure(
  code: ReleaseFailureCode,
  ids: ReleaseLogIds,
  error?: LoggableError,
): string {
  const parts = [`[card-release] ${code}`]
  if (ids.designId) parts.push(`design=${ids.designId}`)
  if (ids.orderId) parts.push(`order=${ids.orderId}`)
  if (ids.releaseId) parts.push(`release=${ids.releaseId}`)
  if (error?.code) parts.push(`pgcode=${error.code}`)
  if (error?.message) parts.push(`err=${error.message}`)
  return parts.join(' ')
}

export function logReleaseFailure(
  code: ReleaseFailureCode,
  ids: ReleaseLogIds,
  error?: LoggableError,
): void {
  console.error(formatReleaseFailure(code, ids, error))
}
