import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface SessionValue {
  /** Someone is using the kiosk: the data providers poll and the 3D world runs. False on the welcome screen. */
  active: boolean
  /** Goes up with each new session, so per-visitor state (quiz, rewind) can start fresh. */
  id: number
  start: () => void
  end: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

/**
 * A visitor session. The welcome screen has none, so the kiosk sends no API requests and draws no 3D
 * while nobody is looking. A tap on the welcome screen starts one; the idle timeout ends it.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [id, setId] = useState(0)
  const start = useCallback(() => {
    setActive((was) => {
      if (!was) setId((n) => n + 1)
      return true
    })
  }, [])
  const end = useCallback(() => setActive(false), [])
  const value = useMemo(() => ({ active, id, start, end }), [active, id, start, end])
  return <SessionContext value={value}>{children}</SessionContext>
}

// eslint-disable-next-line react/only-export-components
export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession needs a SessionProvider')
  return value
}
