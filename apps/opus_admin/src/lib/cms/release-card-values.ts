export const RELEASE_GUEST_PLACEHOLDER = 'Jina la Mgeni'

/** Values written into the couple's frozen master card. */
export function releaseCardFieldValues(
  values: Record<string, string> | null,
): Record<string, string> {
  return {
    ...(values ?? {}),
    // A release belongs to the couple, not to the sample invitee in the
    // artwork. The guest-delivery renderer replaces this value later.
    guest_name: RELEASE_GUEST_PLACEHOLDER,
  }
}
