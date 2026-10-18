# SEAsk ferry kiosk (frontend)

A touch-screen kiosk for the BC Ferries Swartz Bay ↔ Tsawwassen route, for visitors of every age. A welcome
bubble opens onto the live ferry in 3D, with one card of facts and a few bubbles to explore: dive under the ship
to meet the animals, rewind the crossing on the route map, take the ocean quiz, or see all the live data in the
Ocean lab. A diver mascot guides the way. English and French.

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
| `VITE_ENABLE_MAP_MODE` | `true` | Cesium map with real terrain; the camera bubble can switch map ↔ 3D sea. |
| `VITE_HOME_SCENE` | `map` | The ferry screen starts in `map` or `sea`. |
| `VITE_MAP_IMAGERY` | `sentinel` | `sentinel` (satellite) or `nrcan` (Canadian topographic map with labels). |
| `VITE_TILES_URL` | `/tiles` | Where the offline map tiles are served from. |
| `VITE_REPLAY_SPEED` | `1` | Speed of the sample ship feed (10 = demo, 10× faster). |
| `VITE_LOW_FX` | `false` | `true`: no backdrop blur on the bubbles and the card (for slow kiosk hardware). |
| `VITE_BRIDGE_DATE` | `2026-08-17` | The recorded day the captain's bridge (`/bridge`) replays. |
| `VITE_BRIDGE_MODE` | `live` | The bridge opens `live` (the same ship as the kiosk) or in `replay` of `VITE_BRIDGE_DATE` (`/bridge?mode=replay` also works). |

API keys (Ocean Networks Canada, OpenWeatherMap) live only in `backend/.env`. Never put a key in a
`VITE_` variable: those end up in the browser bundle.

## How the kiosk works

| Screen | Path | What it is |
| --- | --- | --- |
| Welcome | `/` | "Welcome to SEAsk · Touch to explore". No live data, no API requests, no 3D. |
| Ferry | `/ferry` | The live ferry (3D sea or map), one card in the corner, bubbles around the ferry. |
| Dive into the ocean | `/dive` | Sea life in three depth bands, the water under the ship, the seafloor along the route. |
| Ocean quiz | `/quiz` | Five questions; the diver cheers or wobbles. |
| Ocean lab | `/lab` | For the curious: every reading, the coloured track, the route profile, tides and weather. |
| Captain's bridge | `/bridge` | Crew screen, outside the visitor shell (no session, diver or idle prompt). See below. |

- **Bubbles and cards.** If it floats and shines it's a bubble, and you can touch it. If it's flat and still it's
  a card, and it only shows information. Keep to this rule when adding things (`components/Bubble`,
  `components/Card`); on the neumorphic screens below the water, tiles play the bubble's part.
- **Sessions.** A tap on the welcome screen starts a session: the ship feed, weather and tides start polling and the
  3D world loads (`context/SessionContext.tsx`). After 75 s with no touch the diver asks "Still there?" with a 10 s
  countdown, then the session ends: no more requests, the language goes back to English
  (`components/StillThere`).
- **Transitions** (`components/WaterTransition`). The welcome bubble pops open onto the ferry and re-forms at the
  end of a session. Going under the water (Dive) and coming back always play the same pair: the diver leaps out of
  the card into the Dive in bubble and the water rises out of it over the screen, then the reverse. Other moves crossfade. With reduced
  motion, all are short fades.
- **Rewind the trip.** Touch or drag the route map on a part the ship has already sailed on this crossing: the
  whole kiosk shows that moment and plays on (1×, 4×, 10×) until Go Live, or until it catches up. 45 s with no
  touch goes live by itself. A session starts with the last 90 min of the track (`GET /api/ship/history`, or the
  sample feed), so the whole crossing is there. Code: `ship/TimeShiftProvider.tsx`, `ship/crossing.ts`.
- **The diver** (`components/Guide`) is `public/models/diver.glb`, built from the 3D-print file in `ref/` by
  `scripts/build-diver.py` (`pip install -r scripts/requirements-diver.txt`). It's painted by height in code
  (`DiverModel.tsx`). On the ferry screen it stands in the card's right column (`data-guide-home`); it's drawn by its
  own layer, so it can still talk and be tapped there. A tap opens "Ask the diver": a few questions answered with canned text and the live readings (`AskGuide.tsx`, texts in `mocks/{en,fr}/guide-qa.json`); on the ferry screen the first chip starts the short tour (Next / Skip). If the model can't load, a flat drawing takes its place.

## Captain's bridge (`/bridge`)

A data-heavy, Windy-style screen for the crew: everything known about one moment of the day. It
follows today live (the default) or replays a recorded day (scrub or play at 1×, 60×, 600× or 3600×).

- **Same ship as the kiosk.** Live, the bridge reads the ship through the kiosk's own feed
  (`api/shipFeed.ts`: `getLatestRow` every second, `getHistory` for the past), so both screens always show
  the same position: the ONC feed with `VITE_LIVE_DATA=true`, otherwise the sample feed (which both work out
  from the clock). The header says `LIVE · SAMPLE FEED` when it is the sample.

- **Left:** own ship: SOG / COG / heading and compass, roll, heave and ride comfort, the crossing and
  ETA, surface water now against "usual here" (ONC Augusts 2017–2025 for temperature, salinity and
  oxygen, with the 10–90% band; today's crossings for chlorophyll and turbidity), air, pressure trend, ONC QC flags.
- **Map:** offline tiles (satellite, inverted chart or plain), surface currents or model wind as a
  colour field with drifting particles (static arrows with reduced motion). Currents are blended per place:
  the ONC CODAR radar where it measured (the open Strait), else the SalishSeaCast model (Gulf Islands,
  Haro Strait, Juan de Fuca), else a global model (the open Pacific); the rail says which one is at the ship.
  Wind works the same way: measured at about 50 Environment Canada stations (arrows on the map; the
  measurement outweighs the model within ~6 km and fades out by 18 km), the Open-Meteo model elsewhere
  (fine over the route, coarse over the ocean). The rail shows the wind at the ship as "measured" (with the
  station) or "model", next to the nearest station's reading; the timeline's wind row is the same value.
  ◎ zooms out to the Salish Sea and the open Pacific (offline tiles to zoom 8 there). Also the track coloured by a
  reading, AIS vessels with 6-minute vectors, the Duke Point ferry, ONC observatories, radar sites and
  tide gauges. Tap a vessel for its CPA / TCPA. Drag, pinch or wheel to move; buttons to fit or follow.
- **Right:** the Active Pass current and next slack, three tide stations, wind (model and Iona), waves,
  visibility, sunset, deep water at the VENUS nodes, ADCP currents by depth, the Duke Point ferry's
  water, and the nearest vessels by CPA.
- **Timeline:** the crossings and eight readings on one time axis; drag anywhere to scrub (keys:
  ←/→ 1 min, Shift 10 min, Space plays). Replay shows the whole day; live shows a window that moves with
  now (2 h back, 1 h of tide, current and wind forecast ahead). Scrubbing back shows "Back to live";
  playing forward until now goes live again.
- **Header:** replay / live, layers, basemap, NIGHT (red on black) and **Ask**, a preview of the
  assistant: canned questions answered with the values at the playhead (`src/qa`,
  `screens/Bridge/ask/crewQa.ts`). The dots open the data status and every ONC source used that day.

Data: `/bridge/{date}/*` and `/api/bridge/*` (see `backend/README.md`). Without the backend it uses the
offline copy in `public/data/{date}/` (`backend/scripts/export_bridge_snapshot.py`). Text is English
only (`screens/Bridge/strings.ts`). The map is a small canvas engine (`src/bridge/map`), not Cesium:
2D particles and colour fields are cheap there, and a captain expects a north-up chart. Useful
addresses: `/bridge` (live), `/bridge?mode=replay&t=13:20` (the recorded day from 13:20).

## Live data and sample data

| Data | Live source (via the backend) | Sample (bundled) |
| --- | --- | --- |
| Ship position, speed, heading, sea sensors | Ocean Networks Canada, ferry TWSB | `src/mocks/common/ship-feed.json`: a real recorded round trip (2026-08-17) |
| Weather at the ship | OpenWeatherMap | `src/mocks/common/weather.json` |
| Waves | Open-Meteo Marine | same file |
| Tides and Active Pass current | Fisheries and Oceans Canada (IWLS) | `src/mocks/{en,fr}/tides.json` |
| Track of the last 90 min (session start) | Ocean Networks Canada (`/api/ship/history`) | made from the sample feed |
| Texts: zones, species, quiz, landmarks | always bundled | `src/mocks/{en,fr}/*.json` |
| Island knowledge (specialties) | always bundled, **draft** | `knowledge` in `src/mocks/{en,fr}/landmarks.json` |

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
- Hovering or tapping a mountain, island or channel shows its name, a fact and what it's known for
  (`src/config/landmarks.json` + `src/mocks/{en,fr}/landmarks.json`).
- The blue line is the track the ship really sailed on this crossing (from the session's history); the dashed line
  ahead follows the planned route.
- While the trip is rewound, the ferry screen always shows the map (the 3D sea isn't tied to real places).
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
  api/          backend calls (ship feed and history, weather, tides, bridge datasets) and the bundled content loader
  bridge/       captain's bridge data: day model and decoders, playhead, snapshot, derived values, map engine
  components/   shared UI: Bubble, Card, Peek, ScreenFrame, BackButton, Guide (diver), WaterTransition,
                LiveBar, StillThere, RisingBubbles, Photo, SampleChip
  config/       env.ts (settings), route.json, terminals.json, landmarks.json, photos.json, tiles.ts
  context/      SessionContext (visitor session), KioskContext (scene mode, camera view)
  i18n/         en.json, fr.json (fr is type-checked against en), number/time formats
  layout/       KioskLayout: world, screen, diver, transition and "Still there?" layers
  map/          Cesium map: MapScene, water material, wake, landmarks, camera
  mocks/        sample data and all texts, per language (+ KNOWLEDGE_CHECKLIST.md)
  qa/           Ask panels: question/answer types, canned-answer provider, useAsk
  scene/        three.js sea scene and the procedural ferry (also used on the map)
  screens/      Welcome, Ferry, Dive, Quiz, Lab, Bridge (crew screen)
  ship/         ShipProvider (polls the feed), TimeShiftProvider (rewind) and route maths
  tides/ weather/   live tides and weather providers
  world/        the 3D world behind the ferry screen
scripts/        download-tiles.ts, build-terrain.sh, fetch-photos.ts, build-diver.py
```

## Common changes

- **Text:** edit `src/i18n/{en,fr}.json` (UI) or `src/mocks/{en,fr}/*.json` (content). Add every key
  to both languages; a missing French key fails `npm run typecheck`.
- **A landmark:** add `{ id, kind, points, radiusM, elevationM? }` to `src/config/landmarks.json`,
  and `{ name, fact }` under the same id in both `landmarks.json` files.
- **Island knowledge:** edit `knowledge` (tagline, specialties, `months` for events) under the place in both
  `landmarks.json` files; see [`src/mocks/KNOWLEDGE_CHECKLIST.md`](src/mocks/KNOWLEDGE_CHECKLIST.md). Set
  `"checked": true` once a person has verified an entry (dev builds mark unchecked ones "DRAFT").
- **The mascot's name:** `guide.name` in both i18n files.
- **A photo:** add the subject to `scripts/photos.config.ts`, run `node scripts/fetch-photos.ts --only=<id>`,
  then set `photoId` in the content JSON. The script only takes CC0, CC BY, CC BY-SA or public-domain
  images and writes the credit line.

## Licences and credits

- Photos: see [`public/images/photos/CREDITS.md`](public/images/photos/CREDITS.md). Each credit is shown with its photo.
- Map: Sentinel-2 cloudless by EOX (contains modified Copernicus Sentinel data); terrain and base map
  NRCan (Open Government Licence – Canada). The credit is in the map corner; tap it for the full text.
- Diver model: from `ref/diver1.3mf`, whose file metadata names no author or licence (it points to a downloaded
  aquarium ornament). **Confirm where it came from and that it may be used on a public kiosk before launch.**
- **Check before any commercial use:** EOX Sentinel-2 cloudless from 2018 on is CC BY-NC-SA 4.0
  (non-commercial), and the free Open-Meteo API is for non-commercial use.
