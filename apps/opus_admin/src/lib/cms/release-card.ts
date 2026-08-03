import 'server-only'
import { createHash } from 'node:crypto'

import {
  injectFontCss,
  renderCardSvg,
  type CardFieldBinding,
  type RenderSkip,
} from '@opusfesta/lib'
import type { createSupabaseAdminClient } from '@/lib/supabase'
import { loadCardArtwork } from '@/lib/cms/card-artwork'
import { cardFontFaceCssFor } from '@/lib/cms/card-font-css'
import { releaseCardFieldValues } from '@/lib/cms/release-card-values'

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
  | { ok: true; path: string; bytes: number; sha256: string; artworkSvgUrl: string }
  | { ok: false; error: string; skipped?: RenderSkip[] }

type ProductRow = {
  artwork_svg_url: string | null
  field_bindings: CardFieldBinding[] | null
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
  const { data: row } = await supabase
    .from('invitation_card_designs')
    .select('product_id, order_id, field_values')
    .eq('id', design.id)
    .maybeSingle<{ product_id: string; order_id: string; field_values: Record<string, string> | null }>()
  if (!row) return { ok: false, error: 'Design job not found.' }

  const { data: product } = await supabase
    .from('website_invitations_products')
    .select('artwork_svg_url, field_bindings')
    .eq('id', row.product_id)
    .maybeSingle<ProductRow>()

  const artwork = await loadCardArtwork(product?.artwork_svg_url ?? '')
  if (!artwork.ok) return { ok: false, error: `Could not read the artwork: ${artwork.reason}` }

  const bindings = product?.field_bindings ?? []
  if (bindings.length === 0) {
    return { ok: false, error: 'This card has no layer mapping, so nothing can be written into it.' }
  }

  const { data: order } = await supabase
    .from('invitation_orders')
    .select('event_id')
    .eq('id', row.order_id)
    .maybeSingle<{ event_id: string | null }>()
  if (!order?.event_id) {
    return { ok: false, error: 'Assign this card order to an event before releasing it.' }
  }

  const { data: event } = await supabase
    .from('wedding_events')
    .select('partner1_name, partner2_name')
    .eq('id', order.event_id)
    .maybeSingle<{ partner1_name: string | null; partner2_name: string | null }>()
  const partner1Name = event?.partner1_name?.trim() || ''
  const partner2Name = event?.partner2_name?.trim() || null
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
  const rendered = renderCardSvg(
    artwork.svg,
    bindings,
    releaseCardFieldValues(row.field_values, { partner1Name, partner2Name }),
  )
  const fatal = rendered.skipped.filter(isFatalSkip)
  if (fatal.length > 0) {
    return {
      ok: false,
      error: `The card cannot be released as-is: ${describeSkips(fatal)}.`,
      skipped: fatal,
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
    artworkSvgUrl: product?.artwork_svg_url ?? '',
  }
}

/**
 * Freeze the card, then move the job to released.
 *
 * Order matters: the file is written FIRST. A job marked ready with no artefact
 * would show the couple a card that does not exist, whereas a stored file with
 * no status change is invisible and harmless, and the storage object is removed
 * if the status write then fails.
 */
export async function releaseApprovedDesign(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  design: { id: string; order_id: string; status: string },
  author: string,
  now: string,
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const frozen = await freezeCardRelease(supabase, design)
  if (!frozen.ok) return { ok: false, error: frozen.error }

  const { data: current } = await supabase
    .from('invitation_card_designs')
    .select('current_release_id')
    .eq('id', design.id)
    .maybeSingle<{ current_release_id: string | null }>()

  const { data: release, error: releaseError } = await supabase
    .from('invitation_card_design_releases')
    .insert({
      design_id: design.id,
      svg_storage_path: frozen.path,
      svg_sha256: frozen.sha256,
      artwork_svg_url: frozen.artworkSvgUrl,
      released_at: now,
      released_by: author,
    })
    .select('id')
    .single<{ id: string }>()
  if (releaseError || !release) {
    await supabase.storage.from(BUCKET).remove([frozen.path]).catch(() => undefined)
    return { ok: false, error: releaseError?.message ?? 'Could not record the card release.' }
  }

  const { error } = await supabase
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
    })
    .eq('id', design.id)

  if (error) {
    // Do not leave an orphan behind: nothing points at this object now.
    await supabase.storage
      .from(BUCKET)
      .remove([frozen.path])
      .catch(() => undefined)
    await supabase.from('invitation_card_design_releases').delete().eq('id', release.id)
    return { ok: false, error: error.message }
  }

  if (current?.current_release_id && current.current_release_id !== release.id) {
    const { error: supersedeError } = await supabase
      .from('invitation_card_design_releases')
      .update({ superseded_at: now })
      .eq('id', current.current_release_id)
      .is('superseded_at', null)
    if (supersedeError) {
      return { ok: true, warning: `Released, but the previous release was not marked superseded: ${supersedeError.message}` }
    }
  }

  return { ok: true }
}
