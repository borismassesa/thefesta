import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatReleaseFailure } from './release-log'

describe('formatReleaseFailure', () => {
  it('carries the code and whichever identifiers were supplied', () => {
    assert.equal(
      formatReleaseFailure('release_insert', { designId: 'd-1', orderId: 'o-2', releaseId: 'r-3' }),
      '[card-release] release_insert design=d-1 order=o-2 release=r-3',
    )
    assert.equal(
      formatReleaseFailure('order_stage_read', { orderId: 'o-2' }),
      '[card-release] order_stage_read order=o-2',
    )
  })

  it('includes a driver error message and code, so a failure is diagnosable', () => {
    assert.equal(
      formatReleaseFailure('release_status_write', { designId: 'd-1' }, {
        code: '23505',
        message: 'duplicate key value violates unique constraint "x"',
      }),
      '[card-release] release_status_write design=d-1 pgcode=23505 err=duplicate key value violates unique constraint "x"',
    )
  })

  it('reads only message and code, never the fields that quote row values', () => {
    // A card's field_values are the couple's names and contact details, and
    // PostgREST puts offending values in `details`/`hint` ("Key (x)=(value)
    // already exists"), never in `message`. Logs travel further and live longer
    // than the rows they describe, so those two are not read at all. This test
    // fails if someone widens the error shape to spread them in.
    const line = formatReleaseFailure('design_read', { designId: 'd-1' }, {
      message: 'permission denied',
      code: '42501',
      details: 'Key (partner1_name)=(Amina) already exists.',
      hint: 'Amina & Joseph',
    } as never)
    assert.equal(line, '[card-release] design_read design=d-1 pgcode=42501 err=permission denied')
    assert.ok(!line.includes('Amina'))
  })

  it('degrades to the bare code when there is nothing else to say', () => {
    assert.equal(formatReleaseFailure('release_raced', {}), '[card-release] release_raced')
    assert.equal(
      formatReleaseFailure('order_stage_empty', { orderId: 'o-2' }, null),
      '[card-release] order_stage_empty order=o-2',
    )
  })
})
