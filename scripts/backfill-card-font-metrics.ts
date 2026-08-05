/**
 * Read advance widths out of every font already in the card library.
 *
 *   npx tsx scripts/backfill-card-font-metrics.ts [--dry-run] [--force]
 *
 * card_fonts.metrics is what lets the Card Design Studio and the render server
 * agree on whether a guest's name fits its box (see the column comment in
 * 20260804170000_card_font_metrics.sql). Faces registered before that column
 * existed have none, and a field set in one of them reports 'unmeasurable',
 * which BLOCKS a release rather than guessing. So this is not an optimisation:
 * until it has run, every card using a pre-existing face is unfittable.
 *
 * Safe to re-run. Only faces with no metrics are touched unless --force is
 * given, and a face that will not yield metrics is reported and skipped rather
 * than failing the run — an unreadable binary was already unreadable, and the
 * blocking behaviour downstream is the correct outcome for it.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: card-fonts is a private bucket holding
 * licensed commercial binaries.
 */

import { createClient } from '@supabase/supabase-js'

import { extractFontMetrics } from '../apps/opus_admin/src/lib/cms/font-metadata'

const BUCKET = 'card-fonts'

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

type FontRow = {
  id: string
  storage_path: string
  family_name: string
  subfamily_name: string
  format: string
}

async function main() {
  const supabase = createClient(url!, serviceKey!, { auth: { persistSession: false } })

  let query = supabase
    .from('card_fonts')
    .select('id, storage_path, family_name, subfamily_name, format')
    .order('created_at', { ascending: true })
  if (!force) query = query.is('metrics', null)

  const { data: fonts, error } = await query.returns<FontRow[]>()
  if (error) {
    console.error(`Could not list fonts: ${error.message}`)
    process.exit(1)
  }
  if (!fonts || fonts.length === 0) {
    console.log('Nothing to do: every registered face already has metrics.')
    return
  }

  console.log(`${fonts.length} face(s) to process${dryRun ? ' (dry run)' : ''}.\n`)

  let done = 0
  const skipped: string[] = []

  for (const font of fonts) {
    const label = `${font.family_name} ${font.subfamily_name} (${font.format})`

    const { data: blob, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(font.storage_path)
    if (downloadError || !blob) {
      skipped.push(`${label} — could not download: ${downloadError?.message ?? 'no data'}`)
      continue
    }

    const metrics = extractFontMetrics(Buffer.from(await blob.arrayBuffer()))
    if (!metrics) {
      // woff/woff2 are the expected members of this list: fontkit reads them,
      // but they are already excluded from rastering for a separate measured
      // reason (they render blank in resvg), so a gap here changes nothing.
      skipped.push(`${label} — no readable metrics`)
      continue
    }

    const glyphs = Object.keys(metrics.advances).length
    if (dryRun) {
      console.log(`  would write ${glyphs} advances for ${label}`)
      done += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('card_fonts')
      .update({ metrics, metrics_extracted_at: new Date().toISOString() })
      .eq('id', font.id)

    if (updateError) {
      skipped.push(`${label} — could not save: ${updateError.message}`)
      continue
    }
    console.log(`  ${glyphs} advances -> ${label}`)
    done += 1
  }

  console.log(`\n${done} face(s) ${dryRun ? 'ready' : 'updated'}.`)
  if (skipped.length > 0) {
    console.log(`\n${skipped.length} skipped:`)
    for (const line of skipped) console.log(`  - ${line}`)
    console.log(
      '\nA skipped face is not a failed run. Fields set in it report ' +
        "'unmeasurable', which blocks a release rather than shipping a guess.",
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
