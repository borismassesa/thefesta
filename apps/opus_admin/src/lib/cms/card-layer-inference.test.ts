import assert from 'node:assert/strict'
import test from 'node:test'
import { autoApplicable, categorySchema, suggestRoles } from '@opusfesta/lib'
import { CARD_FIELD_ROLES } from './card-field-roles'

const WEDDING = categorySchema('Wedding Invitations')

/**
 * The reference card exactly as it exports: layer id and visible text, in
 * document order. Every entry is real, taken from the live artwork rather than
 * invented, because the whole point is to resolve the names designers actually
 * produce.
 */
const REAL_LAYERS = [
  { id: 'Familia_ya', sampleText: 'Familia ya' },
  { id: 'Bw_Bi_Ambukege_Seeta_', sampleText: 'Bw & Bi Ambukege Seeta' },
  { id: 'invite_line-2', sampleText: 'Wanayo furaha kukualika/kuwaalika' },
  { id: 'Bi._Fabiola_Thomas', sampleText: 'Bi. Fabiola Thomas' },
  { id: 'Kwenye_sherehe_ya', sampleText: 'Kwenye sherehe ya' },
  { id: 'Harusi_ya_watoto_wao_wapendwa', sampleText: 'Harusi ya watoto wao wapendwa' },
  { id: 'couple_name_1', sampleText: 'Moses Seeta' },
  { id: 'ampersand', sampleText: '&' },
  { id: 'couple_name_2', sampleText: 'Dayness Mwandri' },
  { id: 'date_intro', sampleText: 'Itakayofanyika Jumamosi tarehe' },
  { id: 'date_day', sampleText: '08' },
  { id: 'Artboard_1_copy_2#1', sampleText: 'A G O STI' },
  { id: 'Artboard_1_copy_2#2', sampleText: '2 0 26' },
  { id: 'Ibada_ya_Ndoa', sampleText: 'Ibada ya Ndoa' },
  { id: 'KKKT_Sala_sala_JUU', sampleText: 'KKKT Sala sala JUU' },
  { id: 'Saa_09:00_Alasiri', sampleText: 'Saa 09:00 Alasiri' },
  { id: 'Sala_sala_M_Lami', sampleText: 'Sala sala M/Lami' },
  { id: '_Kwa_Mama_Seeta_', sampleText: '(Kwa Mama Seeta)' },
  { id: 'Saa_12:00_Jioni', sampleText: 'Saa 12:00 Jioni' },
  { id: 'MAWASILIANO_', sampleText: 'MAWASILIANO' },
  { id: 'contact_1-2', sampleText: 'Bi. Suzan Seeta +255 755 000 850' },
  { id: 'Anita_Isaac_255_756_089_282', sampleText: 'Anita Isaac +255 756 089 282' },
  { id: 'RANGI', sampleText: 'RANGI' },
]

const suggest = (layers = REAL_LAYERS, assigned: Record<string, string> = {}) =>
  suggestRoles(layers, CARD_FIELD_ROLES, WEDDING, assigned)

test('a layer named for its role is matched exactly', () => {
  const s = suggest()
  assert.equal(s.get('couple_name_1')?.role, 'couple_name_1')
  assert.equal(s.get('couple_name_1')?.confidence, 'exact')
})

test("Illustrator's export suffixes do not defeat an exact match", () => {
  const s = suggest()
  assert.equal(s.get('invite_line-2')?.role, 'invite_line')
  assert.equal(s.get('contact_1-2')?.role, 'contact_1')
})

test('a phone number identifies a contact, and position decides which', () => {
  // This is the pair that cannot be told apart one layer at a time.
  const s = suggest()
  assert.equal(s.get('contact_1-2')?.role, 'contact_1')
  assert.equal(s.get('Anita_Isaac_255_756_089_282')?.role, 'contact_2')
  assert.equal(s.get('Anita_Isaac_255_756_089_282')?.confidence, 'content')
  assert.match(s.get('Anita_Isaac_255_756_089_282')!.reason, /phone/i)
})

test('a Swahili clock time identifies a venue time, in reading order', () => {
  const s = suggest()
  assert.equal(s.get('Saa_09:00_Alasiri')?.role, 'venue_1_time')
  assert.equal(s.get('Saa_12:00_Jioni')?.role, 'venue_2_time')
})

test('letterspaced month and year still match', () => {
  // These arrive split per tspan, so the raw text is "A G O STI", not "AGOSTI".
  // Without collapsing whitespace neither would ever resolve.
  const s = suggest()
  assert.equal(s.get('Artboard_1_copy_2#1')?.role, 'date_month')
  assert.equal(s.get('Artboard_1_copy_2#2')?.role, 'date_year')
})

test('a content-named guest layer is recognised from its honorific', () => {
  const s = suggest()
  assert.equal(s.get('Bi._Fabiola_Thomas')?.role, 'guest_name')
  assert.equal(s.get('Bi._Fabiola_Thomas')?.confidence, 'content')
})

test('a hosting couple is not mistaken for a single guest', () => {
  // 'Bw & Bi Ambukege Seeta' also starts with an honorific. The pair form has
  // to win, or the hosts land in the guest field on every card.
  const s = suggest()
  assert.equal(s.get('Bw_Bi_Ambukege_Seeta_')?.role, 'hosts_names')
})

test('the Swahili headings are recognised', () => {
  const s = suggest()
  assert.equal(s.get('MAWASILIANO_')?.role, 'contact_heading')
  assert.equal(s.get('RANGI')?.role, 'palette_heading')
})

test('a church names the ceremony venue', () => {
  assert.equal(suggest().get('KKKT_Sala_sala_JUU')?.role, 'venue_1_place')
})

test('every role is suggested at most once', () => {
  const roles = [...suggest().values()].map((s) => s.role)
  assert.equal(new Set(roles).size, roles.length, 'a role was suggested for two layers')
})

test('an explicit name always beats an inferred one', () => {
  // 'Moses Seeta' would satisfy no pattern, but the ordering guarantee matters
  // for a layer that is BOTH named and content-matchable.
  const s = suggest([
    { id: 'date_day', sampleText: '08' },
    { id: 'some_other_layer', sampleText: '12' },
  ])
  assert.equal(s.get('date_day')?.confidence, 'exact')
  // Only one day field exists, so the second numeric layer gets nothing.
  assert.equal(s.get('some_other_layer'), undefined)
})

test('roles outside the category are never suggested', () => {
  // A Save the Date has no reception time, so a Swahili clock must not be
  // offered one.
  const s = suggestRoles(
    [{ id: 'Saa_12:00_Jioni', sampleText: 'Saa 12:00 Jioni' }],
    CARD_FIELD_ROLES,
    categorySchema('Save the Dates'),
  )
  assert.equal(s.get('Saa_12:00_Jioni'), undefined)
})

test('a layer already mapped by hand is left alone', () => {
  const s = suggest(REAL_LAYERS, { 'Bi._Fabiola_Thomas': 'couple_name_1' })
  assert.equal(s.get('Bi._Fabiola_Thomas'), undefined)
})

test('inference is never auto-applied', () => {
  // The guarantee the whole design rests on: opening the mapper may apply what
  // the designer named, and nothing it merely inferred.
  const s = suggest()
  const auto = autoApplicable(s)
  for (const [layerId, role] of Object.entries(auto)) {
    assert.notEqual(s.get(layerId)?.confidence, 'content', `${layerId} → ${role} was inferred`)
  }
  assert.ok(Object.keys(auto).length > 0, 'named layers should still auto-apply')
})

test('the reference card resolves far better than name matching alone', () => {
  const s = suggest()
  const auto = Object.keys(autoApplicable(s)).length
  const total = s.size
  // Name matching alone managed 10 of 24 on this artwork. Reading the content
  // as well takes it to 22 of 23. Asserted as a floor rather than an exact
  // figure, so adding vocabulary never fails the suite.
  assert.ok(total >= 22, `expected at least 22 resolved, got ${total}`)
  assert.ok(auto >= 10, `named layers should still auto-apply, got ${auto}`)
  // eslint-disable-next-line no-console -- the whole point of this test is
  // to report the number, so it has to reach the terminal.
  console.log(`      reference card: ${total} of ${REAL_LAYERS.length} resolved (${auto} auto, ${total - auto} suggested)`)
})
