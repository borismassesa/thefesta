/**
 * Recolor SVG fragment markup for Design Studio fill edits.
 * Illustrator / layered imports often bake fills into:
 *   - presentation attrs: fill="#…"
 *   - inline style: style="fill:#…"
 *   - <style> blocks + class names: .st0{fill:#1A1A1A}
 * Changing the element's `fill` prop alone does not repaint the canvas.
 */

const PROTECTED_FILL = /^(none|transparent|url\(|currentColor)/i

function shouldReplaceFillValue(value: string | undefined | null): boolean {
  if (value == null) return true
  const v = value.trim().replace(/!important/i, '').trim()
  if (!v) return true
  return !PROTECTED_FILL.test(v)
}

function normalizeHex(hex: string): string {
  const h = hex.trim()
  if (!h) return '#000000'
  return h.startsWith('#') ? h : `#${h}`
}

/** Replace fill: … declarations inside a CSS text blob (style attrs or <style> bodies). */
function replaceFillInCssText(css: string, hex: string): string {
  if (!/\bfill\s*:/i.test(css)) return css
  return css.replace(/\bfill\s*:\s*([^;!}]+)/gi, (decl, value: string) => {
    if (!shouldReplaceFillValue(value)) return decl
    return `fill: ${hex}`
  })
}

/** Replace solid fills in attribute form: fill="…" / fill='…' */
function replaceFillAttrs(markup: string, hex: string): string {
  return markup.replace(/\bfill\s*=\s*(["'])([^"']*)\1/gi, (full, quote: string, value: string) => {
    if (!shouldReplaceFillValue(value)) return full
    return `fill=${quote}${hex}${quote}`
  })
}

/** Replace fill: … inside style="…" */
function replaceFillInStyles(markup: string, hex: string): string {
  return markup.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (full, quote: string, style: string) => {
    const next = replaceFillInCssText(style, hex)
    if (next === style && !/fill\s*:/i.test(style)) return full
    return `style=${quote}${next}${quote}`
  })
}

/** Illustrator class fills live in <style>…</style> */
function replaceFillInStyleTags(markup: string, hex: string): string {
  return markup.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_full, attrs: string, css: string) => {
    return `<style${attrs}>${replaceFillInCssText(css, hex)}</style>`
  })
}

/**
 * Force a presentation fill + inline style fill on leaf shapes so class-based
 * Illustrator fills are overridden (inline style beats stylesheet classes).
 */
function forceLeafFills(markup: string, hex: string): string {
  return markup.replace(
    /<(path|rect|circle|ellipse|polygon|polyline)\b([^>]*?)(\/?)>/gi,
    (full, tag: string, attrs: string, selfClose: string) => {
      const fillAttr = attrs.match(/\bfill\s*=\s*(["'])([^"']*)\1/i)
      if (fillAttr && !shouldReplaceFillValue(fillAttr[2])) return full
      if (/fill\s*:\s*(none|url\()/i.test(attrs)) return full

      let a = attrs.replace(/\bfill\s*=\s*(["'])[^"']*\1/gi, '').trimEnd()

      if (/\bstyle\s*=\s*(["'])/i.test(a)) {
        a = a.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i, (_s, q: string, style: string) => {
          let ns = style.replace(/\bfill\s*:\s*[^;]+;?/gi, '').trim()
          ns = ns.replace(/;+\s*$/, '')
          ns = ns ? `${ns};fill:${hex}` : `fill:${hex}`
          return `style=${q}${ns}${q}`
        })
      } else {
        a = `${a}${a && !a.endsWith(' ') ? ' ' : ''}style="fill:${hex}"`
      }

      const space = a && !a.endsWith(' ') ? ' ' : ''
      return `<${tag} ${a}${space}fill="${hex}"${selfClose}>`.replace(/<(\w+)\s+/, '<$1 ')
    },
  )
}

/**
 * Apply a solid fill to an SVG fragment.
 * Leaves `none`, `transparent`, and `url(#…)` / paint servers alone.
 */
export function applySolidFillToSvgMarkup(markup: string, hex: string): string {
  const normalized = normalizeHex(hex)
  let out = replaceFillInStyleTags(markup, normalized)
  out = replaceFillAttrs(out, normalized)
  out = replaceFillInStyles(out, normalized)
  out = forceLeafFills(out, normalized)
  return out
}

export function applySolidStrokeToSvgMarkup(markup: string, hex: string): string {
  const normalized = normalizeHex(hex)
  let out = markup.replace(/\bstroke\s*=\s*(["'])([^"']*)\1/gi, (full, quote: string, value: string) => {
    if (!shouldReplaceFillValue(value)) return full
    return `stroke=${quote}${normalized}${quote}`
  })
  out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_full, attrs: string, css: string) => {
    const next = css.replace(/\bstroke\s*:\s*([^;!}]+)/gi, (decl, value: string) => {
      if (!shouldReplaceFillValue(value)) return decl
      return `stroke: ${normalized}`
    })
    return `<style${attrs}>${next}</style>`
  })
  return out
}
