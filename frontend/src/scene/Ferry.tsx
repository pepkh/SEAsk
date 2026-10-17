import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { buildFerry, type FerryParts } from './buildFerry'

interface Props {
  /** 0 = docked, 1 = cruise speed */
  speedFactor: number
  reduced: boolean
}

/** The procedural ferry. It rides the swell; the radars turn and the propellers follow the speed. */
export function Ferry({ speedFactor, reduced }: Props) {
  const ship = useMemo(() => buildFerry(), [])
  const rig = useRef<THREE.Group>(null)
  const time = useRef(0)

  useFrame((_, delta) => {
    if (reduced || !rig.current) return
    const dt = Math.min(0.05, delta)
    const t = (time.current += dt)
    rig.current.position.y = Math.sin(t * 0.9) * 0.45 + Math.sin(t * 1.7) * 0.15
    rig.current.rotation.x = Math.sin(t * 0.7 + 0.6) * 0.006
    rig.current.rotation.z = Math.sin(t * 0.55) * 0.012
    const { radars, props } = ship.userData as FerryParts
    radars.forEach((r, i) => (r.rotation.y += dt * (i ? 2.1 : 2.6)))
    props.forEach((p) => (p.rotation.z += dt * 5 * speedFactor))
  })

  return (
    <group ref={rig}>
      <primitive object={ship} />
    </group>
  )
}
