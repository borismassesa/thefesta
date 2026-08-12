/**
 * Deterministic text fitting for invitation fields.
 * Binary-search shrink; wrap by simple word breaks. No DOM measurement —
 * uses an approximate glyph width model suitable for preflight + server.
 */

export type FitInput = {
  text: string
  boxWidth: number
  boxHeight: number
  preferredFontSize: number
  minFontSize: number
  maxLines: number
  lineHeight: number
  letterSpacing?: number
  /** Average glyph width as fraction of fontSize (serif ≈ 0.52). */
  avgGlyphFactor?: number
  fit: 'none' | 'shrink' | 'wrap' | 'shrink_wrap' | 'truncate' | 'block'
  overflow: 'block' | 'warn' | 'ellipsis' | 'overflow'
}

export type FitResult = {
  ok: boolean
  fontSize: number
  lines: string[]
  status: 'fit' | 'warning' | 'blocked'
  reason?: string
}

function measureLineWidth(
  text: string,
  fontSize: number,
  letterSpacing: number,
  avgGlyphFactor: number,
): number {
  return text.length * fontSize * avgGlyphFactor + Math.max(0, text.length - 1) * letterSpacing
}

function wrapLines(
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
  letterSpacing: number,
  avgGlyphFactor: number,
): { lines: string[]; overflow: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { lines: [''], overflow: false }

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word
    if (measureLineWidth(trial, fontSize, letterSpacing, avgGlyphFactor) <= maxWidth) {
      current = trial
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length >= maxLines) {
      return { lines: lines.slice(0, maxLines), overflow: true }
    }
  }
  if (current) lines.push(current)

  if (lines.length > maxLines) {
    return { lines: lines.slice(0, maxLines), overflow: true }
  }
  return { lines, overflow: false }
}

function fitsAtSize(input: FitInput, fontSize: number): { ok: boolean; lines: string[] } {
  const avg = input.avgGlyphFactor ?? 0.52
  const ls = input.letterSpacing ?? 0
  const allowWrap = input.fit === 'wrap' || input.fit === 'shrink_wrap'

  if (!allowWrap) {
    const width = measureLineWidth(input.text, fontSize, ls, avg)
    const height = fontSize * input.lineHeight
    return {
      ok: width <= input.boxWidth && height <= input.boxHeight,
      lines: [input.text],
    }
  }

  const wrapped = wrapLines(input.text, fontSize, input.boxWidth, input.maxLines, ls, avg)
  const height = wrapped.lines.length * fontSize * input.lineHeight
  return {
    ok: !wrapped.overflow && height <= input.boxHeight,
    lines: wrapped.lines,
  }
}

/**
 * Binary-search the largest font size in [min, preferred] that fits.
 */
export function fitText(input: FitInput): FitResult {
  const text = input.text ?? ''
  if (!text.trim()) {
    return { ok: true, fontSize: input.preferredFontSize, lines: [''], status: 'fit' }
  }

  if (input.fit === 'none') {
    return {
      ok: true,
      fontSize: input.preferredFontSize,
      lines: [text],
      status: 'fit',
    }
  }

  if (input.fit === 'truncate') {
    const avg = input.avgGlyphFactor ?? 0.52
    const ls = input.letterSpacing ?? 0
    let cut = text
    while (
      cut.length > 1 &&
      measureLineWidth(cut + '…', input.preferredFontSize, ls, avg) > input.boxWidth
    ) {
      cut = cut.slice(0, -1)
    }
    const truncated = cut === text ? text : `${cut}…`
    return {
      ok: true,
      fontSize: input.preferredFontSize,
      lines: [truncated],
      status: cut === text ? 'fit' : 'warning',
      reason: cut === text ? undefined : 'truncated',
    }
  }

  const preferWrapOnly = input.fit === 'wrap'
  if (preferWrapOnly) {
    const atPreferred = fitsAtSize(input, input.preferredFontSize)
    if (atPreferred.ok) {
      return {
        ok: true,
        fontSize: input.preferredFontSize,
        lines: atPreferred.lines,
        status: 'fit',
      }
    }
    if (input.overflow === 'block') {
      return {
        ok: false,
        fontSize: input.preferredFontSize,
        lines: atPreferred.lines,
        status: 'blocked',
        reason: 'text_overflow_wrap',
      }
    }
    return {
      ok: false,
      fontSize: input.preferredFontSize,
      lines: atPreferred.lines,
      status: 'warning',
      reason: 'text_overflow_wrap',
    }
  }

  // shrink or shrink_wrap — binary search
  let lo = input.minFontSize
  let hi = input.preferredFontSize
  let best: { fontSize: number; lines: string[] } | null = null

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const attempt = fitsAtSize(input, mid)
    if (attempt.ok) {
      best = { fontSize: mid, lines: attempt.lines }
      lo = mid
    } else {
      hi = mid
    }
  }

  if (best) {
    return {
      ok: true,
      fontSize: Math.floor(best.fontSize * 100) / 100,
      lines: best.lines,
      status: 'fit',
    }
  }

  const minAttempt = fitsAtSize(input, input.minFontSize)
  if (input.overflow === 'block') {
    return {
      ok: false,
      fontSize: input.minFontSize,
      lines: minAttempt.lines,
      status: 'blocked',
      reason: 'guest_name_cannot_fit',
    }
  }

  return {
    ok: false,
    fontSize: input.minFontSize,
    lines: minAttempt.lines,
    status: input.overflow === 'warn' ? 'warning' : 'blocked',
    reason: 'guest_name_cannot_fit',
  }
}
