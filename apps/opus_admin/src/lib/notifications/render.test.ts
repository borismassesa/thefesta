import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isWorkflowEventType,
  parseEmailPayload,
  renderNotificationEmail,
  type PersistedEmailPayload,
} from './render'

// This payload shape is persisted in workflow_events.metadata. If these tests
// start failing after a refactor, the refactor has broken retry for every
// message already queued — not just for new ones.

const PAYLOAD: PersistedEmailPayload = {
  approvalSubject: 'Mwanza vendor visit',
  approvalCategory: 'Business Trip',
  approvalLink: 'https://admin.opusfesta.com/approvals',
  submitter: { name: 'Alice', email: 'alice@opusfesta.com', role: null },
  actor: { name: 'Bob', email: 'bob@opusfesta.com', role: 'Finance Manager' },
  note: 'Approved, book economy.',
}

describe('parseEmailPayload', () => {
  it('round-trips a payload through JSON, as jsonb storage would', () => {
    const parsed = parseEmailPayload(JSON.parse(JSON.stringify(PAYLOAD)))
    assert.deepEqual(parsed, PAYLOAD)
  })

  it('returns null rather than throwing on malformed rows', () => {
    // A worker hitting one bad row must skip it, not die and stall the queue.
    for (const bad of [
      null,
      undefined,
      'string',
      [],
      {},
      { ...PAYLOAD, submitter: null },
      { ...PAYLOAD, actor: { name: 'No email' } },
      { ...PAYLOAD, approvalLink: 42 },
    ]) {
      assert.equal(parseEmailPayload(bad), null, JSON.stringify(bad))
    }
  })

  it('tolerates a missing note', () => {
    const { note, ...withoutNote } = PAYLOAD
    void note
    assert.equal(parseEmailPayload(withoutNote)?.note, null)
  })
})

describe('isWorkflowEventType', () => {
  it('accepts every event the registry can render', () => {
    for (const t of [
      'approval.submitted',
      'approval.approved',
      'approval.refused',
      'approval.info_requested',
    ]) {
      assert.equal(isWorkflowEventType(t), true, t)
    }
  })

  it('rejects anything else', () => {
    for (const t of ['approval.unknown', '', null, 42, 'leave.submitted']) {
      assert.equal(isWorkflowEventType(t), false, String(t))
    }
  })
})

describe('renderNotificationEmail', () => {
  const RECIPIENT = { name: 'Carol', email: 'carol@opusfesta.com' }

  it('produces subject, html and text for every event type', () => {
    for (const t of [
      'approval.submitted',
      'approval.approved',
      'approval.refused',
      'approval.info_requested',
    ] as const) {
      const email = renderNotificationEmail(t, PAYLOAD, RECIPIENT)
      assert.ok(email, `${t} must have a template`)
      assert.ok(email.subject.length > 0, `${t} subject`)
      assert.ok(email.html.length > 0, `${t} html`)
      assert.ok(email.text.length > 0, `${t} text`)
      assert.ok(email.html.includes(PAYLOAD.approvalSubject), `${t} names the request`)
    }
  })

  it('returns null for a bell-only event rather than inventing an email', () => {
    // attendance.gap_detected is raised by the nightly sweep for the bell only.
    // A stub email nobody wrote would be worse than none: the retry worker would
    // send it, to everyone, every night.
    assert.equal(renderNotificationEmail('attendance.gap_detected', PAYLOAD, RECIPIENT), null)
  })

  it('renders identically for the same inputs, so a retry matches the original', () => {
    const a = renderNotificationEmail('approval.approved', PAYLOAD, RECIPIENT)
    const b = renderNotificationEmail('approval.approved', PAYLOAD, RECIPIENT)
    assert.deepEqual(a, b)
  })

  it('addresses a submission to the recipient, not to whoever was first', () => {
    // The emitter substitutes per approver; retry has to reproduce that or
    // every approver gets an email addressed to one person.
    const forCarol = renderNotificationEmail('approval.submitted', PAYLOAD, RECIPIENT)
    const forDan = renderNotificationEmail('approval.submitted', PAYLOAD, {
      name: 'Dan',
      email: 'dan@opusfesta.com',
    })
    assert.notDeepEqual(forCarol, forDan)
  })

  it('does not vary outcome emails by recipient — they go to the submitter', () => {
    const a = renderNotificationEmail('approval.refused', PAYLOAD, RECIPIENT)
    const b = renderNotificationEmail('approval.refused', PAYLOAD, {
      name: 'Dan',
      email: 'dan@opusfesta.com',
    })
    assert.deepEqual(a, b)
  })

  it('escapes user-supplied content instead of injecting it as markup', () => {
    const hostile: PersistedEmailPayload = {
      ...PAYLOAD,
      approvalSubject: '<script>alert(1)</script>',
      note: '<img src=x onerror="alert(2)">',
    }
    const email = renderNotificationEmail('approval.refused', hostile, RECIPIENT)
    assert.ok(email)

    // Assert the hostile input never appears verbatim, rather than banning
    // substrings. `onerror=` survives harmlessly inside
    // `&lt;img src=x onerror=&quot;…&gt;`, and the shell legitimately contains
    // its own <img> logo — both would make a cruder check lie.
    assert.ok(
      !email.html.includes(hostile.approvalSubject),
      'subject must not appear as raw markup',
    )
    assert.ok(!email.html.includes(hostile.note!), 'note must not appear as raw markup')
    assert.ok(email.html.includes('&lt;script&gt;'), 'subject should appear escaped')
    assert.ok(email.html.includes('&lt;img'), 'note should appear escaped')

    // Plain-text part carries the raw characters, which is correct — there is
    // no markup context to escape into — but it must still not be empty.
    assert.ok(email.text.includes('alert(2)'), 'text part keeps the literal content')
  })
})
