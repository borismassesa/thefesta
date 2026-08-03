import assert from 'node:assert/strict'
import test from 'node:test'
import {
  invitationDetailsReady,
  invitationHostName,
  invitationLocation,
  invitationMapsUrl,
  parseInvitationCoordinates,
  type InvitationEventSource,
} from './invitation-event-details'

const event: InvitationEventSource = {
  name: 'Moses Seta Wedding',
  event_type: 'wedding',
  partner1_name: ' Moses Seta ',
  partner2_name: 'Dayness Mwaranchi',
  venue_name: 'KKKT Sala Sala',
  address: 'Wazo Hill Road',
  city: 'Dar es Salaam',
}

test('derives invitation identity and location only from the selected event', () => {
  assert.equal(invitationHostName(event), 'Moses Seta & Dayness Mwaranchi')
  assert.equal(invitationLocation(event), 'KKKT Sala Sala, Wazo Hill Road, Dar es Salaam')
  assert.equal(
    invitationMapsUrl(event),
    'https://maps.google.com/?q=KKKT%20Sala%20Sala%2C%20Wazo%20Hill%20Road%2C%20Dar%20es%20Salaam',
  )
  assert.equal(invitationDetailsReady(event), true)
})

test('does not claim an invitation is ready without a partner or location', () => {
  assert.equal(invitationDetailsReady({ ...event, partner1_name: null }), false)
  assert.equal(invitationDetailsReady({ ...event, partner2_name: null }), false)
  assert.equal(
    invitationDetailsReady({ ...event, venue_name: null, address: null, city: null }),
    false,
  )
})

test('single-celebrant event types do not invent a second partner', () => {
  assert.equal(
    invitationDetailsReady({ ...event, event_type: 'birthday', partner2_name: null }),
    true,
  )
})

test('falls back to the event title when celebrant names are not set', () => {
  assert.equal(invitationHostName({ ...event, partner1_name: null, partner2_name: null }), 'Moses Seta Wedding')
})

test('coordinates make the Maps pin exact without replacing the readable location', () => {
  const exact = { ...event, venue_latitude: -6.713456, venue_longitude: 39.212345 }
  assert.equal(invitationLocation(exact), 'KKKT Sala Sala, Wazo Hill Road, Dar es Salaam')
  assert.equal(invitationMapsUrl(exact), 'https://maps.google.com/?q=-6.713456,39.212345')
})

test('coordinate inputs are optional but must be a valid complete pair', () => {
  assert.deepEqual(parseInvitationCoordinates('', ''), { ok: true, value: null })
  assert.deepEqual(parseInvitationCoordinates('-6.8', '39.2'), {
    ok: true,
    value: { latitude: -6.8, longitude: 39.2 },
  })
  assert.deepEqual(parseInvitationCoordinates('-6.8', ''), {
    ok: false,
    error: 'Add both latitude and longitude, or leave both blank.',
  })
  assert.deepEqual(parseInvitationCoordinates('91', '39.2'), {
    ok: false,
    error: 'Latitude must be a number between -90 and 90.',
  })
})
