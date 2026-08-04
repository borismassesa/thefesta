/**
 * What saving field values does to a design job's stage.
 *
 * Pure, because the rule is the whole subtlety and the action around it is
 * nothing but two Supabase round-trips. The bug this encodes against: a job is
 * created with status 'awaiting_info' (the column default) and requested_fields
 * empty. A designer who types every value in themselves never closes out a
 * request, so the old rule ("advance only when the last requested field is
 * answered") never fired, and the job sat on "Waiting on couple" forever. There
 * is no way out of that state by hand either, since "Submit for review" only
 * renders at in_design.
 */
export type SaveStageInput = {
  /** The job's stage as stored, before this save. */
  status: string
  /** requested_fields as stored, before this save. */
  requestedFields: readonly string[]
  /** field_values AFTER merging the incoming save. */
  merged: Readonly<Record<string, string>>
  /**
   * Every role this card can be asked for: the same set the editor counts for
   * "N / N", so what the designer sees as complete is what advances the stage.
   * Rasterised roles are included; unmapped ones are already excluded.
   */
  requestableKeys: readonly string[]
}

export type SaveStageDecision = {
  /** requested_fields to write: whatever this save left unanswered. */
  requestedFields: string[]
  /** The new status, or null to leave the column alone. */
  status: 'in_design' | null
  /** Whether to stamp info_received_at. */
  stampInfoReceived: boolean
}

const filled = (value: string | undefined) => Boolean((value ?? '').trim())

/**
 * Whether a card has been released to the couple.
 *
 * OpusPass resolves guest cards with `.in('status', ['ready', 'delivered'])`,
 * so moving a card out of these two stops it resolving for guests entirely
 * while the couple's order still claims it was delivered. Every action that
 * writes `status` has to ask this before demoting, which is why it is exported
 * rather than re-derived at each call site.
 */
export function isReleasedDesign(status: string): boolean {
  return status === 'ready' || status === 'delivered'
}

export function decideStageAfterSave({
  status,
  requestedFields,
  merged,
  requestableKeys,
}: SaveStageInput): SaveStageDecision {
  // Anything now answered is no longer outstanding.
  const stillOutstanding = requestedFields.filter((role) => !merged[role])
  const answeredTheLastRequest = stillOutstanding.length === 0 && requestedFields.length > 0

  /*
   * A released card can still be carrying outstanding requests: submitForReview
   * accepts an awaiting_info job, so approval can land while requested_fields is
   * non-empty. Answering the last of them must NOT drag the job back to
   * in_design, for the reason isReleasedDesign explains.
   */
  const isReleased = isReleasedDesign(status)

  /*
   * Nothing outstanding and nothing blank means nobody is waiting on the couple,
   * however the values got there. Guarded on requestableKeys being non-empty: an
   * unmapped card asks for nothing, so "every field filled" would be vacuously
   * true and would advance a job that has no fields at all.
   */
  const nothingLeftToCollect =
    status === 'awaiting_info' &&
    stillOutstanding.length === 0 &&
    requestableKeys.length > 0 &&
    requestableKeys.every((key) => filled(merged[key]))

  return {
    requestedFields: stillOutstanding,
    status: (answeredTheLastRequest || nothingLeftToCollect) && !isReleased ? 'in_design' : null,
    // Only a closed-out request means the couple answered. A designer filling
    // the form in themselves moves the stage but must not claim they did, or
    // the editor will caption it "Answered <date>" over work they typed.
    stampInfoReceived: answeredTheLastRequest,
  }
}
