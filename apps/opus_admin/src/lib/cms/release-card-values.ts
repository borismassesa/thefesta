export const RELEASE_GUEST_PLACEHOLDER = 'Jina la Mgeni'

/** Values written into the couple's frozen master card. */
export function releaseCardFieldValues(
  values: Record<string, string> | null,
  eventNames?: { partner1Name: string; partner2Name: string | null },
): Record<string, string> {
  return {
    ...(values ?? {}),
    ...(eventNames
      ? {
          // The assigned event is the source of truth. Card-detail answers are
          // useful during design, but they must not override the event selected
          // for delivery when the approved artefact is frozen.
          couple_name_1: eventNames.partner1Name,
          ...(eventNames.partner2Name ? { couple_name_2: eventNames.partner2Name } : {}),
        }
      : {}),
    // A release belongs to the couple, not to the sample invitee in the
    // artwork. The guest-delivery renderer replaces this value later.
    guest_name: RELEASE_GUEST_PLACEHOLDER,
  }
}
