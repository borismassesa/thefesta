// How a colour is read out of, and written back into, a card's artwork.
//
// Shared by card-svg-fields.ts (which reports what an admin can map) and
// card-render.ts (which writes the couple's colours in). They have to agree
// exactly: a shape the mapper offers but the renderer can't write produces a
// card that silently keeps the designer's placeholder colour, which is the one
// failure mode this whole pipeline exists to prevent.
//
// Offsets come from the regex `d` flag rather than indexOf arithmetic, because
// every one of them is a byte position used to splice a live 2 MB file.

/** SVG elements that can carry a colour. A swatch is just one of these. */
export const FILLABLE_SHAPES = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon'])

// `\b` is WRONG for attribute names here: a hyphen is a non-word character, so
// /\bstyle=/ also matches the `style` inside `font-style="italic"` and /\bfill=/
// the `fill` inside `stroke-fill`. Reading the wrong attribute would be bad
// enough; these carry byte offsets used to splice the file, so a mismatch
// corrupts an unrelated attribute. Consume the preceding character instead.
// Group 1 stays the value, so the `d`-flag offsets are unaffected.
const STYLE_ATTR = /(?:^|[^\w-])style\s*=\s*"([^"]*)"/d
const CLASS_ATTR = /(?:^|[^\w-])class\s*=\s*"([^"]*)"/
const FILL_ATTR = /(?:^|[^\w-])fill\s*=\s*"([^"]*)"/d
const STYLE_FILL = /(?:^|;)\s*fill\s*:\s*([^;]*)/id

/** A declared fill, with the stylesheet position that decided it. */
type ClassFill = { value: string; order: number }

/**
 * Every class-bearing declaration block in the document's <style> elements.
 *
 * `order` counts ALL rules, not just the ones passed to `visit`, so two readers
 * looking for different properties still agree on which rule came later. That
 * matters because equal-specificity class selectors resolve by stylesheet order.
 *
 * Shared so the fill reader and the font reader cannot drift apart on what
 * counts as a rule. Illustrator's default export ("Styling: Internal CSS") puts
 * both colour AND typeface in here, so a reader that only looked at attributes
 * would report an artwork as having neither.
 */
function forEachStyleRule(
  svg: string,
  visit: (classNames: string[], body: string, order: number) => void,
): void {
  let order = 0
  for (const [, css] of svg.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      order += 1
      // One rule can name several classes: '.cls-2, .cls-9 { fill: #024231; }'
      const classNames = [...selectors.matchAll(/\.([\w-]+)/g)].map((m) => m[1])
      if (classNames.length > 0) visit(classNames, body, order)
    }
  }
}

/** Read one CSS property out of a declaration body. */
function declaration(body: string, property: string): string | undefined {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(body)?.[1]?.trim()
}

/**
 * Class name → fill, read from the document's <style> blocks.
 *
 * Illustrator's DEFAULT SVG export ("Styling: Internal CSS") puts every colour
 * here as '.cls-2{fill:#024231;}' and leaves only class="cls-2" on the shape.
 * A scan that looked for a fill attribute would report such a swatch as having
 * no colour at all, and a renderer that wrote one would lose to the stylesheet.
 */
export function readClassFills(svg: string): Map<string, ClassFill> {
  const fills = new Map<string, ClassFill>()
  forEachStyleRule(svg, (classNames, body, order) => {
    const fill = declaration(body, 'fill')
    if (!fill) return
    for (const cls of classNames) fills.set(cls, { value: fill, order })
  })
  return fills
}

/** The typeface properties a class contributes. */
export type ClassFont = {
  family?: string
  weight?: string
  style?: string
  /**
   * Typesetting properties, read here for the same reason as the family: an
   * Internal CSS export puts `.cls-7{font-size:24.32px;letter-spacing:.1em;}`
   * in the stylesheet and leaves only `class="cls-7"` on the <text>. A layout
   * engine that read only attributes would measure every such layer at the
   * default 16px and lay the card out around a size the designer never chose.
   */
  size?: string
  letterSpacing?: string
  anchor?: string
  /** Stylesheet position of the last rule that touched this class. */
  order: number
}

/** CSS properties `readClassFonts` collects, in the spelling stylesheets use. */
const CLASS_FONT_PROPERTIES = [
  ['family', 'font-family'],
  ['weight', 'font-weight'],
  ['style', 'font-style'],
  ['size', 'font-size'],
  ['letterSpacing', 'letter-spacing'],
  ['anchor', 'text-anchor'],
] as const satisfies readonly (readonly [keyof Omit<ClassFont, 'order'>, string])[]

/**
 * Class name → typeface, read from the document's <style> blocks.
 *
 * The font twin of `readClassFills`, and it exists for the same reason: an
 * Internal CSS export writes `.cls-7{font-family:BookmanOldStyle, Bookman Old
 * Style;}` and leaves only `class="cls-7"` on the <text>. Without this, a scan
 * for which fonts an artwork needs reports zero on those files, which is worse
 * than reporting nothing at all because it reads as "this card is fine".
 *
 * Properties merge per class ACROSS rules rather than replacing wholesale,
 * because Illustrator routinely splits them: one rule sets the family for
 * several classes, another adds a weight to one of them.
 */
export function readClassFonts(svg: string): Map<string, ClassFont> {
  const fonts = new Map<string, ClassFont>()
  forEachStyleRule(svg, (classNames, body, order) => {
    const declared = CLASS_FONT_PROPERTIES.map(
      ([key, property]) => [key, declaration(body, property)] as const,
    ).filter((pair): pair is readonly [keyof Omit<ClassFont, 'order'>, string] => Boolean(pair[1]))
    if (declared.length === 0) return
    for (const cls of classNames) {
      const entry = fonts.get(cls) ?? { order }
      // Later rule wins per property; untouched properties survive.
      for (const [key, value] of declared) entry[key] = value
      entry.order = order
      fonts.set(cls, entry)
    }
  })
  return fonts
}

/**
 * Where a new colour has to be written so that it actually takes effect.
 *
 * Offsets are relative to the element's attribute string, so the caller adds
 * its own document offset. All modes are byte-range edits rather than a rebuilt
 * tag, because the artwork's other attributes carry the typesetting and
 * positioning and must survive untouched.
 */
export type FillTarget =
  /** Overwrite an existing value in place. */
  | { mode: 'replace'; start: number; end: number }
  /** Splice 'fill:HEX;' into an existing style attribute that has no fill. */
  | { mode: 'prepend-style'; at: number }
  /** Add a style attribute, the only thing that outranks a CSS class. */
  | { mode: 'insert-style'; at: number }
  /** Add a plain fill attribute. Safe only when no stylesheet is in play. */
  | { mode: 'insert-attr'; at: number }

export type ShapeFill = {
  /** The colour the shape renders today, whatever declared it. */
  value: string | null
  target: FillTarget
}

/**
 * Read a shape's effective colour and decide how to overwrite it.
 *
 * Follows SVG's real precedence, which is what makes the difference between a
 * colour change appearing and being silently swallowed:
 *
 *   inline style  >  CSS class rule  >  presentation attribute
 *
 * So a shape carrying both fill="#000" and class="cls-2" renders as cls-2, and
 * the only thing that beats that is an inline style.
 */
export function resolveShapeFill(attrs: string, classFills: Map<string, ClassFill>): ShapeFill {
  const style = STYLE_ATTR.exec(attrs)
  const styleValueStart = style?.indices?.[1]?.[0] ?? -1
  const styleFill = style ? STYLE_FILL.exec(style[1]) : null

  // 1. An inline fill already wins; overwrite it where it stands.
  if (styleFill?.indices?.[1]) {
    const [from, to] = styleFill.indices[1]
    return {
      value: styleFill[1].trim() || null,
      target: { mode: 'replace', start: styleValueStart + from, end: styleValueStart + to },
    }
  }

  // Equal-specificity class selectors resolve by stylesheet order, not by the
  // order the names appear on the element, so compare the rules themselves.
  const classFill = (CLASS_ATTR.exec(attrs)?.[1]?.split(/\s+/) ?? [])
    .map((name) => classFills.get(name))
    .filter((entry): entry is ClassFill => entry !== undefined)
    .sort((a, b) => a.order - b.order)
    .at(-1)

  // 2. A class supplies the colour, so only an inline style can override it.
  if (classFill) {
    return {
      value: classFill.value,
      target:
        styleValueStart >= 0
          ? { mode: 'prepend-style', at: styleValueStart }
          : { mode: 'insert-style', at: 0 },
    }
  }

  // 3. A plain presentation attribute. Nothing outranks it here, so edit it.
  const attrFill = FILL_ATTR.exec(attrs)
  if (attrFill?.indices?.[1]) {
    const [from, to] = attrFill.indices[1]
    return { value: attrFill[1].trim() || null, target: { mode: 'replace', start: from, end: to } }
  }

  // 4. No colour declared anywhere, so a bare attribute is enough.
  return {
    value: null,
    target:
      styleValueStart >= 0
        ? { mode: 'prepend-style', at: styleValueStart }
        : { mode: 'insert-attr', at: 0 },
  }
}

/** The exact text to splice in at a target, given a validated hex colour. */
export function fillEditText(target: FillTarget, hex: string): string {
  switch (target.mode) {
    case 'replace':
      return hex
    case 'prepend-style':
      return `fill:${hex};`
    case 'insert-style':
      return ` style="fill:${hex}"`
    case 'insert-attr':
      return ` fill="${hex}"`
  }
}

/**
 * Which layer names a shape belongs to.
 *
 * Normally the innermost named group wins, matching how text layers resolve and
 * how designers actually work: they name the group, and Illustrator dedupes the
 * shape inside it to 'palette_swatch_1-2'.
 *
 * The shape's OWN id is also reported when it names something different, which
 * covers the export where a designer named the object instead of a group. Those
 * shapes land loose inside an organisational group, and crediting them only to
 * that parent once hid five correctly drawn swatches inside a group called
 * 'Wedding_card_Image' that also held the floral bitmap, so the whole group read
 * as artwork and the swatches vanished from the mapper.
 *
 * Both are reported rather than one being chosen, so a binding saved against
 * either name still resolves.
 */
export function shapeLayerIds(ownId: string | null, groupId: string | null): string[] {
  const ids: string[] = []
  if (groupId) ids.push(groupId)
  // Strip Illustrator's duplicate-id suffix before comparing, so the shape
  // inside <g id="palette_swatch_1"> is not also reported as its own layer.
  if (ownId && ownId.replace(/-\d+$/, '') !== groupId) ids.push(ownId)
  return ids
}
