import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
const subscribe = (onChange: () => void) => {
  const media = matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** True when the user asks the system for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches)
}
