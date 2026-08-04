import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveServiceLabel } from './vendor-services-catalog'

test('public service labels support canonical strings', () => {
  assert.equal(resolveServiceLabel('drone'), 'Drone coverage')
  assert.equal(resolveServiceLabel('Custom lighting'), 'Custom Lighting')
})

test('public service labels retain legacy encoded-object compatibility', () => {
  assert.equal(
    resolveServiceLabel('{"id":"drone","title":"drone","description":""}'),
    'Drone coverage',
  )
  assert.equal(
    resolveServiceLabel({ title: 'Legacy custom service', description: '' }),
    'Legacy custom service',
  )
})
