import {
  CallbackProperty,
  Cartesian3,
  ExtrapolationType,
  HeadingPitchRoll,
  JulianDate,
  Math as CesiumMath,
  SampledPositionProperty,
  TimeInterval,
  Transforms,
} from 'cesium'
import type { ShipRow } from '../types/feed'

/** Height of the water surface and of the ship waterline (m). Above the DEM sea level (0 m). */
export const WATER_HEIGHT = 1
/** Samples older than this are removed. */
const KEEP_S = 60

/** Below this speed (kn) the GPS course is noise, so it is not used for the bow direction. */
const STEADY_KN = 1

export interface ShipTrack {
  position: SampledPositionProperty
  orientation: CallbackProperty
  /** Where the bow points, degrees true */
  heading: () => number
  add: (row: ShipRow) => void
}

/** Ship position (smoothed between feed fixes) and orientation (compass heading, else course when under way). */
export function createShipTrack(): ShipTrack {
  const position = new SampledPositionProperty()
  position.forwardExtrapolationType = ExtrapolationType.HOLD
  position.backwardExtrapolationType = ExtrapolationType.HOLD
  let heading: number | undefined
  let lastFix: string | undefined

  // The model forward axis is local +X, which points east at heading 0, so Cesium heading = bow − 90°.
  const orientation = new CallbackProperty((time) => {
    const p = time && position.getValue(time)
    return p ? Transforms.headingPitchRollQuaternion(p, new HeadingPitchRoll(CesiumMath.toRadians((heading ?? 0) - 90), 0, 0)) : undefined
  }, false)

  return {
    position,
    orientation,
    heading: () => heading ?? 0,
    add(row) {
      // The feed repeats a fix until a new one comes; only new fixes are samples, so the ship glides between them.
      if (row.time !== lastFix) {
        lastFix = row.time
        // Sample by arrival time, so a feed with past timestamps still moves in real time.
        const now = JulianDate.now()
        position.addSample(now, Cartesian3.fromDegrees(row.longitude, row.latitude, WATER_HEIGHT))
        position.removeSamples(new TimeInterval({ start: JulianDate.fromDate(new Date(0)), stop: JulianDate.addSeconds(now, -KEEP_S, new JulianDate()) }))
      }
      if (row.heading !== null && row.heading !== undefined) heading = row.heading
      else if (heading === undefined || row.speed_over_ground >= STEADY_KN) heading = row.ship_course
    },
  }
}
