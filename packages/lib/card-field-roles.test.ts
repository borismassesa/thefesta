import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CARD_FIELD_ROLES,
  OPUS_ROYAL_IVORY_BINDINGS,
  assessBindings,
  cardFieldRole,
  customerSuppliedRoles,
  requestableFields,
  roleForLayerName,
  type CardFieldBinding,
} from './card-field-roles'

test('the reference schema is the 23 text roles plus 5 palette colours', () => {
  assert.equal(CARD_FIELD_ROLES.length, 28)
  assert.equal(CARD_FIELD_ROLES.filter((r) => r.kind === 'colour').length, 5)
})

test('role keys are unique', () => {
  const keys = CARD_FIELD_ROLES.map((r) => r.key)
  assert.equal(new Set(keys).size, keys.length)
})

test('guest_name is the only per-guest field', () => {
  // This drives render volume: an order of 50 guests produces 50 SVGs that
  // differ only in the 'guest' scoped fields. If a second one ever appears it
  // must be a deliberate decision, not a silent addition.
  const perGuest = CARD_FIELD_ROLES.filter((r) => r.scope === 'guest').map((r) => r.key)
  assert.deepEqual(perGuest, ['guest_name'])
})

test('the couple is only asked for fields that actually vary', () => {
  const asked = customerSuppliedRoles().map((r) => r.key)
  // Straight from the brief: couple names, guest name, date, venues, contacts.
  for (const key of [
    'guest_name', 'hosts_names', 'couple_name_1', 'couple_name_2',
    'date_day', 'date_month', 'date_year',
    'venue_1_place', 'venue_2_place', 'contact_1', 'contact_2',
  ]) {
    assert.ok(asked.includes(key), `${key} must be asked of the couple`)
  }
  // Fixed design copy must never appear on the couple's form.
  for (const key of ['hosts_intro', 'invite_line', 'ampersand', 'palette_heading', 'date_intro']) {
    assert.ok(!asked.includes(key), `${key} is template copy, not a question`)
  }
})

test('every role is bound in the reference artwork', () => {
  const bound = new Set(OPUS_ROYAL_IVORY_BINDINGS.map((b) => b.role))
  for (const role of CARD_FIELD_ROLES) {
    assert.ok(bound.has(role.key), `${role.key} has no binding`)
  }
  assert.equal(OPUS_ROYAL_IVORY_BINDINGS.length, 28)
})

test('every bound role names a real role', () => {
  for (const binding of OPUS_ROYAL_IVORY_BINDINGS) {
    assert.ok(cardFieldRole(binding.role), `${binding.role} is not a known role`)
  }
})

test('date_intro maps to its three exported layers', () => {
  const dateIntro = OPUS_ROYAL_IVORY_BINDINGS.find((b) => b.role === 'date_intro')
  assert.deepEqual(dateIntro?.layerIds, ['Itakayofanyika', 'Jumamosi', 'tarehe'])
})

test('the gold layers and all five swatches are rasterised', () => {
  const blocked = OPUS_ROYAL_IVORY_BINDINGS.filter((b) => b.rasterised).map((b) => b.role)
  assert.deepEqual(blocked.sort(), [
    'ampersand', 'couple_name_1', 'couple_name_2',
    'date_day', 'date_month', 'date_year',
    'palette_1', 'palette_2', 'palette_3', 'palette_4', 'palette_5',
  ])
})

test('every rasterised layer carries the Illustrator _Image suffix', () => {
  // The suffix is the evidence that Illustrator flattened the layer. If a
  // binding is marked rasterised without it, the mapping was probably guessed.
  for (const binding of OPUS_ROYAL_IVORY_BINDINGS.filter((b) => b.rasterised)) {
    for (const id of binding.layerIds) {
      assert.match(id, /_Image$/, `${id} marked rasterised but not an _Image layer`)
    }
  }
})

test('no surviving text layer is misfiled as rasterised', () => {
  for (const binding of OPUS_ROYAL_IVORY_BINDINGS.filter((b) => !b.rasterised)) {
    for (const id of binding.layerIds) {
      assert.doesNotMatch(id, /_Image$/, `${id} is an _Image layer but not flagged`)
    }
  }
})

test('the reference card cannot fulfil orders until re-exported', () => {
  const { blocked, unbound, canFulfilOrders } = assessBindings(
    OPUS_ROYAL_IVORY_BINDINGS,
    'Wedding Invitations',
  )
  assert.equal(unbound.length, 0, 'all 28 roles are bound')
  // Six gold text layers plus the five swatch bitmaps.
  assert.equal(blocked.length, 11)
  // couple_name_1/2 and the date are order-scope, so the couple would be asked
  // for values the designer has nowhere to put.
  assert.equal(canFulfilOrders, false)
})

test('re-exporting the gold layers as text unblocks the card', () => {
  const fixed = OPUS_ROYAL_IVORY_BINDINGS.map((b) =>
    b.rasterised
      ? { ...b, rasterised: undefined, layerIds: b.layerIds.map((id) => id.replace(/_Image$/, '')) }
      : b,
  )
  const { blocked, canFulfilOrders } = assessBindings(fixed)
  assert.deepEqual(blocked, [])
  assert.equal(canFulfilOrders, true)
})

test('a stuck template-copy field alone does not block fulfilment', () => {
  // Swatches are order-scope, so they must be unblocked for this to isolate
  // the template-copy case.
  // 'ampersand' is template scope — an unchanging "&". Stuck as a bitmap it is
  // ugly but harmless, so it must not gate orders on its own.
  const onlyAmpersandStuck = OPUS_ROYAL_IVORY_BINDINGS.map((b) =>
    b.rasterised && b.role !== 'ampersand'
      ? { ...b, rasterised: undefined, layerIds: b.layerIds.map((id) => id.replace(/_Image$/, '')) }
      : b,
  )
  const { blocked, canFulfilOrders } = assessBindings(onlyAmpersandStuck)
  assert.deepEqual(blocked, ['ampersand'])
  assert.equal(canFulfilOrders, true)
})

test('a missing binding blocks fulfilment when the couple supplies that field', () => {
  const withoutCoupleName = OPUS_ROYAL_IVORY_BINDINGS.filter((b) => b.role !== 'couple_name_1')
  const { unbound, canFulfilOrders } = assessBindings(withoutCoupleName, 'Wedding Invitations')
  assert.ok(unbound.includes('couple_name_1'))
  assert.equal(canFulfilOrders, false)
})

test('requestable fields exclude fixed copy and per-guest values', () => {
  const fields = requestableFields(OPUS_ROYAL_IVORY_BINDINGS).map((f) => f.role.key)
  // Template copy is design, not a question.
  for (const key of ['hosts_intro', 'invite_line', 'ampersand', 'date_intro', 'palette_heading']) {
    assert.ok(!fields.includes(key), `${key} is fixed copy and must not be asked`)
  }
  // guest_name differs per printed card — it comes from the guest list, so
  // asking the couple for it once would be wrong.
  assert.ok(!fields.includes('guest_name'), 'guest_name is per-guest, not a form answer')
  // What is left is genuinely couple-supplied.
  for (const key of ['couple_name_1', 'date_day', 'venue_1_place', 'contact_1']) {
    assert.ok(fields.includes(key), `${key} must be requestable`)
  }
})

test('a rasterised field is surfaced with a reason, not dropped', () => {
  const coupleName = requestableFields(OPUS_ROYAL_IVORY_BINDINGS).find(
    (f) => f.role.key === 'couple_name_1',
  )
  assert.ok(coupleName, 'the field must still appear')
  assert.equal(coupleName.blockedReason, 'rasterised')
  assert.deepEqual(coupleName.layerIds, ['couple_name_1_Image'])
})

test('roles the artwork has no layer for are not on the card', () => {
  const withoutVenue = OPUS_ROYAL_IVORY_BINDINGS.filter((b) => b.role !== 'venue_2_place')
  const fields = requestableFields(withoutVenue).map((f) => f.role.key)
  assert.ok(!fields.includes('venue_2_place'), 'an unmapped role is not part of this card')
})

test('an unmapped card asks for nothing', () => {
  assert.deepEqual(requestableFields([]), [])
})

// ── roleForLayerName ──
// Illustrator's suffixes and the artwork's house name for the swatches all have
// to resolve, or "Match by name" leaves the admin hand-mapping every card.

test('a layer named exactly as the role matches', () => {
  assert.equal(roleForLayerName('couple_name_1')?.key, 'couple_name_1')
})

test("Illustrator's flatten and duplicate suffixes are ignored", () => {
  assert.equal(roleForLayerName('couple_name_1_Image')?.key, 'couple_name_1')
  assert.equal(roleForLayerName('invite_line-2')?.key, 'invite_line')
})

test('the artwork calls the swatches palette_swatch_N and the role is palette_N', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(roleForLayerName(`palette_swatch_${n}`)?.key, `palette_${n}`)
  }
  // The shape inside <g id="palette_swatch_1"> exports with the dedupe suffix.
  assert.equal(roleForLayerName('palette_swatch_1-2')?.key, 'palette_1')
})

test('a content-named layer is left for a human rather than guessed', () => {
  assert.equal(roleForLayerName('Bi._Fabiola_Thomas'), undefined)
  assert.equal(roleForLayerName('Rectangle_2'), undefined)
})

// ── Per-category readiness ──
// The catalogue holds four kinds of card. Judging all of them against a
// wedding invitation's 28 roles marked 89 of 133 permanently unready.

test('a Save the Date is ready without the fields it does not have', () => {
  const bindings: CardFieldBinding[] = [
    { role: 'couple_name_1', layerIds: ['couple_name_1'] },
    { role: 'couple_name_2', layerIds: ['couple_name_2'] },
    { role: 'date_day', layerIds: ['date_day'] },
    { role: 'date_month', layerIds: ['date_month'] },
    { role: 'date_year', layerIds: ['date_year'] },
  ]
  assert.equal(assessBindings(bindings, 'Save the Dates').canFulfilOrders, true)
  // The very same card judged as a wedding invitation is not ready: it has no
  // ceremony venue, which a wedding invitation must have.
  const asWedding = assessBindings(bindings, 'Wedding Invitations')
  assert.equal(asWedding.canFulfilOrders, false)
  assert.ok(asWedding.missingRequired.includes('venue_1_place'))
})

test('roles outside a category are not counted as missing', () => {
  const readiness = assessBindings([], 'Save the Dates')
  assert.ok(!readiness.unbound.includes('venue_2_time'), 'a Save the Date has no reception time')
  assert.ok(!readiness.unbound.includes('palette_1'), 'nor a colour palette')
})

test('an unknown category never blocks a card', () => {
  // A card type we have not modelled must not be stuck. Requiring nothing is
  // the safe direction; guessing a schema for an unseen card is not.
  assert.equal(assessBindings([], 'Gala Dinner').canFulfilOrders, true)
  assert.equal(assessBindings([], null).canFulfilOrders, true)
})

test('requestableFields only asks for fields this category has', () => {
  const bindings: CardFieldBinding[] = [
    { role: 'venue_2_time', layerIds: ['some_layer'] },
    { role: 'couple_name_1', layerIds: ['couple_name_1'] },
  ]
  const keys = requestableFields(bindings, 'Save the Dates').map((f) => f.role.key)
  assert.ok(keys.includes('couple_name_1'))
  assert.ok(!keys.includes('venue_2_time'), 'a Save the Date must not ask for a reception time')
})
