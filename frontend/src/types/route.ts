/** [latitude, longitude] in degrees */
export type LatLon = [number, number]

export type TerminalId = 'SWB' | 'TSA'

export interface Terminal {
  id: TerminalId
  name: string
  lat: number
  lon: number
  /** The ship is docked when it is slow and inside this distance. */
  dockRadiusM: number
}

/** A part of the route. Fractions are measured from Swartz Bay (0) to Tsawwassen (1). */
export interface RouteZone {
  id: string
  from: number
  to: number
}

/** A dot on the progress bar. The label is an i18n key in "waypoint". */
export interface RouteStop {
  at: number
  label?: 'swartzBay' | 'strait' | 'tsawwassen'
}

export interface Route {
  id: string
  /** Line from Swartz Bay to Tsawwassen */
  points: LatLon[]
  /** Speed for the ETA when the ship is slow (just after departure) */
  serviceSpeedKn: number
  /** Route fraction of the Active Pass anchor. The SVG drawings use it to align with the mockups. */
  activePassAt: number
  zones: RouteZone[]
  stops: RouteStop[]
}
