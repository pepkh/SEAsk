/*
 * Sunrise, sunset and civil dusk (NOAA solar position, accurate to about a minute at these latitudes).
 * Works offline for any date and place.
 */

const RAD = Math.PI / 180

/** UTC ms when the sun's centre is at `altitude` degrees, rising (morning) or setting (evening), on the UTC day of `dayMs`. */
function sunTime(dayMs: number, lat: number, lon: number, altitude: number, rising: boolean): number | null {
  const day = new Date(dayMs)
  const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())
  // Iterate twice: solar noon and declination depend on the time we are solving for.
  let t = start + 12 * 3_600_000 - (lon / 15) * 3_600_000
  for (let k = 0; k < 3; k++) {
    const jc = (t / 86_400_000 + 2440587.5 - 2451545) / 36525
    const l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    const m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    const c = Math.sin(m * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * m * RAD) * 0.000289
    const trueLong = l0 + c
    const omega = 125.04 - 1934.136 * jc
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD)
    const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    const eps = eps0 + 0.00256 * Math.cos(omega * RAD)
    const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
    const y = Math.tan((eps / 2) * RAD) ** 2
    const eqTime = 4 / RAD * (y * Math.sin(2 * l0 * RAD) - 2 * e * Math.sin(m * RAD) + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) - 0.5 * y * y * Math.sin(4 * l0 * RAD) - 1.25 * e * e * Math.sin(2 * m * RAD))
    const cosH = (Math.sin(altitude * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl))
    if (cosH < -1 || cosH > 1) return null
    const hourAngle = Math.acos(cosH) / RAD
    const noonMin = 720 - 4 * lon - eqTime
    const minutes = noonMin + (rising ? -1 : 1) * 4 * hourAngle
    t = start + minutes * 60_000
  }
  return t
}

export interface SunTimes {
  sunrise: number | null
  sunset: number | null
  /** End of civil twilight (sun 6° below the horizon) */
  civilDusk: number | null
}

/** Sun times for the local day that starts at `dayStartMs`. */
export function sunTimes(dayStartMs: number, lat: number, lon: number): SunTimes {
  // Local midnight on this coast is 07:00 or 08:00 UTC; local noon is about 19:00–20:00 UTC that day.
  const noon = dayStartMs + 12 * 3_600_000
  return {
    sunrise: sunTime(noon, lat, lon, -0.833, true),
    sunset: sunTime(noon, lat, lon, -0.833, false),
    civilDusk: sunTime(noon, lat, lon, -6, false),
  }
}
