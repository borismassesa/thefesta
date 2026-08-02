import assert from 'node:assert/strict'
import test from 'node:test'
import { dbServicesToUi, serviceTitle } from './mapping'

test('serviceTitle reads canonical strings and legacy encoded objects', () => {
  assert.equal(serviceTitle('  Custom lighting  '), 'Custom lighting')
  assert.equal(
    serviceTitle('{"title":"Legacy planning","description":""}'),
    'Legacy planning',
  )
  assert.equal(
    serviceTitle({ title: 'Legacy object', description: '' }),
    'Legacy object',
  )
})

test('dbServicesToUi maps canonical string titles without duplicating them', () => {
  assert.deepEqual(
    dbServicesToUi(
      ['Travel to other regions', 'Custom lighting', 'custom lighting'],
      null,
    ),
    {
      specialServices: ['travel'],
      customServices: ['Custom lighting'],
    },
  )
})
