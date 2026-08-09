import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHECKIN_TIME_ZONE,
  checkinTicketLabel,
  formatCheckinDate,
  formatCheckinDateTime,
  formatCheckinTime,
} from './checkin-report-data'

test('Wakwe is exactly ten admissions in scanner reports', () => {
  assert.equal(checkinTicketLabel(1), 'Single')
  assert.equal(checkinTicketLabel(2), 'Double')
  assert.equal(checkinTicketLabel(10), 'Wakwe')
  assert.equal(checkinTicketLabel(9), 'Party of 9')
  assert.equal(checkinTicketLabel(11), 'Party of 11')
})

test('scanner report timestamps use Dar es Salaam time, not the runtime zone', () => {
  assert.equal(CHECKIN_TIME_ZONE, 'Africa/Dar_es_Salaam')
  // 21:30 UTC is 00:30 on the following day in EAT (UTC+3).
  const iso = '2026-08-08T21:30:00.000Z'
  assert.equal(formatCheckinTime(iso), '12:30 AM')
  assert.equal(formatCheckinDate(iso), '9 August 2026')
  assert.equal(formatCheckinDateTime(iso), '9 August 2026 at 00:30')
})
