import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { orderStageFor } from './order-stage'

describe('orderStageFor', () => {
  it('holds the order at the least advanced card', () => {
    // The bug this whole function exists to prevent is an order that runs ahead
    // of its cards, so every mixed case pins to the laggard.
    assert.equal(orderStageFor(['ready', 'in_design', 'delivered']), 'in_progress')
    assert.equal(orderStageFor(['delivered', 'ready']), 'ready')
    assert.equal(orderStageFor(['ready', 'ready']), 'ready')
  })

  it('only reaches delivered when every card is delivered', () => {
    assert.equal(orderStageFor(['delivered']), 'delivered')
    assert.equal(orderStageFor(['delivered', 'delivered', 'delivered']), 'delivered')
  })

  it('treats an unknown status as unfinished rather than ignoring it', () => {
    // A status this map has not been taught about must not be able to let an
    // order sail past it.
    assert.equal(orderStageFor(['delivered', 'awaiting_print']), 'in_progress')
  })

  it('refuses to conclude anything from no cards', () => {
    // THE REGRESSION. `(siblings ?? [])` after a discarded read error handed
    // this function an empty list, and an empty list contains no 'in_progress'
    // and no 'ready', so the old chained ternary fell through to 'delivered'.
    // A transient read failure marked a couple's whole order Delivered.
    assert.equal(orderStageFor([]), null)
  })

  it('maps every in-flight status to in_progress', () => {
    assert.equal(orderStageFor(['awaiting_info']), 'in_progress')
    assert.equal(orderStageFor(['in_design']), 'in_progress')
    assert.equal(orderStageFor(['in_review']), 'in_progress')
  })
})
