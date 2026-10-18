/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVE_DATA?: string
  /** Older name: false = live data */
  readonly VITE_USE_MOCKS?: string
  readonly VITE_API_URL?: string
  readonly VITE_ENABLE_MAP_MODE?: string
  readonly VITE_HOME_SCENE?: string
  readonly VITE_MAP_IMAGERY?: string
  readonly VITE_TILES_URL?: string
  readonly VITE_REPLAY_SPEED?: string
  /** Recorded day the bridge screen replays, YYYY-MM-DD */
  readonly VITE_BRIDGE_DATE?: string
  /** replay | live */
  readonly VITE_BRIDGE_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Set by vite.config.ts. CesiumJS loads its workers and assets from this path. */
declare const CESIUM_BASE_URL: string
