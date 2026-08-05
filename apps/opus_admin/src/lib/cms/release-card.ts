import 'server-only'
import { createHash } from 'node:crypto'

import {
  injectFontCss,
  planIsReleasable,
  renderPlanToSvg,
  resolveCardLayout,
  validateLayoutGeometry,
  type CardFieldBinding,
  type CardLayout,
  type CardLayoutState,
  type CardRenderManifest,
  type LayoutDiagnostic,
  type RenderSkip,
} from '@opusfesta/lib'
import type { createSupabaseAdminClient } from '@/lib/supabase'
import { loadCardArtwork } from '@/lib/cms/card-artwork'
import { buildCardLayoutContext } from '@/lib/cms/card-layout-context'
import { cardFontFaceCssFor } from '@/lib/cms/card-font-css'
import { releaseCardFieldValues } from '@/lib/cms/release-card-values'
import { logReleaseFailure } from '@/lib/cms/release-log'

// Freezing an approved card into a file.
//
// The personalised card has only ever existed as a Blob in whichever designer's
// browser last had the job open. Nothing persisted it, so "the card" was not a
// thing that could be shown to a couple, printed, or sent to a guest.
//
// Release writes it down. Everything downstream reads THAT FILE, never a fresh
// render, and the reason is not performance:
//
//   A card is approved by a human. If the couple's dashboard re-rendered on
//   demand, then a later artwork re-export, a re-mapped layer, or a font whose
//   licence was withdrawn would silently change a card the couple may already
//   have sent to two hundred guests. The artefact has to be the one the
//   reviewer actually looked at.
//
// This is the first place in the repo that generates a file server-side and
// stores it, so it carries the rollback discipline of the font registration
// flow rather than assuming a happy path.

const BUCKET = 'card-releases'

export type ReleaseResult =
  | {
      ok: true
      path: string
      bytes: number
      sha256: string
      artworkSvgUrl: string
      /**
       * The layout this file was frozen against.
       *
       * Stored on the release row, because guest_name is substituted per guest
       * AFTER the freeze and needs the same box, size and fit policy the
       * reviewer approved. Reading the product row at that point would let an
       * admin widening a box today silently re-lay-out cards that went to two
       * hundred guests last week.
       */
      layout: CardLayout
      /** The full dependency set this file was produced from. */
      manifest: CardRenderManifest
    }
  | { ok: false; error: string; skipped?: RenderSkip[]; diagnostics?: LayoutDiagnostic[] }

type ProductRow = {
  artwork_svg_url: string | null
  field_bindings: CardFieldBinding[] | null
  card_layout: unknown
  card_layout_state: CardLayoutState | null
}

/**
 * A skip that means the card is not what the designer approved.
 *
 * `no_value` is fine and expected: a couple who left the second contact blank
 * simply has no second contact, and the artwork keeps its design copy. Every
 * other reason means a field the card DOES have could not be written, which
 * would ship an invitation with someone's name missing.
 */
function isFatalSkip(skip: RenderSkip): boolean {
  return skip.reason !== 'no_value'
}

/**
 * Guest names to test a card's guest-name box against before freezing it.
 *
 * Not invented: these are the shapes a Tanzanian guest list actually contains.
 * A card is released once and then serves every guest on that list, so the box
 * has to survive the longest of them, not the couple's own short example.
 */
const GUEST_NAME_STRESS = [
  'Prof. Dr. Eng. Arch. Benjamin Emmanuel Mwakatobe',
  'Bw & Bi Christopher Alexander Mwakipesile',
]

/** The stress value most likely to fail, so one resolve covers the set. */
function longest(values: readonly string[]): string {
  return [...values].sort((a, b) => b.length - a.length)[0] ?? ''
}

/**
 * Turn layout blockers into something a reviewer can act on.
 *
 * The diagnostics already carry a written message: they are authored for a
 * human standing at the screen, not for a log, precisely so this function does
 * not have to reconstruct the reason from a code.
 */
function describeDiagnostics(issues: LayoutDiagnostic[]): string {
  return issues.map((issue) => issue.message).join(' ')
}

/** Turn skip reasons into something a reviewer can act on. */
function describeSkips(skips: RenderSkip[]): string {
  return skips
    .map((skip) => {
      const layers = skip.layerIds.join(', ') || 'no layer'
      switch (skip.reason) {
        case 'layer_missing':
          return `${skip.role} points at a layer the artwork no longer has (${layers})`
        case 'rasterised':
          return `${skip.role} is baked into the artwork as an image`
        case 'multi_layer':
          return `${skip.role} spans several layers (${layers})`
        case 'complex_text':
          return `${skip.role} sits in a layer holding more than one text object`
        case 'bad_colour':
          return `${skip.role} is not a valid hex colour`
        case 'no_fillable_shape':
          return `${skip.role} has no shape to colour`
        default:
          return `${skip.role} could not be written (${skip.reason})`
      }
    })
    .join('; ')
}

/**
 * Render an approved card and store it.
 *
 * Returns a failure rather than throwing, because the caller is a server action
 * whose job is to report back to a reviewer standing at the screen.
 */
export async function freezeCardRelease(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  design: { id: string; product_id?: string },
): Promise<ReleaseResult> {
  // Every read below separates "the query failed" from "there is no such row",
  // because the two need opposite responses and they used to be collapsed into
  // one. A failed read of wedding_events produced "Add Partner 1 to the assigned
  // event", sending an operator to go and add a partner to an event that already
  // had one. Instructions that confident have to be earned by an answer, not by
  // the absence of one.
  const { data: row, error: rowError } = await supabase
    .from('invitation_card_designs')
    .select('product_id, order_id, field_values')
    .eq('id', design.id)
    .maybeSingle<{ product_id: string; order_id: string; field_values: Record<string, string> | null }>()
  if (rowError) {
    logReleaseFailure('design_read', { designId: design.id }, rowError)
    return { ok: false, error: 'Could not read the design job. Try again in a moment.' }
  }
  if (!row) return { ok: false, error: 'Design job not found.' }

  const { data: product, error: productError } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url, field_bindings, card_layout, card_layout_state')
    .eq('id', row.product_id)
    .maybeSingle<ProductRow>()
  if (productError) {
    logReleaseFailure('product_read', { designId: design.id }, productError)
    return { ok: false, error: 'Could not read the card product. Try again in a moment.' }
  }
  if (!product) {
    return { ok: false, error: 'The card product behind this job no longer exists, so it cannot be released.' }
  }

  const artwork = await loadCardArtwork(product.artwork_svg_url ?? '')
  if (!artwork.ok) return { ok: false, error: `Could not read the artwork: ${artwork.reason}` }

  const bindings = product.field_bindings ?? []
  if (bindings.length === 0) {
    return { ok: false, error: 'This card has no layer mapping, so nothing can be written into it.' }
  }

  const { data: order, error: orderError } = await supabase
    .from('invitation_orders')
    .select('event_id')
    .eq('id', row.order_id)
    .maybeSingle<{ event_id: string | null }>()
  if (orderError) {
    logReleaseFailure('order_read', { designId: design.id, orderId: row.order_id }, orderError)
    return { ok: false, error: 'Could not read the card order. Try again in a moment.' }
  }
  if (!order) {
    return { ok: false, error: 'The order behind this card no longer exists, so it cannot be released.' }
  }
  if (!order.event_id) {
    return { ok: false, error: 'Assign this card order to an event before releasing it.' }
  }

  const { data: event, error: eventError } = await supabase
    .from('wedding_events')
    .select('partner1_name, partner2_name')
    .eq('id', order.event_id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null }>()
  if (eventError) {
    logReleaseFailure('event_read', { designId: design.id, orderId: row.order_id }, eventError)
    return { ok: false, error: 'Could not read the assigned event. Try again in a moment.' }
  }
  if (!event) {
    return {
      ok: false,
      error: 'The event assigned to this card order no longer exists. Reassign the order before releasing it.',
    }
  }
  const partner1Name = event.partner1_name?.trim() || ''
  const partner2Name = event.partner2_name?.trim() || null
  if (!partner1Name) {
    return { ok: false, error: 'Add Partner 1 to the assigned event before releasing this card.' }
  }
  if (bindings.some((binding) => binding.role === 'couple_name_2') && !partner2Name) {
    return { ok: false, error: 'This design needs Partner 2 on the assigned event before it can be released.' }
  }

  // The released artefact is the couple's master card, not a card for one
  // particular guest. Never preserve the artwork's sample invitee (or a stale
  // designer value) in the copy the couple sees. Per-guest rendering replaces
  // this neutral Swahili placeholder later in the delivery pipeline.
  const values = releaseCardFieldValues(row.field_values, { partner1Name, partner2Name })

  const { layout, state, metricsFor, manifest } = await buildCardLayoutContext({
    svg: artwork.svg,
    requiredFonts: artwork.requiredFonts,
    bindings,
    storedOverrides: product.card_layout,
    state: product.card_layout_state ?? 'none',
  })

  // Every decision about what will be drawn is made here, once. The serialiser
  // below only writes it down, and the same plan is what a Studio preview shows
  // — so a card a reviewer approved cannot render differently from what they saw.
  const plan = resolveCardLayout({ layout, state, values, metricsFor })

  // A value that could not be made to fit is exactly as fatal as a field that
  // could not be written. Both ship an invitation that is not the one the
  // reviewer approved, and an invitation cannot be recalled.
  if (!planIsReleasable(plan)) {
    return {
      ok: false,
      error: `The card cannot be released as-is: ${describeDiagnostics(plan.blockers)}`,
      diagnostics: plan.blockers,
    }
  }

  // Geometry is checked separately from fit because it does not depend on the
  // couple's answers: a box outside the artwork, or text sitting on the QR
  // code's quiet zone, is wrong for every order this card will ever take.
  const structural = validateLayoutGeometry(layout).filter((issue) => issue.severity === 'blocker')
  if (structural.length > 0) {
    return {
      ok: false,
      error: `The card's layout cannot be released as-is: ${describeDiagnostics(structural)}`,
      diagnostics: structural,
    }
  }

  const rendered = renderPlanToSvg(artwork.svg, plan, bindings, values)
  const fatal = rendered.skipped.filter(isFatalSkip)
  if (fatal.length > 0) {
    return {
      ok: false,
      error: `The card cannot be released as-is: ${describeSkips(fatal)}.`,
      skipped: fatal,
    }
  }

  // The guest name is written per guest, AFTER this file is frozen, so it is
  // the one value the render above does not cover. Stress it here so a box that
  // will fail on a real guest list fails now, in front of a reviewer.
  //
  // This is a design-level gate, and it cannot prove that every future guest
  // name fits — no freeze-time check can. prepare-guest-asset.ts resolves each
  // ACTUAL name before delivering it, and that is what makes the guarantee.
  const guestCheck = resolveCardLayout({
    layout,
    state,
    values: { ...values, guest_name: longest(GUEST_NAME_STRESS) },
    metricsFor,
  })
  const guestBlockers = guestCheck.blockers.filter((issue) => issue.role === 'guest_name')
  if (guestBlockers.length > 0) {
    return {
      ok: false,
      error: `A long guest name will not fit this card: ${describeDiagnostics(guestBlockers)}`,
      diagnostics: guestBlockers,
    }
  }

  // Bake the typefaces in. The admin preview injects them separately at
  // Blob-build time, so a frozen file without them renders in a generic serif
  // anywhere else, with no error raised. That is the exact failure this whole
  // pipeline has been chasing.
  //
  // Same helper the two font routes serve, so a licence rule or a match fix
  // cannot land in the preview a designer approves against and miss the file
  // that is actually kept. The artwork is already in hand, so the fonts are
  // resolved from what it asked for rather than by re-fetching it.
  const svg = injectFontCss(rendered.svg, await cardFontFaceCssFor(artwork.requiredFonts))
  const bytes = Buffer.from(svg, 'utf8')

  // Timestamped rather than overwritten: a card released twice keeps both, so a
  // couple's earlier copy is never rewritten under them.
  const path = `${design.id}/${Date.now()}.svg`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/svg+xml', upsert: false })
  if (uploadError) {
    return { ok: false, error: `Could not store the released card: ${uploadError.message}` }
  }

  return {
    ok: true,
    path,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    artworkSvgUrl: product.artwork_svg_url ?? '',
    layout,
    manifest,
  }
}

/**
 * Undo a release that could not be completed.
 *
 * Row FIRST, then the object, and the order is the whole point. The row is what
 * downstream resolves through, so removing the object first and then failing to
 * remove the row leaves a release that still looks live and points at nothing:
 * a guest send would resolve it and 404 on the artefact. The reverse leaves an
 * unreferenced object in a bucket, which is inert and costs storage.
 *
 * For the same reason a failed row delete stops the rollback rather than
 * continuing to the object. A surviving row with its file intact is a release
 * that merely nobody points at. A surviving row without its file is a trap.
 *
 * Never throws and never changes the caller's outcome. The caller is already
 * reporting a failure to a reviewer standing at the screen; a rollback that
 * itself failed is an operator problem, which is what the log line is for.
 */
async function rollbackRelease(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  releaseId: string | null,
  path: string,
): Promise<void> {
  if (releaseId) {
    const { error } = await supabase
      .from('invitation_card_design_releases')
      .delete()
      .eq('id', releaseId)
    if (error) {
      logReleaseFailure('rollback_release_row', { releaseId }, error)
      return
    }
  }
  // storage-js reports API failures as `{ error }` rather than by rejecting, so
  // the `.catch()` that used to sit here could only ever have caught a network
  // throw. Every permission or missing-object failure went by unread.
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) logReleaseFailure('rollback_release_object', { releaseId: releaseId ?? undefined }, error)
}

/**
 * Freeze the card, then move the job to released.
 *
 * Order matters: the file is written FIRST. A job marked ready with no artefact
 * would show the couple a card that does not exist, whereas a stored file with
 * no status change is invisible and harmless, and rollbackRelease takes the
 * release row and the object back if a later step fails.
 */
export async function releaseApprovedDesign(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  design: { id: string; order_id: string; status: string },
  author: string,
  now: string,
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const frozen = await freezeCardRelease(supabase, design)
  if (!frozen.ok) return { ok: false, error: frozen.error }

  const { data: current, error: currentError } = await supabase
    .from('invitation_card_designs')
    .select('current_release_id')
    .eq('id', design.id)
    .maybeSingle<{ current_release_id: string | null }>()
  // The pointer this release is about to replace is also what serialises two
  // concurrent publishes below, so a read that failed cannot be treated as
  // "there was no previous release". Fail closed and take the object back.
  if (currentError || !current) {
    logReleaseFailure('release_pointer_read', { designId: design.id }, currentError)
    await rollbackRelease(supabase, null, frozen.path)
    return { ok: false, error: 'Could not read the card release history. Try again in a moment.' }
  }
  const previousReleaseId = current.current_release_id

  const { data: release, error: releaseError } = await supabase
    .from('invitation_card_design_releases')
    .insert({
      design_id: design.id,
      svg_storage_path: frozen.path,
      svg_sha256: frozen.sha256,
      artwork_svg_url: frozen.artworkSvgUrl,
      // Frozen alongside the file. The per-guest render reads THIS, never the
      // product row, so a later layout edit cannot change a card already sent.
      layout_snapshot: frozen.layout,
      // Which renderer, which fitter, which artwork, which font measurements.
      // Without it, regenerating a guest asset years from now could break a
      // line differently and nothing would say why.
      render_manifest: frozen.manifest,
      released_at: now,
      released_by: author,
    })
    .select('id')
    .single<{ id: string }>()
  if (releaseError || !release) {
    logReleaseFailure('release_insert', { designId: design.id }, releaseError)
    await rollbackRelease(supabase, null, frozen.path)
    return { ok: false, error: releaseError?.message ?? 'Could not record the card release.' }
  }

  const statusWrite = supabase
    .from('invitation_card_designs')
    .update({
      status: 'ready',
      ready_at: now,
      released_at: now,
      release_svg_path: frozen.path,
      current_release_id: release.id,
      released_render_skipped: [],
      reviewed_by: author,
      reviewed_at: now,
      review_note: '',
      // Publishing a new release IS the answer to a couple's change request:
      // what they are served becomes the corrected card. Cleared here rather
      // than in the action so it cannot be answered without a release actually
      // being cut — marking it handled while the couple still holds the old
      // card is exactly the quiet lie this pipeline is built to avoid.
      //
      // A request that arrives DURING a publish is lost to this write. That is
      // the safe direction: the note survives in the history either way, and
      // re-raising a flag over a card that was just corrected would send a
      // designer to re-read a request the new release may already have answered.
      change_requested_at: null,
    })
    .eq('id', design.id)

  // Compare-and-set on the pointer, because two publishes of the same card can
  // be in flight at once and the callers' own guards do not stop it: the status
  // guard in saveAndPublishReleasedDesign compares 'ready' to 'ready', which is
  // still true after the first publish lands. Both would insert a release, each
  // would write its id over the other's, and the loser's release would be left
  // live with nothing pointing at it.
  //
  // Keyed on current_release_id rather than enforced by a unique index on
  // `(design_id) WHERE superseded_at IS NULL`, because the insert above
  // deliberately runs before the previous release is superseded. Such an index
  // would reject every ordinary second release, not just the racing one.
  const { data: written, error } = await (previousReleaseId
    ? statusWrite.eq('current_release_id', previousReleaseId)
    : statusWrite.is('current_release_id', null)
  )
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error || !written) {
    await rollbackRelease(supabase, release.id, frozen.path)
    if (error) {
      logReleaseFailure('release_status_write', { designId: design.id, releaseId: release.id }, error)
      return { ok: false, error: error.message }
    }
    // No error and no row: the pointer moved under us, so another publish of
    // this same card won. Ours is rolled back rather than layered on top.
    logReleaseFailure('release_raced', { designId: design.id, releaseId: release.id })
    return {
      ok: false,
      error:
        'Another publish of this card finished while this one was running, so this update was not applied. Refresh to see the current card, then publish again if it still needs the change.',
    }
  }

  if (previousReleaseId && previousReleaseId !== release.id) {
    const { error: supersedeError } = await supabase
      .from('invitation_card_design_releases')
      .update({ superseded_at: now })
      .eq('id', previousReleaseId)
      .is('superseded_at', null)
    if (supersedeError) {
      logReleaseFailure(
        'release_supersede',
        { designId: design.id, releaseId: previousReleaseId },
        supersedeError,
      )
      return { ok: true, warning: `Released, but the previous release was not marked superseded: ${supersedeError.message}` }
    }
  }

  return { ok: true }
}
