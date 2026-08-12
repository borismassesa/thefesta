/** Curated card elements for the Studio Add rail (not a generic icon pack). */

import { shapePreviewPath, type ShapeKind } from './shape-geometry'

export type CatalogCategory = 'Shapes' | 'Frames' | 'Dividers' | 'Ornaments' | 'Credentials'

export type CatalogElement = {
  key: string
  name: string
  category: CatalogCategory
  description: string
  /** Simple preview path in 48 viewBox */
  previewPath: string
  action:
    | {
        type: 'shape'
        shape: ShapeKind
        fill?: string
        cornerRadius?: number
        stroke?: string
        strokeWidth?: number
      }
    | { type: 'qr' }
    | { type: 'frame'; variant: 'rounded' | 'circle' | 'soft' | 'polaroid' | 'arch' }
    | { type: 'divider'; variant: 'thin' | 'ornament' | 'double' | 'dots' | 'diamonds' | 'flourish' }
    | { type: 'icon'; iconKey: string; fill?: string }
}

const shapeItem = (
  shape: ShapeKind,
  name: string,
  fill = '#c4a484',
  extra?: Partial<Extract<CatalogElement['action'], { type: 'shape' }>>,
): CatalogElement => ({
  key: shape,
  name,
  category: 'Shapes',
  description: name,
  previewPath: shapePreviewPath(shape),
  action: { type: 'shape', shape, fill, ...extra },
})

export const ELEMENTS_CATALOG: CatalogElement[] = [
  // —— Shapes ——
  shapeItem('rect', 'Rectangle'),
  {
    key: 'rounded_rect',
    name: 'Rounded',
    category: 'Shapes',
    description: 'Rounded rectangle',
    previewPath: 'M10 14h28a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z',
    action: { type: 'shape', shape: 'rect', fill: '#c4a484', cornerRadius: 24 },
  },
  {
    key: 'pill',
    name: 'Pill',
    category: 'Shapes',
    description: 'Capsule / pill',
    previewPath: 'M12 16h24a8 8 0 0 1 0 16H12a8 8 0 0 1 0-16z',
    action: { type: 'shape', shape: 'rect', fill: '#e8c4c4', cornerRadius: 999 },
  },
  shapeItem('ellipse', 'Ellipse', '#e8c4c4'),
  shapeItem('triangle', 'Triangle', '#d4b896'),
  shapeItem('diamond', 'Diamond', '#c4a484'),
  shapeItem('star', 'Star', '#d4af37'),
  shapeItem('hexagon', 'Hexagon', '#b08968'),
  shapeItem('pentagon', 'Pentagon', '#c4a484'),
  shapeItem('arrow', 'Arrow', '#7E5896'),
  shapeItem('cross', 'Cross block', '#8b6f47'),
  shapeItem('arch', 'Arch', '#c4a484'),
  shapeItem('line', 'Line', '#1a1a1a'),
  {
    key: 'outline_rect',
    name: 'Outline box',
    category: 'Shapes',
    description: 'Hollow rectangle',
    previewPath: 'M10 12h28v24H10z',
    action: {
      type: 'shape',
      shape: 'rect',
      fill: 'transparent',
      stroke: '#1a1a1a',
      strokeWidth: 3,
      cornerRadius: 8,
    },
  },
  {
    key: 'outline_circle',
    name: 'Outline circle',
    category: 'Shapes',
    description: 'Hollow ellipse',
    previewPath: 'M24 10a14 14 0 1 1 0 28 14 14 0 0 1 0-28z',
    action: {
      type: 'shape',
      shape: 'ellipse',
      fill: 'transparent',
      stroke: '#1a1a1a',
      strokeWidth: 3,
    },
  },

  // —— Frames ——
  {
    key: 'frame_rounded',
    name: 'Photo frame',
    category: 'Frames',
    description: 'Rounded photo frame',
    previewPath: 'M8 10h32a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4zm4 6h24v16H12z',
    action: { type: 'frame', variant: 'rounded' },
  },
  {
    key: 'frame_circle',
    name: 'Circle frame',
    category: 'Frames',
    description: 'Circular crop frame',
    previewPath: 'M24 6a18 18 0 1 1 0 36 18 18 0 0 1 0-36zm0 6a12 12 0 1 0 0 24 12 12 0 0 0 0-24z',
    action: { type: 'frame', variant: 'circle' },
  },
  {
    key: 'frame_soft',
    name: 'Soft square',
    category: 'Frames',
    description: 'Soft-corner photo',
    previewPath: 'M10 10h28a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z',
    action: { type: 'frame', variant: 'soft' },
  },
  {
    key: 'frame_polaroid',
    name: 'Polaroid',
    category: 'Frames',
    description: 'Polaroid-style frame',
    previewPath: 'M10 6h28v36H10zM14 10h20v22H14z',
    action: { type: 'frame', variant: 'polaroid' },
  },
  {
    key: 'frame_arch',
    name: 'Arch frame',
    category: 'Frames',
    description: 'Arched photo window',
    previewPath: 'M10 40V22A14 14 0 0 1 38 22V40H10zm6-4h16V22a8 8 0 0 0-16 0V36z',
    action: { type: 'frame', variant: 'arch' },
  },

  // —— Dividers ——
  {
    key: 'divider_thin',
    name: 'Thin divider',
    category: 'Dividers',
    description: 'Subtle separator',
    previewPath: 'M4 24h40',
    action: { type: 'divider', variant: 'thin' },
  },
  {
    key: 'divider_double',
    name: 'Double line',
    category: 'Dividers',
    description: 'Classic double rule',
    previewPath: 'M4 20h40M4 28h40',
    action: { type: 'divider', variant: 'double' },
  },
  {
    key: 'divider_ornament',
    name: 'Ornament',
    category: 'Dividers',
    description: 'Decorative flourish',
    previewPath: 'M4 24h12l4-4 4 8 4-8 4 4h12',
    action: { type: 'divider', variant: 'ornament' },
  },
  {
    key: 'divider_dots',
    name: 'Dot rule',
    category: 'Dividers',
    description: 'Dotted separator',
    previewPath: 'M6 24h2M14 24h2M22 24h2M30 24h2M38 24h2',
    action: { type: 'divider', variant: 'dots' },
  },
  {
    key: 'divider_diamonds',
    name: 'Diamond rule',
    category: 'Dividers',
    description: 'Diamond separators',
    previewPath: 'M4 24h10M18 24l6-6 6 6-6 6-6-6zM34 24h10',
    action: { type: 'divider', variant: 'diamonds' },
  },
  {
    key: 'divider_flourish',
    name: 'Flourish',
    category: 'Dividers',
    description: 'Side flourish divider',
    previewPath: 'M4 24c8-8 12 8 20 0s12 8 20 0',
    action: { type: 'divider', variant: 'flourish' },
  },

  // —— Ornaments (icon library) ——
  {
    key: 'orn_heart',
    name: 'Heart',
    category: 'Ornaments',
    description: 'Love motif',
    previewPath: 'M24 40s-12-8-16-15C4 18 6 12 12 10c4-1 8 1 12 6 4-5 8-7 12-6 6 2 8 8 4 15-4 7-16 15-16 15z',
    action: { type: 'icon', iconKey: 'heart', fill: '#c45c6a' },
  },
  {
    key: 'orn_rings',
    name: 'Rings',
    category: 'Ornaments',
    description: 'Wedding rings',
    previewPath: 'M16 24a8 8 0 1 1 0.01 0zM32 24a8 8 0 1 1 0.01 0z',
    action: { type: 'icon', iconKey: 'rings', fill: '#d4af37' },
  },
  {
    key: 'orn_floral',
    name: 'Floral corner',
    category: 'Ornaments',
    description: 'Corner flourish',
    previewPath: 'M8 40c4-12 12-20 24-24-4 12-12 20-24 24zm16-28c4 0 8 4 8 8-6 0-8-4-8-8zm-12 12c0-4 4-8 8-8 0 6-4 8-8 8z',
    action: { type: 'icon', iconKey: 'floral_corner', fill: '#c4a484' },
  },
  {
    key: 'orn_rose',
    name: 'Rose',
    category: 'Ornaments',
    description: 'Rose motif',
    previewPath: 'M24 8c4 4 6 8 6 12 4 0 8 2 10 6-4 2-6 6-6 10 0 6-4 10-10 10s-10-4-10-10c0-4-2-8-6-10 2-4 6-6 10-6 0-4 2-8 6-12z',
    action: { type: 'icon', iconKey: 'rose', fill: '#c45c6a' },
  },
  {
    key: 'orn_leaf',
    name: 'Leaf',
    category: 'Ornaments',
    description: 'Botanical leaf',
    previewPath: 'M24 6c12 4 18 14 18 24-10 0-20-6-24-18 4 0 6-2 6-6z',
    action: { type: 'icon', iconKey: 'leaf', fill: '#6b8f71' },
  },
  {
    key: 'orn_olive',
    name: 'Olive branch',
    category: 'Ornaments',
    description: 'Olive branch',
    previewPath: 'M6 40c12-4 20-12 24-24 2 8 6 14 12 18-8 2-16 4-24 2-4 2-8 4-12 4z',
    action: { type: 'icon', iconKey: 'olive_branch', fill: '#6b8f71' },
  },
  {
    key: 'orn_star',
    name: 'Star ornament',
    category: 'Ornaments',
    description: 'Decorative star',
    previewPath: 'M24 6l4.5 13H42l-11 8 4.2 13L24 32l-11.2 8L17 27 6 19h13.5z',
    action: { type: 'icon', iconKey: 'star_ornament', fill: '#d4af37' },
  },
  {
    key: 'orn_geometric',
    name: 'Geometric',
    category: 'Ornaments',
    description: 'Geometric motif',
    previewPath: 'M24 4l8 14H16zM24 44l-8-14h16zM4 24l14-8v16zM44 24l-14 8V16z',
    action: { type: 'icon', iconKey: 'african_pattern', fill: '#7E5896' },
  },
  {
    key: 'orn_banner',
    name: 'Ribbon',
    category: 'Ornaments',
    description: 'Ribbon banner',
    previewPath: 'M4 16h28l8 8-8 8H4l6-8-6-8zm36 0v16l8-8-8-8z',
    action: { type: 'icon', iconKey: 'banner', fill: '#c4a484' },
  },
  {
    key: 'orn_monogram',
    name: 'Monogram circle',
    category: 'Ornaments',
    description: 'Monogram ring',
    previewPath: 'M24 6a18 18 0 1 1 0 36 18 18 0 0 1 0-36zm0 6a12 12 0 1 0 0 24 12 12 0 0 0 0-24z',
    action: { type: 'icon', iconKey: 'monogram_circle', fill: '#d4af37' },
  },
  {
    key: 'orn_cross',
    name: 'Faith cross',
    category: 'Ornaments',
    description: 'Cross motif',
    previewPath: 'M20 6h8v10h10v8H28v18h-8V24H10v-8h10z',
    action: { type: 'icon', iconKey: 'cross', fill: '#8b6f47' },
  },
  {
    key: 'orn_crescent',
    name: 'Crescent',
    category: 'Ornaments',
    description: 'Crescent motif',
    previewPath: 'M24 6a18 18 0 1 0 17 24 14 14 0 1 1-17-24z',
    action: { type: 'icon', iconKey: 'crescent', fill: '#d4af37' },
  },
  {
    key: 'orn_dove',
    name: 'Dove',
    category: 'Ornaments',
    description: 'Dove motif',
    previewPath: 'M8 28c6-2 10-8 12-16 4 6 10 10 18 12-8 2-14 6-18 14-2-4-6-8-12-10z',
    action: { type: 'icon', iconKey: 'dove', fill: '#8a9bb5' },
  },
  {
    key: 'orn_sparkle',
    name: 'Sparkle',
    category: 'Ornaments',
    description: 'Sparkle burst',
    previewPath: 'M24 4l3 14 14 3-14 3-3 14-3-14-14-3 14-3z',
    action: { type: 'icon', iconKey: 'sparkle', fill: '#d4af37' },
  },
  {
    key: 'orn_lotus',
    name: 'Lotus',
    category: 'Ornaments',
    description: 'Lotus bloom',
    previewPath: 'M24 40c-8-4-14-12-14-20 4 2 8 2 14 0 6 2 10 2 14 0 0 8-6 16-14 20zm0-22c-4-8-2-14 0-16 2 2 4 8 0 16z',
    action: { type: 'icon', iconKey: 'lotus', fill: '#c45c6a' },
  },

  // —— Credentials ——
  {
    key: 'qr',
    name: 'Entrance QR',
    category: 'Credentials',
    description: 'Guest admission QR',
    previewPath: 'M8 8h12v12H8zm20 0h12v12H28zM8 28h12v12H8zm20 4h4v4h-4zm8 0h4v8h-8v-4h4z',
    action: { type: 'qr' },
  },
  {
    key: 'qr_frame',
    name: 'QR frame mark',
    category: 'Credentials',
    description: 'QR corner marks',
    previewPath: 'M8 8h12v12H8zm20 0h12v12H28zM8 28h12v12H8zm16 4h4v4h-4zm8 0h8v8h-8z',
    action: { type: 'icon', iconKey: 'qr_frame', fill: '#1a1a1a' },
  },
  {
    key: 'seal',
    name: 'Wax seal',
    category: 'Credentials',
    description: 'Seal / stamp motif',
    previewPath: 'M24 8a16 16 0 1 1 0 32 16 16 0 0 1 0-32zm0 6a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
    action: { type: 'icon', iconKey: 'seal', fill: '#8b3a3a' },
  },
]

export const TEXT_PRESETS = [
  {
    key: 'heading',
    label: 'Couple heading',
    role: 'heading' as const,
    content: 'Moses & Dayness',
    fontSize: 64,
    fontWeight: 600,
    height: 100,
  },
  {
    key: 'subhead',
    label: 'Script line',
    role: 'subhead' as const,
    content: 'Together with their families',
    fontSize: 28,
    fontWeight: 400,
    height: 48,
  },
  {
    key: 'body',
    label: 'Body / venue',
    role: 'body' as const,
    content: 'Sala Sala · 08 August 2026',
    fontSize: 26,
    fontWeight: 400,
    height: 56,
  },
  {
    key: 'caption',
    label: 'Caption',
    role: 'caption' as const,
    content: 'Reception to follow',
    fontSize: 18,
    fontWeight: 400,
    height: 36,
  },
  {
    key: 'date',
    label: 'Date line',
    role: 'body' as const,
    content: 'Saturday, 08 August 2026',
    fontSize: 22,
    fontWeight: 500,
    height: 40,
  },
  {
    key: 'monogram',
    label: 'Monogram',
    role: 'heading' as const,
    content: 'M  ·  D',
    fontSize: 48,
    fontWeight: 500,
    height: 64,
  },
]

/** Static invitation copy snippets — not data bindings (those live in Data). */
export const TEXT_PHRASES = [
  { key: 'save_the_date', label: 'Save the date', content: 'Save the Date' },
  { key: 'request', label: 'Request the pleasure', content: 'Request the pleasure of your company' },
  { key: 'celebrate', label: 'Join us', content: 'Join us as we celebrate' },
  { key: 'reception', label: 'Reception', content: 'Reception to follow' },
  { key: 'dress', label: 'Dress code', content: 'Dress code · Formal' },
  { key: 'rsvp_line', label: 'RSVP line', content: 'Kindly RSVP by 15 July' },
]
