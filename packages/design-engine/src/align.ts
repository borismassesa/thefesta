import type { DesignElement, DesignTransform } from './schema'

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export type AlignBounds = {
  x: number
  y: number
  width: number
  height: number
}

/** Print-safe margin for invitation / social cards (~0.5" at 96dpi). */
export const ARTBOARD_SAFE_INSET = 48

function isAlignable(el: DesignElement): boolean {
  return el.visible && !el.locked && el.type !== 'artboard_background'
}

/** Bounding box of visible, unlocked content (excludes artboard background). */
export function selectionBounds(elements: DesignElement[]): AlignBounds | null {
  const usable = elements.filter(isAlignable)
  if (usable.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of usable) {
    const t = el.transform
    minX = Math.min(minX, t.x)
    minY = Math.min(minY, t.y)
    maxX = Math.max(maxX, t.x + t.width)
    maxY = Math.max(maxY, t.y + t.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Compute next transform for aligning an element inside a target box.
 * Figma/Canva: single objects align to their parent frame; groups align to selection bounds.
 */
export function alignTransformInBounds(
  transform: DesignTransform,
  mode: AlignMode,
  bounds: AlignBounds,
  inset = 0,
): DesignTransform {
  const inner = {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: Math.max(0, bounds.width - inset * 2),
    height: Math.max(0, bounds.height - inset * 2),
  }
  let x = transform.x
  let y = transform.y
  switch (mode) {
    case 'left':
      x = inner.x
      break
    case 'center':
      x = inner.x + (inner.width - transform.width) / 2
      break
    case 'right':
      x = inner.x + inner.width - transform.width
      break
    case 'top':
      y = inner.y
      break
    case 'middle':
      y = inner.y + (inner.height - transform.height) / 2
      break
    case 'bottom':
      y = inner.y + inner.height - transform.height
      break
  }
  return { ...transform, x, y }
}

/** Align many elements; each moves independently into `bounds`. */
export function alignElementsToBounds(
  elements: DesignElement[],
  mode: AlignMode,
  bounds: AlignBounds,
  inset = 0,
): DesignElement[] {
  const ids = new Set(elements.filter(isAlignable).map((el) => el.id))
  return elements.map((el) => {
    if (!ids.has(el.id)) return el
    return {
      ...el,
      transform: alignTransformInBounds(el.transform, mode, bounds, inset),
    }
  })
}

/**
 * When changing card/frame size, keep content optically centered (Canva-like)
 * instead of leaving everything stuck to the top-left.
 */
export function recenterContentAfterResize(
  elements: DesignElement[],
  prev: { width: number; height: number },
  next: { width: number; height: number },
): DesignElement[] {
  const dx = (next.width - prev.width) / 2
  const dy = (next.height - prev.height) / 2
  if (dx === 0 && dy === 0) return elements
  return elements.map((el) => {
    if (el.type === 'artboard_background') {
      return {
        ...el,
        transform: {
          ...el.transform,
          x: 0,
          y: 0,
          width: next.width,
          height: next.height,
        },
      }
    }
    return {
      ...el,
      transform: {
        ...el.transform,
        x: el.transform.x + dx,
        y: el.transform.y + dy,
      },
    }
  })
}
