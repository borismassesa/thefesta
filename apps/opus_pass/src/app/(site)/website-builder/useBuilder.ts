'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type {
  Block,
  BlockType,
  BuilderMeta,
  Section,
  SectionType,
  Selection,
  SiteDoc,
  Theme,
} from '@/lib/builder/types'
import { DEFAULT_DOC, makeBlock, makeSection } from '@/lib/builder/defaults'

// v2: the doc gained a structured `meta` block (names, pages, settings).
const STORAGE_KEY = 'opuspass:website-builder:v2'

type State = {
  doc: SiteDoc
  selection: Selection
  past: SiteDoc[]
  future: SiteDoc[]
}

type Action =
  | { type: 'replace'; doc: SiteDoc; select?: Selection }
  | { type: 'select'; selection: Selection }
  | { type: 'updateBlock'; sectionId: string; blockId: string; patch: Partial<Block> }
  | { type: 'updateSection'; sectionId: string; patch: Partial<Section> }
  | { type: 'updateTheme'; patch: Partial<Theme> }
  | { type: 'updateMeta'; patch: Partial<BuilderMeta> }
  | { type: 'setTitle'; title: string }
  | { type: 'addBlock'; sectionId: string; blockType: BlockType }
  | { type: 'removeBlock'; sectionId: string; blockId: string }
  | { type: 'moveBlock'; sectionId: string; blockId: string; dir: -1 | 1 }
  | { type: 'addSection'; sectionType: SectionType }
  | { type: 'removeSection'; sectionId: string }
  | { type: 'moveSection'; sectionId: string; dir: -1 | 1 }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 60

function withHistory(state: State, doc: SiteDoc, selection?: Selection): State {
  return {
    doc,
    selection: selection !== undefined ? selection : state.selection,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
  }
}

function mapSection(doc: SiteDoc, id: string, fn: (s: Section) => Section): SiteDoc {
  return { ...doc, sections: doc.sections.map((s) => (s.id === id ? fn(s) : s)) }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'replace':
      return withHistory(state, action.doc, action.select)
    case 'select':
      return { ...state, selection: action.selection }
    case 'setTitle':
      return withHistory(state, { ...state.doc, title: action.title })
    case 'updateTheme':
      return withHistory(state, {
        ...state.doc,
        theme: { ...state.doc.theme, ...action.patch },
      })
    case 'updateMeta':
      return withHistory(state, {
        ...state.doc,
        meta: { ...state.doc.meta, ...action.patch },
      })
    case 'updateBlock':
      return withHistory(
        state,
        mapSection(state.doc, action.sectionId, (s) => ({
          ...s,
          blocks: s.blocks.map((b) =>
            b.id === action.blockId ? ({ ...b, ...action.patch } as Block) : b,
          ),
        })),
      )
    case 'updateSection':
      return withHistory(
        state,
        mapSection(state.doc, action.sectionId, (s) => ({ ...s, ...action.patch })),
      )
    case 'addBlock': {
      const block = makeBlock(action.blockType)
      return withHistory(
        state,
        mapSection(state.doc, action.sectionId, (s) => ({ ...s, blocks: [...s.blocks, block] })),
        { kind: 'block', sectionId: action.sectionId, blockId: block.id },
      )
    }
    case 'removeBlock':
      return withHistory(
        state,
        mapSection(state.doc, action.sectionId, (s) => ({
          ...s,
          blocks: s.blocks.filter((b) => b.id !== action.blockId),
        })),
        null,
      )
    case 'moveBlock':
      return withHistory(
        state,
        mapSection(state.doc, action.sectionId, (s) => {
          const i = s.blocks.findIndex((b) => b.id === action.blockId)
          const j = i + action.dir
          if (i < 0 || j < 0 || j >= s.blocks.length) return s
          const blocks = [...s.blocks]
          ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
          return { ...s, blocks }
        }),
      )
    case 'addSection': {
      const section = makeSection(action.sectionType)
      return withHistory(
        state,
        { ...state.doc, sections: [...state.doc.sections, section] },
        { kind: 'section', sectionId: section.id },
      )
    }
    case 'removeSection':
      return withHistory(
        state,
        { ...state.doc, sections: state.doc.sections.filter((s) => s.id !== action.sectionId) },
        null,
      )
    case 'moveSection': {
      const i = state.doc.sections.findIndex((s) => s.id === action.sectionId)
      const j = i + action.dir
      if (i < 0 || j < 0 || j >= state.doc.sections.length) return state
      const sections = [...state.doc.sections]
      ;[sections[i], sections[j]] = [sections[j], sections[i]]
      return withHistory(state, { ...state.doc, sections })
    }
    case 'undo': {
      if (!state.past.length) return state
      const previous = state.past[state.past.length - 1]
      return {
        doc: previous,
        selection: null,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      const next = state.future[0]
      return {
        doc: next,
        selection: null,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      }
    }
    default:
      return state
  }
}

export type SaveStatus = 'saved' | 'saving'

export function useBuilder() {
  const [state, dispatch] = useReducer(reducer, {
    doc: DEFAULT_DOC,
    selection: { kind: 'block', sectionId: 'sec_hero', blockId: 'blk_headline' },
    past: [],
    future: [],
  })
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load persisted doc AFTER mount so the first client render matches the server.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const doc = JSON.parse(raw) as SiteDoc
        // Require the v2 shape (`meta` present) — older saves are ignored so the
        // composer never reads an undefined meta.
        if (doc && doc.meta && Array.isArray(doc.sections) && doc.sections.length) {
          dispatch({ type: 'replace', doc, select: null })
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true)
  }, [])

  // Autosave (debounced) once hydrated.
  useEffect(() => {
    if (!hydrated) return
    setSaveStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.doc))
      } catch {
        /* quota / private mode — ignore */
      }
      setSaveStatus('saved')
    }, 600)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [state.doc, hydrated])

  // Keyboard: undo / redo / delete selected block.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        dispatch({ type: 'redo' })
      } else if (!typing && (e.key === 'Backspace' || e.key === 'Delete')) {
        if (state.selection?.kind === 'block') {
          e.preventDefault()
          dispatch({
            type: 'removeBlock',
            sectionId: state.selection.sectionId,
            blockId: state.selection.blockId,
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.selection])

  const api = {
    select: useCallback((selection: Selection) => dispatch({ type: 'select', selection }), []),
    updateBlock: useCallback(
      (sectionId: string, blockId: string, patch: Partial<Block>) =>
        dispatch({ type: 'updateBlock', sectionId, blockId, patch }),
      [],
    ),
    updateSection: useCallback(
      (sectionId: string, patch: Partial<Section>) =>
        dispatch({ type: 'updateSection', sectionId, patch }),
      [],
    ),
    updateTheme: useCallback((patch: Partial<Theme>) => dispatch({ type: 'updateTheme', patch }), []),
    updateMeta: useCallback((patch: Partial<BuilderMeta>) => dispatch({ type: 'updateMeta', patch }), []),
    setTitle: useCallback((title: string) => dispatch({ type: 'setTitle', title }), []),
    addBlock: useCallback(
      (sectionId: string, blockType: BlockType) =>
        dispatch({ type: 'addBlock', sectionId, blockType }),
      [],
    ),
    removeBlock: useCallback(
      (sectionId: string, blockId: string) => dispatch({ type: 'removeBlock', sectionId, blockId }),
      [],
    ),
    moveBlock: useCallback(
      (sectionId: string, blockId: string, dir: -1 | 1) =>
        dispatch({ type: 'moveBlock', sectionId, blockId, dir }),
      [],
    ),
    addSection: useCallback(
      (sectionType: SectionType) => dispatch({ type: 'addSection', sectionType }),
      [],
    ),
    removeSection: useCallback(
      (sectionId: string) => dispatch({ type: 'removeSection', sectionId }),
      [],
    ),
    moveSection: useCallback(
      (sectionId: string, dir: -1 | 1) => dispatch({ type: 'moveSection', sectionId, dir }),
      [],
    ),
    replaceDoc: useCallback(
      (doc: SiteDoc, select?: Selection) => dispatch({ type: 'replace', doc, select }),
      [],
    ),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  }

  return {
    doc: state.doc,
    selection: state.selection,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    saveStatus,
    ...api,
  }
}

export type BuilderApi = ReturnType<typeof useBuilder>
