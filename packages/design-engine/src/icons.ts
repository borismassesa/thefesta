/** Built-in decorative icon catalogue for the Studio left rail. */

export type DesignIcon = {
  key: string
  name: string
  category: string
  tags: string[]
  /** Inline SVG path(s) in a 24 viewBox for preview + canvas. */
  svgPath: string
}

export const DESIGN_ICON_LIBRARY: DesignIcon[] = [
  {
    key: 'heart',
    name: 'Heart',
    category: 'Motifs',
    tags: ['heart', 'love', 'wedding'],
    svgPath:
      'M12 21s-6.7-4.35-9.33-8.1C.8 9.9 1.5 6.4 4.4 5.1 6.5 4.1 8.9 4.7 12 7.1c3.1-2.4 5.5-3 7.6-2 2.9 1.3 3.6 4.8 1.73 7.8C18.7 16.65 12 21 12 21z',
  },
  {
    key: 'rings',
    name: 'Wedding rings',
    category: 'Motifs',
    tags: ['rings', 'wedding', 'gold'],
    svgPath: 'M8 12a4 4 0 1 1 0.01 0zM16 12a4 4 0 1 1 0.01 0zM10.5 10.5a4 4 0 0 0 3 3',
  },
  {
    key: 'floral_corner',
    name: 'Floral corner',
    category: 'Flowers',
    tags: ['floral', 'corner', 'gold', 'flower'],
    svgPath: 'M4 20c2-6 6-10 12-12-2 6-6 10-12 12zm8-14c2 0 4 2 4 4-3 0-4-2-4-4zm-6 6c0-2 2-4 4-4 0 3-2 4-4 4z',
  },
  {
    key: 'divider_ornament',
    name: 'Ornamental divider',
    category: 'Dividers',
    tags: ['divider', 'ornament', 'line'],
    svgPath: 'M2 12h6l2-2 2 4 2-4 2 2h6',
  },
  {
    key: 'cross',
    name: 'Cross',
    category: 'Faith',
    tags: ['christian', 'cross', 'faith'],
    svgPath: 'M10 2h4v6h6v4h-6v10h-4V12H4V8h6V2z',
  },
  {
    key: 'crescent',
    name: 'Crescent',
    category: 'Faith',
    tags: ['islamic', 'crescent', 'faith'],
    svgPath: 'M12 2a10 10 0 1 0 9.5 13A8 8 0 1 1 12 2z',
  },
  {
    key: 'leaf',
    name: 'Leaf',
    category: 'Flowers',
    tags: ['leaf', 'nature', 'green'],
    svgPath: 'M12 3c6 2 9 7 9 12-5 0-10-3-12-9 2 0 3-1 3-3z',
  },
  {
    key: 'frame_corners',
    name: 'Frame corners',
    category: 'Frames',
    tags: ['frame', 'border', 'corners'],
    svgPath: 'M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm18 0v6h-6v-2h4v-4h2z',
  },
  {
    key: 'monogram_circle',
    name: 'Monogram circle',
    category: 'Monograms',
    tags: ['monogram', 'circle'],
    svgPath: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
  },
  {
    key: 'qr_frame',
    name: 'QR frame',
    category: 'Frames',
    tags: ['qr', 'frame', 'pass'],
    svgPath: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm8 2h2v2h-2v-2zm4 0h4v4h-4v-4zm-4 4h2v2h-2v-2z',
  },
  {
    key: 'rose',
    name: 'Rose',
    category: 'Flowers',
    tags: ['rose', 'floral', 'flower', 'gold'],
    svgPath: 'M12 3c2 2 3 4 3 6 2 0 4 1 5 3-2 1-3 3-3 5 0 3-2 5-5 5s-5-2-5-5c0-2-1-4-3-5 1-2 3-3 5-3 0-2 1-4 3-6z',
  },
  {
    key: 'olive_branch',
    name: 'Olive branch',
    category: 'Flowers',
    tags: ['olive', 'branch', 'leaf', 'green'],
    svgPath: 'M3 20c6-2 10-6 12-12 1 4 3 7 6 9-4 1-8 2-12 1-2 1-4 2-6 2z',
  },
  {
    key: 'african_pattern',
    name: 'Geometric motif',
    category: 'Motifs',
    tags: ['african', 'pattern', 'geometric', 'traditional'],
    svgPath: 'M12 2l4 7H8l4-7zm0 20l-4-7h8l-4 7zM2 12l7-4v8l-7-4zm20 0l-7 4V8l7 4z',
  },
  {
    key: 'star_ornament',
    name: 'Star ornament',
    category: 'Motifs',
    tags: ['star', 'ornament', 'gold'],
    svgPath: 'M12 2l2.4 7.2H22l-6 4.4 2.3 7.2L12 16.8 5.7 20.8 8 13.6 2 9.2h7.6z',
  },
  {
    key: 'banner',
    name: 'Ribbon banner',
    category: 'Frames',
    tags: ['banner', 'ribbon', 'frame'],
    svgPath: 'M2 8h16l4 4-4 4H2l3-4-3-4zm18 0v8l4-4-4-4z',
  },
  {
    key: 'dove',
    name: 'Dove',
    category: 'Motifs',
    tags: ['dove', 'peace', 'bird', 'wedding'],
    svgPath: 'M2 14c4-1 7-5 8-10 3 4 7 7 12 8-5 1-9 4-11 9-1-3-4-6-9-7z',
  },
  {
    key: 'sparkle',
    name: 'Sparkle',
    category: 'Motifs',
    tags: ['sparkle', 'star', 'shine', 'gold'],
    svgPath: 'M12 1l1.6 7.4L21 10l-7.4 1.6L12 19l-1.6-7.4L3 10l7.4-1.6L12 1z',
  },
  {
    key: 'lotus',
    name: 'Lotus',
    category: 'Flowers',
    tags: ['lotus', 'flower', 'bloom'],
    svgPath: 'M12 21c-5-2-8-7-8-12 2 1 5 1 8 0 3 1 6 1 8 0 0 5-3 10-8 12zM12 9c-2-5-1-8 0-8s2 3 0 8z',
  },
  {
    key: 'seal',
    name: 'Wax seal',
    category: 'Motifs',
    tags: ['seal', 'stamp', 'wax', 'credential'],
    svgPath: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm-2 4h4v2h-1v5h-2V9h-1V7z',
  },
  {
    key: 'bouquet',
    name: 'Bouquet',
    category: 'Flowers',
    tags: ['bouquet', 'flowers', 'wedding'],
    svgPath: 'M12 3c2 3 3 5 3 7 2-1 4 0 5 2-2 1-3 3-3 5 0 2-1 4-3 5-2-1-3-3-3-5 0-2-1-4-3-5 1-2 3-3 5-2 0-2 1-4 3-7z',
  },
  {
    key: 'champagne',
    name: 'Champagne',
    category: 'Motifs',
    tags: ['champagne', 'toast', 'glass'],
    svgPath: 'M8 3h8l-1 8a4 4 0 0 1-3 3v6h3v2H9v-2h3v-6a4 4 0 0 1-3-3L8 3zm2.2 2 .6 5h2.4l.6-5h-3.6z',
  },
  {
    key: 'church',
    name: 'Chapel',
    category: 'Motifs',
    tags: ['church', 'chapel', 'venue'],
    svgPath: 'M11 2h2v3h3v2h-1v13h-6V7H8V5h3V2zm-5 8h2v10H6V10zm12 0h2v10h-2V10z',
  },
  {
    key: 'calendar_heart',
    name: 'Date heart',
    category: 'Motifs',
    tags: ['date', 'calendar', 'heart'],
    svgPath: 'M7 3h2v2h6V3h2v2h3v16H4V5h3V3zm-1 6v10h12V9H6zm6 2.5c1.2-1.2 3-.4 3 1.2 0 1.6-3 3.3-3 3.3s-3-1.7-3-3.3c0-1.6 1.8-2.4 3-1.2z',
  },
]

export function searchIcons(query: string): DesignIcon[] {
  const q = query.trim().toLowerCase()
  if (!q) return DESIGN_ICON_LIBRARY
  return DESIGN_ICON_LIBRARY.filter(
    (icon) =>
      icon.name.toLowerCase().includes(q) ||
      icon.category.toLowerCase().includes(q) ||
      icon.tags.some((t) => t.includes(q)),
  )
}

export function getIcon(key: string): DesignIcon | undefined {
  return DESIGN_ICON_LIBRARY.find((i) => i.key === key)
}

export function iconSvgMarkup(icon: DesignIcon, fill = 'currentColor'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill}"><path d="${icon.svgPath}"/></svg>`
}
