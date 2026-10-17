/** All VITE_* settings, read once. See .env.example. */
const env = import.meta.env

/**
 * Live data: the ship feed and the weather come from the backend (VITE_API_URL), with the bundled
 * sample data whenever a source is down. VITE_USE_MOCKS=false is the older name for the same switch.
 */
export const LIVE_DATA = env.VITE_LIVE_DATA === 'true' || env.VITE_USE_MOCKS === 'false'
export const API_URL = (env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

/** Map mode is on unless turned off. It still falls back to the sea when the offline tiles are missing. */
export const MAP_MODE_ENABLED = env.VITE_ENABLE_MAP_MODE !== 'false'
export const HOME_SCENE: 'sea' | 'map' = MAP_MODE_ENABLED && env.VITE_HOME_SCENE !== 'sea' ? 'map' : 'sea'
export const MAP_IMAGERY: 'sentinel' | 'nrcan' = env.VITE_MAP_IMAGERY === 'nrcan' ? 'nrcan' : 'sentinel'
export const TILES_URL = (env.VITE_TILES_URL ?? '/tiles').replace(/\/$/, '')

export const REPLAY_SPEED = Math.max(1, Number(env.VITE_REPLAY_SPEED) || 1)

/** The real feed sends one row each second. */
export const FEED_POLL_MS = 1000
