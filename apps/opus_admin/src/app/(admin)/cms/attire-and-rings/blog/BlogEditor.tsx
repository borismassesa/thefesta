'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { AttireBlogArticle, AttireBlogContent } from '@/lib/cms/attire-blog'
import { useEditorActions } from '../EditorActionsContext'
import { discardAttireBlogDraft, publishAttireBlog, saveAttireBlogDraft } from './actions'

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

type Props = { initial: AttireBlogContent; hasDraft: boolean }

export default function BlogEditor({ initial, hasDraft: initialHasDraft }: Props) {
  const [draft, setDraft] = useState<AttireBlogContent>(initial)
  const [hasDraft, setHasDraft] = useState(initialHasDraft)
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { bind, unbind } = useEditorActions()

  const updateArticle = (id: string, patch: Partial<AttireBlogArticle>) =>
    setDraft((d) => ({ ...d, articles: d.articles.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))

  const removeArticle = (id: string) =>
    setDraft((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== id) }))

  const moveArticle = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.articles.findIndex((a) => a.id === id)
      const target = idx + dir
      if (idx < 0 || target < 0 || target >= d.articles.length) return d
      const next = [...d.articles]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, articles: next }
    })

  const addArticle = () =>
    setDraft((d) => ({
      ...d,
      articles: [
        ...d.articles,
        { id: `article-${Date.now()}`, tag: '', title: '', excerpt: '', img: '' },
      ],
    }))

  const runAction = (job: () => Promise<void>) =>
    startTransition(async () => {
      setError(null)
      try { await job() } catch (err) { setError(`That didn't go through: ${err instanceof Error ? err.message : String(err)}`); setMessage(null) }
    })

  const handleSaveDraft = () => runAction(async () => { await saveAttireBlogDraft(draft); setHasDraft(true); setMessage('Draft saved.') })
  const handlePublish = () => runAction(async () => { await saveAttireBlogDraft(draft); await publishAttireBlog(); setHasDraft(false); setMessage('Published — changes are live.') })
  const handleDiscard = () => runAction(async () => { await discardAttireBlogDraft(); setDraft(initial); setHasDraft(false); setMessage('Draft discarded.') })

  useEffect(() => {
    bind({ hasDraft, pending, message, error, onSaveDraft: handleSaveDraft, onPublish: handlePublish, onDiscard: handleDiscard })
    return () => unbind()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft, pending, message, error, draft])

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] space-y-5">
        <h3 className="text-[15px] font-semibold text-gray-900">Blog Section</h3>

        <Field label="Section heading">
          <input
            type="text"
            value={draft.heading}
            onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))}
            className={inputCls}
            placeholder="Fresh from the blog"
          />
        </Field>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Articles (max 3)</span>
            {draft.articles.length < 3 && (
              <button data-opus-button="control" type="button" onClick={addArticle} className="flex items-center gap-1.5 text-xs font-medium text-[#7E5896] hover:text-[#5d3d72] transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Add article
              </button>
            )}
          </div>

          {draft.articles.map((article, idx) => (
            <div key={article.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Article {idx + 1}</span>
                <div className="flex items-center gap-1">
                  <button data-opus-button="control" type="button" onClick={() => moveArticle(article.id, -1)} disabled={idx === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button data-opus-button="control" type="button" onClick={() => moveArticle(article.id, 1)} disabled={idx === draft.articles.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button data-opus-button="control" type="button" onClick={() => removeArticle(article.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category tag">
                  <input type="text" value={article.tag} onChange={(e) => updateArticle(article.id, { tag: e.target.value })} className={inputCls} placeholder="Bridal Wear" />
                </Field>
                <Field label="Image URL">
                  <input type="text" value={article.img} onChange={(e) => updateArticle(article.id, { img: e.target.value })} className={inputCls} placeholder="https://…" />
                </Field>
              </div>

              <Field label="Title">
                <input type="text" value={article.title} onChange={(e) => updateArticle(article.id, { title: e.target.value })} className={inputCls} placeholder="15 stunning wedding dress trends for 2026 brides" />
              </Field>

              <Field label="Excerpt">
                <textarea value={article.excerpt} onChange={(e) => updateArticle(article.id, { excerpt: e.target.value })} rows={2} className={inputCls} placeholder="Short summary shown on the card…" />
              </Field>

              {article.img && (
                <div className="rounded-lg overflow-hidden border border-gray-200 aspect-[4/3] max-w-[120px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={article.img} alt={article.title} className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          ))}

          {draft.articles.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
              No articles yet. Add one above.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
