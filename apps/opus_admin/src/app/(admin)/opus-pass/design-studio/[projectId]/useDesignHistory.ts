'use client'

import { useCallback, useState } from 'react'

import type { DesignDocument } from '@opusfesta/design-engine'

const MAX = 50

export function useDesignHistory(initial: DesignDocument) {
  const [document, setDocument] = useState(initial)
  const [past, setPast] = useState<DesignDocument[]>([])
  const [future, setFuture] = useState<DesignDocument[]>([])

  const commit = useCallback((next: DesignDocument | ((prev: DesignDocument) => DesignDocument)) => {
    setDocument((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      setPast((p) => [...p.slice(-(MAX - 1)), prev])
      setFuture([])
      return value
    })
  }, [])

  const replace = useCallback((next: DesignDocument) => {
    setDocument(next)
    setPast([])
    setFuture([])
  }, [])

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p
      const previous = p[p.length - 1]
      setDocument((current) => {
        setFuture((f) => [current, ...f].slice(0, MAX))
        return previous
      })
      return p.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f
      const next = f[0]
      setDocument((current) => {
        setPast((p) => [...p, current].slice(-MAX))
        return next
      })
      return f.slice(1)
    })
  }, [])

  return {
    document,
    setDocument: commit,
    replaceDocument: replace,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
