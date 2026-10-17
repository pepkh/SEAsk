import { CallbackProperty, Color, ColorBlendMode } from 'cesium'
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { Entity } from 'resium'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { CRUISE_KN } from '../scene/constants'
import type { ShipTrack } from './shipTrack'

/** Wake size behind the stern (m), and the Kelvin-arm spread as in the sea-scene shader. */
const LEN = 900
const HALF_W = 330
const STERN_Z = 76

let url: Promise<string> | undefined

/** Foam dots on a transparent canvas: centre turbulence and the two Kelvin arms, fading astern. Row 0 = stern. */
function wakeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const px = (x: number) => canvas.width / 2 + (x / HALF_W) * (canvas.width / 2)
  const py = (d: number) => (d / LEN) * canvas.height
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 9000; i++) {
    const d = Math.pow(rnd(), 1.6) * LEN
    const centre = rnd() < 0.55
    const x = centre
      ? (rnd() - 0.5) * (26 + d * 0.06)
      : (rnd() < 0.5 ? -1 : 1) * (13 + d * 0.34 + (rnd() - 0.5) * (4 + d * 0.02))
    // fades in over the first metres so the foam does not start as a hard edge at the stern
    ctx.globalAlpha = Math.min(1, 0.3 + d / 50) * Math.exp(-d / (centre ? 380 : 520)) * (centre ? 0.16 : 0.1)
    const r = 1.2 + rnd() * 2.4
    ctx.beginPath()
    ctx.ellipse(px(x), py(d), r, r * 1.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvas
}

/** A flat foam plane in the ferry's frame (bow = -z, stern at z = +76), as a GLB blob URL made once. */
function wakeGlbUrl(): Promise<string> {
  url ??= (async () => {
    const tex = new THREE.CanvasTexture(wakeCanvas())
    tex.colorSpace = THREE.SRGBColorSpace
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * HALF_W, LEN).rotateX(-Math.PI / 2).translate(0, 0.3, STERN_Z + LEN / 2),
      new THREE.MeshBasicMaterial({ name: 'Wake', map: tex, transparent: true, depthWrite: false }),
    )
    // Same turn as the ferry GLB (ferryGlb.ts), so both use the ship track orientation.
    plane.rotation.y = Math.PI
    const root = new THREE.Group()
    root.add(plane)
    root.updateMatrixWorld(true)
    const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer
    return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
  })()
  return url
}

/** Foam wake behind the ferry. It fades in with speed (none at the dock). */
export function Wake({ track, speedKn }: { track: ShipTrack; speedKn: RefObject<number> }) {
  const [uri, setUri] = useState<string>()
  useEffect(() => {
    wakeGlbUrl().then(setUri)
  }, [])
  const color = useMemo(
    () => new CallbackProperty(() => Color.WHITE.withAlpha(Math.min(1, Math.max(0, speedKn.current / CRUISE_KN))), false),
    [speedKn],
  )
  if (!uri) return null
  return (
    <Entity
      position={track.position}
      orientation={track.orientation}
      model={{ uri, color, colorBlendMode: ColorBlendMode.MIX, colorBlendAmount: 0 }}
    />
  )
}
