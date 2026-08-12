import type { RenderPlan } from './compile'
import type { PersonalizedPlan, PersonalizedElement } from './personalize'
import { getIcon, iconSvgMarkup } from './icons'
import { personalizePlan } from './personalize'
import type { CornerRadii, DesignEffect, StrokeAlign } from './schema'
import { shapePathInBox, type ShapeKind } from './shape-geometry'
import { effectsFilterMarkup, roundedRectPath, strokeWidthForAlign } from './visual-style'
import { sanitizeSvgFragment } from './svg-import'

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function transformAttr(el: PersonalizedElement): string {
  const { x, y, width, height, rotation } = el.transform
  const cx = x + width / 2
  const cy = y + height / 2
  if (!rotation) return ''
  return ` transform="rotate(${rotation} ${cx} ${cy})"`
}

function renderElement(el: PersonalizedElement): string {
  if (!el.visible || el.hiddenByRule) return ''
  const t = el.transform
  const opacity = el.opacity
  const rot = transformAttr(el)

  switch (el.type) {
    case 'artboard_background': {
      const fill = (el.props.fill as string | null) ?? null
      const src = el.props.src as string | null | undefined
      if (src) {
        return `<image href="${esc(src)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"${rot}/>`
      }
      if (fill) {
        return `<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" fill="${esc(fill)}" opacity="${opacity}"${rot}/>`
      }
      return ''
    }
    case 'shape': {
      const shape = el.props.shape as ShapeKind
      const fill = esc(String(el.props.fill ?? '#ccc'))
      const stroke = el.props.stroke ? esc(String(el.props.stroke)) : 'none'
      const strokeAlign = el.props.strokeAlign as StrokeAlign | undefined
      const strokeWidth = strokeWidthForAlign(Number(el.props.strokeWidth ?? 0), strokeAlign)
      const effects = (el.props.effects as DesignEffect[] | undefined) ?? []
      const filterId = `f_${el.id}`
      const filter = effectsFilterMarkup(filterId, effects)
      const filterAttr = filter ? ` filter="url(#${filterId})"` : ''
      const defs = filter ? `<defs>${filter}</defs>` : ''
      if (shape === 'ellipse') {
        return `${defs}<ellipse cx="${t.x + t.width / 2}" cy="${t.y + t.height / 2}" rx="${t.width / 2}" ry="${t.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${filterAttr}${rot}/>`
      }
      if (shape === 'line') {
        return `${defs}<line x1="${t.x}" y1="${t.y + t.height / 2}" x2="${t.x + t.width}" y2="${t.y + t.height / 2}" stroke="${stroke === 'none' ? fill : stroke}" stroke-width="${Math.max(Number(el.props.strokeWidth ?? 0), t.height || 2)}" opacity="${opacity}"${filterAttr}${rot}/>`
      }
      const path = shapePathInBox(shape, t.x, t.y, t.width, t.height)
      if (path) {
        return `${defs}<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${filterAttr}${rot}/>`
      }
      const radii = el.props.cornerRadii as CornerRadii | undefined
      if (radii) {
        return `${defs}<path d="${roundedRectPath(t.x, t.y, t.width, t.height, radii)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${filterAttr}${rot}/>`
      }
      const r = Number(el.props.cornerRadius ?? 0)
      return `${defs}<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${filterAttr}${rot}/>`
    }
    case 'text': {
      const typography = el.props.typography as {
        fontFamily: string
        fontWeight: number
        fontSize: number
        letterSpacing: number
        textAlign: string
        color: string
        italic?: boolean
        uppercase?: boolean
      }
      const fontSize = el.resolvedFontSize ?? typography.fontSize
      const lines = el.resolvedLines ?? [el.resolvedContent ?? String(el.props.content ?? '')]
      const anchor =
        typography.textAlign === 'center'
          ? 'middle'
          : typography.textAlign === 'right'
            ? 'end'
            : 'start'
      const tx =
        typography.textAlign === 'center'
          ? t.x + t.width / 2
          : typography.textAlign === 'right'
            ? t.x + t.width
            : t.x
      const lineHeight = fontSize * ((el.props.typography as { lineHeight: number }).lineHeight ?? 1.2)
      const startY = t.y + fontSize
      const tspans = lines
        .map((line, i) => {
          const text = typography.uppercase ? line.toUpperCase() : line
          return `<tspan x="${tx}" dy="${i === 0 ? 0 : lineHeight}">${esc(text)}</tspan>`
        })
        .join('')
      return `<text x="${tx}" y="${startY}" font-family="${esc(typography.fontFamily)}" font-size="${fontSize}" font-weight="${typography.fontWeight}" fill="${esc(typography.color)}" letter-spacing="${typography.letterSpacing}" text-anchor="${anchor}" font-style="${typography.italic ? 'italic' : 'normal'}" opacity="${opacity}"${rot}>${tspans}</text>`
    }
    case 'image': {
      const src = el.props.src as string | null | undefined
      if (!src) return ''
      const r = Number(el.props.cornerRadius ?? 0)
      if (r > 0) {
        const clipId = `clip_${el.id}`
        return `<defs><clipPath id="${clipId}"><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="${r}"/></clipPath></defs><image href="${esc(src)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"${rot}/>`
      }
      return `<image href="${esc(src)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="xMidYMid slice" opacity="${opacity}"${rot}/>`
    }
    case 'icon': {
      const iconKey = String(el.props.iconKey ?? '')
      const fill = esc(String(el.props.fill ?? '#1a1a1a'))
      const icon = getIcon(iconKey)
      if (!icon) {
        return `<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" fill="${fill}" opacity="${opacity * 0.3}"${rot}/>`
      }
      return `<g opacity="${opacity}"${rot} transform="translate(${t.x} ${t.y}) scale(${t.width / 24} ${t.height / 24})">${iconSvgMarkup(icon, fill).replace(/<\/?svg[^>]*>/g, '')}</g>`
    }
    case 'svg_graphic': {
      const markup = el.props.markup as string | null | undefined
      const src = el.props.src as string | null | undefined
      const viewBox = (el.props.viewBox as string | null | undefined) ?? `0 0 ${t.width} ${t.height}`
      if (markup) {
        const safe = sanitizeSvgFragment(markup)
        return `<g opacity="${opacity}"${rot}><svg x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" viewBox="${esc(viewBox)}" overflow="visible">${safe}</svg></g>`
      }
      if (!src) return ''
      return `<image href="${esc(src)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="xMidYMid meet" opacity="${opacity}"${rot}/>`
    }
    case 'qr': {
      // Placeholder plate — production injects a real QR module matrix later.
      const fg = esc(String(el.props.foreground ?? '#000'))
      const bg = esc(String(el.props.background ?? '#fff'))
      const payload = esc(el.resolvedContent ?? String(el.props.previewPayload ?? 'QR'))
      return `<g${rot} opacity="${opacity}"><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" fill="${bg}" stroke="${fg}" stroke-width="2"/><text x="${t.x + t.width / 2}" y="${t.y + t.height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${fg}">QR</text><title>${payload}</title></g>`
    }
    default:
      return ''
  }
}

/** Render first page of a personalized plan to SVG markup. */
export function renderPersonalizedToSvg(plan: PersonalizedPlan, pageIndex = 0): string {
  const page = plan.pages[pageIndex]
  if (!page) {
    throw new Error('No page to render')
  }
  if (plan.blocked) {
    throw new Error(`Render blocked: ${plan.errors.join('; ')}`)
  }

  const body = page.elements.map(renderElement).filter(Boolean).join('\n  ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}">
  <rect width="100%" height="100%" fill="${esc(page.background)}"/>
  ${body}
</svg>`
}

/** Compile + personalize + SVG in one call (preview / test data). */
export function renderDocumentPreviewSvg(
  document: Parameters<typeof personalizePlan>[0],
  data: Record<string, unknown> = {},
): { svg: string; blocked: boolean; errors: string[]; warnings: string[] } {
  const plan = personalizePlan(document, data)
  if (plan.blocked) {
    return { svg: '', blocked: true, errors: plan.errors, warnings: plan.warnings }
  }
  return {
    svg: renderPersonalizedToSvg(plan),
    blocked: false,
    errors: [],
    warnings: plan.warnings,
  }
}

export function renderPlanPreviewSvg(plan: RenderPlan, data: Record<string, unknown> = {}) {
  return renderDocumentPreviewSvg(plan, data)
}
