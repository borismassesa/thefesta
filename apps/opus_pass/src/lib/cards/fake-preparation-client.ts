// A test double for the slice of Supabase the preparation service touches.
//
// Only exists because the behaviour worth testing in that service is ORDERING
// and the claim race: that no PNG is written before a claim is won, that a
// failure leaves a row a retry can act on, that two workers produce one render.
// None of that is reachable through a pure function, and none of it should
// require a live database to verify.
//
// Deliberately small and deliberately strict. It enforces the unique constraint
// that the claim protocol depends on, and it counts uploads, because "wrote one
// PNG" is the assertion that matters. It is not a Supabase emulator and should
// not grow into one: if this file starts needing joins or RPC, that is a signal
// the service is reaching too far.

type Row = Record<string, unknown>

export type FakeUnique = { table: string; columns: string[] }

/** The unique keys the service relies on. Violating one must behave like Postgres. */
const UNIQUES: FakeUnique[] = [
  { table: 'invitation_card_delivery_assets', columns: ['design_release_id', 'guest_id', 'render_variant'] },
  { table: 'invitation_card_delivery_assets', columns: ['token_hash'] },
]

type Filter = { op: 'eq' | 'lt'; column: string; value: unknown }

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column]
    if (filter.op === 'eq') return actual === filter.value
    return typeof actual === 'string' && typeof filter.value === 'string' && actual < filter.value
  })
}

export class FakePreparationClient {
  tables: Record<string, Row[]> = {}
  buckets: Record<string, Record<string, Uint8Array>> = {}

  /** Counters the tests assert on. */
  uploadCount = 0
  renderedFor: string[] = []

  /** Failure injection. */
  failUploadOnce = false
  failReadyUpdate = false

  private nextId = 1

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.tables[table] = rows.map((r) => ({ ...r }))
  }

  private rows(table: string): Row[] {
    this.tables[table] ??= []
    return this.tables[table]
  }

  private violates(table: string, row: Row): boolean {
    return UNIQUES.filter((u) => u.table === table).some((unique) =>
      this.rows(table).some((existing) =>
        unique.columns.every((column) => existing[column] === row[column]),
      ),
    )
  }

  from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the builder closes over the store
    const db = this
    const filters: Filter[] = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}

    const resolve = (): { data: unknown; error: { code?: string } | null } => {
      if (mode === 'insert') {
        if (db.violates(table, payload)) return { data: null, error: { code: '23505' } }
        const row = { id: `id-${db.nextId++}`, ...payload }
        db.rows(table).push(row)
        return { data: row, error: null }
      }
      if (mode === 'update') {
        const hits = db.rows(table).filter((row) => matches(row, filters))
        for (const row of hits) Object.assign(row, payload)
        return { data: hits[0] ?? null, error: null }
      }
      const found = db.rows(table).filter((row) => matches(row, filters))
      return { data: found, error: null }
    }

    const builder = {
      select() { return builder },
      insert(values: Row) { mode = 'insert'; payload = values; return builder },
      update(values: Row) { mode = 'update'; payload = values; return builder },
      eq(column: string, value: unknown) { filters.push({ op: 'eq', column, value }); return builder },
      lt(column: string, value: unknown) { filters.push({ op: 'lt', column, value }); return builder },
      maybeSingle() {
        const { data, error } = resolve()
        const single = Array.isArray(data) ? (data[0] ?? null) : data
        return Promise.resolve({ data: single, error })
      },
      // Supabase builders are thenable, so an un-terminated chain still runs.
      then(onFulfilled: (value: { data: unknown; error: unknown }) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled)
      },
    }
    return builder as never
  }

  storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        const bytes = this.buckets[bucket]?.[path]
        if (!bytes) return { data: null, error: { message: 'not found' } }
        return {
          data: {
            text: async () => Buffer.from(bytes).toString('utf8'),
            arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          },
          error: null,
        }
      },
      upload: async (path: string, body: Buffer) => {
        if (this.failUploadOnce) {
          this.failUploadOnce = false
          return { data: null, error: { message: 'upload failed' } }
        }
        this.uploadCount += 1
        this.buckets[bucket] ??= {}
        this.buckets[bucket][path] = new Uint8Array(body)
        return { data: { path }, error: null }
      },
    }),
  }

  /** Seed an object into a bucket. */
  put(bucket: string, path: string, bytes: Uint8Array | string): void {
    this.buckets[bucket] ??= {}
    this.buckets[bucket][path] =
      typeof bytes === 'string' ? new Uint8Array(Buffer.from(bytes, 'utf8')) : bytes
  }

  asset(): Row | undefined {
    return this.tables['invitation_card_delivery_assets']?.[0]
  }

  assets(): Row[] {
    return this.tables['invitation_card_delivery_assets'] ?? []
  }
}
