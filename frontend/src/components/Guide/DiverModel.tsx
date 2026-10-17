import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'

export const DIVER_URL = '/models/diver.glb'

/** What the model is asked to do; written by the Guide, read every frame. */
export interface DiverMotion {
  /** 'happy' hop or 'no' wobble, with its start time (performance.now()) */
  reaction: { kind: 'happy' | 'no'; at: number } | null
  /** Turn toward the screen centre (-1 left … 1 right) */
  look: number
  reduced: boolean
}

/*
 * The source is a one-colour 3D-print figure (scripts/build-diver.py): 1 unit tall, feet at y ≈ 0.05 on a round
 * base, facing +z. It is painted here by height, so no separate parts are needed: sandy base, dark boots, canvas
 * suit, bare hands, a brass breastplate and helmet with a dark face window.
 */
const SAND = new THREE.Color('#d1bd92')
const BOOTS = new THREE.Color('#3b4148')
const SUIT = new THREE.Color('#ddd0ab')
const HANDS = new THREE.Color('#c9976f')
const BRASS = new THREE.Color('#c7963b')
const WINDOW = new THREE.Color('#243642')

function paint(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    if (y < 0.055) c.copy(SAND)
    else if (y < 0.15) c.copy(BOOTS)
    else if (y > 0.83 && y < 0.93 && z > 0.085 && Math.abs(x) < 0.075) c.copy(WINDOW)
    else if (y >= 0.745) c.copy(BRASS)
    else if (y > 0.33 && y < 0.43 && Math.abs(x) > 0.165) c.copy(HANDS)
    else c.copy(SUIT)
    c.toArray(colors, i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

/** Three-step toon shading: soft, friendly, readable at a small size. */
function toonGradient() {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255])
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}

function Diver({ motion }: { motion: RefObject<DiverMotion> }) {
  const { scene } = useGLTF(DIVER_URL, false)
  const rig = useRef<THREE.Group>(null)
  const time = useRef(0)

  const model = useMemo(() => {
    const root = scene.clone(true)
    const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry = node.geometry.clone()
        paint(node.geometry)
        node.material = material
      }
    })
    return root
  }, [scene])

  useFrame((_, delta) => {
    const g = rig.current
    const m = motion.current
    if (!g || !m) return
    const t = (time.current += Math.min(0.05, delta))
    const still = m.reduced
    // Idle: a gentle bob and sway, turned a little toward the middle of the screen.
    g.position.y = still ? 0 : Math.sin(t * 1.6) * 0.015
    g.rotation.z = still ? 0 : Math.sin(t * 1.1) * 0.03
    const yaw = m.look * 0.45 + (still ? 0 : Math.sin(t * 0.5) * 0.12)
    // Ease back the short way after a spin (no unwinding backwards).
    const off = g.rotation.y - yaw
    g.rotation.y = yaw + (off - Math.round(off / (Math.PI * 2)) * Math.PI * 2)
    g.rotation.y += (yaw - g.rotation.y) * Math.min(1, delta * 4)

    const r = m.reaction
    if (r && !still) {
      const e = (performance.now() - r.at) / 1000
      if (r.kind === 'happy' && e < 0.8) {
        // A hop with a full spin
        g.position.y += Math.sin((e / 0.8) * Math.PI) * 0.16
        g.rotation.y = yaw + (e / 0.8) * Math.PI * 2
      } else if (r.kind === 'no' && e < 0.7) {
        // Side-to-side wobble
        g.rotation.z += Math.sin(e * 28) * 0.12 * (1 - e / 0.7)
      }
    }
  })

  return (
    <group ref={rig}>
      <primitive object={model} />
    </group>
  )
}

/** The diver in its own small transparent canvas. The Guide moves the canvas around the screen. */
export default function DiverCanvas({ motion }: { motion: RefObject<DiverMotion> }) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0.56, 2.65], fov: 26, near: 0.1, far: 20 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.54, 0)}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[1.5, 2.5, 3]} intensity={2.2} />
      <directionalLight position={[-2.5, 1.2, -2]} intensity={1.4} color="#a9dcff" />
      <Suspense fallback={null}>
        <Diver motion={motion} />
      </Suspense>
    </Canvas>
  )
}

useGLTF.preload(DIVER_URL, false)
