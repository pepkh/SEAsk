import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { markWorldReady } from '../world/ready'

/** Reports the sea scene as ready on its first frame. */
export function ReadyProbe() {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    markWorldReady(true)
  })
  return null
}
