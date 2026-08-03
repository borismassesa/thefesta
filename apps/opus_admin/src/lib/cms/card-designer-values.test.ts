import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeCardDesignerValues } from './card-designer-values'

test('designer value updates merge without deleting untouched answers', () => {
  assert.deepEqual(
    mergeCardDesignerValues(
      { couple_name_1: 'Moses', date_day: '08' },
      { couple_name_1: '  Moses Seeta  ', venue_1_place: 'KKKT Sala sala Juu' },
    ),
    {
      ok: true,
      values: {
        couple_name_1: 'Moses Seeta',
        date_day: '08',
        venue_1_place: 'KKKT Sala sala Juu',
      },
    },
  )
})

test('blank designer values remove the field', () => {
  assert.deepEqual(
    mergeCardDesignerValues({ contact_1: 'Old contact', date_year: '2026' }, { contact_1: ' ' }),
    { ok: true, values: { date_year: '2026' } },
  )
})

test('unknown fields are rejected before persistence or release', () => {
  assert.deepEqual(mergeCardDesignerValues({}, { made_up_role: 'unsafe' }), {
    ok: false,
    error: '"made_up_role" is not a known card field.',
  })
})
