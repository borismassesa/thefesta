// Field validation is the gate between "an employee typed something" and "this
// is a filed record". The cases below are the ones that would otherwise let a
// bad value into a stored version that a PDF renders months later.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  REPORT_FIELD_TYPES,
  REPORT_FIELD_LABELS,
  allFields,
  cleanContent,
  emptyValue,
  parseFormDefinition,
  validateContent,
  validateFieldValue,
  type ReportField,
  type ReportFormDefinition,
} from './fields'

const field = (over: Partial<ReportField> & Pick<ReportField, 'type'>): ReportField => ({
  key: 'f',
  label: 'Field',
  ...over,
})

const UUID = '3f7c1b2e-4d5a-4c6b-8e9f-0a1b2c3d4e5f'

describe('every declared type is usable', () => {
  it('labels all seventeen', () => {
    assert.equal(REPORT_FIELD_TYPES.length, 17)
    for (const t of REPORT_FIELD_TYPES) {
      assert.ok(REPORT_FIELD_LABELS[t]?.length > 0, `${t} needs a label`)
    }
  })

  it('has an empty value for all seventeen', () => {
    for (const t of REPORT_FIELD_TYPES) {
      const empty = emptyValue(field({ type: t }))
      assert.notEqual(empty, undefined, `${t} has no empty value`)
      // The empty value must itself pass validation, or a fresh draft would
      // open with errors already on it.
      assert.deepEqual(validateFieldValue(field({ type: t }), empty), [], `${t} empty must validate`)
    }
  })
})

describe('text', () => {
  it('rejects a non-string and enforces a length cap', () => {
    assert.equal(validateFieldValue(field({ type: 'short_text' }), 42).length, 1)
    assert.equal(
      validateFieldValue(field({ type: 'short_text', maxLength: 5 }), 'abcdef').length,
      1,
    )
    assert.deepEqual(validateFieldValue(field({ type: 'short_text', maxLength: 5 }), 'abcde'), [])
  })
})

describe('numbers', () => {
  it('accepts numeric strings from a form input', () => {
    assert.deepEqual(validateFieldValue(field({ type: 'number' }), '42'), [])
    assert.equal(validateFieldValue(field({ type: 'number' }), 'forty two').length, 1)
  })

  it('enforces min and max', () => {
    const f = field({ type: 'number', min: 1, max: 10 })
    assert.equal(validateFieldValue(f, 0).length, 1)
    assert.equal(validateFieldValue(f, 11).length, 1)
    assert.deepEqual(validateFieldValue(f, 5), [])
  })

  it('holds percentages to 0-100 unless told otherwise', () => {
    assert.equal(validateFieldValue(field({ type: 'percentage' }), 101).length, 1)
    assert.equal(validateFieldValue(field({ type: 'percentage' }), -1).length, 1)
    assert.deepEqual(validateFieldValue(field({ type: 'percentage' }), 99.5), [])
    assert.deepEqual(
      validateFieldValue(field({ type: 'percentage', max: 300 }), 250),
      [],
      'a growth percentage may exceed 100 when the template says so',
    )
  })

  it('defaults currency to whole numbers, because TZS has no practical subunit', () => {
    assert.equal(validateFieldValue(field({ type: 'currency' }), 1500.25).length, 1)
    assert.deepEqual(validateFieldValue(field({ type: 'currency' }), 1500), [])
    assert.deepEqual(validateFieldValue(field({ type: 'currency', precision: 2 }), 1500.25), [])
  })

  it('rejects a negative amount unless the template allows one', () => {
    assert.equal(validateFieldValue(field({ type: 'currency' }), -100).length, 1)
    assert.deepEqual(validateFieldValue(field({ type: 'currency', min: -10000 }), -100), [])
  })

  it('holds ratings to whole numbers inside the scale', () => {
    assert.deepEqual(validateFieldValue(field({ type: 'rating' }), 5), [])
    assert.equal(validateFieldValue(field({ type: 'rating' }), 6).length, 1)
    assert.equal(validateFieldValue(field({ type: 'rating' }), 3.5).length, 1)
    assert.deepEqual(validateFieldValue(field({ type: 'rating', scale: 10 }), 9), [])
  })
})

describe('dates', () => {
  it('requires an ISO date', () => {
    assert.deepEqual(validateFieldValue(field({ type: 'date' }), '2026-08-05'), [])
    assert.equal(validateFieldValue(field({ type: 'date' }), '05/08/2026').length, 1)
  })

  it('requires a range to run forwards', () => {
    const f = field({ type: 'date_range' })
    assert.deepEqual(validateFieldValue(f, { start: '2026-08-01', end: '2026-08-31' }), [])
    assert.equal(validateFieldValue(f, { start: '2026-08-31', end: '2026-08-01' }).length, 1)
    // A half-filled range is allowed while drafting; `required` decides at submit.
    assert.deepEqual(validateFieldValue(f, { start: '2026-08-01', end: null }), [])
  })
})

describe('selectors', () => {
  it('requires an id, not free text, for entity pickers', () => {
    for (const t of ['employee_select', 'project_select', 'task_select'] as const) {
      assert.deepEqual(validateFieldValue(field({ type: t }), UUID), [], t)
      assert.equal(validateFieldValue(field({ type: t }), 'Amina').length, 1, t)
    }
  })

  it('takes a department by name, since departments are a CHECK not a table', () => {
    assert.deepEqual(validateFieldValue(field({ type: 'department_select' }), 'Technology'), [])
  })
})

describe('yes/no and KPI', () => {
  it('requires a real boolean', () => {
    assert.deepEqual(validateFieldValue(field({ type: 'yes_no' }), false), [])
    assert.deepEqual(validateFieldValue(field({ type: 'yes_no' }), true), [])
    assert.equal(validateFieldValue(field({ type: 'yes_no' }), 'yes').length, 1)
  })

  it('checks both halves of a KPI', () => {
    const f = field({ type: 'kpi_value' })
    assert.deepEqual(validateFieldValue(f, { value: 12, target: 20 }), [])
    assert.equal(validateFieldValue(f, { value: 'lots', target: 20 }).length, 1)
  })
})

describe('attachments', () => {
  it('requires attachment ids and caps the count', () => {
    const f = field({ type: 'file', maxFiles: 2 })
    assert.deepEqual(validateFieldValue(f, [{ attachmentId: UUID, fileName: 'a.pdf' }]), [])
    assert.equal(
      validateFieldValue(f, [
        { attachmentId: UUID, fileName: 'a.pdf' },
        { attachmentId: UUID, fileName: 'b.pdf' },
        { attachmentId: UUID, fileName: 'c.pdf' },
      ]).length,
      1,
    )
    // A path from the client is not an attachment id.
    assert.equal(
      validateFieldValue(f, [{ attachmentId: '../../etc/passwd', fileName: 'x' }]).length,
      1,
    )
  })
})

describe('repeatable lists and tables', () => {
  const table = field({
    type: 'table',
    key: 'metrics',
    label: 'Metrics',
    minRows: 1,
    maxRows: 3,
    subFields: [
      { key: 'name', label: 'Metric', type: 'short_text', required: true },
      { key: 'value', label: 'Value', type: 'number' },
      { key: 'share', label: 'Share', type: 'percentage' },
    ],
  })

  it('accepts well-formed rows', () => {
    assert.deepEqual(
      validateFieldValue(table, [{ name: 'Bookings', value: 12, share: 40 }]),
      [],
    )
  })

  it('enforces row counts', () => {
    assert.equal(validateFieldValue(table, [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }]).length, 1)
  })

  it('reports which row and which column is wrong', () => {
    const errors = validateFieldValue(table, [
      { name: 'Bookings', value: 12 },
      { name: '', value: 'nope' },
    ])
    const missing = errors.find((e) => e.subKey === 'name')
    assert.ok(missing, 'the blank required cell must be reported')
    assert.equal(missing?.rowIndex, 1, 'and it must name the row')
    assert.ok(errors.some((e) => e.subKey === 'value' && e.rowIndex === 1))
  })

  it('validates sub-fields through the same rules as top-level fields', () => {
    // 140% in a percentage column must fail exactly as it would at top level.
    const errors = validateFieldValue(table, [{ name: 'Bookings', share: 140 }])
    assert.equal(errors.length, 1)
    assert.equal(errors[0].subKey, 'share')
  })
})

describe('validateContent', () => {
  const definition: ReportFormDefinition = {
    sections: [
      {
        key: 'summary',
        title: 'Summary',
        fields: [
          field({ key: 'headline', type: 'short_text', label: 'Headline', required: true }),
          field({ key: 'detail', type: 'long_text', label: 'Detail' }),
          field({ key: 'score', type: 'rating', label: 'Confidence' }),
        ],
      },
    ],
  }

  it('reports every bad field at once, not one per round-trip', () => {
    const result = validateContent(definition, { headline: '', score: 99 })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.errors.length, 2)
      assert.ok(result.errors.some((e) => e.fieldKey === 'headline'))
      assert.ok(result.errors.some((e) => e.fieldKey === 'score'))
    }
  })

  it('lets an incomplete draft save but blocks an incomplete submit', () => {
    const draft = validateContent(definition, { headline: '' }, { enforceRequired: false })
    assert.equal(draft.ok, true, 'a draft that cannot be saved is a feature nobody uses')
    assert.equal(validateContent(definition, { headline: '' }).ok, false)
  })

  it('still rejects a malformed value in a draft', () => {
    // Optional does not mean unvalidated: a rating of 99 must never be stored.
    const result = validateContent(definition, { score: 99 }, { enforceRequired: false })
    assert.equal(result.ok, false)
  })
})

describe('cleanContent', () => {
  const definition: ReportFormDefinition = {
    sections: [
      {
        key: 's',
        title: 'S',
        fields: [field({ key: 'a', type: 'short_text' }), field({ key: 'b', type: 'number' })],
      },
    ],
  }

  it('drops keys the template does not declare', () => {
    const cleaned = cleanContent(definition, { a: 'hi', b: 1, injected: 'nope' })
    assert.deepEqual(Object.keys(cleaned).sort(), ['a', 'b'])
  })

  it('fills a field added to the template after the draft was started', () => {
    const cleaned = cleanContent(definition, { a: 'hi' })
    assert.equal(cleaned.b, null)
  })
})

describe('parseFormDefinition', () => {
  it('survives whatever is in the jsonb column', () => {
    assert.deepEqual(parseFormDefinition(null), { sections: [] })
    assert.deepEqual(parseFormDefinition('nope'), { sections: [] })
    assert.deepEqual(parseFormDefinition({ sections: 'nope' }), { sections: [] })
  })

  it('discards fields with an unknown type instead of trusting them', () => {
    const parsed = parseFormDefinition({
      sections: [
        {
          key: 's',
          title: 'S',
          fields: [
            { key: 'ok', label: 'Fine', type: 'short_text' },
            { key: 'bad', label: 'Bad', type: 'sql_injection' },
            { key: 'nolabel', type: 'number' },
          ],
        },
      ],
    })
    assert.equal(allFields(parsed).length, 1)
    assert.equal(allFields(parsed)[0].key, 'ok')
  })
})
