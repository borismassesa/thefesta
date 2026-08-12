/** Named geometric shapes for the Design Studio catalog + renderers. */

export const SHAPE_KINDS = [
  'rect',
  'ellipse',
  'line',
  'triangle',
  'diamond',
  'star',
  'hexagon',
  'pentagon',
  'arrow',
  'cross',
  'arch',
] as const

export type ShapeKind = (typeof SHAPE_KINDS)[number]

/** SVG path in a 0..48 preview square for catalog thumbnails. */
export function shapePreviewPath(kind: ShapeKind): string {
  switch (kind) {
    case 'rect':
      return 'M8 12h32v24H8z'
    case 'ellipse':
      return 'M24 10a14 14 0 1 1 0 28 14 14 0 0 1 0-28z'
    case 'line':
      return 'M6 24h36'
    case 'triangle':
      return 'M24 8 L40 38 H8 Z'
    case 'diamond':
      return 'M24 6 L42 24 L24 42 L6 24 Z'
    case 'star':
      return 'M24 6l4.2 12.8H42l-10.5 7.6 4 12.4L24 31.2 12.5 38.8l4-12.4L6 18.8h13.8z'
    case 'hexagon':
      return 'M16 8h16l10 16-10 16H16L6 24z'
    case 'pentagon':
      return 'M24 6l16 12-6 18H14l-6-18z'
    case 'arrow':
      return 'M8 20h20v-8l12 12-12 12v-8H8z'
    case 'cross':
      return 'M18 8h12v10h10v12H30v10H18V30H8V18h10z'
    case 'arch':
      return 'M8 38 V22 A16 16 0 0 1 40 22 V38 H34 V22 A10 10 0 0 0 14 22 V38z'
  }
}

/** SVG path scaled into the element's transform box. */
export function shapePathInBox(
  kind: ShapeKind,
  x: number,
  y: number,
  width: number,
  height: number,
): string | null {
  if (kind === 'rect' || kind === 'ellipse' || kind === 'line') return null

  const pt = (px: number, py: number) => {
    const sx = x + (px / 48) * width
    const sy = y + (py / 48) * height
    return `${sx} ${sy}`
  }
  const poly = (points: Array<[number, number]>) =>
    `M${points.map(([px, py]) => pt(px, py)).join(' L')} Z`

  switch (kind) {
    case 'triangle':
      return poly([
        [24, 4],
        [44, 44],
        [4, 44],
      ])
    case 'diamond':
      return poly([
        [24, 2],
        [46, 24],
        [24, 46],
        [2, 24],
      ])
    case 'star': {
      const cx = 24
      const cy = 24
      const outer = 20
      const inner = 8
      const points: Array<[number, number]> = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
      }
      return poly(points)
    }
    case 'hexagon':
      return poly([
        [14, 4],
        [34, 4],
        [46, 24],
        [34, 44],
        [14, 44],
        [2, 24],
      ])
    case 'pentagon':
      return poly([
        [24, 4],
        [44, 18],
        [36, 42],
        [12, 42],
        [4, 18],
      ])
    case 'arrow':
      return poly([
        [4, 18],
        [28, 18],
        [28, 8],
        [44, 24],
        [28, 40],
        [28, 30],
        [4, 30],
      ])
    case 'cross':
      return poly([
        [18, 4],
        [30, 4],
        [30, 18],
        [44, 18],
        [44, 30],
        [30, 30],
        [30, 44],
        [18, 44],
        [18, 30],
        [4, 30],
        [4, 18],
        [18, 18],
      ])
    case 'arch': {
      const x0 = x + (8 / 48) * width
      const x1 = x + (40 / 48) * width
      const inset = width * 0.1
      const yBottom = y + (44 / 48) * height
      const yTop = y + (22 / 48) * height
      const rOuter = (x1 - x0) / 2
      const rInner = rOuter - inset
      return [
        `M${x0} ${yBottom}`,
        `V${yTop}`,
        `A${rOuter} ${rOuter} 0 0 1 ${x1} ${yTop}`,
        `V${yBottom}`,
        `H${x1 - inset}`,
        `V${yTop}`,
        `A${rInner} ${rInner} 0 0 0 ${x0 + inset} ${yTop}`,
        `V${yBottom}`,
        'Z',
      ].join(' ')
    }
  }
}
