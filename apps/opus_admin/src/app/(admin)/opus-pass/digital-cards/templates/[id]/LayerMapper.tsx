'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Loader2, Save, Wand2, X } from 'lucide-react'
import { useSetPageHeading } from '@/components/PageHeading'
import {
  CARD_FIELD_ROLES,
  assessBindings,
  type CardFieldBinding,
} from '@/lib/cms/card-field-roles'
import type { CardArtworkInspection } from '@/lib/cms/card-svg-fields'
import { saveCardFieldBindings } from '../actions'

const LIST = '/opus-pass/digital-cards/templates'

type ArtworkLoad = ({ ok: true } & CardArtworkInspection) | { ok: false; reason: string }

/** Sentinel for "this layer is decoration, not a field". */
const NOT_A_FIELD = ''

export default function LayerMapper({
  productId,
  productName,
  category,
  imageUrl,
  saved,
  artwork,
}: {
  productId: string
  productName: string
  category: string
  imageUrl: string
  saved: CardFieldBinding[]
  artwork: ArtworkLoad
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useSetPageHeading({
    title: productName,
    back: { href: LIST, label: 'Templates' },
  })

  // layerId → role key. The mapping is edited per LAYER (that's what the admin
  // sees in the artwork) and converted to per-ROLE bindings on save.
  const [assignment, setAssignment] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const binding of saved) {
      for (const layerId of binding.layerIds) initial[layerId] = binding.role
    }
    return initial
  })

  // Memoised so the arrays keep a stable identity across re-renders — a fresh
  // `[]` each time would invalidate every downstream useMemo on every keystroke.
  const { layers, rasterLayers, shapeLayers } = useMemo(
    () =>
      artwork.ok
        ? {
            layers: artwork.textLayers,
            rasterLayers: artwork.rasterLayers,
            shapeLayers: artwork.shapeLayers,
          }
        : { layers: [], rasterLayers: [], shapeLayers: [] },
    [artwork],
  )

  const bindings = useMemo<CardFieldBinding[]>(() => {
    const byRole = new Map<string, CardFieldBinding>()
    const rasterIds = new Set(rasterLayers.map((l) => l.id))
    // Preserve the order of CARD_FIELD_ROLES so saved output is stable.
    for (const role of CARD_FIELD_ROLES) {
      const layerIds = Object.entries(assignment)
        .filter(([, assignedRole]) => assignedRole === role.key)
        .map(([layerId]) => layerId)
      if (layerIds.length === 0) continue
      byRole.set(role.key, {
        role: role.key,
        layerIds,
        // Carried onto the binding so the renderer knows to write a `fill`
        // rather than text content.
        ...(role.kind === 'colour' ? { kind: 'colour' as const } : {}),
        ...(layerIds.every((id) => rasterIds.has(id)) ? { rasterised: true } : {}),
      })
    }
    return [...byRole.values()]
  }, [assignment, rasterLayers])

  const readiness = useMemo(() => assessBindings(bindings), [bindings])

  // Which roles already have a layer, so the dropdowns can show it and the
  // admin isn't left guessing why a save was rejected as a duplicate.
  const roleUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const role of Object.values(assignment)) {
      if (role) counts.set(role, (counts.get(role) ?? 0) + 1)
    }
    return counts
  }, [assignment])

  /**
   * Pre-fill by matching layer ids against role keys. Only exact-ish matches:
   * a wrong guess on a wedding invitation is worse than no guess, so
   * content-named layers ('Bi._Fabiola_Thomas') are deliberately left blank.
   */
  function autoMatch() {
    const next = { ...assignment }
    let matched = 0
    const taken = new Set(Object.values(next).filter(Boolean))
    for (const layer of [...layers, ...shapeLayers, ...rasterLayers]) {
      if (next[layer.id]) continue
      // 'couple_name_1_Image' → 'couple_name_1', 'invite_line-2' → 'invite_line'
      const normalised = layer.id
        .replace(/_Image$/, '')
        .replace(/-\d+$/, '')
        .toLowerCase()
      const role = CARD_FIELD_ROLES.find((r) => r.key === normalised)
      if (role && !taken.has(role.key)) {
        next[layer.id] = role.key
        taken.add(role.key)
        matched += 1
      }
    }
    setAssignment(next)
    setMessage(matched > 0 ? `Matched ${matched} layer${matched === 1 ? '' : 's'} by name.` : 'No layer names matched a field.')
    setError(null)
  }

  function save() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await saveCardFieldBindings(productId, bindings)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setMessage(`Saved — ${result.mapped} field${result.mapped === 1 ? '' : 's'} mapped.`)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the mapping.')
      }
    })
  }

  if (!artwork.ok) {
    return (
      <div className="px-8 py-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-amber-900">Can&apos;t read this card&apos;s layers</h2>
              <p className="text-sm text-amber-800">{artwork.reason}</p>
              {imageUrl && (
                <p className="break-all text-xs text-amber-700">Artwork: {imageUrl}</p>
              )}
            </div>
          </div>
        </div>
        <Link
          href={LIST}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back to Card Designer
        </Link>
      </div>
    )
  }

  return (
    <div className="px-8 py-6">
      <div className="min-w-0 space-y-5">
        {/* Readiness summary — the answer to "can this card take an order?" */}
        <div
          className={`rounded-2xl border p-5 ${
            readiness.canFulfilOrders
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex items-start gap-3">
            {readiness.canFulfilOrders ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0 space-y-1">
              <h2
                className={`text-sm font-bold ${
                  readiness.canFulfilOrders ? 'text-emerald-900' : 'text-amber-900'
                }`}
              >
                {readiness.canFulfilOrders
                  ? 'Ready to take orders'
                  : 'Not ready to take orders'}
              </h2>
              <p
                className={`text-sm ${
                  readiness.canFulfilOrders ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {readiness.ready.length} of {CARD_FIELD_ROLES.length} fields are live text.
                {readiness.blocked.length > 0 && (
                  <>
                    {' '}
                    {readiness.blocked.length} are embedded images and can&apos;t be typed into —
                    the artwork needs re-exporting with those layers as text.
                  </>
                )}
                {readiness.unbound.length > 0 && (
                  <> {readiness.unbound.length} have no layer assigned yet.</>
                )}
              </p>
              {readiness.blocked.length > 0 && (
                <p className="pt-1 text-xs font-medium text-amber-900">
                  Blocked: {readiness.blocked.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {layers.length} text layer{layers.length === 1 ? '' : 's'} and {rasterLayers.length}{' '}
            image layer{rasterLayers.length === 1 ? '' : 's'} found in <strong>{category}</strong>{' '}
            artwork.
          </p>
          <button
            type="button"
            onClick={autoMatch}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Wand2 className="h-4 w-4" />
            Match by name
          </button>
        </div>

        <LayerTable
          title="Text layers"
          caption="These can be personalised. Assign each to the field it represents."
          rows={layers.map((l) => ({
            id: l.id,
            sample: l.sampleText,
            note: l.textNodeCount > 1 ? `${l.textNodeCount} text nodes` : null,
          }))}
          assignment={assignment}
          roleUsage={roleUsage}
          onChange={(layerId, role) => setAssignment((prev) => ({ ...prev, [layerId]: role }))}
        />

        {shapeLayers.length > 0 && (
          <LayerTable
            title="Colour layers"
            caption="Vector shapes with no text. Map these to the palette colour fields — a colour is written as a fill, not as text."
            rows={shapeLayers.map((l) => ({
              id: l.id,
              sample: l.currentFill
                ? `${l.shapeCount} shape${l.shapeCount === 1 ? '' : 's'} · currently ${l.currentFill}`
                : `${l.shapeCount} shape${l.shapeCount === 1 ? '' : 's'} · no fill set`,
              note: null,
            }))}
            assignment={assignment}
            roleUsage={roleUsage}
            onChange={(layerId, role) => setAssignment((prev) => ({ ...prev, [layerId]: role }))}
          />
        )}

        {rasterLayers.length > 0 && (
          <LayerTable
            title="Image layers"
            caption="Embedded bitmaps. Map them to record what they represent, but they cannot be changed per couple until the artwork is re-exported."
            blocked
            rows={rasterLayers.map((l) => ({
              id: l.id,
              sample: `${l.width ?? '?'} × ${l.height ?? '?'} bitmap`,
              note: null,
            }))}
            assignment={assignment}
            roleUsage={roleUsage}
            onChange={(layerId, role) => setAssignment((prev) => ({ ...prev, [layerId]: role }))}
          />
        )}

        <div className="sticky bottom-0 z-10 -mx-8 mt-6 border-t border-gray-200 bg-white/95 px-8 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <Link
              href={LIST}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:border-red-400 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </Link>
            {error ? (
              <span className="min-w-0 truncate text-xs font-medium text-red-600" title={error}>
                {error}
              </span>
            ) : (
              message && <span className="min-w-0 truncate text-xs text-gray-500">{message}</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7E5896] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#6b4a80] disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save mapping
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LayerTable({
  title,
  caption,
  rows,
  assignment,
  roleUsage,
  onChange,
  blocked = false,
}: {
  title: string
  caption: string
  rows: { id: string; sample: string; note: string | null }[]
  assignment: Record<string, string>
  roleUsage: Map<string, number>
  onChange: (layerId: string, role: string) => void
  blocked?: boolean
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <p className="mt-0.5 text-xs text-gray-500">{caption}</p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/50 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          <tr>
            <th className="px-4 py-2 text-left">Layer</th>
            <th className="px-4 py-2 text-left">In the artwork</th>
            <th className="px-4 py-2 text-left w-[240px]">Card field</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const current = assignment[row.id] ?? NOT_A_FIELD
            return (
              <tr key={row.id} className="hover:bg-gray-50/40">
                <td className="px-4 py-2.5 align-top">
                  <code className="break-all text-xs text-gray-700">{row.id}</code>
                  {row.note && <p className="mt-0.5 text-[11px] text-amber-700">{row.note}</p>}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <span className={blocked ? 'text-xs text-gray-400' : 'text-gray-600'}>
                    {row.sample || <span className="text-gray-300">(empty)</span>}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-top">
                  <select
                    value={current}
                    onChange={(e) => onChange(row.id, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC]"
                  >
                    <option value={NOT_A_FIELD}>— not a field —</option>
                    {CARD_FIELD_ROLES.map((role) => {
                      const used = roleUsage.get(role.key) ?? 0
                      const usedByAnother = used > 0 && current !== role.key
                      return (
                        <option key={role.key} value={role.key}>
                          {role.label}
                          {role.scope === 'guest' ? ' · per guest' : ''}
                          {role.scope === 'template' ? ' · fixed copy' : ''}
                          {usedByAnother ? ' (already mapped)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
