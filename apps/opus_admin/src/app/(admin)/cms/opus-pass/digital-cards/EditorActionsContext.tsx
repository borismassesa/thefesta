'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type EditorActionsState = {
  hasDraft: boolean
  pending: boolean
  message: string | null
  error?: string | null
}

export type EditorActionsHandlers = {
  onSaveDraft: () => void
  onPublish: () => void
  onDiscard: () => void
}

type Bound = EditorActionsState & EditorActionsHandlers

type ContextValue = {
  bound: Bound | null
  bind: (b: Bound) => void
  unbind: () => void
}

const EditorActionsContext = createContext<ContextValue | null>(null)

export function EditorActionsProvider({ children }: { children: ReactNode }) {
  const [bound, setBound] = useState<Bound | null>(null)
  const bind = useCallback((b: Bound) => setBound(b), [])
  const unbind = useCallback(() => setBound(null), [])
  const value = useMemo(() => ({ bound, bind, unbind }), [bound, bind, unbind])
  return <EditorActionsContext.Provider value={value}>{children}</EditorActionsContext.Provider>
}

export function useEditorActions(): ContextValue {
  const ctx = useContext(EditorActionsContext)
  if (!ctx) throw new Error('useEditorActions must be used inside EditorActionsProvider')
  return ctx
}
