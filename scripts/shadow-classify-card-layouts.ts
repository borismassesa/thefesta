/**
 * Derive a layout for every card in the catalogue and classify it. Change nothing.
 *
 *   npx tsx scripts/shadow-classify-card-layouts.ts [--out ./tmp/shadow] [--limit 20]
 *
 * The layout engine's assumptions have been tested against artwork we wrote. This
 * runs them against the ~130 pieces of artwork we did NOT write, before any of it
 * can affect a card somebody has bought.
 *
 * SVG text geometry is far less uniform than it looks. Real exports contain
 * nested transforms, text converted to paths, per-character rotation, textLength,
 * mixed faces inside a run, manual kerning across tspans, CSS specificity,
 * gradients, clips and masks. This is how we find out which of those the
 * catalogue actually has, rather than discovering it from a guest's card.
 *
 * IT ACTIVATES NOTHING. No row is written, no state is changed. The output is
 * evidence: one record per card, one per field, and aggregates grouped by cause,
 * so a failure of thirty cards can be recognised as one problem rather than
 * thirty.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY. Deliberately talks to Supabase directly
 * rather than through the admin server actions: those require an admin session
 * and carry 'server-only' markers, and this has to run in a terminal.
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createClient } from '@supabase/supabase-js'

import {
  assessCardGeometry,
  buildMetricsIndex,
  CARD_GEOMETRY_DERIVATION_VERSION,
  deriveLayout,
  extractArtworkGeometry,
  lookupMetrics,
  matchCardFonts,
  applyOverrides,
  readRequiredFonts,
  resolveCardLayout,
  validateLayoutGeometry,
  type CardFieldBinding,
  type CardFontFace,
  type CardLayout,
  type FitStatus,
  type FontMetrics,
  type GeometryAssessment,
  type LayoutDiagnostic,
} from '../packages/lib'

// ── The stress corpus ──
//
// Named inputs, so a failure can be attributed to a KIND of name rather than to
// one string. Every one of these is a shape a Tanzanian guest list actually
// contains, plus the Unicode cases we need an explicit answer for.
const STRESS_INPUTS: { id: string; value: string }[] = [
  { id: 'short', value: 'John Doe' },
  { id: 'typical', value: 'Bi. Fabiola Thomas' },
  { id: 'honorific_pair', value: 'Bw. na Bi. Mwakipesile' },
  { id: 'long_titles', value: 'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe' },
  { id: 'long_couple', value: 'Mr. & Mrs. Christopher Alexander Mwakipesile' },
  { id: 'accented_pt', value: 'José António da Conceição' },
  { id: 'accented_fr', value: 'Zoë François' },
  { id: 'en_dash_apostrophe', value: 'Amani–Neema M’Mboya' },
  { id: 'german', value: 'Müller & Weiß' },
  { id: 'nbsp', value: 'Saa 12:00 Mchana' },
  { id: 'combining', value: 'Amélie Ndésanjo' },
  { id: 'emoji', value: 'Neema 🎉 Mboya' },
  { id: 'arabic', value: 'أحمد بن سعيد' },
]

type ProductRow = {
  id: string
  name: string | null
  category: string | null
  artwork_svg_url: string | null
  field_bindings: CardFieldBinding[] | null
  card_layout: unknown
}

type FontRow = {
  id: string
  family_name: string
  subfamily_name: string
  postscript_name: string
  weight_class: number
  is_italic: boolean
  match_keys: string[]
  embeddable: boolean
  fs_type_no_embedding: boolean
  metrics: FontMetrics | null
}

type Recommendation = 'auto_activatable' | 'review_required' | 'legacy_only' | 'unsupported'

type StressResult = {
  inputId: string
  status: FitStatus | 'not_run'
  fontSize: number | null
  lines: string[]
  diagnostics: LayoutDiagnostic[]
}

type FieldAssessmentRecord = {
  fieldId: string
  role: string
  sourceLayerIds: string[]
  regenerable: boolean
  regenerationBlocker: string | null
  estimated: boolean
  fontFamilies: string[]
  stressResults: StressResult[]
}

type CardLayoutAssessment = {
  productId: string
  productName: string
  category: string
  artworkSha256: string
  derivation: {
    state: 'derived' | 'failed'
    failure?: string
    confidence: GeometryAssessment['confidence']
    mode: GeometryAssessment['mode']
    recommendation: Recommendation
    derivationVersion: number
    reasons: string[]
  }
  fields: FieldAssessmentRecord[]
  unmeasurableFaces: string[]
  hasGuestNameField: boolean
  blockers: LayoutDiagnostic[]
  warnings: LayoutDiagnostic[]
}

const argOf = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

const OUT_DIR = argOf('--out') ?? join(process.cwd(), 'tmp/shadow-card-layouts')
const LIMIT = Number(argOf('--limit') ?? '0')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

/** Matches loadCardArtwork's limits, so this sees what the app would see. */
const ARTWORK_TIMEOUT_MS = 15_000
const ARTWORK_MAX_BYTES = 12 * 1024 * 1024

async function fetchArtwork(svgUrl: string): Promise<{ ok: true; svg: string } | { ok: false; reason: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARTWORK_TIMEOUT_MS)
  try {
    const response = await fetch(svgUrl, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` }
    const text = await response.text()
    if (text.length > ARTWORK_MAX_BYTES) return { ok: false, reason: 'artwork too large' }
    if (!text.includes('<svg')) return { ok: false, reason: 'not an SVG' }
    return { ok: true, svg: text }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The recommendation, which is deliberately stricter than the raw assessment.
 *
 * `legacy_only` is its own outcome rather than being folded into review: a card
 * whose fields can only be spliced works exactly as well as it does today and
 * exactly as badly for a long name. Calling that "needs review" would imply a
 * human can fix it in the Studio, and they cannot — it needs new artwork.
 */
function recommend(assessment: GeometryAssessment): Recommendation {
  if (assessment.mode === 'unsupported') return 'unsupported'
  if (assessment.mode === 'splice_only' || assessment.mode === 'path_text') return 'legacy_only'
  return assessment.confidence === 'high' ? 'auto_activatable' : 'review_required'
}

async function main() {
  const supabase = createClient(url!, serviceKey!, { auth: { persistSession: false } })

  const { data: fontRows, error: fontError } = await supabase
    .from('card_fonts')
    .select(
      'id, family_name, subfamily_name, postscript_name, weight_class, is_italic, match_keys, embeddable, fs_type_no_embedding, metrics',
    )
    .returns<FontRow[]>()
  if (fontError) {
    console.error(`Could not read the font library: ${fontError.message}`)
    process.exit(1)
  }
  const library = fontRows ?? []
  const faces: CardFontFace[] = library.map((row) => ({
    id: row.id,
    familyName: row.family_name,
    subfamilyName: row.subfamily_name,
    postscriptName: row.postscript_name,
    weightClass: row.weight_class,
    isItalic: row.is_italic,
    matchKeys: row.match_keys,
    embeddable: row.embeddable,
    restricted: row.fs_type_no_embedding,
  }))
  const fontById = new Map(library.map((row) => [row.id, row]))

  let query = supabase
    .from('website_invitations_products')
    .select('id, name, category, artwork_svg_url, field_bindings, card_layout')
    .neq('artwork_svg_url', '')
    .order('id', { ascending: true })
  if (LIMIT > 0) query = query.limit(LIMIT)

  const { data: products, error } = await query.returns<ProductRow[]>()
  if (error) {
    console.error(`Could not list cards: ${error.message}`)
    process.exit(1)
  }
  if (!products || products.length === 0) {
    console.log('No cards with artwork to classify.')
    return
  }

  console.log(`Classifying ${products.length} card(s). Nothing will be activated.\n`)

  const assessments: CardLayoutAssessment[] = []

  for (const product of products) {
    const label = `${product.id} (${product.name ?? 'unnamed'})`
    const artwork = await fetchArtwork(product.artwork_svg_url ?? '')

    if (!artwork.ok) {
      assessments.push(failed(product, '', `artwork unreadable: ${artwork.reason}`))
      console.log(`  ✗ ${label} — ${artwork.reason}`)
      continue
    }

    const artworkSha256 = createHash('sha256').update(artwork.svg, 'utf8').digest('hex')
    const bindings = product.field_bindings ?? []
    if (bindings.length === 0) {
      assessments.push(failed(product, artworkSha256, 'no layer mapping'))
      console.log(`  ✗ ${label} — unmapped`)
      continue
    }

    // The same assembly the release path uses, so a classification here means
    // the same thing it would mean at freeze time.
    const required = readRequiredFonts(artwork.svg)
    const unmeasurableFaces: string[] = []
    const index = buildMetricsIndex(
      matchCardFonts(required, faces).map((match) => {
        const metrics = match.face ? (fontById.get(match.face.id)?.metrics ?? null) : null
        if (!metrics) unmeasurableFaces.push(match.required.primary)
        return {
          primary: match.required.primary,
          weight: match.required.weight,
          italic: match.required.italic,
          metrics,
        }
      }),
    )

    const geometry = extractArtworkGeometry(artwork.svg)
    const derived = deriveLayout(
      geometry,
      bindings,
      (text) => lookupMetrics(index, text.families, text.weight, text.italic),
      { artworkSha256, derivationVersion: CARD_GEOMETRY_DERIVATION_VERSION, derivedAt: '' },
    )
    const layout: CardLayout = applyOverrides(
      derived,
      typeof product.card_layout === 'object' && product.card_layout !== null
        ? (product.card_layout as never)
        : null,
    )

    const assessment = assessCardGeometry(layout, geometry.texts)
    const metricsFor = (field: { font: { families: string[]; weight: number; italic: boolean } }) =>
      lookupMetrics(index, field.font.families, field.font.weight, field.font.italic)

    const structural = validateLayoutGeometry(layout)
    const guestFields = Object.values(layout.fields).filter((field) => field.role === 'guest_name')

    // Every stress input is resolved against every field, because a card can
    // pass on a short name and fail on the long one — which is precisely the
    // cohort this run exists to find.
    const fields: FieldAssessmentRecord[] = Object.values(layout.fields).map((field) => ({
      fieldId: field.id,
      role: field.role,
      sourceLayerIds: field.sourceLayerIds,
      regenerable: field.regenerable,
      regenerationBlocker: field.regenerationBlocker,
      estimated: field.estimated,
      fontFamilies: field.font.families,
      stressResults: STRESS_INPUTS.map((input) => {
        if (!field.regenerable) {
          return { inputId: input.id, status: 'not_run', fontSize: null, lines: [], diagnostics: [] }
        }
        const plan = resolveCardLayout({
          layout: { ...layout, fields: { [field.id]: field } },
          state: 'active',
          values: { [field.role]: input.value },
          metricsFor,
        })
        const resolved = plan.fields[field.id]
        return {
          inputId: input.id,
          status: resolved?.fitStatus ?? 'not_run',
          fontSize: resolved?.font.size ?? null,
          lines: resolved?.lines.map((line) => line.text) ?? [],
          diagnostics: plan.blockers,
        }
      }),
    }))

    assessments.push({
      productId: product.id,
      productName: product.name ?? '',
      category: product.category ?? '',
      artworkSha256,
      derivation: {
        state: 'derived',
        confidence: assessment.confidence,
        mode: assessment.mode,
        recommendation: recommend(assessment),
        derivationVersion: CARD_GEOMETRY_DERIVATION_VERSION,
        reasons: assessment.reasons,
      },
      fields,
      unmeasurableFaces: [...new Set(unmeasurableFaces)],
      hasGuestNameField: guestFields.length > 0,
      blockers: structural.filter((issue) => issue.severity === 'blocker'),
      warnings: structural.filter((issue) => issue.severity === 'warning'),
    })

    console.log(
      `  · ${label} — ${assessment.mode}/${assessment.confidence} → ${recommend(assessment)}`,
    )
  }

  await writeArtefacts(assessments)
  report(assessments)
}

function failed(product: ProductRow, artworkSha256: string, failure: string): CardLayoutAssessment {
  return {
    productId: product.id,
    productName: product.name ?? '',
    category: product.category ?? '',
    artworkSha256,
    derivation: {
      state: 'failed',
      failure,
      confidence: 'low',
      mode: 'unsupported',
      recommendation: 'unsupported',
      derivationVersion: CARD_GEOMETRY_DERIVATION_VERSION,
      reasons: [failure],
    },
    fields: [],
    unmeasurableFaces: [],
    hasGuestNameField: false,
    blockers: [],
    warnings: [],
  }
}

async function writeArtefacts(assessments: CardLayoutAssessment[]) {
  await mkdir(OUT_DIR, { recursive: true })

  await writeFile(join(OUT_DIR, 'assessments.json'), JSON.stringify(assessments, null, 2), 'utf8')

  // One row per card, for grouping by cause in a spreadsheet.
  const cardRows = [
    'product_id,name,category,state,mode,confidence,recommendation,has_guest_name,fields,blockers,warnings,unmeasurable_faces,reason',
    ...assessments.map((entry) =>
      [
        entry.productId,
        csv(entry.productName),
        csv(entry.category),
        entry.derivation.state,
        entry.derivation.mode,
        entry.derivation.confidence,
        entry.derivation.recommendation,
        entry.hasGuestNameField,
        entry.fields.length,
        entry.blockers.length,
        entry.warnings.length,
        csv(entry.unmeasurableFaces.join(' ')),
        csv(entry.derivation.reasons[0] ?? ''),
      ].join(','),
    ),
  ].join('\n')
  await writeFile(join(OUT_DIR, 'cards.csv'), cardRows, 'utf8')

  // One row per field per stress input: the finest grain, and where a pattern
  // like "every Great Vibes field fails on accented names" becomes visible.
  const fieldRows = [
    'product_id,field_id,role,regenerable,blocker,estimated,font,input_id,status,font_size',
    ...assessments.flatMap((entry) =>
      entry.fields.flatMap((field) =>
        field.stressResults.map((result) =>
          [
            entry.productId,
            field.fieldId,
            field.role,
            field.regenerable,
            field.regenerationBlocker ?? '',
            field.estimated,
            csv(field.fontFamilies[0] ?? ''),
            result.inputId,
            result.status,
            result.fontSize ?? '',
          ].join(','),
        ),
      ),
    ),
  ].join('\n')
  await writeFile(join(OUT_DIR, 'fields.csv'), fieldRows, 'utf8')

  console.log(`\nArtefacts written to ${OUT_DIR}`)
}

function csv(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * The aggregate questions, answered.
 *
 * Grouped by CAUSE rather than listed per card, because thirty cards failing for
 * one reason is one problem, and a per-card list hides that.
 */
function report(assessments: CardLayoutAssessment[]) {
  const total = assessments.length
  const count = (predicate: (entry: CardLayoutAssessment) => boolean) =>
    assessments.filter(predicate).length

  const line = (label: string, n: number) =>
    console.log(`  ${String(n).padStart(4)}  ${((n / total) * 100).toFixed(0).padStart(3)}%  ${label}`)

  console.log(`\n── ${total} cards ──\n`)
  for (const recommendation of ['auto_activatable', 'review_required', 'legacy_only', 'unsupported'] as const) {
    line(recommendation, count((entry) => entry.derivation.recommendation === recommendation))
  }

  console.log('\n── Why not activatable ──\n')
  line('no identifiable guest-name field', count((entry) => !entry.hasGuestNameField))
  line('some face has no metrics', count((entry) => entry.unmeasurableFaces.length > 0))
  line(
    'unsupported SVG typography',
    count((entry) =>
      entry.fields.some((field) =>
        ['per_char_rotate', 'writing_mode', 'text_path'].includes(field.regenerationBlocker ?? ''),
      ),
    ),
  )
  line(
    'splice-only fields (artwork must change)',
    count((entry) => entry.fields.some((field) => !field.regenerable)),
  )
  line('structural blockers', count((entry) => entry.blockers.length > 0))

  // The cohort the whole engine exists for: fine on a short name, broken on a
  // real one.
  const passShortFailLong = count((entry) =>
    entry.fields.some((field) => {
      const short = field.stressResults.find((r) => r.inputId === 'short')
      const long = field.stressResults.find((r) => r.inputId === 'long_titles')
      return (
        short?.status === 'fits' && (long?.status === 'overflow' || long?.status === 'clipped')
      )
    }),
  )
  console.log('')
  line('passes a short name, fails a long one', passShortFailLong)

  const boundedTooShort = count((entry) =>
    entry.fields.some((field) =>
      field.stressResults.some((result) =>
        result.diagnostics.some((issue) => issue.code === 'GROUP_OVERFLOW'),
      ),
    ),
  )
  line('bounded height insufficient', boundedTooShort)

  // Which faces cause the most trouble, so one font fix can clear many cards.
  const faceFailures = new Map<string, number>()
  for (const entry of assessments) {
    for (const face of entry.unmeasurableFaces) {
      faceFailures.set(face, (faceFailures.get(face) ?? 0) + 1)
    }
  }
  const worstFaces = [...faceFailures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (worstFaces.length > 0) {
    console.log('\n── Faces with no metrics, worst first ──\n')
    for (const [face, n] of worstFaces) console.log(`  ${String(n).padStart(4)}  ${face}`)
    console.log('\n  Run: npx tsx scripts/backfill-card-font-metrics.ts')
  }

  const unicodeTrouble = new Map<string, number>()
  for (const entry of assessments) {
    for (const field of entry.fields) {
      for (const result of field.stressResults) {
        if (result.status === 'unmeasurable') {
          unicodeTrouble.set(result.inputId, (unicodeTrouble.get(result.inputId) ?? 0) + 1)
        }
      }
    }
  }
  if (unicodeTrouble.size > 0) {
    console.log('\n── Inputs that cannot be measured (missing glyphs) ──\n')
    for (const [input, n] of [...unicodeTrouble.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${input}`)
    }
  }

  console.log('\nNothing was activated. Review the artefacts before changing any card state.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
