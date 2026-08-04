/**
 * When a guest may be handed their pass link, and what the message looks like.
 *
 * Free of `server-only` and of any database import, so the decision that gates
 * a CAPABILITY can be asserted in a unit test rather than read out of a webhook
 * and taken on trust.
 */

/**
 * A union rather than a struct with a nullable field, so "not offering" and
 * "offering, for THIS admission" cannot be confused — and a caller cannot reach
 * the invitation id without having gone through the check that produced it.
 */
export type PassLinkDecision =
  | { offer: true; invitationId: string }
  | { offer: false; invitationId: null }

/**
 * Decide whether this RSVP tap identifies one admission.
 *
 * The link is a capability: whoever holds it can view the pass and mint a
 * wallet object. So this refuses every ambiguous case rather than picking.
 *
 *   NOT ATTENDING — a guest who declined has no pass, and sending one would
 *   read as not having registered the decline.
 *
 *   NO EVENT — a tap that cannot be attributed to an event updates EVERY
 *   invitation the guest holds (legacy sends carry no event id). There is no
 *   single admission to link to, and guessing hands a guest the wrong wedding's
 *   pass.
 *
 *   NOT EXACTLY ONE ROW — same reason, defensively. A guest matching several
 *   rows for one event is a data fault, and an ambiguous match is not a licence
 *   to choose.
 */
export function decidePassLink(
  status: string,
  resolvedEventId: string | null | undefined,
  matchedInvitationIds: string[]
): PassLinkDecision {
  if (status !== 'attending') return { offer: false, invitationId: null }
  if (!resolvedEventId) return { offer: false, invitationId: null }
  if (matchedInvitationIds.length !== 1) return { offer: false, invitationId: null }
  const id = matchedInvitationIds[0]
  if (!id) return { offer: false, invitationId: null }
  return { offer: true, invitationId: id }
}

/**
 * The confirmation a guest receives.
 *
 * The link is APPENDED, never substituted. The acknowledgement is the part the
 * guest is owed — they tapped a button and need to see it register — and it has
 * to arrive whether or not the pass machinery is configured, reachable, or able
 * to mint. Every failure upstream of here degrades to exactly the message this
 * app sent before passes existed.
 */
export function rsvpConfirmationMessage(status: string, passLink: string | null): string {
  if (status !== 'attending') {
    return 'Asante kwa kutujulisha. Tunasikitika kwamba hutoweza kuhudhuria. 💐'
  }
  const base = 'Asante! Tumepokea uthibitisho wako wa kuhudhuria. Tunakusubiri! 🎉'
  return passLink ? `${base}\n\nHii hapa tiketi yako ya kuingia:\n${passLink}` : base
}

/** `/p/<token>`, absolute, so it is tappable in a WhatsApp thread. */
export function passLinkUrl(origin: string, rawToken: string): string {
  return `${origin.replace(/\/$/, '')}/p/${rawToken}`
}
