import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  creditSummary,
  deliveryLabel,
  isProblemRow,
  rsvpLabel,
  sortInviteRows,
  type InviteReportRow,
} from './invite-report'

/**
 * The invite report is a PDF: nobody re-reads it, and a wrong label or a
 * mis-summed column width renders perfectly happily with no error anywhere.
 * These lock down the parts that can be wrong without anything complaining.
 *
 * Run: npx tsx --test src/lib/invite-report.test.ts
 */

const row = (over: Partial<InviteReportRow> = {}): InviteReportRow => ({
  name: 'Grace Mollel',
  phone: '+255 712 345 678',
  channel: 'whatsapp',
  delivery: null,
  failureReason: null,
  sharedByHand: false,
  sentAt: null,
  rsvp: 'none',
  partySize: null,
  ...over,
})

describe('deliveryLabel', () => {
  it('covers every WhatsApp state', () => {
    // These four mirror the console's delivery_* CMS strings, which are
    // editable there and hardcoded here. Nothing links the two, so a rename on
    // one side would otherwise drift silently.
    assert.equal(deliveryLabel(row({ delivery: 'pending' })), 'Awaiting')
    assert.equal(deliveryLabel(row({ delivery: 'delivered' })), 'Delivered')
    assert.equal(deliveryLabel(row({ delivery: 'read' })), 'Opened')
    assert.equal(deliveryLabel(row({ delivery: 'failed' })), 'Not delivered')
  })

  it('tells an untouched guest apart from one shared with by hand', () => {
    // Both have no WhatsApp row. Only the report distinguishes them, and the
    // difference is the whole point of the "who still needs inviting" list.
    assert.equal(deliveryLabel(row()), 'Not sent')
    assert.equal(deliveryLabel(row({ sharedByHand: true, sentAt: '7 Aug, 16:12' })), 'Shared by hand')
  })

  it('still labels a failure whose reason Meta withheld', () => {
    // describeDeliveryFailure returns null on an empty error string. The label
    // must not depend on the reason, or these rows would render blank.
    const r = row({ delivery: 'failed', failureReason: null })
    assert.equal(deliveryLabel(r), 'Not delivered')
    assert.equal(isProblemRow(r), true)
  })

  it('treats only a refused delivery as a problem', () => {
    // "Not sent" must never be styled as an alarm: on a list where nothing has
    // gone out, every single row would light up red.
    assert.equal(isProblemRow(row()), false)
    assert.equal(isProblemRow(row({ delivery: 'pending' })), false)
    assert.equal(isProblemRow(row({ delivery: 'delivered' })), false)
    // A stale reason on a delivered row is ignored — the render route accepts
    // client JSON, so the document cannot trust the field's presence.
    assert.equal(isProblemRow(row({ delivery: 'delivered', failureReason: 'Billing problem' })), false)
  })
})

describe('rsvpLabel', () => {
  it('names the ticket the guest is coming on', () => {
    assert.equal(rsvpLabel(row({ rsvp: 'attending', partySize: 1 })), 'Attending, Single')
    assert.equal(rsvpLabel(row({ rsvp: 'attending', partySize: 2 })), 'Attending, Double')
  })

  it('reads a legacy party size above two as a Double', () => {
    // Writes clamp to MAX_TICKET_PARTY but reads only floor at 1, so a legacy
    // 3 exists. `>= 2`, not `=== 2`, or it would fall through to Single.
    assert.equal(rsvpLabel(row({ rsvp: 'attending', partySize: 3 })), 'Attending, Double')
  })

  it('drops the ticket when there is no party size', () => {
    assert.equal(rsvpLabel(row({ rsvp: 'attending', partySize: null })), 'Attending')
  })

  it('never puts a party size on a non-attending answer', () => {
    assert.equal(rsvpLabel(row({ rsvp: 'declined', partySize: 2 })), 'Declined')
    assert.equal(rsvpLabel(row({ rsvp: 'maybe', partySize: 2 })), 'Maybe')
    assert.equal(rsvpLabel(row({ rsvp: 'none' })), 'No reply yet')
  })
})

describe('creditSummary', () => {
  it('does not divide by zero for a couple who has bought nothing', () => {
    assert.deepEqual(creditSummary(0, 0), { remaining: 0, pct: 0, overdrawn: false })
  })

  it('reports the ordinary case', () => {
    assert.deepEqual(creditSummary(42, 100), { remaining: 58, pct: 42, overdrawn: false })
    assert.deepEqual(creditSummary(100, 100), { remaining: 0, pct: 100, overdrawn: false })
  })

  it('flags an overdrawn balance and caps the bar at full', () => {
    // A refunded order removes capacity that was already spent, so used >
    // purchased is a real state. The bar must not overflow its track.
    assert.deepEqual(creditSummary(105, 100), { remaining: 0, pct: 100, overdrawn: true })
  })
})

describe('sortInviteRows', () => {
  it('floats failures, then the never-sent, above everyone else', () => {
    const input = [
      row({ name: 'Zawadi', delivery: 'delivered', sentAt: '7 Aug, 16:12' }),
      row({ name: 'Baraka' }),
      row({ name: 'Neema', delivery: 'failed', sentAt: '7 Aug, 16:12' }),
      row({ name: 'Amani', delivery: 'read', sentAt: '7 Aug, 16:12' }),
      row({ name: 'Asha' }),
    ]
    assert.deepEqual(
      sortInviteRows(input).map((r) => r.name),
      ['Neema', 'Asha', 'Baraka', 'Amani', 'Zawadi'],
    )
  })

  it('leaves the caller’s array untouched', () => {
    // The source is React state (SendInvitesView's `guests`); an in-place sort
    // would reorder the live table as a side effect of a download.
    const input = [row({ name: 'Zawadi', delivery: 'delivered', sentAt: 'x' }), row({ name: 'Amani' })]
    const before = input.map((r) => r.name)
    sortInviteRows(input)
    assert.deepEqual(input.map((r) => r.name), before)
  })
})

describe('invite-report-pdf table layout', () => {
  // Source-shape assertions, in the spirit of styled-jsx-scope.test.ts: a
  // mismatch between the head widths and the body widths renders a visibly
  // skewed table and nothing errors, at build time or at run time.
  const src = readFileSync(new URL('./invite-report-pdf.tsx', import.meta.url), 'utf8')
  const sheet = src.slice(src.indexOf('StyleSheet.create('), src.indexOf('function StatTile'))

  const widthsIn = (block: string) => [...block.matchAll(/width:\s*'(\d+)%'/g)].map((m) => Number(m[1]))
  /** One named entry out of the StyleSheet, anchored at its two-space indent so
   *  a same-named function parameter elsewhere in the file can't be picked up. */
  const style = (name: string) => {
    const m = new RegExp(`\\n  ${name}: \\{[\\s\\S]*?\\},`).exec(sheet)
    assert.ok(m, `no ${name} style found`)
    return m[0]
  }
  const columns = () =>
    widthsIn(['cName', 'cPhone', 'cChannel', 'cSent', 'cDelivery', 'cRsvp'].map(style).join(''))

  it('head and body columns are the same widths in the same order', () => {
    const headStart = src.indexOf('<View style={s.tableHead}')
    const head = widthsIn(src.slice(headStart, src.indexOf('</View>', headStart)))
    const body = columns()
    assert.equal(body.length, 6, 'expected six body columns')
    assert.deepEqual(head, body)
  })

  it('the columns fill the page exactly', () => {
    assert.equal(columns().reduce((a, b) => a + b, 0), 100)
  })

  it('reserves the accent gutter on the head as well as the rows', () => {
    // The failed-row highlight is a coloured left border. If the head does not
    // reserve the same gutter, every failed row shifts right of its own header.
    for (const name of ['tableHead', 'row']) {
      const block = style(name)
      assert.match(block, /paddingLeft:\s*6/, `${name} must reserve the gutter padding`)
      assert.match(block, /borderLeftWidth:\s*2/, `${name} must reserve the gutter border`)
    }
  })
})
