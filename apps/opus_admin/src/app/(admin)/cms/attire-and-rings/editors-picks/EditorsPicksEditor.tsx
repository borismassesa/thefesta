'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { AttireEditorsPicksContent, AttirePickItem } from '@/lib/cms/attire-editors-picks'
import { useEditorActions } from '../EditorActionsContext'
import { discardAttireEditorsPicksDraft, publishAttireEditorsPicks, saveAttireEditorsPicksDraft } from './actions'

const inputCls =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C9A0DC] focus:border-transparent transition-all'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3 pt-2 space-y-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</legend>
      {children}
    </fieldset>
  )
}

type PickRowEditorProps = {
  label: string
  picks: AttirePickItem[]
  onChange: (picks: AttirePickItem[]) => void
}

function PickRowEditor({ label, picks, onChange }: PickRowEditorProps) {
  const updatePick = (id: string, patch: Partial<AttirePickItem>) =>
    onChange(picks.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const removePick = (id: string) => onChange(picks.filter((p) => p.id !== id))

  const movePick = (id: string, dir: -1 | 1) => {
    const idx = picks.findIndex((p) => p.id === id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= picks.length) return
    const next = [...picks]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  const addPick = () =>
    onChange([...picks, { id: `pick-${Date.now()}`, img: '', has_video: false, has_heart: false, price: '' }])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
        <button data-opus-button="control" type="button" onClick={addPick} className="flex items-center gap-1 text-xs font-medium text-[#7E5896] hover:text-[#5d3d72] transition-colors">
          <Plus className="w-3 h-3" />
          Add pick
        </button>
      </div>

      {picks.map((pick, idx) => (
        <div key={pick.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">#{idx + 1}</span>
            <div className="flex items-center gap-1">
              <button data-opus-button="control" type="button" onClick={() => movePick(pick.id, -1)} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                <ArrowUp className="w-3 h-3" />
              </button>
              <button data-opus-button="control" type="button" onClick={() => movePick(pick.id, 1)} disabled={idx === picks.length - 1} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                <ArrowDown className="w-3 h-3" />
              </button>
              <button data-opus-button="control" type="button" onClick={() => removePick(pick.id)} className="p-0.5 text-gray-400 hover:text-red-500 ml-1">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <Field label="Image URL">
            <input type="text" value={pick.img} onChange={(e) => updatePick(pick.id, { img: e.target.value })} className={inputCls} placeholder="https://…" />
          </Field>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={pick.has_video}
                onChange={(e) => updatePick(pick.id, { has_video: e.target.checked })}
                className="rounded border-gray-300 text-[#C9A0DC] focus:ring-[#C9A0DC]"
              />
              Show video badge
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={pick.has_heart}
                onChange={(e) => updatePick(pick.id, { has_heart: e.target.checked })}
                className="rounded border-gray-300 text-[#C9A0DC] focus:ring-[#C9A0DC]"
              />
              Show favourite button
            </label>
          </div>

          {pick.has_heart && (
            <Field label="Price label (optional)">
              <input type="text" value={pick.price} onChange={(e) => updatePick(pick.id, { price: e.target.value })} className={inputCls} placeholder="TZS 2,298,000" />
            </Field>
          )}

          {pick.img && (
            <div className="rounded-lg overflow-hidden border border-gray-200 aspect-square max-w-[80px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pick.img} alt="Pick" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      ))}

      {picks.length === 0 && (
        <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">No picks yet.</p>
      )}
    </div>
  )
}

type Props = { initial: AttireEditorsPicksContent; hasDraft: boolean }

export default function EditorsPicksEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<AttireEditorsPicksContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof AttireEditorsPicksContent>(key: K, value: AttireEditorsPicksContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try { await job() } catch (err) { setError(`That didn't go through: ${err instanceof Error ? err.message : String(err)}`); setMessage(null) }
    })

  const handleSaveDraft = () => runAction(async () => { await saveAttireEditorsPicksDraft(draft); setHasDraft(true); setMessage('Draft saved.') })
  const handlePublish = () => runAction(async () => { await saveAttireEditorsPicksDraft(draft); await publishAttireEditorsPicks(); setHasDraft(false); setMessage('Published — changes are live.') })
  const handleDiscard = () => runAction(async () => { await discardAttireEditorsPicksDraft(); setDraft(initial); setHasDraft(false); setMessage('Draft discarded.') })

  useEffect(() => {
    bind({ hasDraft, pending, message, error, onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, error, draft])

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <h3 className="text-[15px] font-semibold text-gray-900">Editors&apos; Picks</h3>

        <FieldGroup label="Section copy">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Eyebrow text">
              <input type="text" value={draft.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} className={inputCls} placeholder="Editors' Picks" />
            </Field>
            <Field label="CTA label">
              <input type="text" value={draft.cta_label} onChange={(e) => set('cta_label', e.target.value)} className={inputCls} placeholder="Shop these unique finds" />
            </Field>
          </div>
          <Field label="Heading">
            <input type="text" value={draft.heading} onChange={(e) => set('heading', e.target.value)} className={inputCls} placeholder="Bridal & Accessories Favourites" />
          </Field>
          <Field label="Footer text">
            <input type="text" value={draft.footer_text} onChange={(e) => set('footer_text', e.target.value)} className={inputCls} placeholder="Your one-stop shop for wedding attire…" />
          </Field>
        </FieldGroup>

        <PickRowEditor label="Row 1 (3 images)" picks={draft.row1} onChange={(picks) => set('row1', picks)} />
        <PickRowEditor label="Row 2 (3 images)" picks={draft.row2} onChange={(picks) => set('row2', picks)} />
      </div>
    </div>
  )
}
