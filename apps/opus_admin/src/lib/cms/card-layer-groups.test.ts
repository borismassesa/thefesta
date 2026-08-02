import assert from 'node:assert/strict'
import test from 'node:test'
import { CARD_FIELD_ROLES } from '@opusfesta/lib'
import {
  UNASSIGNED,
  groupLayerRows,
  groupNeedsAttention,
  isLightColour,
  parseHexColour,
  relativeLuminance,
  type LayerRow,
} from './card-layer-groups'

const row = (id: string): LayerRow => ({ id, sample: id, note: null })

// ── Grouping ──

test('assigned layers land in their role group, in card reading order', () => {
  const groups = groupLayerRows(
    [row('a'), row('b'), row('c')],
    { a: 'contact_1', b: 'couple_name_1', c: 'hosts_names' },
  )
  assert.deepEqual(
    groups.map((g) => g.key),
    ['Hosts', 'Couple', 'Contacts'],
  )
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['c'])
})

test('unassigned layers go to their own group, last, and are never inferred into one', () => {
  // 'Bi._Fabiola_Thomas' has a content suggestion (guest_name) but no
  // assignment. Filing it under Hosts would present an unconfirmed inference as
  // a decision the admin had taken.
  const groups = groupLayerRows(
    [row('Bi._Fabiola_Thomas'), row('couple_name_1')],
    { couple_name_1: 'couple_name_1' },
  )
  assert.deepEqual(
    groups.map((g) => g.key),
    ['Couple', UNASSIGNED],
  )
  assert.deepEqual(groups[1].rows.map((r) => r.id), ['Bi._Fabiola_Thomas'])
  assert.equal(groups[1].coverage, null)
})

test('a layer explicitly set to "not a field" reads as unassigned', () => {
  // Both are the empty string today. If that ever changes, this test is where
  // the distinction has to be made deliberately rather than by accident.
  const groups = groupLayerRows([row('Rectangle_2')], { Rectangle_2: '' })
  assert.deepEqual(groups.map((g) => g.key), [UNASSIGNED])
})

test('a binding naming a role that no longer exists stays visible as unassigned', () => {
  const groups = groupLayerRows([row('a')], { a: 'role_deleted_in_a_refactor' })
  assert.deepEqual(groups.map((g) => g.key), [UNASSIGNED])
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['a'])
})

test('empty groups are omitted rather than shown as zero', () => {
  const groups = groupLayerRows([row('a')], { a: 'date_day' })
  assert.deepEqual(groups.map((g) => g.key), ['Date'])
})

test('row order inside a group follows document order, not role order', () => {
  const groups = groupLayerRows(
    [row('year'), row('day'), row('month')],
    { year: 'date_year', day: 'date_day', month: 'date_month' },
  )
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['year', 'day', 'month'])
})

test('coverage counts the group schema, not the rows in the section', () => {
  // Date defines four roles. Three bound means three of four, even though only
  // three rows were passed in.
  const groups = groupLayerRows(
    [row('a'), row('b'), row('c')],
    { a: 'date_day', b: 'date_month', c: 'date_year' },
  )
  assert.deepEqual(groups[0].coverage, { mapped: 3, total: 4 })
})

test('coverage counts roles bound anywhere, so a split section still reads true', () => {
  // The palette heading is text and the five chips are shapes, so Design spans
  // two sections. Both must report the same group coverage.
  const assignment = {
    heading: 'palette_heading',
    s1: 'palette_1',
    s2: 'palette_2',
    s3: 'palette_3',
    s4: 'palette_4',
    s5: 'palette_5',
  }
  const text = groupLayerRows([row('heading')], assignment)
  const shapes = groupLayerRows([row('s1'), row('s2')], assignment)
  assert.deepEqual(text[0].coverage, { mapped: 6, total: 6 })
  assert.deepEqual(shapes[0].coverage, { mapped: 6, total: 6 })
})

test('two layers on one role count that role once', () => {
  const groups = groupLayerRows([row('a'), row('b')], { a: 'date_day', b: 'date_day' })
  assert.deepEqual(groups[0].coverage, { mapped: 1, total: 4 })
})

test('re-assigning a layer moves it between groups and updates both counts', () => {
  const rows = [row('a')]
  const before = groupLayerRows(rows, { a: 'date_day' })
  const after = groupLayerRows(rows, { a: 'contact_1' })
  assert.deepEqual(before.map((g) => g.key), ['Date'])
  assert.deepEqual(before[0].coverage, { mapped: 1, total: 4 })
  assert.deepEqual(after.map((g) => g.key), ['Contacts'])
  assert.deepEqual(after[0].coverage, { mapped: 1, total: 3 })
})

test('group totals add up to the whole schema', () => {
  const groups = groupLayerRows(
    CARD_FIELD_ROLES.map((r) => row(r.key)),
    Object.fromEntries(CARD_FIELD_ROLES.map((r) => [r.key, r.key])),
  )
  assert.equal(
    groups.reduce((sum, g) => sum + (g.coverage?.total ?? 0), 0),
    CARD_FIELD_ROLES.length,
  )
  // Every group fully mapped, so none of them needs attention.
  assert.deepEqual(groups.filter(groupNeedsAttention), [])
})

test('a group with an unbound role needs attention, and so does Unassigned', () => {
  const groups = groupLayerRows([row('a'), row('b')], { a: 'date_day' })
  const date = groups.find((g) => g.key === 'Date')!
  const unassigned = groups.find((g) => g.key === UNASSIGNED)!
  assert.equal(groupNeedsAttention(date), true)
  assert.equal(groupNeedsAttention(unassigned), true)
})

// ── Colour swatches ──

test('hex parses in both three and six digit forms', () => {
  assert.deepEqual(parseHexColour('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(parseHexColour('#B67C24'), { r: 182, g: 124, b: 36 })
  assert.deepEqual(parseHexColour('  #024231 '), { r: 2, g: 66, b: 49 })
})

test('anything that is not a hex colour is rejected', () => {
  for (const bad of ['', 'red', 'rgb(1,2,3)', '#12', '#1234', 'url(#grad)', '#gggggg']) {
    assert.equal(parseHexColour(bad), null, bad)
    assert.equal(relativeLuminance(bad), null, bad)
  }
})

test('the catalogue ivories and blushes count as light', () => {
  // These are the real palette examples from the schema, plus the artwork
  // fills that prompted this: a pale square on a white page is invisible.
  for (const pale of ['#ffffff', '#fff', '#F5EFE3', '#F5DCE2', '#FFFFF0']) {
    assert.equal(isLightColour(pale), true, pale)
  }
})

test('the mid and dark artwork fills do not get the heavy ring', () => {
  for (const dark of ['#B67C24', '#4b3014', '#996515', '#713500', '#024231', '#7A1F2B']) {
    assert.equal(isLightColour(dark), false, dark)
  }
})

test('an unreadable fill is treated as light, so it still gets an outline', () => {
  // 'no fill set' and gradient references must not render as a bare white box
  // indistinguishable from an ivory swatch.
  assert.equal(isLightColour('url(#gradient)'), true)
  assert.equal(isLightColour(''), true)
})

test('luminance is ordered black to white', () => {
  const black = relativeLuminance('#000000')!
  const mid = relativeLuminance('#808080')!
  const white = relativeLuminance('#ffffff')!
  assert.equal(black, 0)
  assert.equal(white, 1)
  assert.ok(black < mid && mid < white)
})
