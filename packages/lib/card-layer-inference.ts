// Working out which field each layer of an artwork is.
//
// "Match by name" resolved 10 of 24 layers on the reference card. Every failure
// was the same shape: the designer named the layer after the sample content, so
// the NAME carries no role information.
//
//   Bi._Fabiola_Thomas            "Bi. Fabiola Thomas"
//   KKKT_Sala_sala_JUU            "KKKT Sala sala JUU"
//   Anita_Isaac_255_756_089_282   "Anita Isaac +255 756 089 282"
//
// Nothing about those strings says "guest name" or "ceremony venue". The text
// does. So matching reads both, and treats them very differently:
//
//   exact / synonym  the designer stated the role. Safe to apply.
//   content          we inferred it. SUGGESTED ONLY, with the reason shown.
//
// That split is not caution for its own sake. A wedding invitation goes to
// hundreds of guests and cannot be recalled, and the review step downstream
// assumes a person actually looked. A suggestion someone can see the reasoning
// for is one they can reject in a second; a silent guess is one they will
// rubber-stamp.

import { normaliseFontKey } from './card-svg-fonts'
import type { CategorySchema } from './card-categories'

/** The parts of a role definition matching needs. `CardFieldRole` satisfies it. */
export type MatchableRole = {
  key: string
  aliases?: string[]
  match?: { pattern: RegExp; reason: string; ordinal?: number }
}

export type LayerForMatching = {
  id: string
  /** The layer's visible text. Empty for shape and image layers. */
  sampleText: string
}

export type SuggestionConfidence = 'exact' | 'synonym' | 'content'

export type LayerSuggestion = {
  role: string
  confidence: SuggestionConfidence
  /** Plain-language justification, shown next to the suggestion. */
  reason: string
}

/**
 * Compare layer names the way a human would.
 *
 * Shares `normaliseFontKey`'s rules (case, spaces, hyphens, underscores) since
 * the question is identical: are these two strings the same name spelled
 * differently?
 */
function nameKey(value: string): string {
  return normaliseFontKey(value)
}

/**
 * Strip Illustrator's export suffixes before comparing.
 *
 *   '_Image'  appended to a layer it flattened to a bitmap
 *   '-2'      appended to the second and later uses of an id
 *   '#1'      our own addressing for one <text> inside a multi-text layer
 */
function baseName(layerId: string): string {
  return layerId
    .replace(/#\d+$/, '')
    .replace(/_Image$/i, '')
    .replace(/-\d+$/, '')
}

/**
 * Collapse whitespace before matching content.
 *
 * Not cosmetic: a kerned layer's text arrives split per tspan, so the month
 * reads "A G O STI" and the year "2 0 26". Without this, neither ever matches.
 */
function contentKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The same, with ALL spaces removed, for values that were letterspaced. */
function tightKey(text: string): string {
  return text.replace(/\s+/g, '')
}

/**
 * Suggest a role for every layer.
 *
 * Layers are considered in document order, which is reading order on the card.
 * That matters for the ordinal roles: the first phone number is contact_1 and
 * the second is contact_2, and nothing but position can tell them apart.
 *
 * A role is only ever suggested once. Roles outside the category's schema are
 * never suggested at all, so a Save the Date is not offered a reception time.
 */
export function suggestRoles(
  layers: LayerForMatching[],
  roles: MatchableRole[],
  schema: CategorySchema,
  /** Layer ids already mapped, so their roles are not offered twice. */
  alreadyAssigned: Record<string, string> = {},
): Map<string, LayerSuggestion> {
  const inCategory = new Set(schema.roles)
  const candidates = roles.filter((role) => inCategory.has(role.key))

  const suggestions = new Map<string, LayerSuggestion>()
  const takenRoles = new Set(Object.values(alreadyAssigned).filter(Boolean))

  const claim = (layerId: string, suggestion: LayerSuggestion) => {
    suggestions.set(layerId, suggestion)
    takenRoles.add(suggestion.role)
  }

  // ── Pass 1: the designer said so ──
  //
  // Runs to completion before any inference, so an explicitly named layer can
  // never be beaten to its role by something that merely looks the part.
  const unnamed: LayerForMatching[] = []
  for (const layer of layers) {
    if (alreadyAssigned[layer.id]) continue
    const key = nameKey(baseName(layer.id))

    const exact = candidates.find((role) => nameKey(role.key) === key)
    if (exact && !takenRoles.has(exact.key)) {
      claim(layer.id, { role: exact.key, confidence: 'exact', reason: 'the layer is named for this field' })
      continue
    }

    const synonym = candidates.find((role) =>
      (role.aliases ?? []).some((alias) => nameKey(alias) === key),
    )
    if (synonym && !takenRoles.has(synonym.key)) {
      claim(layer.id, { role: synonym.key, confidence: 'synonym', reason: `the layer name means ${synonym.key.replace(/_/g, ' ')}` })
      continue
    }

    unnamed.push(layer)
  }

  // ── Pass 2: what the text looks like ──
  //
  // Ordinal roles are collected first and assigned by position, because
  // deciding contact_1 vs contact_2 one layer at a time is impossible.
  const ordinalGroups = new Map<string, MatchableRole[]>()
  for (const role of candidates) {
    if (!role.match?.ordinal) continue
    const source = role.match.pattern.source
    ordinalGroups.set(source, [...(ordinalGroups.get(source) ?? []), role])
  }
  for (const group of ordinalGroups.values()) {
    group.sort((a, b) => (a.match?.ordinal ?? 0) - (b.match?.ordinal ?? 0))
  }

  const usedByOrdinal = new Set<string>()
  for (const group of ordinalGroups.values()) {
    const pattern = group[0].match!.pattern
    const hits = unnamed.filter(
      (layer) => layer.sampleText && pattern.test(contentKey(layer.sampleText)),
    )
    // Only the slots still open. On the reference card 'contact_1-2' is matched
    // by NAME in pass 1, so the one remaining phone layer is the second
    // contact, not the first. Zipping against the full group would offer it
    // contact_1, find that taken, and leave the layer unresolved.
    const open = group.filter((role) => !takenRoles.has(role.key))
    hits.forEach((layer, index) => {
      const role = open[index]
      if (!role) return
      claim(layer.id, {
        role: role.key,
        confidence: 'content',
        reason: role.match!.reason,
      })
      usedByOrdinal.add(layer.id)
    })
  }

  // Everything else: first role whose pattern the text satisfies.
  for (const layer of unnamed) {
    if (usedByOrdinal.has(layer.id) || suggestions.has(layer.id)) continue
    if (!layer.sampleText) continue

    const loose = contentKey(layer.sampleText)
    const tight = tightKey(layer.sampleText)

    for (const role of candidates) {
      if (!role.match || role.match.ordinal || takenRoles.has(role.key)) continue
      // Tested both ways: a letterspaced month is "A G O STI" loose and
      // "AGOSTI" tight, and only the tight form matches a month name.
      if (role.match.pattern.test(loose) || role.match.pattern.test(tight)) {
        claim(layer.id, { role: role.key, confidence: 'content', reason: role.match.reason })
        break
      }
    }
  }

  return suggestions
}

/** Suggestions safe to apply without asking. */
export function autoApplicable(
  suggestions: Map<string, LayerSuggestion>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [layerId, suggestion] of suggestions) {
    if (suggestion.confidence !== 'content') out[layerId] = suggestion.role
  }
  return out
}
