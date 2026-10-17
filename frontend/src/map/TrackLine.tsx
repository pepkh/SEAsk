import { Color, GeometryInstance, PolylineColorAppearance, PolylineGeometry } from 'cesium'
import { Primitive } from 'resium'
import { rampColor, sample } from '../screens/Journey/adults/trackColour'
import type { TrackMeta } from '../types/content'
import type { ShipRow } from '../types/feed'
import { toPositions } from './positions'

const MAX_POINTS = 150

/** Travelled track of the current crossing. Each point has the ramp colour of the selected reading. */
export function TrackLine({ crossing, track }: { crossing: ShipRow[]; track: TrackMeta }) {
  const rows = sample(crossing.filter((r) => r[track.key] !== null), MAX_POINTS)
  const last = rows[rows.length - 1]
  const key = `${track.key}:${rows.length}:${last?.time}`

  if (rows.length < 2) return null
  const line = new GeometryInstance({
    geometry: new PolylineGeometry({
      positions: toPositions(rows.map((r) => [r.latitude, r.longitude])),
      colors: rows.map((r) => Color.fromCssColorString(rampColor(r[track.key]!, track))),
      colorsPerVertex: true,
      width: 8,
      vertexFormat: PolylineColorAppearance.VERTEX_FORMAT,
    }),
  })

  // A new primitive for each change; synchronous, so the old line does not blink out.
  return <Primitive key={key} geometryInstances={line} appearance={new PolylineColorAppearance()} asynchronous={false} />
}
