# SEAsk backend

FastAPI app. `/trips` reads the recorded day from Neon Postgres. `/api/*` serves live data.

## Setup

Needs Python 3.10+ (3.12 recommended) and [uv](https://docs.astral.sh/uv/).

```sh
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt   # or: .venv/bin/pip install -r requirements.txt
cp .env.example .env    # then fill in NEON_URL, ONC_TOKEN, OPENWEATHER_API_KEY
.venv/bin/python -m uvicorn main:app --reload               # http://localhost:8000/docs
```

All settings are described in [`.env.example`](.env.example). Never commit `.env`.

## Endpoints

| Route | Source | Notes |
| --- | --- | --- |
| `GET /trips`, `GET /trips/{id}` | Neon | Recorded trips of 2026-08-17. Needs `NEON_URL`. |
| `GET /api/ship/latest` | Ocean Networks Canada | Latest `ShipRow` (speed in knots) + `heading` (degrees true) + `source`, `age_s`. Position, course, speed, heading and roll are cached for `ONC_NAV_CACHE_S` (3 s), the other sensors for `ONC_CACHE_S` (30 s). 503 `onc_not_configured` / `onc_auth` / `onc_stale` / `onc_down`. Needs `ONC_TOKEN`. |
| `GET /api/ship/history?minutes=90&step=5` | Ocean Networks Canada | The last `minutes` (1 to 180, default 90: a whole crossing) as `rows` of `ShipRow`, oldest first, one per `step` seconds (1 to 60, default 5), plus `source`, `from`, `to`, `step_s`. Each row is the newest good sample of every sensor in its step, mapped and converted as in `/api/ship/latest`; steps without a position are left out, sensors without a sample in the step are null. Cached for `ONC_HISTORY_CACHE_S` (20 s). Same 503 codes as `/api/ship/latest`. Needs `ONC_TOKEN`. |
| `GET /api/weather?lat=&lon=` | OpenWeatherMap + Open-Meteo Marine | Point inside the Salish Sea box (lat 47.5 to 50.5, lon -125.5 to -121.5), else 422. Each part is `live` or `unavailable`; 503 `weather_unavailable` if both fail. |
| `GET /api/tides?lat=&lon=` | DFO IWLS (no key) | Today's tide (local day, America/Vancouver) at the nearest of `DFO_TIDE_STATIONS` and the Active Pass current. Same box as `/api/weather`, else 422. 503 `tides_unavailable` if the tide fails; `current` is null if only the current station fails. |
| `GET /api/status` | | Per source (`onc`, `openweathermap`, `openmeteo`, `dfo`, `onc_observatories`, `codar`, `openmeteo_forecast`, `salishseacast`, `eccc`): `configured`, `ok`, `last_error`, `last_success_at`. |
| `GET /trips/stats` | Neon | One row per trip: distance, speed, berth and Active Pass time, roll, mean water values (`crossing_stats`). |
| `GET /trips/{id}/profile`, `GET /route/profile` | Neon | Water values and depth in 200 parts of the route, for one trip or all trips (`route_profile`). |

### Heading

`heading` is the direction the bow points, in degrees true. Use it for the ship icon: `ship_course`
(course over ground) is GPS noise when the ferry is slow or docked. It comes from the NAV true
heading (`TWSB.N1` / NAV / `heading`, same request as the position). When that is missing, it falls
back to `TWSB` / ORIENTATION / `magnetic_heading` + `MAGNETIC_DECLINATION_DEG`. That compass is
strongly deviated (on 2026-08-17 it read 299 to 3 degrees while the ship turned all the way round),
so the fallback is about right at the Swartz Bay berth and about 40 degrees off at Tsawwassen.

### Tides and currents

```json
{
  "station": {"code": "07270", "name": "Swartz Bay"},
  "date": "2026-10-17",
  "stepMin": 15,
  "heights": [1.69, 1.6, 1.5, "... 97 values, m above chart datum, local 00:00 to next 00:00"],
  "extremes": [{"type": "low", "h": 0.79, "at": "03:43"}, {"type": "high", "h": 3.24, "at": "13:24"}],
  "current": {
    "station": "Active Pass", "speedKn": 3.1, "towardDeg": 45, "flooding": true,
    "maxFloodKn": 3.6, "maxEbbKn": 2.4, "nextSlack": "10:40",
    "events": [{"type": "slack", "at": "03:15", "kn": 0.0}, {"type": "flood", "at": "06:53", "kn": 3.6}]
  }
}
```

- `heights` has one value every `stepMin` minutes, from local 00:00 to the next 00:00 (97 values;
  a DST change day has 93 or 101).
- Current speeds are knots: DFO reports them in knots (they match the CHS current tables).
  `towardDeg` is the direction the water flows toward. At Active Pass the flood sets 045° (NE,
  toward the Strait of Georgia) and the ebb 225°. `flooding` is true when the current now runs
  within 90° of the station's flood direction.
- Event types: `slack`, `flood` (maximum flood), `ebb` (maximum ebb). DFO's "weak and variable"
  periods are listed as `slack`, as in the CHS tables. Times are local `HH:MM` of the same day.
- Station ids are looked up once a day; each day of predictions is cached per station for
  `DFO_CACHE_S` (6 h). The "now" values (`speedKn`, `towardDeg`, `flooding`, `nextSlack`) are
  computed per request.

## ONC sensor mapping

`app/sources/onc_sensors.json` maps each `ShipRow` column to an ONC device category and sensor
code. To check the codes and units against the live API:

```sh
.venv/bin/python scripts/onc_discover.py
```

## Derived tables

`scripts/build_derived.py` builds `readings_derived`, `route_profile` and `crossing_stats` in Neon
(see `DATA.md`) and the kiosk's offline copy of `/route/profile`. It needs the extra packages in
`requirements-scripts.txt`, ONC_TOKEN (for the QC flags) and the GEBCO grid in `backend/data/`
(git-ignored), copied from `s3://ocean-hackathon-2026/data/bcferries/bathymetry_salishsea/`:

```sh
uv pip install --python .venv/bin/python -r requirements-scripts.txt
.venv/bin/python scripts/build_derived.py --dry-run   # summaries only
.venv/bin/python scripts/build_derived.py             # replaces the three tables
```

## Sample data for the frontend

The kiosk's sample ship feed (`frontend/src/mocks/common/ship-feed.json`) and route line
(`frontend/src/config/route.json`) come from the recorded day in Neon (read only):

```sh
.venv/bin/python scripts/export_sample_data.py              # --dry-run to only print the summary
```

- Feed: the first morning round trip (crossings 1 and 2), from 20 min before the first departure
  to 20 min before the next departure from Swartz Bay (06:41 to 10:45, 1462 rows every 10 s). It
  starts and ends docked, so it loops without a jump. Same keys as `/api/ship/latest` (speed in
  knots, `heading` in degrees true). Water sensors are null while docked (the pump is off).
- Route: the berth-to-berth track of crossing 1 (Swartz Bay to Tsawwassen), simplified with
  Douglas-Peucker (20 m). `activePassAt`, the zones and the stops are moved onto the new line.
  `--crossing N` starts the round trip at crossing N (the route then comes from its eastbound
  crossing; 3, 5 and 7 leave Swartz Bay by another channel, up to 4 km away).

## Captain's bridge (`/bridge` in the kiosk)

The crew screen replays a whole recorded day (or shows today, live) from these endpoints. Every
dataset is column-oriented on a regular time axis (`t0` ISO UTC, `stepS`, `n`; every list has `n`
values, `null` = missing), so the kiosk loads a day once and scrubs it locally. Responses are
gzipped (`GZipMiddleware`). Replay payloads are built once per process: **restart the API after
rebuilding a table**.

| Route | Source | Notes |
| --- | --- | --- |
| `GET /bridge/days` | Neon | Recorded days and which datasets each has, plus which are available live. |
| `GET /bridge/{date}/ship?step=10` | Neon `readings` + `readings_derived` | Own ship for the local day (`step` 1 to 60 s; first reading per step): position, SOG/COG/heading, roll/heave, air, pressure, water values, crossing, zone, route fraction, comfort, QC flags. ~0.12 MB gzipped. |
| `GET /bridge/{date}/tides` | DFO IWLS | 15-min axis (97 frames): every `DFO_TIDE_STATIONS` station (`heights`, ISO `extremes`) and the Active Pass current (`kn`, `towardDeg`, `signedKn` + flood / − ebb, `events`). Any date up to tomorrow (422 `day_out_of_range` after). |
| `GET /bridge/{date}/weather` | Open-Meteo historical forecast + Marine | 25 hourly frames. Atmosphere (wind, gust, pressure, temperature, cloud, rain, visibility) as [n][cells] on a `BRIDGE_WX_GRID_DEG` grid over `BRIDGE_BBOX` (cell = iy·nLon + ix, iy 0 = south); `wide`: wind and gusts on a coarse grid over 47–51° N, 129.5–122° W; marine (waves, SST, model current in kn toward) at 14 route points. CC BY 4.0. Requests are paced to 500 calls/min; when Open-Meteo breaks off a response on one variable (it streams `Unexpected error while streaming data`), that variable is dropped and the rest asked again. |
| `GET /bridge/{date}/stations` | ONC `scalardata` | SCVIP and SEVIP (CTD, oxygen, optics, current meter) and IONA (wind, pressure) every 10 min; the Tsawwassen–Duke Point ferry (TWDP.N1 track + TSG, oxygen, optics) every minute as `twdp`. Angles are vector-averaged or newest per step. Finished days only (422 `day_not_finished`). |
| `GET /bridge/{date}/ocean` | SalishSeaCast (UBC ERDDAP) + Open-Meteo Marine | Model surface currents where the radar can't see, finest layer first: `ssc-fine` (SalishSeaCast, top level 0.5 m, on a 0.006° × 0.009° grid over `BRIDGE_BBOX`), `ssc-wide` (SalishSeaCast, 0.04° × 0.06° over the Salish Sea) and `global` (Mercator 1/12° via Open-Meteo, 0.25° × 0.35° out to 129.5° W). int cm/s east/north, null on land. Replay from the SalishSeaCast hindcast (2007 to ~2 days ago; newer days from its forecast); the model grid is rotated to east/north and regridded with `app/sources/ssc_map.json` (`scripts/build_ssc_map.py`). `?stride=N` thins the SalishSeaCast grids (the snapshot uses 5). ~0.6 MB gzipped; a day is built once (~15 s) and kept in `bridge_cache`. |
| `GET /bridge/{date}/windobs` | ECCC climate-hourly | Measured wind at every Environment and Climate Change Canada station in 47–51° N, 129.5–122° W (about 50: lightstations, automatic stations, airports, incl. the Tsawwassen ferry terminal): hourly, 25 frames, knots and direction it blows from (calm = 0 kn, direction null), no gusts. The kiosk uses it first near each station and the model elsewhere, like the radar for currents. Finished days only (ECCC publishes about a day later); kept in Neon once three days old. climate-hourly times are Local Standard Time (UTC−8) all year. |
| `GET /api/bridge/windobs` | ECCC SWOB real-time | Live: the last 3 h at 10 min (19 frames): 10-min mean wind and the highest wind in the 10 min (`gustKn`). Minutely stations fill every frame, hourly ones every 6th (the kiosk holds a reading up to 70 min). Cached 5 min. |
| `GET /bridge/{date}/currents` | Neon `codar_*` | ONC Strait of Georgia CODAR surface currents, hourly (n = 25), int cm/s on the radar's 1 km grid, cells with data that day only, plus the radar `sites`. |
| `GET /bridge/{date}/profiles` | Neon `adcp_profiles` | SCVIP and SEVIP 150 kHz ADCP current profiles every 10 min: `binDepthM`, `u`/`v` m/s per bin. |
| `GET /bridge/{date}/traffic?step=60` | Neon `ais_*` | ONC Iona AIS: each vessel's name, type group, size, `role` (`own` = our ferry, `twdp` = the Duke Point ferry) and fixes (`t` = seconds from `t0`). `step` 60 to 600 (multiple of 60): ~1 MB gzipped at 60 s. |
| `GET /bridge/{date}/sources` | Neon `onc_inventory` | Every ONC location/device category in the bbox that day, with what it returned and which bridge dataset uses it (`usedBy`). |
| `GET /route/climatology?window=aug` | Neon `route_climatology` | "Usual" water along the route: mean, p10, p90 and n per route bin for `sst`, `sal`, `o2Sat`, `chl`, `turb` over Aug 3–31 of 2017, 2018 and 2020–2025. |
| `GET /api/bridge/tides`, `/weather`, `/stations`, `/currents`, `/ocean` | as above + ONC CODAR `.tuv` | Live: the same shapes with `"mode": "live"` and `now`. Tides today; weather 3 h back to 6 h ahead at the replay's resolution (`atmosphere` 0.05°, `wide` 0.25° × 0.35°), each grid read once per 3-hour block (staggered by an hour with the ocean's global currents: ~8.1k Open-Meteo calls a day live, free tier 10k), marine hourly; a failed or degraded part is retried within minutes; stations the last 3 h at 5 min; currents the newest 6 hourly CODAR files (503 `currents_unavailable` with none in 9 h); ocean from the SalishSeaCast forecast (hourly) and the global model (every 3 h). AIS is replay only: ONC publishes it as daily files. |

Errors: 404 `day_not_found`; 503 `neon_not_configured`, `replay_unavailable`, `onc_not_configured`,
`onc_auth`, `onc_down`, `tides_unavailable`, `weather_unavailable`. Datasets made of several
upstream parts answer 200 with `parts: {name: "ok" | code}` when at least one part works. Finished
past days of tides, weather and stations are kept in the Neon table `bridge_cache`, so a restart (or
a teammate without `ONC_TOKEN`) does not refetch them.

### Building the bridge tables

Run from `backend/` with the script packages installed (`requirements-scripts.txt`). Each script has
`--dry-run` and prints a summary; each writes only its own tables.

```sh
.venv/bin/python scripts/build_currents.py --inspect      # then without flags: codar_cells, codar_totals (from frontend/ref/*Totals_Clean.nc)
.venv/bin/python scripts/build_adcp.py --date 2026-08-17  # orders ONC RADCPTS NetCDF (600 s ensembles) → adcp_profiles
.venv/bin/python scripts/onc_inventory.py --date 2026-08-17   # ~2 min → onc_inventory
.venv/bin/python scripts/build_ais.py --peek              # then --date 2026-08-17: both UTC-day AIS files → ais_vessels, ais_positions
.venv/bin/python scripts/build_climatology.py             # ~12 min the first time (cached in data/climatology/) → route_climatology
.venv/bin/python scripts/build_ssc_map.py                 # once: SalishSeaCast grid → app/sources/ssc_map.json (regridding and rotation)
```

### Offline copy for the kiosk

The bridge falls back to `frontend/public/data/{date}/{dataset}.json` when the API is down. The
files are the exact API responses (ship at 20 s, traffic at 180 s, model currents at stride 5; about 4 MB in total):

```sh
.venv/bin/python scripts/export_bridge_snapshot.py --date 2026-08-17
```

### Planned: an assistant (`POST /api/ask`)

The bridge's "Ask" panel and the passenger diver answer canned questions today
(`frontend/src/qa/mockProvider.ts`), filled with the values on screen. The next step is a real
assistant behind the same interface (`QaProvider`):

- `POST /api/ask` with `{persona: "crew" | "guide", lang, question, context: {mode, t, snapshot}}`,
  streaming back `{text, sources[], followUps[]}`.
- Answers come from **tool calls over the endpoints above** (`conditions_at(t)`,
  `series(var, from, to, stat)`, `tides_and_current(date)`, `traffic_near(t, r)`, `crossing_stats()`,
  `route_profile(var)`), not from vector search: the data is numbers in time and space. The small
  text knowledge (DATA.md findings, zones, species, instrument notes) goes in a cached system prompt.
- Server-side only (the model key never reaches the browser), with topic limits, a rate limit per
  kiosk, a kid-safe tone for the diver, "advisory only, not for navigation" for the crew, and the
  canned answers as the offline fallback.
