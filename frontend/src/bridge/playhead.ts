import { useCallback, useSyncExternalStore } from 'react'

/** Playback speeds: real time, a minute a second, ten minutes a second, an hour a second. */
export const SPEEDS = [1, 60, 600, 3600] as const
export type Speed = (typeof SPEEDS)[number]

export interface PlayState {
  /** Epoch ms shown on every panel */
  t: number
  playing: boolean
  speed: Speed
  /** Live mode: the playhead follows now */
  follow: boolean
  /** Playable range */
  min: number
  max: number
}

export interface Playhead {
  get(): PlayState
  subscribe(listener: () => void): () => void
  seek(t: number): void
  setPlaying(playing: boolean): void
  setSpeed(speed: Speed): void
  setRange(min: number, max: number): void
  setFollow(follow: boolean): void
  /** Live mode: jump to now and keep following it */
  goLive(now: number): void
  /** Live mode, every second: the range ends now; follow now (and pick it up again once caught up) */
  tickLive(now: number): void
}

/**
 * The bridge clock, outside React: the map and the timeline cursor read it every frame, and the
 * panels subscribe through `usePlayheadTime`, which re-renders them a few times a second at most.
 */
export function createPlayhead(init: Pick<PlayState, 't' | 'min' | 'max'>): Playhead {
  let state: PlayState = { playing: false, speed: 60, follow: false, ...init }
  const listeners = new Set<() => void>()
  let raf = 0
  let last = 0

  const emit = () => listeners.forEach((l) => l())
  const update = (next: Partial<PlayState>) => {
    state = { ...state, ...next }
    emit()
  }

  const tick = (now: number) => {
    const dt = now - last
    last = now
    const t = Math.min(state.max, state.t + dt * state.speed)
    update({ t, playing: t < state.max })
    raf = state.playing ? requestAnimationFrame(tick) : 0
  }

  const start = () => {
    if (raf) return
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
  }

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    seek(t) {
      update({ t: Math.min(state.max, Math.max(state.min, t)), follow: false })
    },
    setPlaying(playing) {
      // Play from the start again after the end.
      if (playing && state.t >= state.max) update({ t: state.min })
      update({ playing, follow: false })
      if (playing) start()
      else stop()
    },
    setSpeed: (speed) => update({ speed }),
    setRange(min, max) {
      update({ min, max, t: Math.min(max, Math.max(min, state.t)) })
    },
    setFollow: (follow) => update({ follow }),
    goLive(now) {
      stop()
      update({ t: Math.min(state.max, Math.max(state.min, now)), follow: true, playing: false })
    },
    tickLive(now) {
      // Nothing after now can be shown live: the range ends now.
      const next: Partial<PlayState> = { max: now }
      if (state.follow) next.t = Math.max(state.min, now)
      // Played or scrubbed back up to now: live again.
      else if (state.t >= now - 2000) Object.assign(next, { t: now, follow: true, playing: false })
      if (next.playing === false) stop()
      update(next)
    },
  }
}

/**
 * The playhead time, rounded so the caller re-renders at most `maxHz` times a second during
 * playback (and at least on every `minStepMs` of change while scrubbing).
 */
export function usePlayheadTime(playhead: Playhead, maxHz: number, minStepMs: number): number {
  const snapshot = useCallback(() => {
    const { t, speed, playing } = playhead.get()
    const q = playing ? Math.max(minStepMs, (speed * 1000) / maxHz) : minStepMs
    return Math.floor(t / q) * q
  }, [playhead, maxHz, minStepMs])
  return useSyncExternalStore(playhead.subscribe, snapshot)
}

/** The rest of the play state (playing, speed, range), without the time. */
export function usePlayControls(playhead: Playhead) {
  const playing = useSyncExternalStore(playhead.subscribe, () => playhead.get().playing)
  const speed = useSyncExternalStore(playhead.subscribe, () => playhead.get().speed)
  const follow = useSyncExternalStore(playhead.subscribe, () => playhead.get().follow)
  const min = useSyncExternalStore(playhead.subscribe, () => playhead.get().min)
  const max = useSyncExternalStore(playhead.subscribe, () => playhead.get().max)
  return { playing, speed, follow, min, max }
}
