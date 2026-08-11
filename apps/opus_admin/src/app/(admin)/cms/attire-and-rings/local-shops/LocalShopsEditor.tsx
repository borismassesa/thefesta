'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { AttireLocalShopsContent, AttireShopItem } from '@/lib/cms/attire-local-shops'
import { useEditorActions } from '../EditorActionsContext'
import { discardAttireLocalShopsDraft, publishAttireLocalShops, saveAttireLocalShopsDraft } from './actions'

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

type Props = { initial: AttireLocalShopsContent; hasDraft: boolean }

export default function LocalShopsEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<AttireLocalShopsContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const set = <K extends keyof AttireLocalShopsContent>(key: K, value: AttireLocalShopsContent[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const updateShop = (id: string, patch: Partial<AttireShopItem>) =>
    setDraft((d) => ({ ...d, shops: d.shops.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))

  const removeShop = (id: string) =>
    setDraft((d) => ({ ...d, shops: d.shops.filter((s) => s.id !== id) }))

  const moveShop = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.shops.findIndex((s) => s.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.shops.length) return d
      const next = [...d.shops]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, shops: next }
    })

  const addShop = () =>
    setDraft((d) => ({
      ...d,
      shops: [...d.shops, { id: `shop-${Date.now()}`, name: 'New shop', img: '', avatar: '' }],
    }))

  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try { await job() } catch (err) { setError(`That didn't go through: ${err instanceof Error ? err.message : String(err)}`); setMessage(null) }
    })

  const handleSaveDraft = () => runAction(async () => { await saveAttireLocalShopsDraft(draft); setHasDraft(true); setMessage('Draft saved.') })
  const handlePublish = () => runAction(async () => { await saveAttireLocalShopsDraft(draft); await publishAttireLocalShops(); setHasDraft(false); setMessage('Published — changes are live.') })
  const handleDiscard = () => runAction(async () => { await discardAttireLocalShopsDraft(); setDraft(initial); setHasDraft(false); setMessage('Draft discarded.') })

  useEffect(() => {
    bind({ hasDraft, pending, message, error, onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, error, draft])

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <h3 className="text-[15px] font-semibold text-gray-900">Local Shops</h3>

        <FieldGroup label="Section copy">
          <Field label="Eyebrow text">
            <input type="text" value={draft.eyebrow} onChange={(e) => set('eyebrow', e.target.value)} className={inputCls} placeholder="Local finds? OpusFesta has it." />
          </Field>
          <Field label="Heading">
            <input type="text" value={draft.heading} onChange={(e) => set('heading', e.target.value)} className={inputCls} placeholder="Discover shops in your area" />
          </Field>
          <Field label="CTA button label">
            <input type="text" value={draft.cta_label} onChange={(e) => set('cta_label', e.target.value)} className={inputCls} placeholder="Shop from local makers" />
          </Field>
        </FieldGroup>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Shop cards (max 3)</span>
            {draft.shops.length < 3 && (
              <button data-opus-button="control" type="button" onClick={addShop} className="flex items-center gap-1.5 text-xs font-medium text-[#7E5896] hover:text-[#5d3d72] transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Add shop
              </button>
            )}
          </div>

          {draft.shops.map((shop, idx) => (
            <div key={shop.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Shop {idx + 1}</span>
                <div className="flex items-center gap-1">
                  <button data-opus-button="control" type="button" onClick={() => moveShop(shop.id, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button data-opus-button="control" type="button" onClick={() => moveShop(shop.id, 1)} disabled={idx === draft.shops.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button data-opus-button="control" type="button" onClick={() => removeShop(shop.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <Field label="Shop name">
                <input type="text" value={shop.name} onChange={(e) => updateShop(shop.id, { name: e.target.value })} className={inputCls} placeholder="Boutique Bridal" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Field label="Main image URL">
                    <input type="text" value={shop.img} onChange={(e) => updateShop(shop.id, { img: e.target.value })} className={inputCls} placeholder="https://…" />
                  </Field>
                  {shop.img && (
                    <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 aspect-[4/5] max-w-[80px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shop.img} alt={shop.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div>
                  <Field label="Avatar URL">
                    <input type="text" value={shop.avatar} onChange={(e) => updateShop(shop.id, { avatar: e.target.value })} className={inputCls} placeholder="https://…" />
                  </Field>
                  {shop.avatar && (
                    <div className="mt-2 rounded-full overflow-hidden border border-gray-200 w-10 h-10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shop.avatar} alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {draft.shops.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
              No shops yet. Add one above.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
