import type { CornerRadii, DesignEffect, StrokeAlign } from './schema'

/** SVG filter markup for the first visible drop/inner shadow (+ optional blur). */
export function effectsFilterMarkup(filterId: string, effects: DesignEffect[]): string {
  const visible = effects.filter((e) => e.visible)
  if (visible.length === 0) return ''

  const parts: string[] = []
  let input = 'SourceGraphic'
  visible.forEach((fx, i) => {
    const result = `fx${i}`
    if (fx.type === 'drop_shadow' || fx.type === 'inner_shadow') {
      const flood = hexToRgb(fx.color)
      parts.push(
        `<feDropShadow in="${input}" dx="${fx.offsetX}" dy="${fx.offsetY}" stdDeviation="${fx.blur / 2}" flood-color="rgb(${flood.r},${flood.g},${flood.b})" flood-opacity="${fx.opacity}" result="${result}"/>`,
      )
      input = result
    } else if (fx.type === 'layer_blur') {
      parts.push(
        `<feGaussianBlur in="${input}" stdDeviation="${fx.blur / 2}" result="${result}"/>`,
      )
      input = result
    }
  })
  if (parts.length === 0) return ''
  return `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%">${parts.join('')}</filter>`
}

export function strokeWidthForAlign(width: number, align: StrokeAlign | undefined): number {
  if (!width) return 0
  // SVG strokes are centered; approximate inside/outside by doubling + clip.
  if (align === 'inside' || align === 'outside') return width * 2
  return width
}

export function cornerRadiusValue(
  cornerRadius: number | undefined,
  cornerRadii: CornerRadii | undefined,
): number {
  if (cornerRadii) {
    return Math.max(cornerRadii.tl, cornerRadii.tr, cornerRadii.br, cornerRadii.bl)
  }
  return cornerRadius ?? 0
}

/** Path for a rect with independent corner radii. */
export function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radii: CornerRadii | number,
): string {
  const r =
    typeof radii === 'number'
      ? { tl: radii, tr: radii, br: radii, bl: radii }
      : radii
  const tl = Math.min(r.tl, w / 2, h / 2)
  const tr = Math.min(r.tr, w / 2, h / 2)
  const br = Math.min(r.br, w / 2, h / 2)
  const bl = Math.min(r.bl, w / 2, h / 2)
  return [
    `M ${x + tl} ${y}`,
    `H ${x + w - tr}`,
    tr ? `A ${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : `L ${x + w} ${y}`,
    `V ${y + h - br}`,
    br ? `A ${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : `L ${x + w} ${y + h}`,
    `H ${x + bl}`,
    bl ? `A ${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : `L ${x} ${y + h}`,
    `V ${y + tl}`,
    tl ? `A ${tl} ${tl} 0 0 1 ${x + tl} ${y}` : `L ${x} ${y}`,
    'Z',
  ].join(' ')
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = hex.replace('#', '')
  const full =
    n.length === 3
      ? n
          .split('')
          .map((c) => c + c)
          .join('')
      : n.padEnd(6, '0').slice(0, 6)
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  }
}
