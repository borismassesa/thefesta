// Reads the editable text layers out of a card's SVG artwork.
//
// Designers name their layers in Illustrator and those names survive the SVG
// export as group ids, so the artwork already carries its own field schema:
//
//   <g id="Names">
//     <text class="st11" transform="..."><tspan x="0" y="0">ROMEO &amp; JULIET</tspan></text>
//   </g>
//
// The name is on the enclosing <g>, never on the <text> itself, so a layer is
// found by tracking group nesting rather than by reading text attributes.
//
// Some named layers are decorative rather than fillable — 'Event_Title' in the
// house template holds three separately-positioned <text> nodes spelling
// "Save" / "the" / "Date" as lettering art. Those are reported like any other
// layer (with textNodeCount > 1 as the tell) and it's the admin's job to mark
// which layers are actually editable; guessing here would silently drop real
// fields.
//
// Deliberately not a full SVG parser: Node has no DOM, and pulling in jsdom to
// read a handful of ids would be a heavy dependency for a scan that runs when
// an admin uploads artwork. The tag walk below handles the structure Illustrator
// and Figma emit. It does not handle CDATA or tags inside attribute values;
// neither appears in exported card artwork.

/** Shapes that can carry a colour. Mirrors FILLABLE_SHAPES in card-render.ts. */
const FILLABLE_SHAPES = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon'])

export type CardTextLayer = {
  /** The SVG group id — the designer's layer name. Stable key for the schema. */
  id: string
  /** Humanised for the admin UI: 'Event_Title' → 'Event title'. */
  label: string
  /** Placeholder copy sitting in the artwork, e.g. 'ROMEO & JULIET'. */
  sampleText: string
  /** Separate <text> nodes in the layer. >1 usually means decorative lettering. */
  textNodeCount: number
}

/**
 * A named layer whose content is a bitmap, not text.
 *
 * These are the reason artwork has to be inspected rather than trusted. The
 * live Opus Royal Ivory card renders its wedding date as three embedded PNGs
 * (date_day_Image 71×44, date_month_Image 103×22, date_year_Image 70×22), so
 * the single most important variable on a wedding invitation cannot be re-typed
 * for the next couple. Surfacing them lets the Card Designer refuse to treat
 * such a card as personalisable instead of discovering it mid-order.
 */
export type CardRasterLayer = {
  id: string
  label: string
  /** Rendered size in the artwork, when the <image> declares it. */
  width: string | null
  height: string | null
}

/**
 * A named layer whose content is a fillable vector shape and no text.
 *
 * This is what a colour swatch looks like once it's exported properly: a
 * circle or rect with a `fill`. It carries no text, so it would be invisible
 * to a text-only scan — and then the very thing the colour fields exist to
 * drive could never be mapped.
 */
export type CardShapeLayer = {
  id: string
  label: string
  /** How many fillable shapes the layer holds. */
  shapeCount: number
  /** The fill currently on the first shape, so the admin can recognise it. */
  currentFill: string | null
}

export type CardArtworkInspection = {
  /** Layers that can be personalised. */
  textLayers: CardTextLayer[]
  /** Layers baked to pixels — permanently fixed unless the artwork is redrawn. */
  rasterLayers: CardRasterLayer[]
  /** Vector shape layers — mappable to colour fields. */
  shapeLayers: CardShapeLayer[]
}

/** 'Event_Title' / 'event-title' / 'eventTitle' → 'Event title'. */
export function humaniseLayerName(id: string): string {
  const spaced = id
    .replace(/[_-]+/g, ' ')
    // camelCase / PascalCase word boundaries, and ACRONYMWord → ACRONYM Word
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return id
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return XML_ENTITIES[body.toLowerCase()] ?? whole
  })
}

function readId(attrs: string): string | null {
  const match = /\bid\s*=\s*("([^"]*)"|'([^']*)')/.exec(attrs)
  const raw = match?.[2] ?? match?.[3]
  const id = raw?.trim()
  return id ? id : null
}

/**
 * Every named layer in the artwork that contains text, in document order.
 *
 * Nested named groups resolve to the INNERMOST one, so a designer who wraps
 * fields in an organisational group ("Text", "Layer 1") still gets the specific
 * layer names rather than the wrapper.
 */
export function extractCardTextLayers(svg: string): CardTextLayer[] {
  return inspectCardArtwork(svg).textLayers
}

/**
 * Both halves of the artwork's story: what can be filled in, and what is stuck.
 *
 * A layer reported in `rasterLayers` and not in `textLayers` holds no editable
 * text at all. A layer in both has text alongside imagery.
 */
export function inspectCardArtwork(svg: string): CardArtworkInspection {
  // id → accumulated state, keyed so a layer split across the file merges.
  const layers = new Map<string, { chunks: string[]; textNodes: number }>()
  const rasters = new Map<string, CardRasterLayer>()
  const shapes = new Map<string, { count: number; fill: string | null }>()
  // Open elements, innermost last. `id` is null for unnamed groups.
  const stack: { tag: string; id: string | null }[] = []

  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g
  let cursor = 0
  let match: RegExpExecArray | null

  const currentLayerId = (): string | null => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].id) return stack[i].id
    }
    return null
  }

  const insideText = (): boolean => stack.some((el) => el.tag === 'text')

  while ((match = tagPattern.exec(svg)) !== null) {
    const [whole, closing, rawTag, attrs, selfClosing] = match

    // Characters between the previous tag and this one are content. Only keep
    // them when they sit inside a <text> belonging to a named layer.
    if (match.index > cursor && insideText()) {
      const id = currentLayerId()
      if (id) {
        const text = svg.slice(cursor, match.index)
        if (text.trim()) layers.get(id)?.chunks.push(text)
      }
    }
    cursor = match.index + whole.length

    const tag = rawTag.toLowerCase()

    if (closing) {
      // Unwind to the matching open tag. Tolerates stray closers rather than
      // corrupting the stack for the rest of the file.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }

    const id = readId(attrs)

    if (tag === 'image') {
      // <image> is usually self-closing, so record it before the early return.
      // The enclosing group's name wins over the image's own id, matching how
      // text layers resolve: Illustrator emits <g id="date_day_Image"> around
      // <image id="date_day_Image-2">, and the group is what the designer named.
      const layerId = currentLayerId() ?? id
      if (layerId && !rasters.has(layerId)) {
        rasters.set(layerId, {
          id: layerId,
          label: humaniseLayerName(layerId),
          width: /\bwidth\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? null,
          height: /\bheight\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? null,
        })
      }
    }

    if (FILLABLE_SHAPES.has(tag)) {
      const owner = currentLayerId() ?? id
      if (owner) {
        const entry = shapes.get(owner) ?? { count: 0, fill: null }
        entry.count += 1
        if (entry.fill === null) {
          entry.fill = /\bfill\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? null
        }
        shapes.set(owner, entry)
      }
    }

    // <?xml ...?> and <!-- --> never reach here (they don't match the pattern's
    // leading letter requirement), so anything self-closing is a real element.
    if (selfClosing) continue

    stack.push({ tag, id })

    if (tag === 'text') {
      const layerId = currentLayerId()
      if (layerId) {
        const entry = layers.get(layerId) ?? { chunks: [], textNodes: 0 }
        entry.textNodes += 1
        layers.set(layerId, entry)
      }
    }
  }

  const textLayers = [...layers.entries()]
    .map(([id, { chunks, textNodes }]) => ({
      id,
      label: humaniseLayerName(id),
      sampleText: decodeEntities(chunks.join(' ')).replace(/\s+/g, ' ').trim(),
      textNodeCount: textNodes,
    }))
    // A named group can wrap only shapes (a border, a background). Those are
    // not fields.
    .filter((layer) => layer.textNodeCount > 0)

  const rasterLayers = [...rasters.values()]
  const textIds = new Set(textLayers.map((l) => l.id))
  const rasterIds = new Set(rasterLayers.map((l) => l.id))

  // A layer holding text or a bitmap is already reported as such; only
  // shape-ONLY layers are candidates for a colour field.
  const shapeLayers: CardShapeLayer[] = [...shapes.entries()]
    .filter(([id]) => !textIds.has(id) && !rasterIds.has(id))
    .map(([id, { count, fill }]) => ({
      id,
      label: humaniseLayerName(id),
      shapeCount: count,
      currentFill: fill,
    }))

  return { textLayers, rasterLayers, shapeLayers }
}
