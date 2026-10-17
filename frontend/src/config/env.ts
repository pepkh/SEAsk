/** All VITE_* settings, read once. See .env.example. */
const env = import.meta.env

export const USE_MOCKS = env.VITE_USE_MOCKS !== 'false'
export const API_URL = (env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export const MAP_MODE_ENABLED = env.VITE_ENABLE_MAP_MODE === 'true'
export const HOME_SCENE: 'sea' | 'map' = MAP_MODE_ENABLED && env.VITE_HOME_SCENE === 'map' ? 'map' : 'sea'
export const MAP_IMAGERY: 'sentinel' | 'nrcan' = env.VITE_MAP_IMAGERY === 'nrcan' ? 'nrcan' : 'sentinel'
export const TILES_URL = (env.VITE_TILES_URL ?? '/tiles').replace(/\/$/, '')

export const REPLAY_SPEED = Math.max(1, Number(env.VITE_REPLAY_SPEED) || 1)

/** The real feed sends one row each second. */
export const FEED_POLL_MS = 1000
