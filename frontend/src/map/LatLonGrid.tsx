import { Cartesian2, Cartesian3, Color, LabelStyle } from 'cesium'
import { Entity, LabelGraphics, PolylineGraphics } from 'resium'
import { ROUTE_AREA } from '../config/tiles'
import { formatLatLon } from '../i18n/format'
import { useLanguage } from '../i18n/LanguageContext'
import { SURFACE_GRANULARITY, toPositions } from './positions'

/* The same grid as the Grown-ups SVG map. */
const LATS = [48.95, 48.8]
const LONS = [-123.4, -123.2]
const LINE = Color.WHITE.withAlpha(0.35)
const TEXT = Color.fromCssColorString('#5E7480')
const { west, south, east, north } = ROUTE_AREA

const Label = ({ lat, lon, text }: { lat: number; lon: number; text: string }) => (
  <Entity position={Cartesian3.fromDegrees(lon, lat, 2)}>
    <LabelGraphics
      text={text}
      font='13px "JetBrains Mono", monospace'
      fillColor={TEXT}
      outlineColor={Color.WHITE}
      outlineWidth={3}
      style={LabelStyle.FILL_AND_OUTLINE}
      pixelOffset={new Cartesian2(0, -10)}
    />
  </Entity>
)

export function LatLonGrid() {
  const { lang } = useLanguage()
  return (
    <>
      {LATS.map((lat) => (
        <Entity key={`lat${lat}`}>
          <PolylineGraphics positions={toPositions([[lat, west], [lat, east]])} width={1} material={LINE} granularity={SURFACE_GRANULARITY} />
        </Entity>
      ))}
      {LONS.map((lon) => (
        <Entity key={`lon${lon}`}>
          <PolylineGraphics positions={toPositions([[south, lon], [north, lon]])} width={1} material={LINE} granularity={SURFACE_GRANULARITY} />
        </Entity>
      ))}
      {LATS.map((lat) => <Label key={`tlat${lat}`} lat={lat} lon={west + 0.05} text={formatLatLon(lat, 'lat', lang, 2)} />)}
      {LONS.map((lon) => <Label key={`tlon${lon}`} lat={south + 0.02} lon={lon} text={formatLatLon(lon, 'lon', lang, 2)} />)}
    </>
  )
}
