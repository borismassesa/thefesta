// Everything a frozen card was produced from, named precisely enough to
// reproduce it — or to notice that it can no longer be reproduced.
//
// Freezing the SVG pins the picture. Freezing the layout pins the boxes. Neither
// pins the things that turned one into the other:
//
//   THE METRICS   the advance widths the lines were measured with. Re-extract a
//                 face — a wider code-point repertoire, a fixed bug — and the
//                 same name can break differently.
//   THE FITTER    the ladder and the wrap rules that chose those breaks.
//   THE RENDERER  the code that placed the baselines.
//
// That matters because guest_name is substituted AFTER the freeze. A guest
// asset regenerated in a year — a retry, a re-send, a bucket restore — runs
// today's code over yesterday's release. Without a manifest, a different line
// break in that render is invisible. With one, it is a mismatch somebody can
// see and decide about.
//
// Nothing here duplicates the font bytes or the metrics table. card_fonts rows
// are content-addressed by content_sha256, so naming the SHA identifies the
// bytes exactly. The manifest's job is to SAY which ones, not to hold them.

export const CARD_MANIFEST_SCHEMA_VERSION = 1

export type ManifestFont = {
  /** The name the artwork asks for, which is what the match resolved on. */
  primary: string
  weight: number
  italic: boolean
  /** SHA-256 of the font file. Null when the face never resolved. */
  fontSha256: string | null
  /**
   * Fingerprint of the metrics table used to measure this face.
   *
   * Separate from the font's own SHA because metrics are EXTRACTED: the same
   * binary can yield a different table after an extractor change, and that is
   * precisely the drift this exists to catch.
   */
  metricsSha256: string | null
}

export type CardRenderManifest = {
  schemaVersion: number
  rendererVersion: string
  fitVersion: string
  /** SHA-256 of the artwork the release was rendered from. */
  artworkSha256: string
  /** SHA-256 of the effective layout, so a drifted layout is detectable. */
  layoutSha256: string
  /** SHA-256 of the bindings, which decide which layer each role writes into. */
  bindingSha256: string
  fonts: ManifestFont[]
}

export type ManifestField =
  | 'artwork'
  | 'layout'
  | 'bindings'
  | 'renderer'
  | 'fit'
  | 'font'
  | 'metrics'

export type ManifestMismatch = {
  field: ManifestField
  /** What this drift means for the operation being attempted. */
  severity: 'ignored' | 'informational' | 'blocker'
  detail: string
}

/**
 * What the caller is doing, because the same drift means opposite things.
 *
 *   'freeze'      producing a NEW release. Current dependencies are the point;
 *                 a changed layout or artwork is the change being released.
 *   'regenerate'  rebuilding a guest asset for an EXISTING release — a retry, a
 *                 re-send, a restored bucket. Here the frozen dependencies are
 *                 authoritative and drift in the ones that decide typesetting
 *                 means the rebuilt card would differ from the one that guest
 *                 already has.
 */
export type ManifestContext = 'freeze' | 'regenerate'

/**
 * Compare a manifest against the dependencies available now.
 *
 * Returns what has moved AND what it means, rather than a bare list. A verdict
 * that ignored context would either block every new freeze (because the layout
 * legitimately changed) or permit a silently re-typeset old card — and those are
 * the only two ways to get this wrong.
 *
 * The distinctions that carry the weight:
 *
 *   PRODUCT LAYOUT CHANGED   fine at freeze (that IS the change); irrelevant on
 *                            regenerate, because the snapshot wins there and the
 *                            product row is never consulted.
 *   ARTWORK CHANGED          fine at freeze after validation; on regenerate the
 *                            frozen file is what is rendered, so a changed
 *                            source artwork says nothing.
 *   METRICS CHANGED          the quiet one. Same font file, re-extracted table,
 *                            different line break, nothing in the picture to
 *                            explain it. A blocker on regenerate.
 *   FONT BYTES CHANGED       a blocker on regenerate unless the old bytes are
 *                            still resolvable: the glyphs themselves differ.
 *   FONT METADATA CHANGED    a rename or a licence note. Harmless either way,
 *                            and deliberately not reported.
 */
export function compareManifest(
  frozen: CardRenderManifest,
  current: Partial<CardRenderManifest>,
  context: ManifestContext = 'regenerate',
): ManifestMismatch[] {
  const mismatches: ManifestMismatch[] = []
  const regenerating = context === 'regenerate'

  const check = (
    field: Exclude<ManifestField, 'font' | 'metrics'>,
    severity: ManifestMismatch['severity'],
    was: string,
    now: string | undefined,
  ) => {
    if (now === undefined || now === was) return
    mismatches.push({ field, severity, detail: `frozen with ${was || '(none)'}, now ${now || '(none)'}` })
  }

  // On regenerate these are read from the snapshot and the frozen file, so a
  // change to the live ones cannot affect the output. Recorded as informational
  // rather than dropped, because "the product moved on" is worth seeing when
  // diagnosing why two guests' cards differ.
  check('artwork', regenerating ? 'informational' : 'ignored', frozen.artworkSha256, current.artworkSha256)
  check('layout', regenerating ? 'informational' : 'ignored', frozen.layoutSha256, current.layoutSha256)
  check('bindings', regenerating ? 'informational' : 'ignored', frozen.bindingSha256, current.bindingSha256)

  // These DO decide typesetting, and on a rebuild there is no snapshot that can
  // stand in for them: the code that runs is the code that is installed.
  check('renderer', regenerating ? 'blocker' : 'ignored', frozen.rendererVersion, current.rendererVersion)
  check('fit', regenerating ? 'blocker' : 'ignored', frozen.fitVersion, current.fitVersion)

  if (current.fonts) {
    const byKey = new Map(current.fonts.map((font) => [fontKey(font), font]))
    for (const font of frozen.fonts) {
      const now = byKey.get(fontKey(font))
      if (!now) {
        mismatches.push({
          field: 'font',
          severity: regenerating ? 'blocker' : 'informational',
          detail: `${font.primary} is no longer resolved`,
        })
        continue
      }
      if (font.fontSha256 && now.fontSha256 !== font.fontSha256) {
        mismatches.push({
          field: 'font',
          severity: regenerating ? 'blocker' : 'informational',
          detail: `${font.primary}'s file has changed`,
        })
      }
      if (font.metricsSha256 && now.metricsSha256 !== font.metricsSha256) {
        mismatches.push({
          field: 'metrics',
          severity: regenerating ? 'blocker' : 'informational',
          detail: `${font.primary}'s measurements have changed`,
        })
      }
    }
  }

  return mismatches
}

/**
 * Whether a rebuild may proceed.
 *
 * The practical question behind this is whether historical guest assets ever
 * need regenerating. Where they do, every pinned dependency has to stay
 * resolvable; where they do not, the already-produced PNG is the answer and this
 * never has to be asked. Blocking here is what turns the second case into a
 * deliberate choice rather than an accident.
 */
export function manifestPermits(mismatches: ManifestMismatch[]): boolean {
  return !mismatches.some((mismatch) => mismatch.severity === 'blocker')
}

function fontKey(font: ManifestFont): string {
  return `${font.primary.toLowerCase()}|${font.weight}|${font.italic}`
}

/**
 * A stable fingerprint for a JSON value.
 *
 * Keys are sorted at every level, so two objects that differ only in insertion
 * order fingerprint the same. Without that, merely re-deriving a layout would
 * appear to change it — and a mismatch that fires on nothing is a mismatch
 * everyone learns to ignore.
 *
 * The hash itself is the caller's, because the shared package has no crypto:
 * Node has `node:crypto`, browsers have SubtleCrypto, and neither belongs here.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
  return `{${entries.join(',')}}`
}
