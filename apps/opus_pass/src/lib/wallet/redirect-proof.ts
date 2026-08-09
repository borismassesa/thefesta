import type { WalletPassModel } from './types'

/**
 * The fixed test admission behind the WhatsApp redirect proof.
 *
 * Milestone 1 answers one question and nothing else: will WhatsApp follow a
 * template URL button to an OpusPass URL that 302s off-domain to
 * pay.google.com? Meta does not document the answer, and the button's base URL
 * is frozen at template approval, so the whole delivery architecture rests on
 * a fact we can only establish by testing it.
 *
 * ONE model, shared by two consumers that must agree exactly. The script
 * provisions a class and an object at Google; the /t/<code> route signs a save
 * link that REFERENCES that object by id. Google object ids are derived, not
 * returned, so if the two sides ever computed a model differently the link
 * would point at an object that does not exist and the proof would fail for a
 * reason that has nothing to do with WhatsApp. Deriving both from this one
 * function is what makes a failed proof mean what it says.
 *
 * Kept free of `server-only` and of any database import: a build script and a
 * unit test both import it.
 */

/** Fixed ids. Real admissions are UUIDs, so these cannot collide with one. */
export const PROOF_EVENT_ID = 'redirect-proof'
export const PROOF_INVITATION_ID = 'redirect-proof-guest'
export const PROOF_CREDENTIAL_ID = 'proofcred'

/**
 * Deliberately readable, and deliberately not minted.
 *
 * It satisfies the OP1 grammar so `validatePassModel` accepts it, and it is
 * the value baked into the test object's QR. Anyone who scans that QR at any
 * point in the next decade reads the string and knows immediately what they
 * are holding. A random-looking secret here would be indistinguishable from a
 * live credential to the person trying to work out whether a stray test pass
 * matters.
 *
 * It admits nobody. The door resolves a credential by hash against
 * admission_credentials, and no row will ever hash to this.
 */
const PROOF_CREDENTIAL = 'OP1:proof-only-not-a-real-admission-credential'

/**
 * The test pass.
 *
 * Every guest-visible field says "test" in plain language. If this object ever
 * surfaces somewhere unexpected, in a wallet or a console listing, it should
 * take nobody more than a glance to classify it.
 */
export function proofPassModel(): WalletPassModel {
  return {
    invitationId: PROOF_INVITATION_ID,
    eventId: PROOF_EVENT_ID,
    eventName: 'OpusPass Redirect Test',
    guestName: 'Test Guest',
    venueName: null,
    venueAddress: null,
    startsAt: null,
    endsAt: null,
    ticketType: 'Test',
    passId: null,
    entryAllowance: 1,
    credential: PROOF_CREDENTIAL,
    credentialId: PROOF_CREDENTIAL_ID,
  }
}
