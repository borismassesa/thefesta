import assert from 'node:assert/strict'
import test from 'node:test'
import { formatInviteGuestName, INVITE_TEMPLATE } from './types'

test('invitation greeting preserves the complete guest-list name', () => {
  assert.equal(formatInviteGuestName('Mr Boris Massesa'), 'Mr Boris Massesa')
  assert.equal(formatInviteGuestName('Mr&Mrs Joel'), 'Mr&Mrs Joel')
  assert.equal(formatInviteGuestName('Familia ya Prof Ziddy'), 'Familia ya Prof Ziddy')
})

test('invitation greeting only normalizes template-unsafe whitespace', () => {
  assert.equal(formatInviteGuestName('  Mr Boris\nMassesa  '), 'Mr Boris Massesa')
  assert.equal(formatInviteGuestName('  ', 'Amina'), 'Amina')
})

test('approved invitation template copy remains unchanged', () => {
  assert.equal(
    INVITE_TEMPLATE.body,
    'Habari *{{1}}*,\nUmealikwa kwa furaha kuhudhuria *{{3}}* ya *{{2}}*. Tunatarajia uwepo wako katika siku hii maalum.\nTafadhali thibitisha ujio wako hapa chini 👇',
  )
})
