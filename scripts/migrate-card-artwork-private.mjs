#!/usr/bin/env node
// Moves card artwork out of the PUBLIC website-media bucket into a private one.
//
// This is the step that actually closes the hole. Everything in
// docs/CARD_COPY_PROTECTION.md stops NEW artwork URLs reaching a browser, but
// the old ones still resolve: `website-media` is public, so anyone who ever
// collected a URL — or who guesses a path — can still fetch the original at
// full resolution. Until this runs, treat the catalogue as still exposed.
//
// WHY A SCRIPT AND NOT A MIGRATION. Two of the three steps are storage-API
// operations (copy object, delete object), which SQL cannot express, and the
// third has to rewrite `image_url` to match wherever the object actually landed.
// Doing that in three places that can disagree is how you get a catalogue of
// broken images, so it is one transaction-shaped script instead.
//
// SAFE TO RE-RUN. Every step is skipped when it has already happened, and
// nothing is deleted until the copy is confirmed present in the new bucket.
//
// Usage:
//   node scripts/migrate-card-artwork-private.mjs --dry-run   # report only
//   node scripts/migrate-card-artwork-private.mjs             # do it
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment. Run it against staging first.

import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.argv.includes('--dry-run')
const SOURCE_BUCKET = 'website-media'
const TARGET_BUCKET = 'card-artwork'

/**
 * Only these prefixes move.
 *
 * `website-media` also holds category marketing photography and other site
 * media that is SUPPOSED to be public, so moving the whole bucket would break
 * the storefront and protect nothing extra. These two prefixes are where the
 * product artwork lives (opus_admin's IMAGE_PREFIX, and the older SVG uploads).
 */
const PREFIXES = ['opus-pass/invitations/products', 'invitation-svgs']

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const log = (...args) => console.log(DRY_RUN ? '[dry-run]' : '[migrate]', ...args)

/** Recursively lists every object under a prefix. */
async function listAll(bucket, prefix) {
  const found = []
  const walk = async (dir) => {
    let offset = 0
    for (;;) {
      const { data, error } = await db.storage
        .from(bucket)
        .list(dir, { limit: 100, offset })
      if (error) throw new Error(`list ${dir}: ${error.message}`)
      if (!data?.length) return
      for (const entry of data) {
        const path = dir ? `${dir}/${entry.name}` : entry.name
        // A folder comes back with no id; only real objects have one.
        if (entry.id) found.push(path)
        else await walk(path)
      }
      if (data.length < 100) return
      offset += data.length
    }
  }
  await walk(prefix)
  return found
}

async function ensureBucket() {
  const { data } = await db.storage.getBucket(TARGET_BUCKET)
  if (data) {
    if (data.public) {
      throw new Error(
        `${TARGET_BUCKET} exists but is PUBLIC. Refusing to continue — that ` +
          'would move the artwork from one open bucket to another.',
      )
    }
    log(`bucket ${TARGET_BUCKET} already exists and is private`)
    return
  }
  if (DRY_RUN) return log(`would create private bucket ${TARGET_BUCKET}`)

  const { error } = await db.storage.createBucket(TARGET_BUCKET, {
    public: false,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg', 'image/avif', 'image/svg+xml'],
  })
  if (error) throw new Error(`createBucket: ${error.message}`)
  log(`created private bucket ${TARGET_BUCKET}`)
}

/** Copies one object, verifying the destination before reporting success. */
async function moveObject(path) {
  const { data: already } = await db.storage.from(TARGET_BUCKET).download(path)
  if (already) return 'already-there'
  if (DRY_RUN) return 'would-copy'

  const { data: blob, error: dlError } = await db.storage.from(SOURCE_BUCKET).download(path)
  if (dlError || !blob) throw new Error(`download ${path}: ${dlError?.message}`)

  const { error: upError } = await db.storage
    .from(TARGET_BUCKET)
    .upload(path, new Uint8Array(await blob.arrayBuffer()), {
      contentType: blob.type || 'application/octet-stream',
      upsert: true,
    })
  if (upError) throw new Error(`upload ${path}: ${upError.message}`)
  return 'copied'
}

/** Repoints every column that can hold one of these URLs. */
async function repointRows() {
  const { data, error } = await db
    .from('website_invitations_products')
    .select('id, image_url, back_image_url, designs, gallery')
  if (error) throw new Error(`select products: ${error.message}`)

  const swap = (value) =>
    typeof value === 'string' && value.includes(`/public/${SOURCE_BUCKET}/`)
      ? value.replace(`/public/${SOURCE_BUCKET}/`, `/public/${TARGET_BUCKET}/`)
      : value

  let changed = 0
  for (const row of data ?? []) {
    const patch = {
      image_url: swap(row.image_url),
      back_image_url: swap(row.back_image_url),
      designs: Array.isArray(row.designs) ? row.designs.map(swap) : row.designs,
      gallery: Array.isArray(row.gallery) ? row.gallery.map(swap) : row.gallery,
    }
    if (JSON.stringify(patch) === JSON.stringify({
      image_url: row.image_url,
      back_image_url: row.back_image_url,
      designs: row.designs,
      gallery: row.gallery,
    })) continue

    changed += 1
    if (DRY_RUN) continue
    const { error: upError } = await db
      .from('website_invitations_products')
      .update(patch)
      .eq('id', row.id)
    if (upError) throw new Error(`update ${row.id}: ${upError.message}`)
  }
  log(`${changed} product row(s) repointed`)
}

async function main() {
  await ensureBucket()

  const counts = { copied: 0, 'already-there': 0, 'would-copy': 0 }
  const moved = []
  for (const prefix of PREFIXES) {
    const objects = await listAll(SOURCE_BUCKET, prefix)
    log(`${objects.length} object(s) under ${prefix}`)
    for (const path of objects) {
      counts[await moveObject(path)] += 1
      moved.push(path)
    }
  }
  log('objects:', JSON.stringify(counts))

  await repointRows()

  // Deliberately NOT deleting from website-media in this pass. The originals
  // stay until someone has confirmed the storefront renders from the new
  // bucket; deleting first turns a mistake into an outage with no undo. Delete
  // them in a follow-up once /digital-cards looks right:
  //
  //   node -e "..." or the Supabase dashboard, removing exactly these paths.
  log('')
  log('Originals were NOT deleted. Verify /digital-cards renders, then remove')
  log(`the ${moved.length} listed path(s) from ${SOURCE_BUCKET} to close the hole.`)
  log('Until they are deleted, old URLs still resolve.')
}

main().catch((err) => {
  console.error('[migrate] FAILED:', err.message)
  process.exit(1)
})
