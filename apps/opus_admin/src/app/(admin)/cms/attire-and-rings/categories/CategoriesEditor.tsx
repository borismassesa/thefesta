'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { AttireCategoriesContent, AttireCategoryItem } from '@/lib/cms/attire-categories'
import { useEditorActions } from '../EditorActionsContext'
import { discardAttireCategoriesDraft, publishAttireCategories, saveAttireCategoriesDraft } from './actions'

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

type Props = { initial: AttireCategoriesContent; hasDraft: boolean }

export default function CategoriesEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<AttireCategoriesContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const updateItem = (id: string, patch: Partial<AttireCategoryItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }))

  const removeItem = (id: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }))

  const moveItem = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.items.findIndex((it) => it.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.items.length) return d
      const next = [...d.items]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, items: next }
    })

  const addItem = () =>
    setDraft((d) => ({
      ...d,
      items: [...d.items, { id: `item-${Date.now()}`, name: 'New category', img: '' }],
    }))

  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try {
        await job()
      } catch (err) {
        setError(`That didn't go through: ${err instanceof Error ? err.message : String(err)}`)
        setMessage(null)
      }
    })

  const handleSaveDraft = () => runAction(async () => { await saveAttireCategoriesDraft(draft); setHasDraft(true); setMessage('Draft saved.') })
  const handlePublish = () => runAction(async () => { await saveAttireCategoriesDraft(draft); await publishAttireCategories(); setHasDraft(false); setMessage('Published — changes are live.') })
  const handleDiscard = () => runAction(async () => { await discardAttireCategoriesDraft(); setDraft(initial); setHasDraft(false); setMessage('Draft discarded.') })

  useEffect(() => {
    bind({ hasDraft, pending, message, error, onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, error, draft])

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <h3 className="text-[15px] font-semibold text-gray-900">Trending Categories</h3>

        <Field label="Section title">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className={inputCls}
            placeholder="Discover trending wedding attire & rings"
          />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Category cards</span>
            <button data-opus-button="control"
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 text-xs font-medium text-[#7E5896] hover:text-[#5d3d72] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add category
            </button>
          </div>

          {draft.items.map((item, idx) => (
            <div key={item.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">#{idx + 1}</span>
                <div className="flex items-center gap-1">
                  <button data-opus-button="control" type="button" onClick={() => moveItem(item.id, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button data-opus-button="control" type="button" onClick={() => moveItem(item.id, 1)} disabled={idx === draft.items.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button data-opus-button="control" type="button" onClick={() => removeItem(item.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <input type="text" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} className={inputCls} placeholder="Diamond Rings" />
                </Field>
                <Field label="Image URL">
                  <input type="text" value={item.img} onChange={(e) => updateItem(item.id, { img: e.target.value })} className={inputCls} placeholder="https://…" />
                </Field>
              </div>

              {item.img && (
                <div className="rounded-lg overflow-hidden border border-gray-200 aspect-[4/5] max-w-[80px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          ))}

          {draft.items.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
              No categories yet. Add one above.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
