import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { buildFerry } from '../scene/buildFerry'

let url: Promise<string> | undefined

/**
 * The procedural ferry as a GLB blob URL, made once in the browser.
 * The ship turns 180° so the bow points to glTF +Z, the forward axis that Cesium expects.
 */
export function ferryGlbUrl(): Promise<string> {
  url ??= (async () => {
    const ship = buildFerry()
    ship.rotation.y = Math.PI
    const root = new THREE.Group()
    root.add(ship)
    root.updateMatrixWorld(true)
    const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer
    return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
  })()
  return url
}
