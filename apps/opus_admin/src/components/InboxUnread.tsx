'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// Unread count behind the Header's Messages badge.
//
// Seeded on the server so the badge is correct on first paint, then kept in
// sync by /inbox itself. The page owns read/archive state, so after the first
// interaction it is the only thing that knows the real number — without this,
// the badge would keep showing the seed while the page showed fewer, because
// the (admin) layout does not re-render on client-side navigation.
//
// Same page-drives-the-header shape as PageHeading and PageSearch.

const ValueContext = createContext<number>(0)
const SetterContext = createContext<((next: number) => void) | null>(null)

export function InboxUnreadProvider({
  initial,
  children,
}: {
  initial: number
  children: ReactNode
}) {
  const [count, setCount] = useState(initial)
  // Value and setter are split so the setter stays referentially stable and
  // the publishing effect below doesn't loop.
  const setStable = useCallback((next: number) => setCount(next), [])
  return (
    <SetterContext.Provider value={setStable}>
      <ValueContext.Provider value={count}>{children}</ValueContext.Provider>
    </SetterContext.Provider>
  )
}

export function useInboxUnread(): number {
  return useContext(ValueContext)
}

// Publish the live count from /inbox. Deliberately not cleared on unmount:
// navigating away from the inbox does not make read threads unread again.
export function usePublishInboxUnread(count: number): void {
  const setCount = useContext(SetterContext)
  useEffect(() => {
    setCount?.(count)
  }, [setCount, count])
}
