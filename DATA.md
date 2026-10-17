# Data Guide

This document explains where our data lives and what is in the shared Neon Postgres database.

---

## 1. Raw data (S3)

Location: `s3://ocean-hackathon-2026/data/bcferries/`

| File                            | Size     | Content                                                                                                                                                                                   | In Postgres?           | Why                                                                                                                                        |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `TWSB_2026-08-17_combined.csv`  | 21.8 MB  | Main dataset, **wide format**. One row per second for one full day (86,400 rows), one column per variable.                                                                                | Yes, as `readings_raw` | Easiest format for the kiosk, plots and queries.                                                                                           |
| `TWSB_2026-08-17_inventory.csv` | < 0.1 MB | Data dictionary. One row per variable (28 rows): device, name, unit, counts, min, max, % good.                                                                                            | Yes, as `sensors`      | Small and useful for labels and units.                                                                                                     |
| `TWSB_2026-08-17_tidy.csv`      | 190.9 MB | Same measurements in **long format** (~2.65 M rows, one per reading). Adds a QC flag per value and original sensor timestamps (some sensors sample every 0.5 s).                             | No                     | Not needed: the same QC flags come from the ONC API (see section 5), and `combined` already holds only QC-good values. Load only for sub-second data. |
| `TWSB_2026-08-17.xlsx`          | < 0.1 MB | Which vessels sailed which crossings that day, and facts about them (from the README PDF). Not downloaded yet.                                                                          | No                     | Small and useful: vessel name per crossing for `crossing_stats`.                                                                           |
| `bathymetry_salishsea/`         | ~17 MB   | GEBCO 2026 seafloor elevation grid (NetCDF), 45°N to 55°N, 130°W to 120°W, ~300 to 460 m per cell. Plus a PNG preview and PDFs. No ship data.                                             | No                     | Gridded raster, not tabular. Read with `xarray`. Use it as a base map and to look up water depth under the ship. **Credit GEBCO if used.** |
| `BCFerriesData_README.pdf`      | small    | Official description of the data.                                                                                                                                                         | No                     | Documentation. Read it.                                                                                                                    |

`TWSB` is the Tsawwassen to Swartz Bay route. The ship's position ranges over latitude 48.69 to 49.01 and longitude -123.45 to -123.13.

---

## 2. Shared database (Neon Postgres)

- Project: `Ocean Victoria`, branch `production`, database `neondb`, region AWS US East 2 (Ohio)
- Free tier: 1 GB storage. Currently using about 64 MB.
- Get the connection string from a teammate by DM, or from the Neon console (**Connect** button) if you have been invited to the org.

### Connecting from Python

Connection string format (get the real one from a teammate by DM or from the Neon console **Connect** button):

```
postgresql://<user>:<password>@<host>/neondb?sslmode=require
```

```python
import os, getpass
from sqlalchemy import create_engine, text

if "NEON_URL" not in os.environ:
    os.environ["NEON_URL"] = getpass.getpass("Neon connection string: ")

engine = create_engine(
    os.environ["NEON_URL"].replace("postgresql://", "postgresql+psycopg2://"),
    pool_pre_ping=True,  # reconnects automatically after Neon scales to zero
)
```

Notes:

- Neon suspends the database after ~5 minutes idle. The first query after that takes a few seconds. `pool_pre_ping=True` avoids `PendingRollbackError` after a suspend.
- Use the **pooled** host (contains `-pooler`) for notebooks and the backend. Use the **direct** host (without `-pooler`) for GUI tools like DBeaver, with SSL mode `require`.
- The Neon console also has a **Tables** browser and **SQL Editor**.

---

## 3. Tables

### Current

#### `readings_raw` (86,400 rows, 23 MB)

Direct import of `combined.csv`. One row per second.

| Column                                       | Type   | Unit      | Notes                                                                                 |
| -------------------------------------------- | ------ | --------- | ------------------------------------------------------------------------------------- |
| `time`                                       | text   | UTC       | e.g. `2026-08-17 07:00:00.062000+00:00`. Unique. Stored as text for now.              |
| `time_local`                                 | text   | UTC-07:00 | Pacific Daylight Time. Same instant as `time`.                                        |
| `latitude`, `longitude`                      | double | deg       | Ship position                                                                         |
| `speed_over_ground`                          | double | m/s       | Below ~2 m/s means docked or maneuvering                                              |
| `heading`, `ship_course`, `magnetic_heading` | double | deg       |                                                                                       |
| `pitch`, `roll`                              | double | deg       |                                                                                       |
| `heave`                                      | double | m         |                                                                                       |
| `air_temperature`                            | double | °C        |                                                                                       |
| `barometric_pressure`                        | double | hPa       |                                                                                       |
| `tsg_temperature`                            | double | °C        | Sea surface water temperature (TSG)                                                   |
| `salinity`                                   | double | psu       |                                                                                       |
| `conductivity`                               | double | S/m       |                                                                                       |
| `sound_speed`                                | double | m/s       |                                                                                       |
| `oxygen`, `oxygen_corrected`                 | double | ml/l      | Dissolved oxygen                                                                      |
| `oxygen_saturation`                          | double | %         |                                                                                       |
| `oxysensor_temperature`                      | double | °C        | Temperature at the oxygen sensor                                                      |
| `chlorophyll`                                | double | µg/l      | Proxy for phytoplankton                                                               |
| `turbidity`                                  | double | NTU       | Water cloudiness                                                                      |
| `cdom_fluorescence`                          | double | ppb       | Dissolved organic matter                                                              |
| `flow`                                       | double | V         | Seawater pump flow signal                                                             |
| `current`                                    | double | A         | Pump system current                                                                   |
| `tank_level`                                 | double | %         |                                                                                       |
| `leak_status`, `systemstatus`                | double | on/off    |                                                                                       |

#### `sensors` (28 rows)

Direct import of `inventory.csv`. One row per variable.

| Column               | Type   | Notes                                                                                  |
| -------------------- | ------ | -------------------------------------------------------------------------------------- |
| `locationCode`       | text   | `TWSB` (ship systems) or `TWSB.N1` (navigation)                                        |
| `deviceCategoryCode` | text   | `NAV`, `ORIENTATION`, `BARPRESS`, `TEMPHUMID`, `TSG`, `OXYSENSOR`, `TURBCHLFL`, `PVCS` |
| `sensor`             | text   | Variable name                                                                          |
| `unit`               | text   |                                                                                        |
| `n`                  | bigint | Number of records                                                                      |
| `good`               | bigint | Records passing QC                                                                     |
| `vmin`, `vmax`       | double | Min and max values                                                                     |
| `pct_good`           | double | % of records passing QC                                                                |

Column names are camelCase, so quote them in SQL: `select "deviceCategoryCode" from sensors`.

Two rows have `sensor = 'temperature'`. In `readings_raw` they are `tsg_temperature` and `oxysensor_temperature`. `valve_position_status` (PVCS valve code; 1 while seawater is sampled) is a column of `readings_raw` and `readings` too, after `turbidity`.

#### `readings` (86,400 rows, 21 MB)

Cleaned `readings_raw`: `time` is now `ts` (`timestamptz`, primary key). Other columns are unchanged.

#### `crossings` (8 rows)

One row per trip, numbered by start time.

| Column      | Type        | Notes                                |
| ----------- | ----------- | ------------------------------------ |
| `id`        | smallint    | Primary key, 1 to 8                  |
| `direction` | text        | `swb_to_tsa` or `tsa_to_swb`         |
| `start_ts`  | timestamptz | Departure                            |
| `end_ts`    | timestamptz | Arrival                              |

### Derived

Built by `backend/scripts/build_derived.py` from `readings`, `crossings`, the ONC QC flags, the route
line (`frontend/src/config/route.json`) and the GEBCO grid. The script recreates only these three
tables. It also writes `frontend/src/mocks/common/route-profile.json`, the kiosk's offline copy of
`GET /route/profile`. Setup and run: see `backend/README.md`.

#### `readings_derived` (86,400 rows, 10 MB)

One row per `readings.ts` (same key).

| Column | Type | Notes |
| --- | --- | --- |
| `crossing_id` | smallint | `crossings.id`, null at the berth |
| `is_underway` | boolean | `speed_over_ground` > 2 m/s |
| `is_sampling` | boolean | `systemstatus` = 1 and `valve_position_status` = 1 (seawater flowing to the sensors) |
| `speed_kn` | real | knots |
| `route_fraction`, `route_km` | real | Position projected onto the route line: 0 / 0 km at Swartz Bay, 1 / 46.2 km at Tsawwassen. The kiosk uses the same fraction. |
| `off_route_m` | real | Distance from the route line (median 169 m underway; crossings 3, 5, 7 leave Swartz Bay by another channel) |
| `zone` | text | `swartz-bay`, `swanson-channel`, `active-pass`, `strait-of-georgia`, `tsawwassen` (zones of `route.json`) |
| `sigma_t` | real | Surface density − 1000, kg/m³ (TEOS-10 σ0 from TSG temperature and salinity) |
| `roll_std_60s` | real | Standard deviation of roll over the previous 60 s, degrees |
| `comfort` | text | `calm` (< 0.5°, 77% of underway time), `gentle` (< 1°, 17%), `rolly` (6%) |
| `tsg_flag`, `oxygen_flag`, `optics_flag` | smallint | ONC QC flag of the TSG, OXYSENSOR and TURBCHLFL sample nearest in time (the flag is the same for every sensor of a device) |

#### `route_profile` (1,800 rows)

Underway water values in 200 equal parts ("bins", ~230 m) of the route line, for each crossing
(`crossing_id` 1 to 8) and for all crossings together (`crossing_id` 0). Key: (`crossing_id`, `bin`).
Columns: `fraction`, `km`, `zone`, `lat`, `lon` (middle of the bin on the route line), `depth_m`
(GEBCO water depth there, 0 on land cells near the berths), `n` (underway seconds), `speed_kn`,
`sst`, `salinity`, `o2_sat`, `chl`, `turbidity`, `sigma_t`, and `sst_anom`, `salinity_anom`,
`o2_sat_anom` (bin value minus the same crossing's mean over the whole route).

#### `crossing_stats` (8 rows)

One row per crossing: `direction`, `start_ts`, `end_ts`, `duration_min`, `track_km` (distance
sailed), `avg_kn`, `max_kn`, `dwell_before_min` (time at the berth since the previous arrival),
`active_pass_min`, `roll_std`, `max_abs_roll`, mean `sst`, `salinity` (+ `salinity_min`,
`salinity_max`), `o2_sat`, `chl`, and `tsg_missing` (true for crossing 6).

---

## 4. Things to know about the data

- **One ship, one day:** 2026-08-17, local time 00:00 to 23:59. The ship is docked from 00:00 to ~07:00 and after ~23:00, and runs back and forth in between.
- **Water quality data only exists while underway.** When docked, the seawater pump is off and TSG, oxygen and chlorophyll are empty:

  | State                    | Seconds | Salinity present | Oxygen present | Chlorophyll present |
  | ------------------------ | ------- | ---------------- | -------------- | ------------------- |
  | Docked or slow (≤ 2 m/s) | 46,805  | 0%               | 0%             | 0%                  |
  | Underway (> 2 m/s)       | 39,595  | 80.5%            | 92.3%          | 92.3%               |

- **Gap:** between 17:00 and 19:00 local time the ship is underway but salinity (TSG) is empty. ONC's QC flagged the TSG "probably bad" (flag 3) then; oxygen and chlorophyll are fine.
- **QC:** every water value in `readings` has ONC QC flag 1 (good); the export already dropped the rest. Flag 4 (bad) covers 97% of the docked time (pump off). `sensors.good` counts good *samples*; `readings` has a few more non-null rows because `combined` repeats a sample when it resamples to 1 Hz.
- **Do not use `pitch`:** it swings ±5° (standard deviation) even at the berth, around −2°. `roll` (±4.6°, largest in the Active Pass turns) and `heave` look right.
- **`magnetic_heading`** is off by up to ~60° (compass deviation). Use `heading` (NAV true heading).
- Barometric pressure, air temperature and magnetic heading are sampled at 2 Hz in the raw data. `combined` resamples everything to 1 row per second.

---

## 5. What the data shows (2026-08-17)

- **Fraser River plume.** Moving east, salinity falls from about 29.2 psu (Swartz Bay side) to 26.2 psu near Tsawwassen and sea temperature rises from 13–14 °C to 16.8 °C. Chlorophyll (~3 µg/l) and oxygen saturation (~112%) peak in the mid and east Strait.
- **Active Pass mixing.** At 48.86 N, −123.30 to −123.35 the tide brings deep water to the surface: 12.6 °C, 29.6 psu, oxygen saturation down to ~70%.
- **Operations.** 8 crossings of 79–87 min and 45.6–47.8 km sailed, 35–46 min at the berth in between, about 9–11 min in the Active Pass zone at 16–20 kn.
- **Through the day.** Air temperature 12.7 → 18.6 °C, pressure falling about 4 hPa. Chlorophyll rises from 1.3 to 3.1 µg/l per crossing by evening, oxygen saturation from 92% to 107%.

## 6. ONC onboard sensors

The same instruments stream live from Ocean Networks Canada (Oceans 3.0 API; Python package `onc`).
Locations: `TWSB` (ship systems) and `TWSB.N1` (navigation).

| What | Notes |
| --- | --- |
| Live data | Every sensor in `readings`, about 1 s behind. The backend's `GET /api/ship/latest` reads it (now including `oxygen_saturation`), and `GET /api/ship/history` the last 1 to 180 min of it, one row per 1 to 60 s. |
| QC flags | `scalardata/location` with `qualityControl=raw` gives a flag per sample. `build_derived.py` reads them for the TSG, OXYSENSOR and TURBCHLFL. |
| History | TSG data on this route 2001–2011, 2014–2018 and 2020 to now (current Sea-Bird 45 since 2025-10-10). NAV and the other sensors since 2020. |
| Instruments | On 2026-08-17: Hemisphere GNSS (NAV), Sea-Bird TSG 45, WET Labs ECO Triplet (TURBCHLFL), Aanderaa Optode 3835 (OXYSENSOR), Rotronic air temperature, RM Young pressure and compass, PVCS pump control. |
| Not available | Wind (no wind monitor deployed; the RM Young met station returns no data), relative humidity, transmissometer and the older fluorometers (retired). |

## 7. Island knowledge (draft, to check)

The kiosk shows what each island and the main peaks along the route are known for (food, events, nature, history,
arts): on the ferry screen's card while the ship passes, and on the map labels. The text is bundled in
`frontend/src/mocks/{en,fr}/landmarks.json` under each place's `knowledge` key.

All 28 entries are drafts researched from public web sources on 2026-10-17, each with `"checked": false`.
**A person on the team must verify every entry before the kiosk goes live**, using
[`frontend/src/mocks/KNOWLEDGE_CHECKLIST.md`](frontend/src/mocks/KNOWLEDGE_CHECKLIST.md) (sources, confidence,
and sensitive items first). Indigenous names (`indigenousName`) are left empty on purpose, for the team to fill
from verified sources.
