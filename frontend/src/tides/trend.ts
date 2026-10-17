/** Rising or falling now, and minutes until the water turns, from heights evenly spaced over the day. */
export function tideTrend(heights: number[], nowMin: number): { rising: boolean; minutes: number } {
  const step = 1440 / (heights.length - 1)
  const i = Math.min(heights.length - 2, Math.max(0, Math.floor(nowMin / step)))
  const rising = heights[i + 1] >= heights[i]
  let j = i + 1
  while (j < heights.length - 1 && heights[j + 1] >= heights[j] === rising) j++
  return { rising, minutes: Math.max(0, Math.round(j * step - nowMin)) }
}

export type TideKey = 'high' | 'low' | 'almostHigh' | 'almostLow' | 'rising' | 'falling'

/** Headline (tides.state.*) and sub-line (tides.trend.*) keys in src/i18n for the tide right now. */
export function describeTide(heights: number[], nowMin: number) {
  const { rising, minutes } = tideTrend(heights, nowMin)
  const headline: TideKey = minutes <= 10 ? (rising ? 'high' : 'low') : minutes <= 45 ? (rising ? 'almostHigh' : 'almostLow') : rising ? 'rising' : 'falling'
  if (minutes <= 10) return { headline, sub: rising ? ('turnSoonFall' as const) : ('turnSoonRise' as const), n: 0 }
  const hours = minutes >= 90
  return {
    headline,
    sub: rising ? (hours ? ('risingHours' as const) : ('risingMin' as const)) : hours ? ('fallingHours' as const) : ('fallingMin' as const),
    n: hours ? Math.round(minutes / 60) : Math.max(5, Math.round(minutes / 5) * 5),
  }
}
