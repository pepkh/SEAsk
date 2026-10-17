# SEAsk ferry kiosk (frontend)

A touch-screen kiosk for the BC Ferries Swartz Bay ↔ Tsawwassen route. It shows where the ferry is,
what the ship's sensors measure in the sea right now, the tides and weather, the animals of the
Salish Sea and a quiz. Kids and Grown-ups modes; English and French.

React 19 + TypeScript + Vite. The 3D views use CesiumJS (real terrain and satellite imagery) and
three.js (a stylized sea, used when the map tiles are not installed).

## Quick start

```sh
cd frontend
npm install
cp .env.example .env.local     # optional: the defaults work with sample data
npm run dev                    # http://localhost:5173
```

With no backend and `VITE_LIVE_DATA=false`, everything runs on the bundled sample data and shows a
**SAMPLE DATA** chip. For live data, run the backend too (see [`../backend/README.md`](../backend/README.md))
and set `VITE_LIVE_DATA=true`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built app (port 4173) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |

## Settings (`.env.local`)

All settings are in [`.env.example`](.env.example). Vite reads them at start-up, so restart `npm run dev` after a change.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_LIVE_DATA` | `false` | `true`: ship feed, weather and tides come from the backend. |
| `VITE_API_URL` | `http://localhost:8000` | Backend address. |
| `VITE_ENABLE_MAP_MODE` | `true` | Cesium map with real terrain; the globe button switches map ↔ 3D sea. |
| `VITE_HOME_SCENE` | `map` | Journey starts in `map` or `sea`. |
| `VITE_MAP_IMAGERY` | `sentinel` | `sentinel` (satellite) or `nrcan` (Canadian topographic map with labels). |
| `VITE_TILES_URL` | `/tiles` | Where the offline map tiles are served from. |
| `VITE_REPLAY_SPEED` | `1` | Speed of the sample ship feed (10 = demo, 10× faster). |

API keys (Ocean Networks Canada, OpenWeatherMap) live only in `backend/.env`. Never put a key in a
`VITE_` variable: those end up in the browser bundle.

## Live data and sample data

| Data | Live source (via the backend) | Sample (bundled) |
| --- | --- | --- |
| Ship position, speed, heading, sea sensors | Ocean Networks Canada, ferry TWSB | `src/mocks/common/ship-feed.json`: a real recorded round trip (2026-08-17) |
| Weather at the ship | OpenWeatherMap | `src/mocks/common/weather.json` |
| Waves | Open-Meteo Marine | same file |
| Tides and Active Pass current | Fisheries and Oceans Canada (IWLS) | `src/mocks/{en,fr}/tides.json` |
| Texts: zones, species, quiz, landmarks | always bundled | `src/mocks/{en,fr}/*.json` |

Each live source falls back to the sample on its own when it is down, and the SAMPLE chip says which
part is sample. The ship feed switches after a 503 or 3 failed polls and tries the live feed again
every 30 s. Code: `src/api/`, `src/ship/ShipProvider.tsx`, `src/weather/`, `src/tides/`.

The ferry's seawater pump is off while it is docked (for example overnight), so the sea readings are
empty then. The cards say "Sensors rest while the ferry is docked".

To rebuild the sample feed and the route line from the recorded day in Neon:
`cd ../backend && .venv/bin/python scripts/export_sample_data.py`.

## Map mode and offline tiles

The map works offline from `public/tiles/` (not in git; about 270 MB):

```sh
node scripts/download-tiles.ts      # Sentinel-2 imagery and NRCan base map (needs internet once)
bash scripts/build-terrain.sh       # NRCan MRDEM-30 terrain (needs Docker)
```

Without `public/tiles/terrain/layer.json` the app falls back to the 3D sea and hides the globe button.

On the map:
- The camera follows the ferry with three views (3D chase, side, bird's-eye). It slowly circles the
  ferry when nobody has touched the screen for 15 s.
- Hovering or tapping a mountain, island or channel shows its name and a fact
  (`src/config/landmarks.json` + `src/mocks/{en,fr}/landmarks.json`).
- The water, wake and light use a fixed afternoon sun (`src/map/sun.ts`), so the map looks the same
  at night.

## Screen size

The layout is designed for a 1920×1080 kiosk. On smaller or larger windows the cards and pages keep
their proportions and are zoomed by `--ui-scale` (`src/hooks/useUiScale.ts`). The 3D canvases are
never inside a zoomed element, because pointer input would be off. At 900 px wide or less, the layout
stacks for phones instead.

## Project layout

```
src/
  api/          backend calls (ship feed, weather, tides) and the bundled content loader
  components/   shared UI: Dock, PageHeader, Photo, SampleChip, toggles
  config/       env.ts (settings), route.json, terminals.json, landmarks.json, photos.json, tiles.ts
  context/      KioskContext: audience, scene mode, camera view
  i18n/         en.json, fr.json (fr is type-checked against en), number/time formats
  map/          Cesium map: MapScene, water material, wake, landmarks, camera
  mocks/        sample data and all texts, per language
  scene/        three.js sea scene and the procedural ferry (also used on the map)
  screens/      Journey (Kids, Grown-ups), Sea life, Seafloor, Tides & weather, Quiz
  ship/         ShipProvider (polls the feed) and route maths
  tides/ weather/   live tides and weather hooks
scripts/        download-tiles.ts, build-terrain.sh, fetch-photos.ts
```

## Common changes

- **Text:** edit `src/i18n/{en,fr}.json` (UI) or `src/mocks/{en,fr}/*.json` (content). Add every key
  to both languages; a missing French key fails `npm run typecheck`.
- **A landmark:** add `{ id, kind, points, radiusM, elevationM? }` to `src/config/landmarks.json`,
  and `{ name, fact }` under the same id in both `landmarks.json` files.
- **A photo:** add the subject to `scripts/photos.config.ts`, run `node scripts/fetch-photos.ts --only=<id>`,
  then set `photoId` in the content JSON. The script only takes CC0, CC BY, CC BY-SA or public-domain
  images and writes the credit line.

## Licences and credits

- Photos: see [`public/images/photos/CREDITS.md`](public/images/photos/CREDITS.md). Each credit is shown with its photo.
- Map: Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data); terrain and base map
  NRCan (Open Government Licence – Canada). The credit is in the map corner; tap it for the full text.
- **Check before any commercial use:** EOX Sentinel-2 cloudless from 2018 on is CC BY-NC-SA 4.0
  (non-commercial), and the free Open-Meteo API is for non-commercial use.
