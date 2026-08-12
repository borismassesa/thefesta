import type { DesignElement } from './schema'

/**
 * Detect full-bleed Illustrator “Background / Artwork” roots so Studio can
 * hide them (like Illustrator’s hide-background) and edit content layers cleanly.
 */
export function isArtworkRoot(
  el: DesignElement,
  pageW: number,
  pageH: number,
): boolean {
  if (el.type === 'artboard_background') return false
  // Only top-level containers — children follow their root
  if (el.parentId) return false

  const name = (el.name || '').toLowerCase()
  if (
    /background|artwork|art.?work|base.?plate|decor|floral|ornament/.test(name) &&
    !/text|title|host|guest|name|swatch|label|date|venue|contact/.test(name)
  ) {
    return true
  }

  // Locked base plate image sitting on the artboard
  if (el.type === 'image' && 'isBasePlate' in el && (el as { isBasePlate?: boolean }).isBasePlate) {
    return true
  }

  // Near-full-bleed graphic/group without a content-ish name
  if (el.type === 'group' || el.type === 'svg_graphic' || el.type === 'image') {
    const area = Math.max(0, el.transform.width) * Math.max(0, el.transform.height)
    const full = pageW * pageH
    if (full > 0 && area >= full * 0.9) {
      if (/text|title|host|guest|name|swatch|label|invite|date|venue|contact/.test(name)) {
        return false
      }
      // Prefer name match; area-only only if name is empty/generic
      if (!name || /^(group|layer|graphic)\b/i.test(el.name || '')) return true
    }
  }

  return false
}

/** Collect id + all descendants (via parentId and group.children). */
export function collectDescendantIds(
  rootId: string,
  elements: DesignElement[],
): Set<string> {
  const ids = new Set<string>([rootId])
  const byParent = new Map<string | null, DesignElement[]>()
  for (const el of elements) {
    const pid = el.parentId ?? null
    const list = byParent.get(pid) ?? []
    list.push(el)
    byParent.set(pid, list)
  }
  const walk = (id: string) => {
    const el = elements.find((e) => e.id === id)
    if (el?.type === 'group') {
      for (const cid of el.children) {
        if (!ids.has(cid)) {
          ids.add(cid)
          walk(cid)
        }
      }
    }
    for (const child of byParent.get(id) ?? []) {
      if (!ids.has(child.id)) {
        ids.add(child.id)
        walk(child.id)
      }
    }
  }
  walk(rootId)
  return ids
}

export function artworkLayerIds(
  elements: DesignElement[],
  pageW: number,
  pageH: number,
): Set<string> {
  const ids = new Set<string>()
  for (const el of elements) {
    if (isArtworkRoot(el, pageW, pageH)) {
      for (const id of collectDescendantIds(el.id, elements)) ids.add(id)
    }
  }
  return ids
}

/** Ancestors from el up to root (excluding el). */
export function ancestorIds(el: DesignElement, elements: DesignElement[]): string[] {
  const byId = new Map(elements.map((e) => [e.id, e]))
  const out: string[] = []
  let pid = el.parentId ?? null
  while (pid) {
    out.push(pid)
    pid = byId.get(pid)?.parentId ?? null
  }
  return out
}

export type LayerViewMode = {
  /** Hide Illustrator background / artwork plate (session-only). */
  hideArtwork: boolean
  /** Solo this layer (+ ancestors + descendants). null = off. */
  soloId: string | null
}

export function isLayerVisibleInView(
  el: DesignElement,
  elements: DesignElement[],
  pageW: number,
  pageH: number,
  view: LayerViewMode,
): boolean {
  if (!el.visible) return false
  if (el.type === 'artboard_background') return true

  if (view.soloId) {
    const solo = elements.find((e) => e.id === view.soloId)
    const tree = collectDescendantIds(view.soloId, elements)
    if (solo) {
      for (const a of ancestorIds(solo, elements)) tree.add(a)
    }
    return tree.has(el.id)
  }

  if (view.hideArtwork) {
    const art = artworkLayerIds(elements, pageW, pageH)
    if (art.has(el.id)) return false
  }

  return true
}
