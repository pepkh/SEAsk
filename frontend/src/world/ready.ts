/**
 * Whether the 3D world has drawn its first frame. The welcome "pop" waits for it (up to a limit), so the ferry is
 * already there when the bubble bursts. A plain mutable flag: written from the render loop, never React state.
 */
export const worldState = { ready: false }

export function markWorldReady(ready: boolean) {
  worldState.ready = ready
}
