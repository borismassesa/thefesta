'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { resolveOpusPassAssetUrl } from '@/lib/cms/opus-pass-asset-url'
import { parseSvgAttributes, type SvgInspectionResult } from '@/lib/cms/svg-inspector'

const EXPECTED_VARS = ['--iv-bg', '--iv-surf', '--iv-acc', '--iv-tp', '--iv-ts', '--iv-mut']

export function SvgInspector({ url }: { url: string }) {
  const [result, setResult] = useState<SvgInspectionResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!url) { setResult(null); setError(null); return }
    const resolved = resolveOpusPassAssetUrl(url)
    setResult(null)
    setError(null)
    fetch(resolved)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => setResult(parseSvgAttributes(text)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [url])

  if (!result && !error) return null

  if (error) {
    return (
      <p className="text-[11px] text-red-600 mt-1">
        SVG Inspector: could not fetch — {error}
      </p>
    )
  }

  if (!result) return null

  const usedVarNames = new Set(result.cssVars.map((v) => v.name))
  const missingVars = EXPECTED_VARS.filter((v) => !usedVarNames.has(v))
  const unknownVars = result.cssVars.filter((v) => v.role === null)
  const hasWarnings = missingVars.length > 0 || unknownVars.length > 0

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 text-xs overflow-hidden">
      <button data-opus-button="control"
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 font-semibold text-gray-700">
          {hasWarnings ? (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          )}
          SVG Inspector
          {hasWarnings && (
            <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-bold">
              {missingVars.length + unknownVars.length} warning{missingVars.length + unknownVars.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-200 divide-y divide-gray-100">
          {/* CSS Variables */}
          <section className="px-3 py-2.5 space-y-1.5">
            <p className="font-bold text-gray-700 text-[11px] uppercase tracking-wide">CSS Variables</p>
            {missingVars.length > 0 && (
              <p className="text-amber-600">
                Missing expected: {missingVars.join(', ')}
              </p>
            )}
            {result.cssVars.length === 0 ? (
              <p className="text-gray-400 italic">None found — SVG uses no CSS variables.</p>
            ) : (
              <ul className="space-y-0.5">
                {result.cssVars.map((v) => (
                  <li key={v.name} className={`flex items-center gap-2 ${v.role === null ? 'text-amber-600' : 'text-gray-700'}`}>
                    <code className="font-mono">{v.name}</code>
                    {v.role ? (
                      <span className="text-gray-400">→ {v.role}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-500">
                        <AlertTriangle className="w-3 h-3" />
                        unrecognised
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Text Nodes */}
          <section className="px-3 py-2.5 space-y-1.5">
            <p className="font-bold text-gray-700 text-[11px] uppercase tracking-wide">Text nodes ({result.textNodes.length})</p>
            {result.textNodes.length === 0 ? (
              <p className="text-gray-400 italic">No text elements found.</p>
            ) : (
              <ul className="space-y-0.5">
                {result.textNodes.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700">
                    <code className="shrink-0 text-gray-400">&lt;{t.tag}{t.id ? ` #${t.id}` : ''}{t.className ? ` .${t.className.split(' ')[0]}` : ''}&gt;</code>
                    <span className="text-gray-600 truncate">{t.content}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Named Layers */}
          <section className="px-3 py-2.5 space-y-1.5">
            <p className="font-bold text-gray-700 text-[11px] uppercase tracking-wide">Named layers ({result.namedLayers.length})</p>
            {result.namedLayers.length === 0 ? (
              <p className="text-gray-400 italic">No elements with id or class.</p>
            ) : (
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {result.namedLayers.map((l, i) => (
                  <li key={i} className="text-gray-600">
                    <code className="text-gray-400">&lt;{l.tag}&gt;</code>{' '}
                    {l.id && <span className="text-purple-600">#{l.id}</span>}
                    {l.className && <span className="text-blue-600 ml-1">.{l.className.split(' ')[0]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
