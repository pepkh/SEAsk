/**
 * One row of the ship data feed (GET /api/ship/latest).
 * The property names are the same as the API column names.
 * A sensor value is null when the sensor sends no reading.
 */
export interface ShipRow {
  /** ISO 8601 time, UTC */
  time: string
  /** ISO 8601 time with the local offset */
  time_local: string
  latitude: number
  longitude: number
  /** °C */
  air_temperature: number | null
  /** hPa */
  barometric_pressure: number | null
  /** ppb */
  cdom_fluorescence: number | null
  /** µg/L */
  chlorophyll: number | null
  /** S/m */
  conductivity: number | null
  current: number | null
  /** Dissolved oxygen, % of saturation */
  oxygen_saturation: number | null
  /** Degrees, positive to starboard */
  roll: number | null
  /** PSU */
  salinity: number | null
  /** Course over ground, degrees true (GPS noise when the ship is nearly stopped) */
  ship_course: number
  /** Where the bow points, degrees true (compass). Missing in older feeds. */
  heading?: number | null
  /** m/s */
  sound_speed: number | null
  /** knots */
  speed_over_ground: number
  systemstatus: number | string | null
  tank_level: number | null
  /** °C */
  tsg_temperature: number | null
  /** NTU */
  turbidity: number | null
  valve_position_status: number | string | null
}

/** The sensor columns that the kiosk shows. */
export type ReadingKey =
  | 'tsg_temperature'
  | 'salinity'
  | 'oxygen_saturation'
  | 'conductivity'
  | 'chlorophyll'
  | 'turbidity'
  | 'cdom_fluorescence'
  | 'sound_speed'
  | 'air_temperature'
  | 'barometric_pressure'

/** The readings that can colour the track on the Grown-ups map. */
export type TrackKey = 'salinity' | 'tsg_temperature' | 'oxygen_saturation' | 'turbidity' | 'chlorophyll'
