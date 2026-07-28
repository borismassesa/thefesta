'use client'

const REGISTRY_BAG_KEY = 'opusfesta:registryBag'

export type RegistryBagItem = {
  category: string
  id: string
  name: string
  img: string
  price: string
  quantity: number
}

function readFromStorage(): RegistryBagItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(REGISTRY_BAG_KEY)
    return raw ? (JSON.parse(raw) as RegistryBagItem[]) : []
  } catch {
    return []
  }
}

function writeToStorage(value: RegistryBagItem[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(REGISTRY_BAG_KEY, JSON.stringify(value))
  } catch {
    /* quota or disabled — ignore */
  }
}

// useSyncExternalStore requires getSnapshot to return a stable reference
// until the data actually changes — re-parsing localStorage on every call
// (as a naive getter would) creates a new array each time and triggers an
// infinite render loop. This module-level cache is the single source of
// truth for the "current" snapshot; it's only ever reassigned on a write or
// on a same-tab/cross-tab change notification.
let cachedBag: RegistryBagItem[] = readFromStorage()
const EMPTY_BAG: RegistryBagItem[] = []

function dispatchRegistryBagChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('opusfesta:registry-bag-changed'))
}

export function getRegistryBag(): RegistryBagItem[] {
  return cachedBag
}

export function getRegistryBagServerSnapshot(): RegistryBagItem[] {
  return EMPTY_BAG
}

export function setRegistryBag(items: RegistryBagItem[]): void {
  cachedBag = items
  writeToStorage(items)
  dispatchRegistryBagChanged()
}

export function addToRegistryBag(item: Omit<RegistryBagItem, 'quantity'> & { quantity?: number }): void {
  const bag = getRegistryBag()
  const idx = bag.findIndex((b) => b.category === item.category && b.id === item.id)
  const next =
    idx >= 0
      ? bag.map((b, i) => (i === idx ? { ...b, quantity: b.quantity + (item.quantity ?? 1) } : b))
      : [...bag, { ...item, quantity: item.quantity ?? 1 }]
  setRegistryBag(next)
}

export function removeFromRegistryBag(category: string, id: string): void {
  setRegistryBag(getRegistryBag().filter((b) => !(b.category === category && b.id === id)))
}

export function clearRegistryBag(): void {
  setRegistryBag([])
}

export function subscribeRegistryBag(onChange: () => void): () => void {
  const handler = () => {
    cachedBag = readFromStorage()
    onChange()
  }
  window.addEventListener('opusfesta:registry-bag-changed', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('opusfesta:registry-bag-changed', handler)
    window.removeEventListener('storage', handler)
  }
}
