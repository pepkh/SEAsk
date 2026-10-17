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
| `GET /api/weather?lat=&lon=` | OpenWeatherMap + Open-Meteo Marine | Point inside the Salish Sea box (lat 47.5 to 50.5, lon -125.5 to -121.5), else 422. Each part is `live` or `unavailable`; 503 `weather_unavailable` if both fail. |
| `GET /api/tides?lat=&lon=` | DFO IWLS (no key) | Today's tide (local day, America/Vancouver) at the nearest of `DFO_TIDE_STATIONS` and the Active Pass current. Same box as `/api/weather`, else 422. 503 `tides_unavailable` if the tide fails; `current` is null if only the current station fails. |
| `GET /api/status` | | Per source (`onc`, `openweathermap`, `openmeteo`, `dfo`): `configured`, `ok`, `last_error`, `last_success_at`. |

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
