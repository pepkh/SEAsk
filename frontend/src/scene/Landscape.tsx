import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { VIS_SPEED } from './constants'

/* Islands that drift past, and the far mountains (from the Home mockup). */

const landMat = new THREE.MeshStandardMaterial({ color: '#4f6e5d', roughness: 1, flatShading: true })
const rockMat = new THREE.MeshStandardMaterial({ color: '#8a8a7c', roughness: 1, flatShading: true })
const mtnMat = new THREE.MeshStandardMaterial({ color: '#8aa3ad', roughness: 1, flatShading: true })

function makeIsland(seed: number): THREE.Group {
  let s = seed
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  const g = new THREE.IcosahedronGeometry(1, 3)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const n = 1 + 0.18 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 0.7) + 0.08 * Math.sin(x * 7 + z * 5 + seed)
    p.setXYZ(i, x * n, Math.max(y, -0.05) * n, z * n)
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, landMat)
  const w = 260 + r() * 520, len = 400 + r() * 900, h = 60 + r() * 170
  m.scale.set(w, h, len)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.08, 1, 18, 1), rockMat)
  base.scale.set(w * 0.98, 10, len * 0.98)
  base.position.y = 2
  const grp = new THREE.Group()
  grp.add(m, base)
  return grp
}

const ISLANDS: [number, number, number][] = [
  [-720, -2600, 3], [820, -1700, 7], [-1050, -600, 11], [980, 400, 17],
  [-760, 1500, 23], [1250, 2300, 29], [-1500, 2600, 31], [1600, -2900, 37],
]

interface Props {
  /** 0 = docked, 1 = cruise speed */
  speedFactor: number
  reduced: boolean
}

export function Landscape({ speedFactor, reduced }: Props) {
  const drifting = useRef<THREE.Group>(null)
  const islands = useMemo(
    () =>
      ISLANDS.map(([x, z, seed]) => {
        const isl = makeIsland(seed)
        isl.position.set(x, -6, z)
        return isl
      }),
    [],
  )
  const mountains = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(500 + (i % 3) * 220, 520 + ((i * 37) % 5) * 120, 7, 1), mtnMat)
        m.position.set(-3200 + i * 800 + ((i * 53) % 7) * 40, 180, -3300 - ((i * 29) % 4) * 160)
        return m
      }),
    [],
  )

  // Islands slide past; recycle far astern back to the horizon ahead.
  useFrame((_, delta) => {
    if (reduced || !drifting.current) return
    const step = VIS_SPEED * speedFactor * Math.min(0.05, delta)
    for (const isl of drifting.current.children) {
      isl.position.z += step
      if (isl.position.z > 3200) isl.position.z -= 6400
    }
  })

  return (
    <>
      <group ref={drifting}>
        {islands.map((isl, i) => <primitive key={i} object={isl} />)}
      </group>
      {mountains.map((m, i) => <primitive key={i} object={m} />)}
    </>
  )
}
