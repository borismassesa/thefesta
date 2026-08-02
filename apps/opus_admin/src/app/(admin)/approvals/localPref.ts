'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Device-local UI preferences for the Approvals module: starred request
// types, catalog view mode. These are per-person display choices, not
// business data, so they live in localStorage rather than costing a table
// and a migration.
//
// LIMITATION: device-local. Not synchronised between browsers, devices or
// incognito sessions, and cleared with site data. Keys are namespaced by
// account so a shared machine doesn't leak one person's preferences to the
// next. If any of these ever need to follow a user across devices, this is
// the one module to swap for a server round-trip.

// useSyncExternalStore needs a stable subscribe/snapshot pair. The listener
// set lets two components on the same page stay in step, which the native
// `storage` event alone would not do (it only fires in *other* tabs).
const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function prefKey(name: string, actorEmail: string): string {
  return `opusfesta.approvals.${name}:${actorEmail.trim().toLowerCase() || 'anonymous'}`
}

export function readPref(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    // Private mode / disabled storage — the preference degrades to its default.
    return ''
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Nothing to do — the change just won't persist.
  }
  for (const l of listeners) l()
}

export function useLocalPref(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readPref(key),
    // Server render has no localStorage; start empty and let the first
    // client snapshot fill it in.
    () => '',
  )
  const set = useCallback((next: string) => writePref(key, next), [key])
  return [value, set]
}
