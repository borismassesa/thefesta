import assert from 'node:assert/strict'
import test from 'node:test'
import { firstNameOf, fullNameOf, greetingNameOf, splitStoredGuestName } from './share'

/**
 * Honorific stripping for greetings.
 *
 * Run with:
 *   npx tsx --test src/lib/dashboard/share.test.ts
 */

test('a plain name is returned untouched', () => {
  assert.equal(firstNameOf('Boris Massesa'), 'Boris')
  assert.equal(fullNameOf('Boris Massesa'), 'Boris Massesa')
})

test('a single leading title is skipped', () => {
  assert.equal(firstNameOf('Mr Boris Massesa'), 'Boris')
  assert.equal(fullNameOf('Mr. Boris Massesa'), 'Boris Massesa')
})

test('Swahili honorifics are skipped too', () => {
  assert.equal(firstNameOf('Mzee Juma Ally'), 'Juma')
  assert.equal(firstNameOf('Bi. Zawadi Mushi'), 'Zawadi')
})

test('a compound "Mr & Mrs" greets the name, not the ampersand', () => {
  // The title dropdown offers "Mr & Mrs" for a couple invited on one row, so
  // the connector has to be skipped along with the two honorifics.
  assert.equal(firstNameOf('Mr & Mrs Boris Massesa'), 'Boris')
  assert.equal(fullNameOf('Mr & Mrs Boris Massesa'), 'Boris Massesa')
  assert.equal(firstNameOf('Mr and Mrs Boris Massesa'), 'Boris')
})

test('a guest whose first name is Swahili for "and" keeps it', () => {
  // "na" is deliberately NOT treated as a connector: skipping it would eat a
  // real first name, and no title in the dropdown produces it.
  assert.equal(firstNameOf('Na Mwangi'), 'Na')
})

test('a name that is nothing but titles falls back to the whole input', () => {
  assert.equal(firstNameOf('Mr'), 'Mr')
  assert.equal(firstNameOf('Mr & Mrs'), 'Mr & Mrs')
  assert.equal(fullNameOf('Mr & Mrs'), 'Mr & Mrs')
})

// ── greetingNameOf ────────────────────────────────────────────────────────
// How a guest is ADDRESSED: title + first given name. firstNameOf drops the
// title because it shortens the couple's own names; a guest keeps theirs.

test('a guest greeting keeps the honorific', () => {
  // The case this exists for: "Habari Mvela" is not what a guest held as
  // "Mama Mvela" is called.
  assert.equal(greetingNameOf('Mama Mvela'), 'Mama Mvela')
  assert.equal(greetingNameOf('Mr Boris Massesa'), 'Mr Boris')
  assert.equal(greetingNameOf('Mzee Juma Ally'), 'Mzee Juma')
  assert.equal(greetingNameOf('Sheikh Juma Ally'), 'Sheikh Juma')
})

test('a guest greeting keeps a compound honorific whole', () => {
  assert.equal(greetingNameOf('Mr & Mrs Emmanuel Laiser'), 'Mr & Mrs Emmanuel')
  assert.equal(greetingNameOf('Mr and Mrs Boris Massesa'), 'Mr and Mrs Boris')
})

test('a guest greeting stops at the first given name', () => {
  // Not the whole stored name: a greeting stays a greeting, and the result
  // has to fit a WhatsApp template parameter.
  assert.equal(greetingNameOf('Boris Massesa'), 'Boris')
  assert.equal(greetingNameOf('Dr Jonathan David Kileo'), 'Dr Jonathan')
})

test('a guest greeting falls back to the whole input', () => {
  assert.equal(greetingNameOf('Mr'), 'Mr')
  assert.equal(greetingNameOf('Mr & Mrs'), 'Mr & Mrs')
  assert.equal(greetingNameOf('Na Mwangi'), 'Na')
  assert.equal(greetingNameOf('  Amina  '), 'Amina')
})

test('firstNameOf still drops the title, for the couple\'s own names', () => {
  // The two must not converge: "Jonathan David & Jenifer Kasala" is shown to
  // guests as "Jonathan & Jenifer", never "Mr Jonathan & Mrs Jenifer".
  assert.equal(firstNameOf('Mama Mvela'), 'Mvela')
  assert.equal(firstNameOf('Mr Boris Massesa'), 'Boris')
})

// ── splitStoredGuestName ──────────────────────────────────────────────────
// Fixtures are the real inconsistent shapes on the Moses Seeta roster: the
// same "Mr & Mrs X" name is stored three different ways.

test('the honorific is recovered from full_name when no title is stored', () => {
  assert.deepEqual(splitStoredGuestName({ full_name: 'Mr & Mrs Agapit' }), {
    title: 'Mr & Mrs',
    first: 'Agapit',
    last: '',
  })
})

test('a badly split stored name is corrected, not trusted', () => {
  // Stored as first "Mr", last "& Mrs Alphayo" — the form used to show "Mr"
  // as the guest's first name.
  assert.deepEqual(
    splitStoredGuestName({ full_name: 'Mr & Mrs Alphayo', first_name: 'Mr', last_name: '& Mrs Alphayo' }),
    { title: 'Mr & Mrs', first: 'Alphayo', last: '' },
  )
})

test('a differently-split stored name is corrected too', () => {
  assert.deepEqual(
    splitStoredGuestName({ full_name: 'Mr & Mrs Amon Nkembo', first_name: 'Mr & Mrs Amon', last_name: 'Nkembo' }),
    { title: 'Mr & Mrs', first: 'Amon', last: 'Nkembo' },
  )
})

test('a correct stored split comes back unchanged', () => {
  assert.deepEqual(
    splitStoredGuestName({ full_name: 'Dr Joyce Nkembo', title: 'Dr', first_name: 'Joyce', last_name: 'Nkembo' }),
    { title: 'Dr', first: 'Joyce', last: 'Nkembo' },
  )
})

test('a name with no honorific keeps every word', () => {
  assert.deepEqual(splitStoredGuestName({ full_name: 'Robert Munisi' }), {
    title: '',
    first: 'Robert',
    last: 'Munisi',
  })
  assert.deepEqual(splitStoredGuestName({ full_name: 'Joel' }), { title: '', first: 'Joel', last: '' })
})

test('a name that is nothing but an honorific stays the name', () => {
  // Otherwise the guest ends up with no name at all.
  assert.deepEqual(splitStoredGuestName({ full_name: 'Mama' }), { title: '', first: 'Mama', last: '' })
})

test('the recovered title matches a dropdown option', () => {
  assert.equal(splitStoredGuestName({ full_name: 'MR & MRS MSUYA' }).title, 'Mr & Mrs')
  assert.equal(splitStoredGuestName({ full_name: 'mrs Mwanjala' }).title, 'Mrs')
})

test('an empty name does not invent one', () => {
  assert.deepEqual(splitStoredGuestName({ full_name: '' }), { title: '', first: '', last: '' })
})

test('a corrupt stored split is rebuilt from full_name, not trusted', () => {
  // Live roster row: recomposing the stored parts gives
  // "Mr & Mrs Msuya & Mrs Msuya", so saving the form would have corrupted the
  // name. full_name is what every other surface shows, so it wins.
  assert.deepEqual(
    splitStoredGuestName({
      full_name: 'Mr & Mrs Msuya',
      title: 'Mr & Mrs',
      first_name: 'Msuya',
      last_name: '& Mrs Msuya',
    }),
    { title: 'Mr & Mrs', first: 'Msuya', last: '' },
  )
})

test('a stored split with the name only in last_name is rebuilt', () => {
  assert.deepEqual(
    splitStoredGuestName({ full_name: 'Mr & Mrs Kawa', title: 'Mr & Mrs', first_name: null, last_name: 'Kawa' }),
    { title: 'Mr & Mrs', first: 'Kawa', last: '' },
  )
})

test('every real roster name survives a split-then-recompose round trip', () => {
  // The check that caught the corruption above. A split that does not add back
  // up to the stored name would silently rewrite that guest on the next save.
  const roster = [
    { full_name: 'Mr & Mrs Lameck', first_name: 'Mr', last_name: '& Mrs Lameck' },
    { full_name: 'Mr & Mrs Msuya', title: 'Mr & Mrs', first_name: 'Msuya', last_name: '& Mrs Msuya' },
    { full_name: 'Mr & Mrs Amon Nkembo', first_name: 'Mr & Mrs Amon', last_name: 'Nkembo' },
    { full_name: 'Mr & Mrs Richard Minja', title: 'Mr & Mrs', last_name: 'Richard Minja' },
    { full_name: 'Prof & Mrs Ziddy' },
    { full_name: 'Mh& Mrs Mwakasaka' },
    { full_name: 'Familia ya Njeje' },
    { full_name: 'Lucy & Angel' },
    { full_name: 'Mary Mary (Mhasibu)' },
    { full_name: 'Mr & Mrs Augustino (Abigeal)' },
    { full_name: 'Ms Sarah', title: 'Ms', first_name: 'Sarah' },
    { full_name: 'Ombeni' },
    { full_name: 'Le Plant' },
  ]
  for (const guest of roster) {
    const { title, first, last } = splitStoredGuestName(guest)
    const recomposed = [title, first, last].filter(Boolean).join(' ')
    assert.equal(recomposed, guest.full_name, `split changed "${guest.full_name}"`)
  }
})
