import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type ComponentRef } from 'react'
import * as THREE from 'three'
import { IDLE_RETURN_MS, VIEWS, type ViewName } from './constants'

const UP = new THREE.Vector3(0, 1, 0)

/** Camera and orbit controls. The camera glides to the selected view, drifts, and returns after 15 s with no input. */
export function CameraRig({ view, reduced }: { view: ViewName; reduced: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const portrait = useThree((s) => s.size.width < s.size.height)
  const lastTouch = useRef(-1e9)
  const flyTo = useRef(true)
  const time = useRef(0)

  useEffect(() => {
    flyTo.current = true
    lastTouch.current = -1e9
  }, [view])

  useFrame(({ camera }, delta) => {
    const dt = Math.min(0.05, delta)
    if (!reduced) time.current += dt
    if (performance.now() - lastTouch.current > IDLE_RETURN_MS) flyTo.current = true
    if (!flyTo.current || !controls.current) return
    const v = VIEWS[view]
    const drift = reduced ? 0 : Math.sin(time.current * 0.05) * 0.18
    const goal = new THREE.Vector3(...v.pos).applyAxisAngle(UP, view === 'top' ? 0 : drift)
    const s = 1 - Math.exp(-dt * 1.2)
    camera.position.lerp(goal, s)
    controls.current.target.lerp(new THREE.Vector3(...v.tgt), s)
  })

  return (
    <>
      <PerspectiveCamera makeDefault fov={portrait ? 50 : 32} near={1} far={8000} position={VIEWS.chase.pos} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        enablePan={false}
        minDistance={120}
        maxDistance={900}
        maxPolarAngle={Math.PI * 0.47}
        target={VIEWS.chase.tgt}
        onStart={() => {
          lastTouch.current = performance.now()
          flyTo.current = false
        }}
      />
    </>
  )
}
