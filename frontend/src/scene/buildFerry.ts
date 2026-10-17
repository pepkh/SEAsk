import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface FerryParts {
  radars: THREE.Mesh[]
  props: THREE.Group[]
}

/**
 * Double-ended RoPax ferry, built in metres. Forward = -z, up = +y, waterline at y = 0.
 * Paint scheme: red antifouling, black boot-top, deep green topsides, gold sheer stripe, white superstructure.
 * Ported from the Home mockup without changes.
 */
export function buildFerry(): THREE.Group {
  const L = 160, B = 27, T = 5.6, D = 9
  const col = { bottom: '#7a2b22', boot: '#16191c', topside: '#0f3b3a', stripe: '#d6a640' }
  const M = {
    hull: new THREE.MeshStandardMaterial({ name: 'Hull', vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ name: 'Deck', color: '#7d8786', roughness: 0.9, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ name: 'Superstructure', color: '#f1f4f3', roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ name: 'Glass', color: '#1c3542', roughness: 0.12, metalness: 0.5, emissive: '#000000' }),
    dark: new THREE.MeshStandardMaterial({ name: 'Dark', color: '#1f262a', roughness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ name: 'Steel', color: '#5c666b', roughness: 0.45, metalness: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ name: 'Stripe', color: col.stripe, roughness: 0.45, metalness: 0.2 }),
    green: new THREE.MeshStandardMaterial({ name: 'Funnel band', color: col.topside, roughness: 0.5 }),
    orange: new THREE.MeshStandardMaterial({ name: 'Rescue boat', color: '#f26b1d', roughness: 0.5 }),
    bronze: new THREE.MeshStandardMaterial({ name: 'Propeller', color: '#b0793d', roughness: 0.3, metalness: 0.85 }),
    navR: new THREE.MeshBasicMaterial({ name: 'Port light', color: '#ff3b30' }),
    navG: new THREE.MeshBasicMaterial({ name: 'Starboard light', color: '#30ff7a' }),
    navW: new THREE.MeshBasicMaterial({ name: 'Masthead light', color: '#fff6d8' }),
  }
  const ship = new THREE.Group()
  ship.name = 'DoubleEndedFerry'
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name?: string) => {
    const m = new THREE.Mesh(geo, mat)
    m.name = name || mat.name
    m.castShadow = true
    m.receiveShadow = true
    ship.add(m)
    return m
  }
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }

  /* ---------- hull: lofted sections ---------- */
  const NZ = 72
  const ys = [-T, -5.0, -4, -3, -2, -1, -0.03, 0.03, 0.5, 0.97, 1.03, 2, 3, 4, 5, 6.0, 6.37, 6.43, 7.07, 7.13, 8, D]
  const plan = (t: number) => (t < 0.5 ? 1 : Math.pow(Math.max(0, 1 - Math.pow((t - 0.5) / 0.5, 2.4)), 0.55))
  const keelY = (t: number) => -T + 4.4 * smooth(0.68, 1, t)
  const hullHalf = (t: number, y: number) => {
    const ky = keelY(t), s = Math.min(1, Math.max(0, (y - ky) / (D - ky)))
    const fb = 0.78 * (1 - smooth(0.35, 0.9, t))
    const shape = fb + (1 - fb) * (1 - Math.pow(1 - s, 5))
    return (B / 2) * plan(t) * shape * (1 + 0.07 * s * smooth(0.5, 1, t))
  }
  const colorAt = (y: number) => (y < 0 ? col.bottom : y < 1 ? col.boot : y > 6.4 && y < 7.1 ? col.stripe : col.topside)
  const P = ys.length * 2 + 1, pos: number[] = [], cols: number[] = [], c = new THREE.Color()
  const topEdge: [number, number][] = []
  for (let i = 0; i <= NZ; i++) {
    const z = -L / 2 + (L * i) / NZ, t = Math.abs(z) / (L / 2), ky = keelY(t)
    const pts: [number, number][] = []
    for (let j = ys.length - 1; j >= 0; j--) { const y = Math.max(ys[j], ky); pts.push([-hullHalf(t, y), y]) }
    pts.push([0, ky])
    for (let j = 0; j < ys.length; j++) { const y = Math.max(ys[j], ky); pts.push([hullHalf(t, y), y]) }
    for (const [x, y] of pts) { pos.push(x, y, z); c.set(colorAt(y)); cols.push(c.r, c.g, c.b) }
    topEdge.push([hullHalf(t, D), z])
  }
  const idx: number[] = []
  for (let i = 0; i < NZ; i++) for (let j = 0; j < P - 1; j++) {
    const a = i * P + j, b = a + 1, d = a + P, e = d + 1
    idx.push(a, d, b, b, d, e)
  }
  const hullGeo = new THREE.BufferGeometry()
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  hullGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  hullGeo.setIndex(idx)
  hullGeo.computeVertexNormals()
  add(hullGeo, M.hull, 'Hull')

  // main deck cap
  const deckShape = new THREE.Shape()
  topEdge.forEach(([x, z], i) => (i ? deckShape.lineTo(x, z) : deckShape.moveTo(x, z)))
  for (let i = topEdge.length - 1; i >= 0; i--) deckShape.lineTo(-topEdge[i][0], topEdge[i][1])
  const deckGeo = new THREE.ShapeGeometry(deckShape, 4)
  deckGeo.rotateX(Math.PI / 2)
  deckGeo.translate(0, D, 0)
  add(deckGeo, M.deck, 'Main deck')

  // open vehicle-deck bays along the parallel midbody
  const bays: THREE.BufferGeometry[] = [], posts: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.06, 2.3, 74); g.translate(sx * (B / 2 + 0.02), 4.35, 0); bays.push(g)
    for (let z = -36; z <= 36; z += 4) { const p = new THREE.BoxGeometry(0.12, 2.3, 0.6); p.translate(sx * (B / 2 + 0.07), 4.35, z); posts.push(p) }
  }
  add(mergeGeometries(bays), M.dark, 'Vehicle deck openings')
  add(mergeGeometries(posts), M.white, 'Vehicle deck frames')

  // "BC FERRIES" on both sides at both ends, clear of the bays (|z| < 37), between the boot-top and the stripe.
  // Each patch follows the hull surface, so the letters sit flat on the curved ends.
  const NAME = { z0: 40, z1: 70, y0: 1.5, y1: 6.2, off: 0.1, nu: 24, nv: 4 }
  const namePatch = (sx: number, sz: number) => {
    const p: number[] = [], uv: number[] = [], ix: number[] = []
    const zMin = sz > 0 ? NAME.z0 : -NAME.z1
    for (let i = 0; i <= NAME.nu; i++) for (let j = 0; j <= NAME.nv; j++) {
      const u = i / NAME.nu, v = j / NAME.nv
      // Seen from outside, text reads towards -z on starboard (+x) and towards +z on port.
      const z = zMin + (NAME.z1 - NAME.z0) * (sx > 0 ? 1 - u : u)
      const y = NAME.y0 + (NAME.y1 - NAME.y0) * v
      p.push(sx * (hullHalf(Math.abs(z) / (L / 2), y) + NAME.off), y, z)
      uv.push(u, v)
    }
    for (let i = 0; i < NAME.nu; i++) for (let j = 0; j < NAME.nv; j++) {
      const a = i * (NAME.nv + 1) + j, b = a + NAME.nv + 1
      ix.push(a, b, a + 1, b, b + 1, a + 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(ix)
    g.computeVertexNormals()
    return g
  }
  const lettering = new THREE.MeshStandardMaterial({ name: 'Hull lettering', map: nameTexture('BC FERRIES'), alphaTest: 0.5, roughness: 0.5 })
  add(mergeGeometries([-1, 1].flatMap((sx) => [-1, 1].map((sz) => namePatch(sx, sz)))), lettering, 'Hull lettering')

  /* ---------- superstructure tiers ---------- */
  const rounded = (len: number, wid: number, r: number) => {
    r = Math.min(r, wid / 2 - 0.01, len / 2 - 0.01)
    const s = new THREE.Shape(), hx = wid / 2, hz = len / 2
    s.moveTo(-hx + r, -hz); s.lineTo(hx - r, -hz); s.quadraticCurveTo(hx, -hz, hx, -hz + r); s.lineTo(hx, hz - r)
    s.quadraticCurveTo(hx, hz, hx - r, hz); s.lineTo(-hx + r, hz); s.quadraticCurveTo(-hx, hz, -hx, hz - r)
    s.lineTo(-hx, -hz + r); s.quadraticCurveTo(-hx, -hz, -hx + r, -hz)
    return s
  }
  const prism = (len: number, wid: number, y0: number, h: number, r: number, mat: THREE.Material, name: string, zc = 0) => {
    const g = new THREE.ExtrudeGeometry(rounded(len, wid, r), { depth: h, bevelEnabled: false, curveSegments: 10 })
    g.rotateX(-Math.PI / 2)
    g.translate(0, y0, zc)
    return add(g, mat, name)
  }
  const mullions = (len: number, wid: number, r: number, y0: number, h: number, step: number, name: string) => {
    const parts: THREE.BufferGeometry[] = [], straight = len / 2 - r
    for (const sx of [-1, 1]) for (let z = -straight; z <= straight + 0.01; z += step) {
      const g = new THREE.BoxGeometry(0.22, h, 0.28); g.translate(sx * (wid / 2 + 0.09), y0 + h / 2, z); parts.push(g)
    }
    add(mergeGeometries(parts), M.white, name)
  }
  const level = (n: number, len: number, wid: number, y0: number, h: number, r: number, winY: number, winH: number, step: number) => {
    prism(len, wid, y0, h, r, M.white, `Deck ${n}`)
    prism(len + 0.14, wid + 0.14, y0 + winY, winH, r + 0.07, M.glass, `Deck ${n} windows`)
    mullions(len, wid, r, y0 + winY, winH, step, `Deck ${n} mullions`)
  }
  level(5, 132, 25.6, D, 3.4, 9, 1.4, 0.9, 3.2)
  level(6, 114, 25.0, 12.4, 3.2, 11, 0.8, 1.9, 2.6)
  level(7, 96, 23.6, 15.6, 3.0, 11, 0.7, 1.7, 2.6)
  level(8, 58, 19.0, 18.6, 2.8, 8, 0.6, 1.6, 2.4)

  // wheelhouses at both ends, with bridge wings
  const radars: THREE.Mesh[] = []
  for (const zc of [-25, 25]) {
    const fwd = Math.sign(zc)
    prism(7.5, 27.4, 21.4, 2.9, 1.2, M.white, 'Wheelhouse', zc)
    prism(7.64, 27.54, 22.2, 1.5, 1.27, M.glass, 'Wheelhouse windows', zc)
    const visor = new THREE.BoxGeometry(27.6, 0.25, 1.0); visor.translate(0, 24.3, zc + fwd * 4.1); add(visor, M.dark, 'Sun visor')
    const mastG = new THREE.CylinderGeometry(0.22, 0.28, 8, 10); mastG.translate(0, 28.3, zc - fwd * 1.5); add(mastG, M.steel, 'Mast')
    const yard = new THREE.BoxGeometry(6, 0.2, 0.2); yard.translate(0, 30.2, zc - fwd * 1.5); add(yard, M.steel, 'Yard')
    const lt = new THREE.SphereGeometry(0.28, 10, 8); lt.translate(0, 32.4, zc - fwd * 1.5); add(lt, M.navW, 'Masthead light')
    const ped = new THREE.CylinderGeometry(0.35, 0.35, 1.2, 10); ped.translate(0, 24.9, zc - fwd * 2.4); add(ped, M.steel, 'Radar pedestal')
    const radar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.5), M.dark); radar.name = 'Radar scanner'
    radar.position.set(0, 25.7, zc - fwd * 2.4); radar.castShadow = true; ship.add(radar); radars.push(radar)
    const red = new THREE.BoxGeometry(0.3, 0.45, 0.6); red.translate(-13.85, 23.0, zc); add(red, M.navR, 'Sidelight port')
    const grn = new THREE.BoxGeometry(0.3, 0.45, 0.6); grn.translate(13.85, 23.0, zc); add(grn, M.navG, 'Sidelight starboard')
  }

  // twin funnels amidships on a casing
  const casing = new THREE.BoxGeometry(14, 2.6, 9); casing.translate(0, 22.7, 0); add(casing, M.white, 'Funnel casing')
  for (const sx of [-1, 1]) {
    const f = new THREE.CylinderGeometry(2.1, 2.3, 8.6, 28); f.scale(1, 1, 1.55); f.translate(sx * 4.4, 25.7, 0); add(f, M.white, 'Funnel')
    const band = new THREE.CylinderGeometry(2.16, 2.17, 1.1, 28); band.scale(1, 1, 1.55); band.translate(sx * 4.4, 27.6, 0); add(band, M.green, 'Funnel band')
    const gb = new THREE.CylinderGeometry(2.17, 2.18, 0.35, 28); gb.scale(1, 1, 1.55); gb.translate(sx * 4.4, 28.35, 0); add(gb, M.gold, 'Funnel stripe')
    const cap = new THREE.CylinderGeometry(2.12, 2.12, 0.8, 28); cap.scale(1, 1, 1.55); cap.translate(sx * 4.4, 29.6, 0); add(cap, M.dark, 'Funnel top')
    for (const dz of [-1.2, 1.2]) { const p = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 10); p.translate(sx * 4.4, 30.4, dz); add(p, M.dark, 'Exhaust pipe') }
  }

  // rescue boats on davits, both sides
  for (const sx of [-1, 1]) for (const zc of [-40, 40]) {
    const boat = new THREE.CapsuleGeometry(1.15, 5.0, 6, 14); boat.rotateX(Math.PI / 2); boat.scale(1.1, 0.9, 1)
    boat.translate(sx * 13.9, 14.0, zc); add(boat, M.orange, 'Rescue boat')
    const top = new THREE.BoxGeometry(1.4, 0.7, 2.4); top.translate(sx * 13.9, 15.1, zc); add(top, M.white, 'Rescue boat canopy')
    for (const dz of [-2.4, 2.4]) { const arm = new THREE.BoxGeometry(1.8, 0.3, 0.3); arm.translate(sx * 13.3, 15.9, zc + dz); add(arm, M.steel, 'Davit') }
  }

  // life-raft canisters along the deck 7 roof edge
  const rafts: THREE.BufferGeometry[] = []
  for (const sx of [-1, 1]) for (let z = -38; z <= 38; z += 2.2) {
    if (Math.abs(z) < 30) continue
    const g = new THREE.CylinderGeometry(0.55, 0.55, 1.5, 12); g.rotateZ(Math.PI / 2); g.translate(sx * 10.6, 19.2, z); rafts.push(g)
  }
  add(mergeGeometries(rafts), M.white, 'Life rafts')

  // railings: deck 7 roof sides and deck 8 sun deck
  const rail = (len: number, x: number, y: number, name: string) => {
    const parts: THREE.BufferGeometry[] = []
    for (const sx of [-1, 1]) {
      const top = new THREE.BoxGeometry(0.08, 0.08, len); top.translate(sx * x, y + 1.1, 0); parts.push(top)
      const mid = new THREE.BoxGeometry(0.05, 0.05, len); mid.translate(sx * x, y + 0.55, 0); parts.push(mid)
      for (let z = -len / 2; z <= len / 2 + 0.01; z += 1.6) { const p = new THREE.BoxGeometry(0.06, 1.1, 0.06); p.translate(sx * x, y + 0.55, z); parts.push(p) }
    }
    add(mergeGeometries(parts), M.white, name)
  }
  rail(74, 11.65, 18.6, 'Deck 7 railing')
  rail(42, 9.4, 21.4, 'Sun deck railing')

  // bollards on the open car-deck ends
  const bol: THREE.BufferGeometry[] = []
  for (const zc of [-74, 74]) for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(0.35, 0.4, 0.8, 10); g.translate(sx * 5, D + 0.4, zc); bol.push(g) }
  add(mergeGeometries(bol), M.dark, 'Bollards')

  // propeller + rudder at each end
  const props: THREE.Group[] = []
  for (const sz of [-1, 1]) {
    const zc = sz * (L / 2 - 13), hubY = -4.3
    const shaft = new THREE.CylinderGeometry(0.3, 0.3, 6, 10); shaft.rotateX(Math.PI / 2); shaft.translate(0, hubY + 0.4, zc - sz * 3); add(shaft, M.steel, 'Shaft')
    const prop = new THREE.Group(); prop.name = 'Propeller'; prop.position.set(0, hubY, zc)
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), M.bronze); prop.add(hub)
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.12), M.bronze)
      bl.position.y = 0.95
      const piv = new THREE.Group(); piv.rotation.z = (k * Math.PI) / 2; bl.rotation.y = 0.45; piv.add(bl); prop.add(piv)
    }
    ship.add(prop); props.push(prop)
    const rud = new THREE.BoxGeometry(0.35, 3.2, 2.6); rud.translate(0, -3.6, zc + sz * 3.4); add(rud, M.dark, 'Rudder')
  }

  ship.userData = { radars, props } satisfies FerryParts
  return ship
}

/** White bold lettering on a transparent canvas, sized for a 30 m × 4.7 m hull patch. */
function nameTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 320
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '700 230px "Helvetica Neue", Arial, sans-serif'
    ctx.letterSpacing = '14px'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 8, canvas.width - 80)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
