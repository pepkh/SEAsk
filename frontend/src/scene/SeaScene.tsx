import { Canvas } from '@react-three/fiber'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { CameraRig } from './CameraRig'
import { CRUISE_KN, HORIZON, SUN_POSITION, type ViewName } from './constants'
import { Ferry } from './Ferry'
import { Landscape } from './Landscape'
import { Ocean } from './Ocean'
import { ReadyProbe } from './ReadyProbe'

interface Props {
  view: ViewName
  speedKn: number
  /** Stop drawing while another screen covers the scene */
  paused?: boolean
}

/** Full-bleed 3D sea with the ferry centre stage (sea mode of the ferry screen). */
export default function SeaScene({ view, speedKn, paused = false }: Props) {
  const reduced = useReducedMotion()
  const speedFactor = Math.max(0, Math.min(1.3, speedKn / CRUISE_KN))

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      frameloop={paused ? 'never' : 'always'}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.05
      }}
    >
      <fog attach="fog" args={[HORIZON, 1200, 4600]} />
      <hemisphereLight args={['#eaf4f8', '#33505a', 1.25]} />
      <directionalLight
        color="#fff0d8"
        intensity={2.6}
        position={SUN_POSITION}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={50}
        shadow-camera-far={900}
      />
      <Ferry speedFactor={speedFactor} reduced={reduced} />
      <Ocean speedFactor={speedFactor} reduced={reduced} />
      <Landscape speedFactor={speedFactor} reduced={reduced} />
      <CameraRig view={view} reduced={reduced} />
      <ReadyProbe />
    </Canvas>
  )
}
