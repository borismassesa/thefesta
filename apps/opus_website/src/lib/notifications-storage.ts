'use client'

// Client-side notifications store for the header bell. Mirrors the registry-bag
// store: localStorage-backed, exposed to React via useSyncExternalStore with a
// stable cached snapshot. There is no notifications backend on the marketing
// site yet, so this is the single source of truth; `addNotification` is the
// entry point for any future server/event push to surface a notification.

const NOTIF_KEY = 'opusfesta:notifications'
const SEEDED_KEY = 'opusfesta:notificationsSeeded'

export type NotificationItem = {
  id: string
  title: string
  body: string
  href?: string
  read: boolean
  createdAt: number
}

// Onboarding notifications shown once, the first time a user loads the site.
// These are real, actionable pointers rather than placeholder text.
function defaultNotifications(now: number): NotificationItem[] {
  return [
    {
      id: 'welcome',
      title: 'Welcome to OpusFesta 🎉',
      body: 'Everything for your wedding in one place. Start by exploring vendors.',
      href: '/vendors',
      read: false,
      createdAt: now,
    },
    {
      id: 'registry-tip',
      title: 'Build your gift registry',
      body: 'Add gifts you would love and share the link with your guests.',
      href: '/registry',
      read: false,
      createdAt: now - 1000 * 60 * 60, // ~1h earlier so ordering looks natural
    },
  ]
}

function readFromStorage(): NotificationItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(NOTIF_KEY)
    if (raw) return JSON.parse(raw) as NotificationItem[]
    // Never seeded before: initialise with the onboarding set, once.
    if (!window.localStorage.getItem(SEEDED_KEY)) {
      const seeded = defaultNotifications(Date.now())
      window.localStorage.setItem(NOTIF_KEY, JSON.stringify(seeded))
      window.localStorage.setItem(SEEDED_KEY, '1')
      return seeded
    }
    return []
  } catch {
    return []
  }
}

function writeToStorage(value: NotificationItem[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIF_KEY, JSON.stringify(value))
  } catch {
    /* quota or disabled — ignore */
  }
}

// Stable snapshot for useSyncExternalStore (see registry-storage for the why).
let cached: NotificationItem[] = readFromStorage()
const EMPTY: NotificationItem[] = []

function dispatchChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('opusfesta:notifications-changed'))
}

export function getNotifications(): NotificationItem[] {
  return cached
}

export function getNotificationsServerSnapshot(): NotificationItem[] {
  return EMPTY
}

function setNotifications(items: NotificationItem[]): void {
  cached = items
  writeToStorage(items)
  dispatchChanged()
}

export function addNotification(
  n: Omit<NotificationItem, 'read' | 'createdAt'> & { read?: boolean; createdAt?: number },
): void {
  const item: NotificationItem = {
    read: false,
    createdAt: Date.now(),
    ...n,
  }
  // De-dupe by id: replace an existing notification with the same id.
  const rest = getNotifications().filter((x) => x.id !== item.id)
  setNotifications([item, ...rest])
}

export function markNotificationRead(id: string): void {
  setNotifications(getNotifications().map((n) => (n.id === id ? { ...n, read: true } : n)))
}

export function markAllNotificationsRead(): void {
  setNotifications(getNotifications().map((n) => ({ ...n, read: true })))
}

export function clearNotifications(): void {
  setNotifications([])
}

export function subscribeNotifications(onChange: () => void): () => void {
  const handler = () => {
    cached = readFromStorage()
    onChange()
  }
  window.addEventListener('opusfesta:notifications-changed', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('opusfesta:notifications-changed', handler)
    window.removeEventListener('storage', handler)
  }
}
