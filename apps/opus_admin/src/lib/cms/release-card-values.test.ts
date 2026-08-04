import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RELEASE_GUEST_PLACEHOLDER,
  releaseCardFieldValues,
} from './release-card-values'

test('release card values replace the artwork sample guest with the neutral placeholder', () => {
  const designerValues = {
    guest_name: 'Bi. Fabiola Thomas',
    couple_name_1: 'Asha',
  }

  assert.deepEqual(releaseCardFieldValues(designerValues), {
    guest_name: RELEASE_GUEST_PLACEHOLDER,
    couple_name_1: 'Asha',
  })
  assert.equal(designerValues.guest_name, 'Bi. Fabiola Thomas')
})

test('release card values add the placeholder when no guest value was stored', () => {
  assert.deepEqual(releaseCardFieldValues(null), {
    guest_name: 'Jina la Mgeni',
  })
})

test('assigned event partner names override stale card-detail answers', () => {
  assert.deepEqual(
    releaseCardFieldValues(
      { couple_name_1: 'Old One', couple_name_2: 'Old Two' },
      { partner1Name: 'Moses Seta', partner2Name: 'Dayness Mwaranchi' },
    ),
    {
      couple_name_1: 'Moses Seta',
      couple_name_2: 'Dayness Mwaranchi',
      guest_name: 'Jina la Mgeni',
    },
  )
})
