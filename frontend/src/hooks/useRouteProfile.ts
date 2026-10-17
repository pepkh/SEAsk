import { useEffect, useState } from 'react'
import { getRouteProfile } from '../api/routeProfile'
import { useSession } from '../context/SessionContext'
import { BUNDLED_PROFILE } from '../ship/profile'
import type { RouteProfile } from '../types/profile'

let fetched: Promise<RouteProfile | null> | undefined

/**
 * The recorded day's route profile: the bundled copy at once, then the API's when live data is on
 * (asked once per page load, in the first visitor session).
 */
export function useRouteProfile(): RouteProfile {
  const { active } = useSession()
  const [profile, setProfile] = useState(BUNDLED_PROFILE)

  useEffect(() => {
    if (!active) return
    let live = true
    fetched ??= getRouteProfile()
    fetched.then((result) => live && result && setProfile(result))
    return () => {
      live = false
    }
  }, [active])

  return profile
}
