import assert from 'node:assert/strict'
import test from 'node:test'
import type { CardFieldBinding } from './card-field-roles'
import type { FontMetrics } from './card-font-metrics'
import { extractArtworkGeometry } from './card-geometry'
import {
  defaultEmptyPolicy,
  defaultMissingPolicy,
  deriveLayout,
  valueStateFor,
  type CardLayout,
  type EmptyValuePolicy,
  type FieldLayout,
} from './card-layout'
import { resolveCardLayout, type FieldPresence } from './card-layout-resolve'
import { renderPlanToSvg } from './card-layout-render'

const HALF_EM: FontMetrics = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  lineGap: 0,
  advances: Object.fromEntries(Array.from({ length: 95 }, (_, i) => [String(i + 32), 500])),
  fallbackAdvance: 500,
}

const ARTWORK = `<svg viewBox="0 0 400 400">
  <g id="contact_2"><text x="20" y="300" font-family="Nexa" font-size="10">0712 000 000</text></g>
</svg>`

const BINDINGS: CardFieldBinding[] = [{ role: 'contact_2', layerIds: ['contact_2'] }]
const FIELD_ID = 'fld_contact_2_1'

function layoutWith(policy: Partial<Pick<FieldLayout, 'onEmpty' | 'onMissing'>>): CardLayout {
  const layout = deriveLayout(extractArtworkGeometry(ARTWORK), BINDINGS, () => HALF_EM)
  const field = layout.fields[FIELD_ID]
  layout.fields[FIELD_ID] = {
    ...field,
    // Widened so a present value is not also fighting the fit margin.
    localBox: { ...field.localBox, w: field.localBox.w + 40 },
    ...policy,
  }
  return layout
}

function resolve(layout: CardLayout, values: Record<string, string>) {
  return resolveCardLayout({
    layout,
    state: 'active',
    values,
    metricsFor: () => HALF_EM,
    boundRoles: new Set(BINDINGS.map((binding) => binding.role)),
  })
}

const presence = (layout: CardLayout, values: Record<string, string>): FieldPresence =>
  resolve(layout, values).fields[FIELD_ID].presence

const svg = (layout: CardLayout, values: Record<string, string>) =>
  renderPlanToSvg(ARTWORK, resolve(layout, values), BINDINGS, values).svg

// ── The four states are actually four ──

test('classifies unbound, missing, empty and present as distinct states', () => {
  const field = layoutWith({}).fields[FIELD_ID]
  const bound = new Set(['contact_2'])

  assert.deepEqual(valueStateFor(field, {}, new Set()), { kind: 'unbound' })
  assert.deepEqual(valueStateFor(field, {}, bound), { kind: 'missing' })
  assert.deepEqual(valueStateFor(field, { contact_2: '   ' }, bound), { kind: 'empty' })
  assert.deepEqual(valueStateFor(field, { contact_2: '0755' }, bound), {
    kind: 'present',
    value: '0755',
  })
})

test('a role no binding supplies is unbound, whatever the order says', () => {
  // Its mapping has been removed. Nothing about the order can change that, so
  // no policy about the order's data applies.
  const field = layoutWith({}).fields[FIELD_ID]
  assert.deepEqual(valueStateFor(field, { contact_2: '0755' }, new Set()), { kind: 'unbound' })
})

// ── Each policy, against each absent state ──

const ABSENT: { label: string; values: Record<string, string> }[] = [
  { label: 'missing', values: {} },
  { label: 'empty', values: { contact_2: '' } },
]

test("'preserve-source' keeps the designer's copy for both absent states", () => {
  for (const { label, values } of ABSENT) {
    const layout = layoutWith({ onMissing: 'preserve-source', onEmpty: 'preserve-source' })
    assert.equal(presence(layout, values), 'placeholder', label)
    assert.match(svg(layout, values), />0712 000 000</, label)
  }
})

test("'hide' removes the element for both absent states", () => {
  for (const { label, values } of ABSENT) {
    const layout = layoutWith({ onMissing: 'hide', onEmpty: 'hide' })
    assert.equal(presence(layout, values), 'hidden', label)
    assert.doesNotMatch(svg(layout, values), /0712 000 000/, label)
    assert.doesNotMatch(svg(layout, values), /<text/, label)
  }
})

test("'render-empty' keeps an element with no text, so surrounding spacing survives", () => {
  const layout = layoutWith({ onEmpty: 'render-empty' })
  assert.equal(presence(layout, { contact_2: '' }), 'empty')
  const out = svg(layout, { contact_2: '' })
  assert.match(out, /<text[^>]*><\/text>/)
  assert.doesNotMatch(out, /0712 000 000/)
})

test("'block' refuses, and names which absent state it was", () => {
  for (const { label, values } of ABSENT) {
    const layout = layoutWith({ onMissing: 'block', onEmpty: 'block' })
    const plan = resolve(layout, values)
    const blocker = plan.blockers.find((issue) => issue.code === 'REQUIRED_VALUE_ABSENT')
    assert.ok(blocker, label)
    assert.equal(blocker.role, 'contact_2', label)
    assert.equal(blocker.details?.valueState, label, label)
    // Blocking does not also destroy the artwork's copy: the release simply
    // does not happen.
    assert.equal(plan.fields[FIELD_ID].presence, 'placeholder', label)
  }
})

test('an unbound field is preserved even when its policy says block', () => {
  // No binding supplies the role, so there is no order data to be absent. A
  // blocking policy about data that cannot exist would make the card
  // unreleasable for a mapping change nobody can act on from the order side.
  const layout = layoutWith({ onMissing: 'block', onEmpty: 'block' })
  const plan = resolveCardLayout({
    layout,
    state: 'active',
    values: {},
    metricsFor: () => HALF_EM,
    boundRoles: new Set(),
  })
  assert.equal(plan.fields[FIELD_ID].presence, 'placeholder')
  assert.equal(plan.blockers.length, 0)
})

// ── missing and empty are allowed to differ, and by default they do ──

test('a form not yet filled in is treated differently from a box somebody cleared', () => {
  const layout = layoutWith({ onMissing: 'preserve-source', onEmpty: 'hide' })
  assert.equal(presence(layout, {}), 'placeholder')
  assert.equal(presence(layout, { contact_2: '' }), 'hidden')
})

test('the defaults block only the guest name, and hide the genuinely optional fields', () => {
  // Blocking a release because a couple has one contact number rather than two
  // would be absurd; a card addressed to nobody is not a card.
  assert.equal(defaultMissingPolicy('guest_name'), 'block')
  assert.equal(defaultEmptyPolicy('guest_name'), 'block')

  assert.equal(defaultEmptyPolicy('contact_2'), 'hide')
  assert.equal(defaultEmptyPolicy('table_number'), 'hide')

  assert.equal(defaultEmptyPolicy('couple_name_1'), 'preserve-source')
  assert.equal(defaultEmptyPolicy('hosts_intro'), 'preserve-source')
  // An optional field the couple has not REACHED yet keeps its copy: hiding it
  // would change the card they are still working on.
  assert.equal(defaultMissingPolicy('contact_2'), 'preserve-source')
})

// ── A visibility rule still outranks everything ──

test('an explicit visibility rule wins over the value policy', () => {
  const layout = layoutWith({ onEmpty: 'preserve-source' })
  layout.fields[FIELD_ID] = {
    ...layout.fields[FIELD_ID],
    visibleIf: { role: 'contact_2', op: 'present' },
  }
  // The policy says keep the placeholder; the rule an admin set says hide.
  assert.equal(presence(layout, { contact_2: '' }), 'hidden')
})

// ── Present values are unaffected by any of it ──

test('a present value is drawn whatever the absent policies say', () => {
  for (const policy of ['preserve-source', 'hide', 'render-empty', 'block'] as EmptyValuePolicy[]) {
    const layout = layoutWith({ onMissing: policy, onEmpty: policy })
    assert.equal(presence(layout, { contact_2: '0755 123 456' }), 'drawn', policy)
    assert.match(svg(layout, { contact_2: '0755 123 456' }), />0755 123 456</, policy)
  }
})
