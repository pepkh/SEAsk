import type { DayData } from '../../../bridge/model'
import type { Snapshot } from '../../../bridge/snapshot'
import { fmtClock, fmtDuration } from '../../../bridge/time'
import type { QaContext, QaItem } from '../../../qa/types'
import { compass, deg, num, ZONE_NAMES } from '../strings'

/*
 * Canned crew questions. Most answers are filled from the snapshot at the playhead, so they agree
 * with the panels; the "why" answers come from what the day's data shows (DATA.md §5).
 */

export const CREW_QA: QaItem[] = [
  {
    id: 'ap-current',
    question: 'What is Active Pass doing, and when is slack?',
    answer: 'Active Pass is running {apDir} at {apKn} kn, setting {apToward}. Next slack {apSlack} ({apSlackIn}). {apNextMax}',
    fallback: 'There is no Active Pass current prediction for this time.',
    sources: ['DFO IWLS station 07527 · {at}'],
    keywords: ['current', 'slack', 'tide', 'flood', 'ebb', 'pass'],
  },
  {
    id: 'water-usual',
    question: 'How does the water here compare to usual?',
    answer: 'Near {zone}: sea temperature {sstNow} °C against a usual {sstUsual} °C, salinity {salNow} psu against {salUsual} psu ({salWord}), oxygen saturation {o2Now} % against {o2Usual} %.',
    fallback: 'The seawater sensors have no reading now: the pump is off at the berth, or the TSG is flagged by ONC QC.',
    sources: ['ONC TWSB · {at}', 'usual: {usualFrom}'],
    keywords: ['water', 'temperature', 'salinity', 'oxygen', 'usual', 'normal', 'compare'],
  },
  {
    id: 'roughest',
    question: 'Which crossing today was the roughest?',
    answer: 'Crossing {roughId} ({roughLeg}, departed {roughStart}) rolled the most: σ {roughStd}°, up to {roughMax}°. The calmest was crossing {calmId} at σ {calmStd}°.',
    fallback: 'The crossing statistics are not loaded.',
    sources: ['ONC TWSB roll · crossing stats'],
    keywords: ['rough', 'roll', 'calm', 'motion', 'crossing', 'worst'],
  },
  {
    id: 'pressure',
    question: 'Is the pressure falling?',
    answer: 'Pressure is {baro} hPa, {baroTrend} ({baroDelta} hPa in 3 h).',
    fallback: 'Pressure is {baro} hPa. The trend needs three hours of readings.',
    sources: ['ONC TWSB barometer · {at}'],
    keywords: ['pressure', 'barometer', 'baro', 'weather', 'front'],
  },
  {
    id: 'traffic',
    question: 'Any traffic to watch?',
    answer: '{traffic}',
    fallback: 'No AIS traffic is loaded for this time.',
    sources: ['ONC Iona AIS · {at}'],
    keywords: ['traffic', 'vessel', 'ship', 'cpa', 'collision', 'ais', 'boat'],
  },
  {
    id: 'wind',
    question: 'What is the wind doing?',
    answer: 'Wind at the ship is {windKn} kn from {windFrom}, gusting {gustKn} kn ({windSource}). {nearestNote}',
    fallback: 'No wind data for this time.',
    sources: ['Environment Canada stations · {at}', 'Open-Meteo model'],
    keywords: ['wind', 'gust', 'breeze', 'blow'],
  },
  {
    id: 'deep',
    question: 'What is the water like on the seabed?',
    answer: 'At SCVIP (300 m) the water is {scvipT} °C and {scvipSal} psu, with O₂ saturation {scvipO2} %. At SEVIP (165 m) it is {sevipT} °C, O₂ {sevipO2} %. Deep water stays cold and low in oxygen all year.',
    fallback: 'The ONC observatory data is not loaded.',
    sources: ['ONC SCVIP, SEVIP · {at}'],
    keywords: ['deep', 'seabed', 'bottom', 'venus', 'observatory', 'node'],
  },
  {
    id: 'plume',
    question: 'Why does salinity drop toward Tsawwassen?',
    answer: 'That is the Fraser River plume. Fresh, warmer river water spreads over the Strait of Georgia from the river mouth just north of Tsawwassen. On this day salinity fell from about 29 psu near Swartz Bay to about 26 psu near Tsawwassen, and the sea warmed from 13–14 °C to almost 17 °C.',
    sources: ['ONC TWSB, 8 crossings of 2026-08-17'],
    keywords: ['fraser', 'plume', 'river', 'fresh', 'salinity', 'brown'],
  },
  {
    id: 'active-pass-cold',
    question: 'Why is Active Pass colder and lower in oxygen?',
    answer: 'Strong tidal currents in Active Pass mix deep water up to the surface. Deep water is colder, saltier and lower in oxygen, so the surface there reads about 12.6 °C and 29.6 psu, with oxygen saturation down to about 70 %.',
    sources: ['ONC TWSB, 2026-08-17'],
    keywords: ['active', 'pass', 'cold', 'mixing', 'oxygen'],
  },
]

/** Placeholder values for the crew answers at the snapshot's moment. */
export function crewContext(snap: Snapshot, day: DayData): QaContext {
  const v: Record<string, string | null> = { at: fmtClock(snap.t) }
  const ok = (x: number | undefined | null, digits = 1) => (x !== undefined && x !== null && Number.isFinite(x) ? num(x, digits) : null)

  const c = snap.current
  if (c && Number.isFinite(c.kn)) {
    v.apDir = c.flooding === null ? 'slack' : c.flooding ? 'flood' : 'ebb'
    v.apKn = num(c.kn)
    v.apToward = `${deg(c.towardDeg)} (${compass(c.towardDeg)})`
    v.apSlack = c.nextSlack ? `at ${fmtClock(c.nextSlack)}` : 'not before midnight'
    v.apSlackIn = c.nextSlack ? `in ${fmtDuration(c.nextSlack - snap.t)}` : 'later'
    v.apNextMax = c.nextMax ? `Next maximum ${c.nextMax.type} ${num(c.nextMax.kn)} kn at ${fmtClock(c.nextMax.t)}.` : ''
  }

  const s = snap.ship
  if (s) {
    v.zone = s.zone ? ZONE_NAMES[s.zone] ?? s.zone : 'the route'
    v.sstNow = ok(s.water.sstC.now)
    v.sstUsual = ok(s.water.sstC.usual)
    v.salNow = ok(s.water.sal.now)
    v.salUsual = ok(s.water.sal.usual)
    const d = s.water.sal.now - s.water.sal.usual
    v.salWord = Number.isFinite(d) ? (Math.abs(d) < 0.3 ? 'about usual' : d < 0 ? 'fresher than usual' : 'saltier than usual') : null
    v.o2Now = ok(s.water.o2Sat.now, 0)
    v.o2Usual = ok(s.water.o2Sat.usual, 0)
    v.usualFrom = s.water.sal.usualFrom === 'climatology' ? 'ONC Augusts' : 'today’s crossings'
    v.baro = ok(s.baroHpa)
    v.baroTrend = s.baro?.label ?? null
    v.baroDelta = s.baro ? `${s.baro.delta > 0 ? '+' : ''}${num(s.baro.delta)}` : null
  }

  const stats = day.stats?.filter((x) => x.roll_std !== null)
  if (stats?.length) {
    const rough = stats.reduce((a, b) => (b.roll_std! > a.roll_std! ? b : a))
    const calm = stats.reduce((a, b) => (b.roll_std! < a.roll_std! ? b : a))
    v.roughId = String(rough.id)
    v.roughLeg = rough.direction === 'swb_to_tsa' ? 'Swartz Bay → Tsawwassen' : 'Tsawwassen → Swartz Bay'
    v.roughStart = fmtClock(Date.parse(rough.start))
    v.roughStd = num(rough.roll_std, 2)
    v.roughMax = num(rough.max_abs_roll, 1)
    v.calmId = String(calm.id)
    v.calmStd = num(calm.roll_std, 2)
  }

  if (day.traffic && s) {
    const danger = snap.targets.find((x) => x.danger)
    const near = snap.targets[0]
    if (danger) {
      v.traffic = `Watch ${danger.v.name}: ${num(danger.cpa.rangeNm, 1)} nm ${compass(danger.cpa.bearingDeg)}, closest approach ${num(danger.cpa.cpaNm, 2)} nm in ${num(danger.cpa.tcpaMin, 0)} min.`
    } else if (near) {
      v.traffic = `Nothing comes within 0.5 nm in the next 20 minutes. Nearest is ${near.v.name}, ${num(near.cpa.rangeNm, 1)} nm ${compass(near.cpa.bearingDeg)}, ${num(near.sogKn, 0)} kn.`
    } else {
      v.traffic = 'No AIS targets near the ferry.'
    }
  }

  const w = snap.wind.atShip
  if (w) {
    v.windKn = num(w.kn, 0)
    v.windFrom = compass(w.fromDeg)
    v.gustKn = Number.isFinite(w.gustKn) ? num(w.gustKn, 0) : '—'
    v.windSource = w.source.kind === 'measured' ? `measured at ${w.source.station}` : `from the ${w.source.label} model`
    const n = snap.wind.nearest
    v.nearestNote = n && !(w.source.kind === 'measured' && w.source.station === n.name)
      ? `${n.name} (${num(n.distKm, 0)} km) measures ${n.kn === 0 ? 'calm' : `${num(n.kn, 0)} kn from ${compass(n.fromDeg)}`}.`
      : ''
  }

  const scvip = snap.deep.find((d) => d.code === 'SCVIP')?.v
  const sevip = snap.deep.find((d) => d.code === 'SEVIP')?.v
  if (scvip && sevip) {
    v.scvipT = ok(scvip.tempC, 2)
    v.scvipSal = ok(scvip.sal, 2)
    v.scvipO2 = ok(scvip.o2Sat, 0)
    v.sevipT = ok(sevip.tempC, 2)
    v.sevipO2 = ok(sevip.o2Sat, 0)
  }
  return { values: v }
}
