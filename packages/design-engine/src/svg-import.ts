import {
  createBlankDocument,
  createGroupElement,
  createSvgGraphicElement,
  type DesignDocument,
  type DesignElement,
  type GroupElement,
  type SvgGraphicElement,
  type TextElement,
} from './schema'
import { newElementId } from './ids'
import { VARIABLE_FIELDS } from './variables'

export type SvgImportMode = 'layered' | 'plate_plus_text'

export type SvgImportReport = {
  document: DesignDocument
  mode: SvgImportMode
  imported: {
    paths: number
    groups: number
    shapes: number
    textObjects: number
    images: number
    layers: number
    unsupported: string[]
  }
  suggestedMappings: {
    elementId: string
    content: string
    suggestedPath: string | null
    suggestedRole: string | null
  }[]
}

const SKIP_TAGS = new Set([
  'defs',
  'style',
  'script',
  'title',
  'desc',
  'metadata',
  'clippath',
  'mask',
  'filter',
  'lineargradient',
  'radialgradient',
  'pattern',
  'marker',
  'symbol',
])

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'])
const SELF_CLOSING_OK = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'image',
  'use',
  'stop',
])

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function readViewBox(svg: string): { width: number; height: number; minX: number; minY: number } {
  const vb = svg.match(/viewBox\s*=\s*["']([^"']+)["']/i)
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return {
        minX: parts[0] || 0,
        minY: parts[1] || 0,
        width: Math.round(parts[2]),
        height: Math.round(parts[3]),
      }
    }
  }
  const w = Number(svg.match(/\bwidth\s*=\s*["']([\d.]+)/i)?.[1] ?? 1080)
  const h = Number(svg.match(/\bheight\s*=\s*["']([\d.]+)/i)?.[1] ?? 1350)
  return { minX: 0, minY: 0, width: w || 1080, height: h || 1350 }
}

function extractSvgInner(svg: string): string {
  const open = svg.match(/<svg\b[^>]*>/i)
  if (!open || open.index == null) return svg
  const start = open.index + open[0].length
  const end = svg.toLowerCase().lastIndexOf('</svg>')
  return end > start ? svg.slice(start, end) : svg.slice(start)
}

function extractDefs(inner: string): string {
  const blocks: string[] = []
  const re = /<defs\b[^>]*>[\s\S]*?<\/defs>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(inner))) {
    blocks.push(match[0])
  }
  return blocks.join('\n')
}

/** Strip executable / hostile content from imported fragments. */
export function sanitizeSvgFragment(markup: string): string {
  return markup
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1=""')
}

/**
 * Split SVG body into top-level element strings (comments/whitespace skipped).
 * Nest-aware so `<g>…</g>` stays one node.
 */
export function splitTopLevelSvgNodes(inner: string): string[] {
  const nodes: string[] = []
  let i = 0
  const s = inner
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i++
    if (i >= s.length) break
    if (s[i] !== '<') {
      i++
      continue
    }
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4)
      i = end < 0 ? s.length : end + 3
      continue
    }
    if (s.startsWith('<![CDATA[', i)) {
      const end = s.indexOf(']]>', i + 9)
      i = end < 0 ? s.length : end + 3
      continue
    }
    if (s.startsWith('</', i)) break

    const tagMatch = s.slice(i).match(/^<([A-Za-z][\w:-]*)/)
    if (!tagMatch) {
      i++
      continue
    }
    const tag = tagMatch[1]!
    const tagLower = tag.toLowerCase()

    // Find end of opening tag
    let j = i + 1 + tag.length
    let quote: '"' | "'" | null = null
    while (j < s.length) {
      const c = s[j]!
      if (quote) {
        if (c === quote) quote = null
        j++
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        j++
        continue
      }
      if (c === '>') {
        j++
        break
      }
      j++
    }
    const openTag = s.slice(i, j)
    const selfClosing =
      /\/\s*>$/.test(openTag) || (SELF_CLOSING_OK.has(tagLower) && !s.slice(j).match(new RegExp(`^\\s*<\\/${tag}\\b`, 'i')))

    if (selfClosing && /\/\s*>$/.test(openTag)) {
      nodes.push(openTag)
      i = j
      continue
    }

    // Paired element — nest count
    const closeRe = new RegExp(`</${tag}\\s*>`, 'i')
    const openRe = new RegExp(`<${tag}\\b`, 'i')
    let depth = 1
    let cursor = j
    while (cursor < s.length && depth > 0) {
      const nextOpen = s.slice(cursor).search(openRe)
      const nextClose = s.slice(cursor).search(closeRe)
      if (nextClose < 0) {
        // Unclosed — take rest
        nodes.push(s.slice(i).trim())
        return nodes
      }
      const absClose = cursor + nextClose
      const absOpen = nextOpen >= 0 ? cursor + nextOpen : Infinity
      if (absOpen < absClose) {
        // Could be self-closing open of same tag
        const openSlice = s.slice(absOpen, absOpen + 200)
        const openEnd = openSlice.indexOf('>')
        const fragment = openEnd >= 0 ? openSlice.slice(0, openEnd + 1) : ''
        if (/\/\s*>$/.test(fragment)) {
          cursor = absOpen + openEnd + 1
        } else {
          depth++
          cursor = absOpen + 1
        }
      } else {
        depth--
        const closeMatch = s.slice(absClose).match(closeRe)
        cursor = absClose + (closeMatch?.[0].length ?? 0)
        if (depth === 0) {
          nodes.push(s.slice(i, cursor))
          i = cursor
          break
        }
      }
    }
    if (depth !== 0) {
      nodes.push(s.slice(i).trim())
      break
    }
  }
  return nodes
}

function tagNameOf(node: string): string {
  return (node.match(/^<\s*([A-Za-z][\w:-]*)/)?.[1] ?? '').toLowerCase()
}

function attrOf(node: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')
  const m = node.match(re)
  return m ? m[2]! : null
}

function layerName(tag: string, node: string, index: number): string {
  const id = attrOf(node, 'id')
  const inkscape = attrOf(node, 'inkscape:label') || attrOf(node, 'data-name')
  if (inkscape) return inkscape.slice(0, 48)
  if (id) return id.slice(0, 48)
  const label =
    tag === 'g'
      ? 'Group'
      : tag === 'path'
        ? 'Path'
        : tag === 'image'
          ? 'Image'
          : tag === 'text'
            ? 'Text'
            : tag.charAt(0).toUpperCase() + tag.slice(1)
  return `${label} ${index}`
}

function kindForTag(tag: string): SvgGraphicElement['kind'] {
  if (tag === 'path') return 'path'
  if (tag === 'g') return 'group'
  if (tag === 'image' || tag === 'use') return 'image'
  if (SHAPE_TAGS.has(tag)) return 'shape'
  return 'fragment'
}

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 }
  const m = transform.match(/matrix\s*\(\s*([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)\s*\)/i)
  if (m) {
    return { x: Number(m[5]), y: Number(m[6]) }
  }
  const t = transform.match(/translate\s*\(\s*([-\d.eE+]+)(?:[,\s]+([-\d.eE+]+))?\s*\)/i)
  if (t) {
    return { x: Number(t[1]), y: Number(t[2] ?? 0) }
  }
  return { x: 0, y: 0 }
}

function extractTextNodes(
  svg: string,
  parentOffset: { x: number; y: number } = { x: 0, y: 0 },
): { content: string; x: number; y: number; fontSize: number; fontFamily: string | null }[] {
  const results: {
    content: string
    x: number
    y: number
    fontSize: number
    fontFamily: string | null
  }[] = []
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(svg))) {
    const attrs = match[1]
    const inner = decodeXml(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    if (!inner) continue
    const own = parseTranslate(attrOf(`<text${attrs}>`, 'transform'))
    const xAttr = attrs.match(/\bx\s*=\s*["']([\d.-]+)/i)?.[1]
    const yAttr = attrs.match(/\by\s*=\s*["']([\d.-]+)/i)?.[1]
    const x = (xAttr != null ? Number(xAttr) : 0) + own.x + parentOffset.x
    const y = (yAttr != null ? Number(yAttr) : 0) + own.y + parentOffset.y
    const fontSize = Number(attrs.match(/font-size\s*=\s*["']([\d.]+)/i)?.[1] ?? 32)
    const fontFamily = attrs.match(/font-family\s*=\s*["']([^"']+)["']/i)?.[1] ?? null
    results.push({ content: inner, x, y, fontSize, fontFamily })
  }
  return results
}

/** True when markup still paints a &lt;text&gt; node (avoid Studio double-paint). */
function markupContainsText(markup: string | null | undefined): boolean {
  return Boolean(markup && /<text\b/i.test(markup))
}

function countTags(svg: string, tag: string): number {
  const re = new RegExp(`<${tag}\\b`, 'gi')
  return (svg.match(re) ?? []).length
}

function suggestVariable(content: string): { path: string; role: string } | null {
  const lower = content.toLowerCase()
  for (const field of VARIABLE_FIELDS) {
    if (lower.includes(field.label.toLowerCase())) {
      return { path: field.path, role: field.role }
    }
    if (field.sample && lower === field.sample.toLowerCase()) {
      return { path: field.path, role: field.role }
    }
  }
  if (/\b(mr|mrs|ms|dr|prof)\b/i.test(content) || /&/.test(content)) {
    return { path: 'guest.full_name', role: 'guest_name' }
  }
  if (/\d{1,2}\s+\w+\s+\d{4}/.test(content) || /\d{4}-\d{2}-\d{2}/.test(content)) {
    return { path: 'event.date', role: 'event_date' }
  }
  return null
}

function makeTextElement(
  t: {
    content: string
    x: number
    y: number
    fontSize: number
    fontFamily?: string | null
  },
  pageWidth: number,
  parentId: string | null = null,
): TextElement {
  const suggestion = suggestVariable(t.content)
  const fontSize = t.fontSize || 32
  // Approximate content width; Illustrator often centers names — keep box tight.
  const approxW = Math.min(
    pageWidth * 0.9,
    Math.max(fontSize * 2, t.content.length * fontSize * 0.55),
  )
  const x = Math.max(0, t.x - approxW / 2)
  const y = Math.max(0, t.y - fontSize)
  const family =
    (t.fontFamily?.replace(/['"]/g, '').split(',')[0]?.trim() || 'Cormorant Garamond')
  return {
    id: newElementId(),
    type: 'text',
    name: t.content.slice(0, 40) || 'Text',
    locked: false,
    visible: true,
    opacity: 1,
    parentId,
    content: suggestion ? `{{${suggestion.path}}}` : t.content,
    typography: {
      fontFamily: family,
      fontWeight: 500,
      fontSize,
      lineHeight: 1.15,
      letterSpacing: 0,
      textAlign: 'center',
      color: '#1a1a1a',
      opacity: 1,
      uppercase: false,
      italic: false,
      underline: false,
    },
    layout: {
      fit: 'shrink_wrap',
      minFontSize: Math.max(14, Math.round(fontSize * 0.55)),
      maxLines: 4,
      overflow: 'block',
      verticalAlign: 'middle',
    },
    binding: suggestion
      ? {
          type: 'variable',
          path: suggestion.path,
          role: suggestion.role,
          fallback: 'Guest',
        }
      : { type: 'none' },
    transform: {
      x,
      y,
      width: approxW,
      height: Math.max(fontSize * 1.4, 48),
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  }
}

/** Peel &lt;text&gt; out of a fragment so graphics don't double-paint with Studio text. */
function stripTextNodes(markup: string): string {
  return markup.replace(/<text\b[^>]*>[\s\S]*?<\/text>/gi, '')
}

function detectUnsupported(svg: string): string[] {
  const unsupported: string[] = []
  if (/<filter\b/i.test(svg)) unsupported.push('filters')
  if (/<mask\b/i.test(svg)) unsupported.push('masks')
  if (/<foreignObject\b/i.test(svg)) unsupported.push('foreignObject')
  if (/<animate\b|<animatetransform\b/i.test(svg)) unsupported.push('animations')
  return unsupported
}

function solidBackgroundElement(width: number, height: number, fill: string | null): DesignElement {
  return {
    id: newElementId(),
    type: 'artboard_background',
    name: 'Artboard',
    locked: true,
    visible: true,
    opacity: 1,
    transform: {
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    fill: fill ?? '#ffffff',
    src: null,
    isBasePlate: false,
  }
}

function plateBackgroundElement(
  width: number,
  height: number,
  options: { assetUrl: string; assetId?: string; assetVersion?: number },
): DesignElement {
  return {
    id: newElementId(),
    type: 'artboard_background',
    name: 'Base artwork',
    locked: true,
    visible: true,
    opacity: 1,
    transform: {
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    fill: null,
    src: options.assetUrl,
    asset: options.assetId
      ? { assetId: options.assetId, version: options.assetVersion ?? 1 }
      : undefined,
    isBasePlate: true,
  }
}

/**
 * Guess page fill from a full-bleed background rect, else white.
 */
function guessPageFill(nodes: string[], width: number, height: number): string | null {
  for (const node of nodes) {
    if (tagNameOf(node) !== 'rect') continue
    const w = Number(attrOf(node, 'width') ?? 0)
    const h = Number(attrOf(node, 'height') ?? 0)
    const x = Number(attrOf(node, 'x') ?? 0)
    const y = Number(attrOf(node, 'y') ?? 0)
    const fill = attrOf(node, 'fill')
    if (!fill || fill === 'none') continue
    if (x <= 1 && y <= 1 && w >= width * 0.95 && h >= height * 0.95) {
      return fill
    }
  }
  return null
}

function isFullBleedBackgroundRect(node: string, width: number, height: number): boolean {
  if (tagNameOf(node) !== 'rect') return false
  const w = Number(attrOf(node, 'width') ?? 0)
  const h = Number(attrOf(node, 'height') ?? 0)
  const x = Number(attrOf(node, 'x') ?? 0)
  const y = Number(attrOf(node, 'y') ?? 0)
  return x <= 1 && y <= 1 && w >= width * 0.95 && h >= height * 0.95
}

/**
 * Expand a `<g>` into child nodes, preserving the group's transform / opacity
 * by wrapping each child. Recurses up to `depth` levels.
 */
export function expandGroupNode(node: string, depth = 2): string[] {
  if (depth < 0 || tagNameOf(node) !== 'g') return [node]
  const open = node.match(/^<g\b([^>]*)>/i)
  if (!open) return [node]
  const attrs = open[1] ?? ''
  const stub = `<g${attrs}>`
  const transform = attrOf(stub, 'transform')
  const opacity = attrOf(stub, 'opacity')
  const fill = attrOf(stub, 'fill')
  const stroke = attrOf(stub, 'stroke')
  const inner = node.slice(open[0].length).replace(/<\/g>\s*$/i, '')
  const children = splitTopLevelSvgNodes(inner)
  if (children.length === 0) return [node]

  const wrapAttrs = [
    transform ? `transform="${transform}"` : '',
    opacity ? `opacity="${opacity}"` : '',
    fill ? `fill="${fill}"` : '',
    stroke ? `stroke="${stroke}"` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const out: string[] = []
  for (const child of children) {
    if (tagNameOf(child) === 'g' && depth > 0) {
      const nested = expandGroupNode(child, depth - 1)
      for (const n of nested) {
        out.push(wrapAttrs ? `<g ${wrapAttrs}>${n}</g>` : n)
      }
    } else {
      out.push(wrapAttrs ? `<g ${wrapAttrs}>${child}</g>` : child)
    }
  }
  return out.length > 0 ? out : [node]
}

/** Flatten drawable nodes: expand groups, keep leaves. */
function flattenDrawableNodes(nodes: string[], expandGroups: boolean): string[] {
  if (!expandGroups) return nodes
  const out: string[] = []
  for (const node of nodes) {
    if (tagNameOf(node) === 'g') {
      out.push(...expandGroupNode(node, 2))
    } else {
      out.push(node)
    }
  }
  return out
}

function estimateNodeBounds(
  node: string,
  artW: number,
  artH: number,
): { x: number; y: number; width: number; height: number } {
  const tag = tagNameOf(node)
  const fallback = { x: 0, y: 0, width: artW, height: artH }
  if (tag === 'rect') {
    const x = Number(attrOf(node, 'x') ?? 0)
    const y = Number(attrOf(node, 'y') ?? 0)
    const w = Number(attrOf(node, 'width') ?? 0)
    const h = Number(attrOf(node, 'height') ?? 0)
    if (w > 0 && h > 0) return { x, y, width: w, height: h }
  }
  if (tag === 'circle') {
    const cx = Number(attrOf(node, 'cx') ?? 0)
    const cy = Number(attrOf(node, 'cy') ?? 0)
    const r = Number(attrOf(node, 'r') ?? 0)
    if (r > 0) return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 }
  }
  if (tag === 'ellipse') {
    const cx = Number(attrOf(node, 'cx') ?? 0)
    const cy = Number(attrOf(node, 'cy') ?? 0)
    const rx = Number(attrOf(node, 'rx') ?? 0)
    const ry = Number(attrOf(node, 'ry') ?? 0)
    if (rx > 0 && ry > 0) return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }
  }
  if (tag === 'image') {
    const x = Number(attrOf(node, 'x') ?? 0)
    const y = Number(attrOf(node, 'y') ?? 0)
    const w = Number(attrOf(node, 'width') ?? 0)
    const h = Number(attrOf(node, 'height') ?? 0)
    if (w > 0 && h > 0) return { x, y, width: w, height: h }
  }
  if (tag === 'line') {
    const x1 = Number(attrOf(node, 'x1') ?? 0)
    const y1 = Number(attrOf(node, 'y1') ?? 0)
    const x2 = Number(attrOf(node, 'x2') ?? 0)
    const y2 = Number(attrOf(node, 'y2') ?? 0)
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    return { x, y, width: Math.max(2, Math.abs(x2 - x1)), height: Math.max(2, Math.abs(y2 - y1)) }
  }
  // Path: parse SVG path commands (relative h/v/c break naive number pairing)
  if (tag === 'path') {
    const d = attrOf(node, 'd') ?? ''
    const box = boundsFromPathD(d)
    if (box) return applyNodeTransformToBounds(node, box)
  }
  // Group / fragment: union child bounds when possible
  if (tag === 'g' || tag === 'svg') {
    const open = node.match(/^<[a-zA-Z][\w:-]*\b[^>]*>/)
    if (open) {
      const inner = node.slice(open[0].length).replace(/<\/[a-zA-Z][\w:-]*\s*>\s*$/i, '')
      const children = splitTopLevelSvgNodes(inner)
      const boxes = children
        .filter((c) => !SKIP_TAGS.has(tagNameOf(c)))
        .map((c) => estimateNodeBounds(c, artW, artH))
        .filter((b) => b.width < artW * 0.98 || b.height < artH * 0.98)
      const union = unionBounds(boxes)
      if (union) return union
    }
  }
  return fallback
}

type BBox = { x: number; y: number; width: number; height: number }

/**
 * Bounds from an SVG path `d` attribute.
 * Must understand command arity — pairing every number as x/y (old approach)
 * misreads relative `h`/`v`/`c` args as absolute points near 0 and inflates
 * Illustrator outlined-text boxes to cover the top-left of the artboard.
 */
export function boundsFromPathD(d: string): BBox | null {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g)
  if (!tokens || tokens.length === 0) return null

  let i = 0
  let cmd = ''
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let prevCx = 0
  let prevCy = 0
  let prevCmd = ''
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  const read = (): number => {
    const n = Number(tokens[i++])
    return Number.isFinite(n) ? n : 0
  }

  const isCmd = (t: string | undefined) => !!t && /^[a-zA-Z]$/.test(t)

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i++]!
    } else if (!cmd) {
      i++
      continue
    }

    const rel = cmd === cmd.toLowerCase()
    const base = cmd.toUpperCase()

    if (base === 'Z') {
      cx = startX
      cy = startY
      include(cx, cy)
      prevCmd = base
      continue
    }

    if (base === 'M' || base === 'L' || base === 'T') {
      let first = true
      while (i < tokens.length && !isCmd(tokens[i])) {
        const x = read()
        const y = read()
        const nx = rel ? cx + x : x
        const ny = rel ? cy + y : y
        if (base === 'M' && first) {
          startX = nx
          startY = ny
          // Additional M pairs are implicit LineTos
        }
        cx = nx
        cy = ny
        include(cx, cy)
        first = false
        if (base === 'M') cmd = rel ? 'l' : 'L'
      }
      prevCmd = base === 'M' ? 'L' : base
      continue
    }

    if (base === 'H') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const x = read()
        cx = rel ? cx + x : x
        include(cx, cy)
      }
      prevCmd = base
      continue
    }

    if (base === 'V') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const y = read()
        cy = rel ? cy + y : y
        include(cx, cy)
      }
      prevCmd = base
      continue
    }

    if (base === 'C') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const x1 = read()
        const y1 = read()
        const x2 = read()
        const y2 = read()
        const x = read()
        const y = read()
        const ax1 = rel ? cx + x1 : x1
        const ay1 = rel ? cy + y1 : y1
        const ax2 = rel ? cx + x2 : x2
        const ay2 = rel ? cy + y2 : y2
        const nx = rel ? cx + x : x
        const ny = rel ? cy + y : y
        include(ax1, ay1)
        include(ax2, ay2)
        include(nx, ny)
        prevCx = ax2
        prevCy = ay2
        cx = nx
        cy = ny
      }
      prevCmd = base
      continue
    }

    if (base === 'S') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const x2 = read()
        const y2 = read()
        const x = read()
        const y = read()
        const ax1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cx - prevCx : cx
        const ay1 = prevCmd === 'C' || prevCmd === 'S' ? 2 * cy - prevCy : cy
        const ax2 = rel ? cx + x2 : x2
        const ay2 = rel ? cy + y2 : y2
        const nx = rel ? cx + x : x
        const ny = rel ? cy + y : y
        include(ax1, ay1)
        include(ax2, ay2)
        include(nx, ny)
        prevCx = ax2
        prevCy = ay2
        cx = nx
        cy = ny
        prevCmd = 'S'
      }
      continue
    }

    if (base === 'Q') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        const x1 = read()
        const y1 = read()
        const x = read()
        const y = read()
        const ax1 = rel ? cx + x1 : x1
        const ay1 = rel ? cy + y1 : y1
        const nx = rel ? cx + x : x
        const ny = rel ? cy + y : y
        include(ax1, ay1)
        include(nx, ny)
        prevCx = ax1
        prevCy = ay1
        cx = nx
        cy = ny
      }
      prevCmd = base
      continue
    }

    if (base === 'A') {
      while (i < tokens.length && !isCmd(tokens[i])) {
        read() // rx
        read() // ry
        read() // angle
        read() // large-arc
        read() // sweep
        const x = read()
        const y = read()
        cx = rel ? cx + x : x
        cy = rel ? cy + y : y
        include(cx, cy)
      }
      prevCmd = base
      continue
    }

    // Unknown / stalled — skip one token to avoid infinite loop
    i++
    prevCmd = base
  }

  if (!Number.isFinite(minX) || maxX < minX || maxY < minY) return null
  // Degenerate (hairline) paths still need a selectable box
  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)
  const pad = 4
  return {
    x: minX - pad,
    y: minY - pad,
    width: w + pad * 2,
    height: h + pad * 2,
  }
}

function applyNodeTransformToBounds(node: string, box: BBox): BBox {
  const t = attrOf(node, 'transform')
  if (!t) return box
  const m = t.match(
    /matrix\s*\(\s*([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+)\s*\)/i,
  )
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const c = Number(m[3])
    const d = Number(m[4])
    const e = Number(m[5])
    const f = Number(m[6])
    const corners = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ].map(([x, y]) => [a * x! + c * y! + e, b * x! + d * y! + f] as const)
    const xs = corners.map((p) => p[0])
    const ys = corners.map((p) => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
  }
  const tr = parseTranslate(t)
  if (tr.x === 0 && tr.y === 0) return box
  return { ...box, x: box.x + tr.x, y: box.y + tr.y }
}

function unionBounds(
  boxes: { x: number; y: number; width: number; height: number }[],
): { x: number; y: number; width: number; height: number } | null {
  if (boxes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Split a grouped `svg_graphic` into child graphic layers (one expansion level).
 * Returns null when the element cannot be ungrouped.
 */
export function ungroupSvgGraphic(
  el: SvgGraphicElement,
  artW: number,
  artH: number,
): SvgGraphicElement[] | null {
  if (el.type !== 'svg_graphic' || !el.markup) return null
  const markup = el.markup.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, '').trim()
  const roots = splitTopLevelSvgNodes(markup)
  const seed =
    roots.length === 1 && tagNameOf(roots[0]!) === 'g'
      ? expandGroupNode(roots[0]!, 1)
      : roots.length > 1
        ? roots
        : tagNameOf(markup) === 'g'
          ? expandGroupNode(markup, 1)
          : null
  if (!seed || seed.length < 2) return null

  return seed.map((raw, i) => {
    const tag = tagNameOf(raw)
    const bounds = estimateNodeBounds(raw, artW, artH)
    return createSvgGraphicElement({
      name: layerName(tag, raw, i + 1),
      kind: kindForTag(tag),
      markup: sanitizeSvgFragment(raw),
      viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
      fill: attrOf(raw, 'fill') ?? el.fill,
      stroke: attrOf(raw, 'stroke') ?? el.stroke,
      strokeWidth: Number(attrOf(raw, 'stroke-width') ?? el.strokeWidth ?? 0) || 0,
      opacity: el.opacity,
      locked: false,
      visible: el.visible,
      transform: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    })
  })
}

function wrapFragment(markup: string, defs: string): string {
  const clean = sanitizeSvgFragment(markup)
  if (!defs) return clean
  // Prefix shared defs so fill/clip urls resolve inside the fragment wrapper.
  return `${sanitizeSvgFragment(defs)}${clean}`
}

type ImportCounters = {
  paths: number
  groups: number
  shapes: number
  images: number
  textObjects: number
  layerIndex: number
}

/**
 * Recursively turn SVG nodes into Studio elements with parentId + group.children
 * so the Layers panel can mirror Illustrator’s tree.
 */
function importSvgNodes(
  nodes: string[],
  parentId: string | null,
  ctx: {
    width: number
    height: number
    defs: string
    origin: { x: number; y: number }
    expandGroups: boolean
    depth: number
    suggestedMappings: SvgImportReport['suggestedMappings']
    counters: ImportCounters
  },
): DesignElement[] {
  const out: DesignElement[] = []
  const { width, height, defs, expandGroups, counters } = ctx

  for (const raw of nodes) {
    const tag = tagNameOf(raw)
    if (!tag || SKIP_TAGS.has(tag)) continue
    if (isFullBleedBackgroundRect(raw, width, height) && ctx.depth === 0) continue

    const nodeOrigin = {
      x: ctx.origin.x + parseTranslate(attrOf(raw, 'transform')).x,
      y: ctx.origin.y + parseTranslate(attrOf(raw, 'transform')).y,
    }

    // Nested <g>: keep as a Group folder (Illustrator-style), unless flatten requested.
    if (tag === 'g' && !expandGroups && ctx.depth < 12) {
      const open = raw.match(/^<g\b([^>]*)>/i)
      const inner = open
        ? raw.slice(open[0].length).replace(/<\/g>\s*$/i, '')
        : ''
      const childNodes = splitTopLevelSvgNodes(inner)
      // Pure transform wrapper around a single text → promote text only
      if (childNodes.length === 1 && tagNameOf(childNodes[0]!) === 'text') {
        const texts = extractTextNodes(childNodes[0]!, nodeOrigin)
        for (const t of texts) {
          const el = makeTextElement(t, width, parentId)
          out.push(el)
          counters.textObjects++
          const suggestion = suggestVariable(t.content)
          ctx.suggestedMappings.push({
            elementId: el.id,
            content: t.content,
            suggestedPath: suggestion?.path ?? null,
            suggestedRole: suggestion?.role ?? null,
          })
        }
        continue
      }

      counters.layerIndex++
      counters.groups++
      const groupId = newElementId()
      const bounds = estimateNodeBounds(raw, width, height)
      const group = createGroupElement({
        id: groupId,
        name: layerName('g', raw, counters.layerIndex),
        parentId,
        children: [],
        transform: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      })
      const descendants = importSvgNodes(childNodes, groupId, {
        ...ctx,
        origin: nodeOrigin,
        depth: ctx.depth + 1,
      })
      const directKids = descendants.filter((el) => el.parentId === groupId)
      const childIds = directKids.map((el) => el.id)
      // Prefer union of imported child boxes (path parser) over raw-group estimate
      const childUnion = unionBounds(
        directKids.map((el) => ({
          x: el.transform.x,
          y: el.transform.y,
          width: el.transform.width,
          height: el.transform.height,
        })),
      )
      const box = childUnion ?? bounds
      out.push(
        {
          ...group,
          children: childIds,
          transform: {
            ...group.transform,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
        } satisfies GroupElement,
        ...descendants,
      )
      continue
    }

    // Flatten mode: explode groups into leaves under the same parent
    if (tag === 'g' && expandGroups) {
      out.push(
        ...importSvgNodes(expandGroupNode(raw, 2), parentId, {
          ...ctx,
          origin: nodeOrigin,
          depth: ctx.depth + 1,
        }),
      )
      continue
    }

    if (tag === 'text' || tag === 'tspan') {
      const texts = extractTextNodes(raw.includes('<text') ? raw : `<g>${raw}</g>`, ctx.origin)
      for (const t of texts) {
        const el = makeTextElement(t, width, parentId)
        out.push(el)
        counters.textObjects++
        const suggestion = suggestVariable(t.content)
        ctx.suggestedMappings.push({
          elementId: el.id,
          content: t.content,
          suggestedPath: suggestion?.path ?? null,
          suggestedRole: suggestion?.role ?? null,
        })
      }
      continue
    }

    // Mixed node that still contains text: promote text, keep remaining ink
    if (markupContainsText(raw)) {
      const texts = extractTextNodes(raw, nodeOrigin)
      for (const t of texts) {
        const el = makeTextElement(t, width, parentId)
        out.push(el)
        counters.textObjects++
        const suggestion = suggestVariable(t.content)
        ctx.suggestedMappings.push({
          elementId: el.id,
          content: t.content,
          suggestedPath: suggestion?.path ?? null,
          suggestedRole: suggestion?.role ?? null,
        })
      }
      const withoutText = stripTextNodes(raw).replace(/<g\b[^>]*>\s*<\/g>/gi, '').trim()
      if (!withoutText || !/<[a-zA-Z]/.test(withoutText)) continue
      // Continue with stripped markup as a graphic under same parent
      out.push(
        ...importSvgNodes([withoutText], parentId, {
          ...ctx,
          depth: ctx.depth + 1,
        }),
      )
      continue
    }

    counters.layerIndex++
    const kind = kindForTag(tag)
    if (kind === 'path') counters.paths++
    else if (kind === 'group') counters.groups++
    else if (kind === 'shape') counters.shapes++
    else if (kind === 'image') counters.images++

    const bounds = estimateNodeBounds(raw, width, height)
    const layerViewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`
    out.push(
      createSvgGraphicElement({
        name: layerName(tag, raw, counters.layerIndex),
        kind,
        parentId,
        markup: wrapFragment(raw, defs),
        viewBox: layerViewBox,
        fill: attrOf(raw, 'fill'),
        stroke: attrOf(raw, 'stroke'),
        strokeWidth: Number(attrOf(raw, 'stroke-width') ?? 0) || 0,
        transform: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      }),
    )
  }

  return out
}

function importLayered(options: {
  svg: string
  name?: string
  assetUrl: string
  assetId?: string
  assetVersion?: number
  /** When true, explode &lt;g&gt; into flat leaves (legacy). Default false = keep Illustrator tree. */
  expandGroups?: boolean
}): SvgImportReport {
  const { width, height } = readViewBox(options.svg)
  const expandGroups = options.expandGroups ?? false
  const doc = createBlankDocument({
    name: options.name ?? 'Imported artwork',
    presetKey: 'digital_1080_1350',
  })
  doc.meta.importedFrom = 'svg'
  doc.meta.importMode = 'layered'
  const page = doc.pages[0]
  page.width = width
  page.height = height
  page.name = 'Invitation'

  const inner = extractSvgInner(options.svg)
  const defs = extractDefs(inner)
  const topNodes = splitTopLevelSvgNodes(inner)
  const pageFill = guessPageFill(topNodes, width, height)
  page.background = pageFill ?? '#ffffff'

  const artboard = solidBackgroundElement(width, height, pageFill)
  const suggestedMappings: SvgImportReport['suggestedMappings'] = []
  const counters: ImportCounters = {
    paths: 0,
    groups: 0,
    shapes: 0,
    images: 0,
    textObjects: 0,
    layerIndex: 0,
  }

  const imported = importSvgNodes(topNodes, null, {
    width,
    height,
    defs,
    origin: { x: 0, y: 0 },
    expandGroups,
    depth: 0,
    suggestedMappings,
    counters,
  })

  page.elements = [artboard, ...imported]
  const graphicLayers = imported.filter((e) => e.type === 'svg_graphic').length
  const groupLayers = imported.filter((e) => e.type === 'group').length

  return {
    document: doc,
    mode: 'layered',
    imported: {
      paths: counters.paths || countTags(options.svg, 'path'),
      groups: counters.groups || groupLayers,
      shapes: counters.shapes,
      textObjects: counters.textObjects,
      images: counters.images || countTags(options.svg, 'image'),
      layers: graphicLayers + counters.textObjects + groupLayers,
      unsupported: detectUnsupported(options.svg),
    },
    suggestedMappings,
  }
}

function importPlatePlusText(options: {
  svg: string
  name?: string
  assetUrl: string
  assetId?: string
  assetVersion?: number
}): SvgImportReport {
  const { width, height } = readViewBox(options.svg)
  const doc = createBlankDocument({
    name: options.name ?? 'Imported artwork',
    presetKey: 'digital_1080_1350',
  })
  doc.meta.importedFrom = 'svg'
  doc.meta.importMode = 'plate_plus_text'
  const page = doc.pages[0]
  page.width = width
  page.height = height
  page.name = 'Invitation'
  page.elements = [
    plateBackgroundElement(width, height, {
      assetUrl: options.assetUrl,
      assetId: options.assetId,
      assetVersion: options.assetVersion,
    }),
  ]

  const texts = extractTextNodes(options.svg)
  const suggestedMappings: SvgImportReport['suggestedMappings'] = []
  for (const t of texts) {
    const el = makeTextElement(t, width)
    page.elements.push(el)
    const suggestion = suggestVariable(t.content)
    suggestedMappings.push({
      elementId: el.id,
      content: t.content,
      suggestedPath: suggestion?.path ?? null,
      suggestedRole: suggestion?.role ?? null,
    })
  }

  return {
    document: doc,
    mode: 'plate_plus_text',
    imported: {
      paths: countTags(options.svg, 'path'),
      groups: countTags(options.svg, 'g'),
      shapes: 0,
      textObjects: texts.length,
      images: countTags(options.svg, 'image'),
      layers: texts.length + 1,
      unsupported: detectUnsupported(options.svg),
    },
    suggestedMappings,
  }
}

/**
 * Analyze an SVG string and produce a Design Document.
 *
 * Default `layered`: each top-level path/group/shape becomes an editable
 * `svg_graphic` layer (plus extracted top-level text). No flattened plate —
 * avoids duplicating artwork under the layers.
 *
 * `plate_plus_text`: legacy mode — locked full-SVG plate + text overlays.
 */
export function importSvgArtwork(options: {
  svg: string
  name?: string
  assetUrl: string
  assetId?: string
  assetVersion?: number
  mode?: SvgImportMode
  /** When layered, expand nested `<g>` into separate layers (default true). */
  expandGroups?: boolean
}): SvgImportReport {
  const mode = options.mode ?? 'layered'
  if (mode === 'plate_plus_text') {
    return importPlatePlusText(options)
  }
  return importLayered(options)
}

/** PNG/JPEG upload: base plate only, no text extraction. */
export function importRasterArtwork(options: {
  name?: string
  assetUrl: string
  assetId?: string
  assetVersion?: number
  width?: number
  height?: number
}): { document: DesignDocument } {
  const width = options.width ?? 1080
  const height = options.height ?? 1350
  const doc = createBlankDocument({ name: options.name ?? 'Imported artwork' })
  doc.meta.importedFrom = 'png'
  const page = doc.pages[0]
  page.width = width
  page.height = height
  page.elements = [
    plateBackgroundElement(width, height, {
      assetUrl: options.assetUrl,
      assetId: options.assetId,
      assetVersion: options.assetVersion,
    }),
  ]
  return { document: doc }
}
