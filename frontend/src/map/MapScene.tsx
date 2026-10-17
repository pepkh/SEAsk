import 'cesium/Build/Cesium/Widgets/widgets.css'

import {
  buildModuleUrl,
  CesiumTerrainProvider,
  ClockRange,
  ClockStep,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  JulianDate,
  Material,
  RectangleGeometry,
} from 'cesium'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Clock, Entity, Globe, ImageryLayer, Primitive, ScreenSpaceCameraController, Viewer } from 'resium'
import { CONTEXT_AREA, TERRAIN_CREDIT } from '../config/tiles'
import { useLanguage } from '../i18n/LanguageContext'
import type { ViewName } from '../scene/constants'
import { useShip } from '../ship/ShipProvider'
import { ferryGlbUrl } from './ferryGlb'
import { imageryCredit, imageryProviders, terrainProvider, toRectangle } from './layers'
import styles from './MapScene.module.css'
import { SURFACE_GRANULARITY } from './positions'
import { createShipTrack, WATER_HEIGHT, type ShipTrack } from './shipTrack'
import { useMapCamera } from './useMapCamera'

/** The map lags the feed a little, so the ship always moves between two known positions. */
const RENDER_DELAY_S = 1.5
const SEA = Color.fromCssColorString('#174a5e')

/** Offline Cesium map with terrain, water and the ferry at the feed position (map mode). */
export function MapScene({ view, children }: { view: ViewName; children?: ReactNode }) {
  const { lang } = useLanguage()
  const ship = useShip()
  const track = useMemo(() => createShipTrack(), [])
  const start = useMemo(() => JulianDate.addSeconds(JulianDate.now(), -RENDER_DELAY_S, new JulianDate()), [])
  const layers = useMemo(() => imageryProviders(lang), [lang])
  const [hasTerrain, setHasTerrain] = useState(false)

  useEffect(() => {
    terrainProvider().then((p) => setHasTerrain(p instanceof CesiumTerrainProvider))
  }, [])

  useEffect(() => {
    if (ship) track.add(ship.row)
  }, [ship, track])

  return (
    <>
      <Viewer
        full
        className={styles.viewer}
        baseLayer={false}
        terrainProvider={terrainProvider()}
        animation={false}
        timeline={false}
        baseLayerPicker={false}
        geocoder={false}
        homeButton={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        scene3DOnly
        shouldAnimate
      >
        {/* Real-time clock, a little behind the feed */}
        <Clock currentTime={start} clockStep={ClockStep.SYSTEM_CLOCK_MULTIPLIER} multiplier={1} clockRange={ClockRange.UNBOUNDED} />
        <Globe depthTestAgainstTerrain baseColor={SEA} />
        <ScreenSpaceCameraController minimumZoomDistance={120} maximumZoomDistance={3000} />
        {layers.map(({ key, provider }) => <ImageryLayer key={key} imageryProvider={provider} />)}
        {hasTerrain && <Water />}
        <Ship track={track} />
        <Camera view={view} track={track} />
        {children}
      </Viewer>
      {/* Licence attribution (Cesium's own credit box is hidden in the CSS). */}
      <span className={styles.credits}>{[imageryCredit(), ...(hasTerrain ? [TERRAIN_CREDIT] : [])].join(' · ')}</span>
    </>
  )
}

/** Moving water (Cesium Water material) over the map area. The terrain hides it on land. */
function Water() {
  const water = useMemo(
    () => ({
      instance: new GeometryInstance({
        geometry: new RectangleGeometry({
          rectangle: toRectangle(CONTEXT_AREA),
          height: WATER_HEIGHT,
          // A fine grid follows the Earth's curve. The default (1°) makes flat facets that sink ~200 m.
          granularity: SURFACE_GRANULARITY,
          vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new EllipsoidSurfaceAppearance({
        aboveGround: true,
        translucent: false, // writes depth, so the hull below the waterline stays hidden
        material: Material.fromType('Water', {
          baseWaterColor: SEA,
          blendColor: Color.fromCssColorString('#3b8ea3'),
          normalMap: buildModuleUrl('Assets/Textures/waterNormals.jpg'),
          frequency: 8000,
          animationSpeed: 0.02,
          amplitude: 5,
          specularIntensity: 0.6,
        }),
      }),
    }),
    [],
  )
  return <Primitive geometryInstances={water.instance} appearance={water.appearance} />
}

/** The procedural ferry (as GLB) at the smoothed feed position. */
function Ship({ track }: { track: ShipTrack }) {
  const [uri, setUri] = useState<string>()
  useEffect(() => {
    ferryGlbUrl().then(setUri)
  }, [])
  if (!uri) return null
  return <Entity position={track.position} orientation={track.orientation} model={{ uri, minimumPixelSize: 48 }} />
}

function Camera({ view, track }: { view: ViewName; track: ShipTrack }) {
  useMapCamera(view, track)
  return null
}
