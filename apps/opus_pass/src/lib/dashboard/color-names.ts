/**
 * Name a colour from its hex value.
 *
 * The card stores its palette as swatches — "#B08A80", five of them. That is
 * exactly right for rendering the card and useless in an SMS: a guest reading
 * "RANGI ZA SHEREHE: #B08A80" learns nothing about what to wear.
 *
 * So each swatch is matched to the nearest name in the list below. Matching is
 * done in CIE L*a*b* rather than raw RGB, because RGB distance does not track
 * how different two colours look — it will happily call a dark olive "grey"
 * while separating two blushes a person would not tell apart.
 *
 * THE NAME IS AN APPROXIMATION, not the designer's own word for the shade. The
 * list is deliberately built from names a guest can act on when choosing what
 * to wear, and stays coarse for that reason: "Dusty Rose" is useful, "Pale
 * Silver Pink" is not.
 */

/** Wedding-palette names, spread widely enough that a nearest match lands on a
 *  word that describes the colour rather than the closest entry in a cluster. */
const NAMED_COLORS: { name: string; hex: string }[] = [
  // Neutrals
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Ivory', hex: '#FFFFF0' },
  { name: 'Cream', hex: '#FFFDD0' },
  { name: 'Champagne', hex: '#F7E7CE' },
  { name: 'Beige', hex: '#E8DCC8' },
  { name: 'Taupe', hex: '#B5A398' },
  { name: 'Grey', hex: '#9AA0A6' },
  { name: 'Charcoal', hex: '#3C4043' },
  { name: 'Black', hex: '#1A1A1A' },
  // Pinks and reds
  { name: 'Blush', hex: '#EFBFBB' },
  { name: 'Pale Blush', hex: '#FFE5E4' },
  { name: 'Dusty Rose', hex: '#B08A80' },
  { name: 'Rose', hex: '#D46A82' },
  { name: 'Coral', hex: '#F5776A' },
  { name: 'Terracotta', hex: '#C56A44' },
  { name: 'Burgundy', hex: '#6E1220' },
  { name: 'Maroon', hex: '#7B1E28' },
  { name: 'Wine', hex: '#5C2A3A' },
  // Oranges and yellows
  { name: 'Peach', hex: '#FFCBA4' },
  { name: 'Apricot', hex: '#F0A868' },
  { name: 'Mustard', hex: '#D4A017' },
  { name: 'Gold', hex: '#C9A227' },
  // Greens
  { name: 'Sage', hex: '#8D8E7C' },
  { name: 'Olive', hex: '#666956' },
  { name: 'Eucalyptus', hex: '#7C9A7E' },
  { name: 'Emerald', hex: '#2E7D55' },
  { name: 'Forest Green', hex: '#274E32' },
  // Blues and purples
  { name: 'Sky Blue', hex: '#8FC0E0' },
  { name: 'Dusty Blue', hex: '#7B93A8' },
  { name: 'Teal', hex: '#2A7F86' },
  { name: 'Navy', hex: '#1F3050' },
  { name: 'Lilac', hex: '#C3A8D4' },
  { name: 'Lavender', hex: '#B39BC8' },
  { name: 'Plum', hex: '#6B3FA0' },
  // Browns
  { name: 'Sand', hex: '#D9C3A0' },
  { name: 'Caramel', hex: '#B07B4F' },
  { name: 'Brown', hex: '#6B4A32' },
]

type Rgb = { r: number; g: number; b: number }

/** Accepts "#RGB" and "#RRGGBB", with or without the hash. */
export function parseHex(hex: string): Rgb | null {
  const v = hex.trim().replace(/^#/, '')
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** sRGB → CIE L*a*b* (D65). The gamma step matters: skipping it is what makes
 *  naive matchers confuse dark colours with each other. */
function toLab({ r, g, b }: Rgb): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  // sRGB D65 matrix.
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const LAB_TABLE = NAMED_COLORS.map((c) => {
  const rgb = parseHex(c.hex)
  return { name: c.name, lab: rgb ? toLab(rgb) : null }
})

/** The closest name, or null when the value is not a colour we can read. */
export function hexColorName(hex: string): string | null {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [l1, a1, b1] = toLab(rgb)
  let best: { name: string; d: number } | null = null
  for (const entry of LAB_TABLE) {
    if (!entry.lab) continue
    const [l2, a2, b2] = entry.lab
    const d = (l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2
    if (!best || d < best.d) best = { name: entry.name, d }
  }
  return best?.name ?? null
}

/**
 * Name a whole palette, in order, dropping unreadable values and repeats.
 *
 * Repeats are dropped because two swatches often sit inside one name's
 * territory — a blush and a slightly paler blush — and "Blush, Blush" reads as
 * a bug rather than as two shades.
 */
export function paletteNames(hexes: (string | null | undefined)[]): string[] {
  const names: string[] = []
  for (const hex of hexes) {
    if (!hex) continue
    const name = hexColorName(hex)
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}
