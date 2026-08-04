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
 * Whether a number that just replied is the number a guest is on file with.
 *
 * Compared on the last 9 digits, which is the national significant number in
 * Tanzania: Meta hands back `255712345678` while the roster commonly holds
 * `0712345678` or `+255 712 345 678`, and all three are the same phone. Plain
 * digit equality would refuse a correct match for most of the roster, and this
 * check is only worth having if it does not fire constantly on legitimate
 * guests.
 *
 * 9 digits is still 1-in-a-billion specific, so it is not a meaningfully weaker
 * bind than full equality here.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const tail = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(-9)
  const left = tail(a)
  // An empty or too-short number must never match. Without this a guest with no
  // phone on file matches every sender, which is the exact opposite of the
  // check's purpose.
  if (left.length < 9) return false
  return left === tail(b)
}

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
 *
 *   SENDER IS NOT THE GUEST — the most important one, and the reason this takes
 *   a phone at all. The webhook identifies the guest from the public_token in
 *   the BUTTON PAYLOAD, then replies to whatever number sent the tap; nothing
 *   upstream requires those to be the same person. So a tap carrying Alice's
 *   token from Bob's phone resolves to Alice and answers Bob. For the RSVP that
 *   is a pre-existing wrong-row write. For this link it would be a capability
 *   leak: Bob could open Alice's pass, save it to his own wallet, and walk in
 *   as her. The reply goes to the sender, so the only safe rule is that the
 *   sender must be the number the guest is on file with.
 */
export function decidePassLink(
  status: string,
  resolvedEventId: string | null | undefined,
  matchedInvitationIds: string[],
  senderPhone: string | null | undefined,
  guestPhones: (string | null | undefined)[]
): PassLinkDecision {
  if (status !== 'attending') return { offer: false, invitationId: null }
  if (!resolvedEventId) return { offer: false, invitationId: null }
  if (matchedInvitationIds.length !== 1) return { offer: false, invitationId: null }
  const id = matchedInvitationIds[0]
  if (!id) return { offer: false, invitationId: null }
  if (!guestPhones.some((p) => samePhone(senderPhone, p))) {
    return { offer: false, invitationId: null }
  }
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
