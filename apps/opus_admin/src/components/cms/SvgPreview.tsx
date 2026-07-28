'use client'

import { useEffect, useState } from 'react'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import type { DigitalCardPalette } from '@/lib/cms/opus-pass-digital-cards-products'

function injectPalette(svg: string, p: DigitalCardPalette): string {
  const vars = [
    `--iv-bg:${p.background}`,
    `--iv-surf:${p.surface}`,
    `--iv-acc:${p.accent}`,
    `--iv-tp:${p.textPrimary}`,
    `--iv-ts:${p.textSecondary}`,
    `--iv-mut:${p.muted}`,
  ].join(';')
  return svg.replace(/(<svg[^>]*>)/, `$1<style>:root{${vars}}</style>`)
}

function svgToDataUrl(svg: string): string {
  try {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  } catch {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
}

export function SvgPreview({
  url,
  palette,
  aspect = 'aspect-[5/7]',
  label,
}: {
  url: string
  palette?: DigitalCardPalette | null
  aspect?: string
  label?: string
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const palKey = palette
    ? `${palette.background}|${palette.surface}|${palette.accent}|${palette.textPrimary}|${palette.textSecondary}|${palette.muted}`
    : ''

  useEffect(() => {
    if (!url) { setDataUrl(null); return }
    const resolved = resolveOpusPassAssetUrl(url)
    setLoading(true)
    let cancelled = false
    fetch(resolved)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((svg) => {
        if (cancelled) return
        const result = palette ? injectPalette(svg, palette) : svg
        setDataUrl(svgToDataUrl(result))
      })
      .catch(() => { if (!cancelled) setDataUrl(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, palKey])

  return (
    <div className="space-y-1">
      {label && <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>}
      <div className={`${aspect} w-full bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative`}>
        {!url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] text-gray-400">No SVG uploaded</span>
          </div>
        )}
        {url && loading && (
          <div className="absolute inset-0 animate-pulse bg-gray-100 rounded-lg" />
        )}
        {url && dataUrl && !loading && (
          <img src={dataUrl} alt={label ?? 'SVG preview'} className="w-full h-full object-contain" />
        )}
      </div>
    </div>
  )
}
