import assert from 'node:assert/strict';
import test from 'node:test';
import { EVENT_TIME_ZONE, eventDayLabel, formatEventTime } from './eventTime';

test('scanner clocks are always displayed in Dar es Salaam time', () => {
  assert.equal(EVENT_TIME_ZONE, 'Africa/Dar_es_Salaam');
  assert.equal(formatEventTime('2026-08-08T21:30:00.000Z'), '00:30');
});

test('arrival day headings cross midnight on the EAT calendar', () => {
  const now = new Date('2026-08-08T22:00:00.000Z'); // 01:00 EAT on 9 August
  assert.equal(eventDayLabel('2026-08-08T21:30:00.000Z', now), 'Today');
  assert.equal(eventDayLabel('2026-08-08T20:30:00.000Z', now), 'Yesterday');
});
