'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// Focus mode: a page can ask the shell to get out of the way.
//
// Some surfaces are a workspace rather than a page. The Operations Inbox is
// the first: once a case is open it already carries its own three columns of
// navigation, and the app rail beside it is just a second, competing one. A
// page in focus mode collapses the sidebar to its icon rail so the case gets
// the width, without touching the user's own collapsed preference in
// localStorage — leaving the page restores whatever they had before.
//
// Same page-drives-the-chrome shape as PageHeading, PageSearch and
// InboxUnread. Value and setter are split so the setter stays referentially
// stable and the publishing effect below cannot loop.

const ValueContext = createContext<boolean>(false)
const SetterContext = createContext<((next: boolean) => void) | null>(null)

export function SidebarFocusProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false)
  const setStable = useCallback((next: boolean) => setFocused(next), [])
  return (
    <SetterContext.Provider value={setStable}>
      <ValueContext.Provider value={focused}>{children}</ValueContext.Provider>
    </SetterContext.Provider>
  )
}

export function useSidebarFocus(): boolean {
  return useContext(ValueContext)
}

// For the Sidebar's own expand control: expanding by hand leaves focus mode,
// and the page does not fight the user by turning it straight back on.
export function useSetSidebarFocus(): (next: boolean) => void {
  const setFocused = useContext(SetterContext)
  return useCallback((next: boolean) => setFocused?.(next), [setFocused])
}

// Request focus mode from a page. Cleared on unmount, so navigating away
// always gives the sidebar back.
export function useFocusMode(active: boolean): void {
  const setFocused = useContext(SetterContext)
  useEffect(() => {
    setFocused?.(active)
  }, [setFocused, active])
  useEffect(() => {
    return () => setFocused?.(false)
  }, [setFocused])
}
