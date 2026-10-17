import { Cartesian2, Cartesian3, Color, DistanceDisplayCondition, LabelStyle, NearFarScalar, VerticalOrigin } from 'cesium'
import { Entity, LabelGraphics } from 'resium'
import terminalsJson from '../config/terminals.json'
import { useContent } from '../hooks/useContent'
import type { Terminal, TerminalId } from '../types/route'

/** Landmark text (src/mocks/{lang}/landmarks.json) with each terminal's name */
const NAME_IDS: Record<TerminalId, string> = { SWB: 'swartz-bay-terminal', TSA: 'tsawwassen-terminal' }
const INK = Color.fromCssColorString('#15191C')

/** Name tags at the two ferry berths, always shown, so the dock is easy to recognise. */
export function TerminalLabels() {
  const texts = useContent('landmarks')
  if (!texts) return null
  return (terminalsJson as Terminal[]).map(({ id, lat, lon }) => {
    const name = texts[NAME_IDS[id]]?.name
    if (!name) return null
    return (
      <Entity key={id} position={Cartesian3.fromDegrees(lon, lat, 30)}>
        <LabelGraphics
          text={name}
          font='600 15px Outfit, sans-serif'
          fillColor={INK}
          style={LabelStyle.FILL}
          showBackground
          backgroundColor={Color.WHITE.withAlpha(0.88)}
          backgroundPadding={new Cartesian2(10, 6)}
          verticalOrigin={VerticalOrigin.BOTTOM}
          distanceDisplayCondition={new DistanceDisplayCondition(0, 25_000)}
          scaleByDistance={new NearFarScalar(1_000, 1, 20_000, 0.7)}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
    )
  })
}
