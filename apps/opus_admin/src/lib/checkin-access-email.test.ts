import assert from 'node:assert/strict'
import test from 'node:test'
import { composeAccessCodeEmail, type AccessCodeMessage } from './checkin-access-email'

const BASE: AccessCodeMessage = {
  recipientName: 'Asha Mwakalinga',
  eventName: 'Moses Seeta Wedding',
  eventDate: 'Saturday, 8 August 2026',
  eventTime: '4:00 PM',
  venue: 'Nyumbani kwa Mama Seeta, Dar es salaam',
  doorLabel: 'Main Gate',
  code: 'M0W4J0KM',
  expiresAt: '2026-08-09T05:39:00.000Z',
  link: 'https://scanner.opusfesta.com/event/abc?token=M0W4J0KM',
}

test('the code never appears in the subject line', () => {
  // Subjects surface on lock screens and in notification shades, where a live
  // door credential must not be readable by whoever is holding the phone.
  const { subject } = composeAccessCodeEmail(BASE)
  assert.ok(!subject.includes(BASE.code), 'raw code leaked into the subject')
  assert.ok(!subject.includes('M0W4-J0KM'), 'formatted code leaked into the subject')
  assert.ok(subject.includes(BASE.eventName))
})

test('the code is shown in the documented grouped form in both bodies', () => {
  const { html, text } = composeAccessCodeEmail(BASE)
  assert.ok(html.includes('M0W4-J0KM'), 'html must carry the grouped code')
  assert.ok(text.includes('M0W4-J0KM'), 'text must carry the grouped code')
})

test('both bodies tell the recipient not to forward the credential', () => {
  const { html, text } = composeAccessCodeEmail(BASE)
  assert.match(html, /do not forward/i)
  assert.match(text, /do not forward/i)
})

test('the expiry is stated, so nobody discovers it at the door', () => {
  const { html, text } = composeAccessCodeEmail(BASE)
  assert.match(text, /stops working/i)
  assert.match(html, /stops working/i)
})

test('a missing scanner link degrades to code-entry instructions, not a dead button', () => {
  const { html, text } = composeAccessCodeEmail({ ...BASE, link: '' })
  assert.ok(!html.includes('<a href'), 'no anchor should be rendered without a link')
  assert.match(html, /home screen/i)
  assert.match(text, /home screen/i)
})

test('a nameless recipient still gets a valid greeting', () => {
  const { text } = composeAccessCodeEmail({ ...BASE, recipientName: null })
  assert.ok(text.startsWith('Hello,'))
  assert.ok(!text.includes('Hi ,'))
})

test('the event details are listed one per line in both bodies', () => {
  const { html, text } = composeAccessCodeEmail(BASE)
  for (const value of [BASE.eventName, BASE.venue!, BASE.eventDate!, BASE.eventTime!]) {
    assert.ok(html.includes(value), `html is missing ${value}`)
    assert.ok(text.includes(value), `text is missing ${value}`)
  }
  // Four rows, each led by its own icon rather than a shared bullet.
  assert.equal(html.match(/<tr>/g)?.length, 4)
  assert.ok(['🎉', '📍', '📅', '🕒'].every((icon) => html.includes(icon)))
})

test('a detail nobody recorded is dropped, not shown blank', () => {
  const { html, text } = composeAccessCodeEmail({ ...BASE, venue: null, eventTime: null })
  assert.equal(html.match(/<tr>/g)?.length, 2)
  assert.ok(!text.includes('Venue:'))
  assert.ok(!text.includes('Time:'))
  assert.ok(text.includes('Date: Saturday, 8 August 2026'))
})

test('recipient-supplied text is escaped rather than injected into the html', () => {
  const { html } = composeAccessCodeEmail({
    ...BASE,
    eventName: '<script>alert(1)</script>',
    doorLabel: 'Gate "A" & B',
  })
  assert.ok(!html.includes('<script>'), 'event name must not inject markup')
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('&quot;A&quot;') && html.includes('&amp;'))
})
