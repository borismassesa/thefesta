'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requireAdminRole, type AdminAccessRole } from '@/lib/admin-auth'
import {
  CARD_FIELD_ROLE_KEYS,
  type CardFieldBinding,
} from '@opusfesta/lib'

// Same allowlist as the card editor — mapping a card's fields is catalogue work.
const DESIGNER_ROLES: AdminAccessRole[] = ['owner', 'admin', 'editor']

type SaveResult = { ok: true; mapped: number } | { ok: false; error: string }
type ArtworkUrlResult = { ok: true } | { ok: false; error: string }

/**
 * Replace a card's layer→role mapping.
 *
 * Validated server-side rather than trusting the form: an unknown role or a
 * duplicate would silently break the couple's form and the render step, and
 * both are cheap to reject here.
 */
export async function saveCardFieldBindings(
  productId: string,
  bindings: CardFieldBinding[],
): Promise<SaveResult> {
  await requireAdminRole(DESIGNER_ROLES)

  if (!productId.trim()) return { ok: false, error: 'Missing card id.' }
  if (!Array.isArray(bindings)) return { ok: false, error: 'Malformed mapping.' }

  const seenRoles = new Set<string>()
  const seenLayers = new Set<string>()
  const clean: CardFieldBinding[] = []

  for (const binding of bindings) {
    const role = String(binding?.role ?? '').trim()
    if (!role) continue
    if (!CARD_FIELD_ROLE_KEYS.includes(role)) {
      return { ok: false, error: `"${role}" is not a known card field.` }
    }
    if (seenRoles.has(role)) {
      return { ok: false, error: `"${role}" is mapped more than once.` }
    }

    const layerIds = (Array.isArray(binding.layerIds) ? binding.layerIds : [])
      .map((id) => String(id).trim())
      .filter(Boolean)
    if (layerIds.length === 0) continue // an unmapped role is simply omitted

    for (const id of layerIds) {
      // One layer can only render one field; sharing it would make the render
      // order-dependent and the last write would win invisibly.
      if (seenLayers.has(id)) {
        return { ok: false, error: `Layer "${id}" is assigned to two different fields.` }
      }
      seenLayers.add(id)
    }

    seenRoles.add(role)
    clean.push({
      role,
      layerIds,
      ...(binding.kind === 'colour' ? { kind: 'colour' as const } : {}),
      ...(binding.rasterised ? { rasterised: true } : {}),
    })
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_invitations_products')
    .update({ field_bindings: clean })
    .eq('id', productId)

  if (error) return { ok: false, error: error.message || 'Could not save the mapping.' }

  revalidatePath('/opus-pass/digital-cards/templates')
  revalidatePath(`/opus-pass/digital-cards/templates/${productId}`)
  revalidatePath('/opus-pass/digital-cards/cards')
  revalidatePath(`/opus-pass/digital-cards/cards/${productId}/artwork`)
  return { ok: true, mapped: clean.length }
}

export async function setCardArtworkSvgUrl(
  productId: string,
  artworkSvgUrl: string,
): Promise<ArtworkUrlResult> {
  await requireAdminRole(DESIGNER_ROLES)

  const id = productId.trim()
  const url = artworkSvgUrl.trim()
  if (!id) return { ok: false, error: 'Missing card id.' }
  if (url && !/\.svg(\?|#|$)/i.test(url)) {
    return { ok: false, error: 'Editable artwork must be an SVG file.' }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('website_invitations_products')
    .update({ artwork_svg_url: url })
    .eq('id', id)

  if (error) return { ok: false, error: error.message || 'Could not save the artwork SVG.' }

  revalidatePath('/opus-pass/digital-cards/cards')
  revalidatePath(`/opus-pass/digital-cards/cards/${id}`)
  revalidatePath(`/opus-pass/digital-cards/cards/${id}/artwork`)
  return { ok: true }
}
