/**
 * Whether to ask how many of a party actually arrived.
 *
 * A pure function rather than a condition inside the effect that opens the
 * sheet, because the condition is the whole bug: asking is driven by the scan
 * result, but the answer CLOSES the sheet without changing that result, so a
 * rule written in terms of "is the sheet open?" re-opens it the instant it
 * closes. A Double could not be admitted at all — Done and the close button
 * both put the sheet straight back.
 *
 * The fix is to key the decision on the scan, not on the sheet: one scan gets
 * one question. Expressed here so it can be tested without a renderer, which
 * is what the original inline version could not be.
 */

export interface PartyPromptInput {
  /** Outcome status of the scan just completed. */
  status: string | null;
  /** Headcount the pass was issued for. */
  partySize: number | null;
  /**
   * Id of the scan being shown, or null when the admission did not come from
   * a scan. A manual admission already collected the headcount on the confirm
   * card, so asking again would be asking twice.
   */
  scanRequestId: string | null;
  /** The scan already asked about, so the same one is never asked twice. */
  promptedRequestId: string | null;
}

export function shouldPromptForParty(input: PartyPromptInput): boolean {
  // Only a successful admission has a headcount worth correcting. A duplicate
  // or a refusal admitted nobody.
  if (input.status !== 'success') return false;
  // A Single has nothing to ask about: one invited, one arrived.
  if ((input.partySize ?? 1) <= 1) return false;
  if (!input.scanRequestId) return false;
  return input.scanRequestId !== input.promptedRequestId;
}
