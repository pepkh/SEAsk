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

export interface ShipTrack {
  position: SampledPositionProperty
  orientation: CallbackProperty
  /** Latest ship course in degrees true */
  course: () => number
  add: (row: ShipRow) => void
}

/** Ship position (smoothed between feed rows) and orientation (from ship_course). */
export function createShipTrack(): ShipTrack {
  const position = new SampledPositionProperty()
  position.forwardExtrapolationType = ExtrapolationType.HOLD
  position.backwardExtrapolationType = ExtrapolationType.HOLD
  let course = 0

  // The model forward axis is local +X, which points east at heading 0, so heading = course − 90°.
  const orientation = new CallbackProperty((time) => {
    const p = time && position.getValue(time)
    return p ? Transforms.headingPitchRollQuaternion(p, new HeadingPitchRoll(CesiumMath.toRadians(course - 90), 0, 0)) : undefined
  }, false)

  return {
    position,
    orientation,
    course: () => course,
    add(row) {
      // Sample by arrival time, so a feed with past timestamps still moves in real time.
      const now = JulianDate.now()
      position.addSample(now, Cartesian3.fromDegrees(row.longitude, row.latitude, WATER_HEIGHT))
      position.removeSamples(new TimeInterval({ start: JulianDate.fromDate(new Date(0)), stop: JulianDate.addSeconds(now, -KEEP_S, new JulianDate()) }))
      course = row.ship_course
    },
  }
}
