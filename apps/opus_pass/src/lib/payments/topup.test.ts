import assert from 'node:assert/strict'
import test from 'node:test'
import { listTopupCandidates, resolveTopup, topupOrderItem, type TopupClient } from './topup'

// A fake Supabase client that records the filters applied and replays canned
// rows. The filters are the point: which orders may act as a parent is
// expressed entirely as query predicates, so asserting on them is asserting on
// the security of the feature.

type Filters = Record<string, unknown>

function fakeClient(tables: {
  invitation_orders?: unknown[]
  invitation_card_designs?: unknown[]
  onQuery?: (table: string, filters: Filters) => void
}): TopupClient {
  const builder = (table: string) => {
    const filters: Filters = {}
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[`eq:${col}`] = val
        return chain
      },
      in: (col: string, val: unknown) => {
        filters[`in:${col}`] = val
        return chain
      },
      not: (col: string, op: string, val: unknown) => {
        filters[`not:${col}:${op}`] = val
        return chain
      },
      order: () => chain,
      then: (resolve: (r: { data: unknown[]; error: null }) => unknown) => {
        tables.onQuery?.(table, filters)
        const data =
          table === 'invitation_orders'
            ? (tables.invitation_orders ?? [])
            : (tables.invitation_card_designs ?? [])
        return Promise.resolve(resolve({ data, error: null }))
      },
    }
    return chain
  }
  return { from: builder } as unknown as TopupClient
}

const PARENT = {
  id: 'order-1',
  ref: 'OF-2026-AB12CD',
  user_id: 'user-1',
  event_id: 'event-1',
  status: 'paid',
  fulfillment_status: 'ready',
  order_kind: 'purchase',
  items: [
    {
      id: 'card-the-couple',
      name: 'The Couple',
      tier: 'Signature',
      tierId: 'signature',
      guests: 121,
      pricePerGuest: 1500,
      extrasTotal: 50_000,
      total: 231_500,
      image: '/cards/couple.jpg',
    },
  ],
}

const DESIGN = {
  id: 'design-1',
  order_id: 'order-1',
  line_index: 1,
  product_name: 'The Couple',
  current_release_id: 'release-1',
  released_at: '2026-08-01T10:00:00Z',
}

test('only paid, released, own, same-event purchases are admitted as parents', async () => {
  const seen: Array<{ table: string; filters: Filters }> = []
  await listTopupCandidates(
    'user-1',
    'event-1',
    fakeClient({
      invitation_orders: [PARENT],
      invitation_card_designs: [DESIGN],
      onQuery: (table, filters) => seen.push({ table, filters }),
    }),
  )

  const orderQuery = seen.find((q) => q.table === 'invitation_orders')!.filters
  assert.equal(orderQuery['eq:user_id'], 'user-1', 'scoped to the signed-in couple')
  assert.equal(orderQuery['eq:event_id'], 'event-1', 'scoped to the selected event')
  assert.equal(orderQuery['eq:status'], 'paid', 'refunded/failed orders excluded')
  assert.equal(orderQuery['eq:order_kind'], 'purchase', 'a top-up can never be a parent')
  assert.deepEqual(orderQuery['in:fulfillment_status'], ['ready', 'delivered'])
})

test('a candidate inherits card identity, release and unit price from the parent', async () => {
  const [candidate] = await listTopupCandidates(
    'user-1',
    'event-1',
    fakeClient({ invitation_orders: [PARENT], invitation_card_designs: [DESIGN] }),
  )
  assert.equal(candidate.releaseId, 'release-1')
  assert.equal(candidate.parentOrderId, 'order-1')
  assert.equal(candidate.cardName, 'The Couple')
  assert.equal(candidate.cardTier, 'Signature')
  assert.equal(candidate.unitPrice, 1500, 'the rate the parent actually paid')
  assert.equal(candidate.previewUrl, '/api/my/card/design-1')
})

test('a legacy line with no recorded rate recovers it from the line total, minus extras', async () => {
  const legacy = {
    ...PARENT,
    items: [{ ...PARENT.items[0], pricePerGuest: undefined }],
  }
  const [candidate] = await listTopupCandidates(
    'user-1',
    'event-1',
    fakeClient({ invitation_orders: [legacy], invitation_card_designs: [DESIGN] }),
  )
  // (231,500 − 50,000 extras) / 121 guests = 1,500
  assert.equal(candidate.unitPrice, 1500)
})

test('a line whose rate cannot be established is not offered rather than guessed at', async () => {
  const unpriceable = {
    ...PARENT,
    items: [{ ...PARENT.items[0], pricePerGuest: undefined, total: 0, extrasTotal: 0 }],
  }
  const candidates = await listTopupCandidates(
    'user-1',
    'event-1',
    fakeClient({ invitation_orders: [unpriceable], invitation_card_designs: [DESIGN] }),
  )
  assert.deepEqual(candidates, [])
})

test('a design with no release is not a candidate', async () => {
  const candidates = await listTopupCandidates(
    'user-1',
    'event-1',
    fakeClient({
      invitation_orders: [PARENT],
      invitation_card_designs: [{ ...DESIGN, current_release_id: null }],
    }),
  )
  assert.deepEqual(candidates, [])
})

test('a design pointing at a line the order does not have is not a candidate', async () => {
  const candidates = await listTopupCandidates(
    'user-1',
    'event-1',
    fakeClient({
      invitation_orders: [PARENT],
      invitation_card_designs: [{ ...DESIGN, line_index: 7 }],
    }),
  )
  assert.deepEqual(candidates, [])
})

test('resolve prices the top-up from the parent, not from anything the client sent', async () => {
  const result = await resolveTopup(
    { userId: 'user-1', eventId: 'event-1', releaseId: 'release-1', guests: 20 },
    fakeClient({ invitation_orders: [PARENT], invitation_card_designs: [DESIGN] }),
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.unitPrice, 1500)
  assert.equal(result.amount, 30_000)
  assert.equal(result.candidate.parentOrderId, 'order-1')
})

test('resolve rejects a release that is not among this couple’s candidates', async () => {
  const result = await resolveTopup(
    { userId: 'user-1', eventId: 'event-1', releaseId: 'someone-elses-release', guests: 20 },
    fakeClient({ invitation_orders: [PARENT], invitation_card_designs: [DESIGN] }),
  )
  assert.equal(result.ok, false)
})

test('resolve rejects an invalid quantity before it looks anything up', async () => {
  let queried = false
  const result = await resolveTopup(
    { userId: 'user-1', eventId: 'event-1', releaseId: 'release-1', guests: 12 },
    fakeClient({ onQuery: () => { queried = true } }),
  )
  assert.equal(result.ok, false)
  assert.equal(queried, false, 'a bad quantity must not cost a database round trip')
})

test('the order line carries guests and no add-ons', () => {
  const item = topupOrderItem(
    {
      releaseId: 'release-1',
      designId: 'design-1',
      parentOrderId: 'order-1',
      parentRef: 'OF-2026-AB12CD',
      cardName: 'The Couple',
      cardTier: 'Signature',
      cardImageUrl: '/cards/couple.jpg',
      cardTreatment: null,
      previewUrl: '/api/my/card/design-1',
      unitPrice: 1500,
      parentGuests: 121,
      releasedAt: null,
    },
    20,
    30_000,
  )
  assert.equal(item.guests, 20, 'the entitlement query sums this field')
  assert.equal(item.total, 30_000)
  assert.equal(item.pricePerGuest, 1500)
  assert.equal(item.kind, 'topup')
  assert.equal(item.addOns, undefined, 'a top-up buys capacity, not another print run')
  assert.equal(
    item.tierId,
    undefined,
    'no tierId: priceOrder would otherwise re-price it at the catalogue rate and 50-guest floor',
  )
})
