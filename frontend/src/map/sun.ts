import { Cartesian3, DirectionalLight, Matrix4, Transforms } from 'cesium'

/**
 * A fixed afternoon sun in the south-west, as a direction towards the sun in east-north-up.
 * The map uses it for the water glint and for lighting the ferry, so the scene looks the same
 * at any time of day (the feed clock can be at night).
 */
export const SUN_ENU = new Cartesian3(-0.45, -0.35, 0.82)

/** Middle of the route, where the east-north-up frame for the light is taken. */
const ROUTE_CENTRE = Cartesian3.fromDegrees(-123.28, 48.85)

/** Scene light for models (the ferry, its wake): travels from the fixed sun towards the ground. */
export function fixedSunLight(): DirectionalLight {
  const enu = Transforms.eastNorthUpToFixedFrame(ROUTE_CENTRE)
  const towardSun = Matrix4.multiplyByPointAsVector(enu, Cartesian3.normalize(SUN_ENU, new Cartesian3()), new Cartesian3())
  return new DirectionalLight({ direction: Cartesian3.negate(towardSun, new Cartesian3()), intensity: 2.2 })
}
