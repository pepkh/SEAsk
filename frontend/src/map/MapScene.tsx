import 'cesium/Build/Cesium/Widgets/widgets.css'

import {
  CesiumTerrainProvider,
  ClockRange,
  ClockStep,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  JulianDate,
  RectangleGeometry,
} from 'cesium'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Clock, Entity, Globe, ImageryLayer, Primitive, Scene, ScreenSpaceCameraController, Viewer } from 'resium'
import { CONTEXT_AREA, TERRAIN_CREDIT, TERRAIN_SHORT_CREDIT } from '../config/tiles'
import { useLanguage } from '../i18n/LanguageContext'
import type { ViewName } from '../scene/constants'
import { useShip } from '../ship/ShipProvider'
import { ferryGlbUrl } from './ferryGlb'
import { Landmarks } from './Landmarks'
import { IMAGERY_LOOK, imageryCredit, imageryProviders, imageryShortCredit, terrainProvider, toRectangle } from './layers'
import { MapCredits } from './MapCredits'
import styles from './MapScene.module.css'
import { SURFACE_GRANULARITY } from './positions'
import { createShipTrack, WATER_HEIGHT, type ShipTrack } from './shipTrack'
import { fixedSunLight } from './sun'
import { TerminalLabels } from './TerminalLabels'
import { useMapCamera } from './useMapCamera'
import { Wake } from './Wake'
import { createWaterMaterial } from './waterMaterial'

/** The map lags the feed a little, so the ship always moves between two known fixes (live fixes come every few seconds). */
const RENDER_DELAY_S = 5
const SEA = Color.fromCssColorString('#174a5e')

/** Offline Cesium map with terrain, water and the ferry at the feed position (map mode). */
export function MapScene({ view, children }: { view: ViewName; children?: ReactNode }) {
  const { lang } = useLanguage()
  const ship = useShip()
  const track = useMemo(() => createShipTrack(), [])
  const start = useMemo(() => JulianDate.addSeconds(JulianDate.now(), -RENDER_DELAY_S, new JulianDate()), [])
  const layers = useMemo(() => imageryProviders(lang), [lang])
  const [hasTerrain, setHasTerrain] = useState(false)
  const speedKn = useRef(0)
  /** True while something on the map wants the camera to stop circling (a landmark label). */
  const holdCamera = useRef(false)
  const onLandmarkOpen = useCallback((open: boolean) => {
    holdCamera.current = open
  }, [])
  const light = useMemo(() => fixedSunLight(), [])

  useEffect(() => {
    terrainProvider().then((p) => setHasTerrain(p instanceof CesiumTerrainProvider))
  }, [])

  useEffect(() => {
    if (!ship) return
    track.add(ship.row)
    speedKn.current = ship.row.speed_over_ground
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
        <Scene light={light} />
        <Globe depthTestAgainstTerrain baseColor={SEA} />
        <ScreenSpaceCameraController minimumZoomDistance={120} maximumZoomDistance={3000} />
        {layers.map(({ key, provider }) => <ImageryLayer key={key} imageryProvider={provider} {...IMAGERY_LOOK} />)}
        {hasTerrain && <Water />}
        <Wake track={track} speedKn={speedKn} />
        <Ship track={track} />
        <Camera view={view} track={track} hold={holdCamera} />
        <Landmarks onOpenChange={onLandmarkOpen} />
        <TerminalLabels />
        {children}
      </Viewer>
      <MapCredits
        short={[imageryShortCredit(), ...(hasTerrain ? [TERRAIN_SHORT_CREDIT] : [])].join(' · ')}
        full={[imageryCredit(), ...(hasTerrain ? [TERRAIN_CREDIT] : [])].join(' · ')}
      />
    </>
  )
}

/** Moving water over the map area (see waterMaterial.ts). The terrain hides it on land. */
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
        flat: true, // the material does its own shading
        translucent: false, // writes depth, so the hull below the waterline stays hidden
        material: createWaterMaterial(),
      }),
    }),
    [],
  )
  // Not pickable, so a click on the water reaches the landmark lookup (it uses pickPosition).
  return <Primitive geometryInstances={water.instance} appearance={water.appearance} allowPicking={false} />
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

function Camera({ view, track, hold }: { view: ViewName; track: ShipTrack; hold: RefObject<boolean> }) {
  useMapCamera(view, track, hold)
  return null
}
