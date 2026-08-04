/**
 * Whether a button tap may trigger the automatic entrance-pass send.
 *
 * Free of `server-only` and of any database import, so the gate on a
 * credit-spending, credential-bearing send is asserted in a unit test rather
 * than read out of a webhook and taken on trust.
 */

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
 * 9 digits is still 1-in-a-billion specific, so it is not a meaningfully
 * weaker bind than full equality here.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const tail = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(-9)
  const left = tail(a)
  // An empty or too-short number must never match. Without this a guest with
  // no phone on file matches every sender, which is the exact opposite of the
  // check's purpose.
  if (left.length < 9) return false
  return left === tail(b)
}

/**
 * Decide whether this RSVP tap may send a ticket by itself.
 *
 * The couple clicking "send" in the dashboard is a human authorising a spend.
 * This path has no human in it, so it refuses every case it cannot attribute:
 *
 *   NOT ATTENDING — a guest who declined has no ticket.
 *
 *   NO EVENT — a tap that cannot be attributed to an event updated EVERY
 *   invitation the guest holds (legacy sends carry no event id). There is no
 *   single admission to draw, and guessing sends the wrong wedding's ticket.
 *
 *   SENDER IS NOT THE GUEST — the reason this takes a phone at all. The
 *   webhook identifies the guest from the public_token in the BUTTON PAYLOAD,
 *   and WhatsApp forwards templates with their buttons intact, so a forwarded
 *   invite tapped by Bob resolves to Alice. The ticket itself is safe — it is
 *   addressed to Alice's number on file, never to the sender — but the SEND
 *   is not free: it spends one of the couple's paid entrance-pass credits and
 *   puts a live check-in QR in a thread nobody asked for it in. #275 left the
 *   underlying RSVP misattribution deliberately unfixed; this refuses to build
 *   an automatic spend on top of it.
 */
export function shouldAutoSendEntrancePass(
  status: string,
  resolvedEventId: string | null | undefined,
  senderPhone: string | null | undefined,
  guestPhones: (string | null | undefined)[]
): boolean {
  if (status !== 'attending') return false
  if (!resolvedEventId) return false
  return guestPhones.some((p) => samePhone(senderPhone, p))
}
