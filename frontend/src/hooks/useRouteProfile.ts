import { useEffect, useState } from 'react'
import { getRouteProfile } from '../api/routeProfile'
import { BUNDLED_PROFILE } from '../ship/profile'
import type { RouteProfile } from '../types/profile'

let fetched: Promise<RouteProfile | null> | undefined

/** The recorded day's route profile: the bundled copy at once, then the API's when live data is on (asked once per page load). */
export function useRouteProfile(): RouteProfile {
  const [profile, setProfile] = useState(BUNDLED_PROFILE)

  useEffect(() => {
    let live = true
    fetched ??= getRouteProfile()
    fetched.then((result) => live && result && setProfile(result))
    return () => {
      live = false
    }
  }, [])

  return profile
}
