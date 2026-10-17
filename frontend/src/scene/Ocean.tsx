import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HORIZON, SUN_POSITION, VIS_SPEED } from './constants'
import { oceanFragmentShader, oceanVertexShader } from './oceanShaders'

interface Props {
  /** 0 = docked, 1 = cruise speed */
  speedFactor: number
  reduced: boolean
}

export function Ocean({ speedFactor, reduced }: Props) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => new THREE.PlaneGeometry(9000, 9000, 360, 360).rotateX(-Math.PI / 2), [])
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOffset: { value: 0 },
      uWake: { value: 1 },
      uDeep: { value: new THREE.Color('#123f50') },
      uShallow: { value: new THREE.Color('#2f7e93') },
      uSky: { value: new THREE.Color('#a9cbdb') },
      // Mixed in after the sRGB conversion, so this one stays in sRGB.
      uFog: { value: new THREE.Color(HORIZON).convertLinearToSRGB() },
      uSun: { value: new THREE.Vector3(...SUN_POSITION).normalize() },
    }),
    [],
  )

  useFrame((_, delta) => {
    if (reduced || !material.current) return
    const dt = Math.min(0.05, delta)
    const u = material.current.uniforms
    u.uTime.value += dt
    u.uOffset.value += VIS_SPEED * speedFactor * dt
    u.uWake.value = Math.min(1, speedFactor)
  })

  return (
    <mesh geometry={geometry}>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={oceanVertexShader} fragmentShader={oceanFragmentShader} />
    </mesh>
  )
}
