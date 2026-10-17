# Data Guide

This document explains where our data lives and what is in the shared Neon Postgres database.

---

## 1. Raw data (S3)

Location: `s3://ocean-hackathon-2026/data/bcferries/`

| File                            | Size     | Content                                                                                                                                                                                   | In Postgres?           | Why                                                                                                                                        |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `TWSB_2026-08-17_combined.csv`  | 21.8 MB  | Main dataset, **wide format**. One row per second for one full day (86,400 rows), one column per variable.                                                                                | Yes, as `readings_raw` | Easiest format for the kiosk, plots and queries.                                                                                           |
| `TWSB_2026-08-17_inventory.csv` | < 0.1 MB | Data dictionary. One row per variable (28 rows): device, name, unit, counts, min, max, % good.                                                                                            | Yes, as `sensors`      | Small and useful for labels and units.                                                                                                     |
| `TWSB_2026-08-17_tidy.csv`      | 190.9 MB | Same measurements in **long format** (~2.65 M rows, one per reading). Adds a QC flag per value, original sensor timestamps (some sensors sample every 0.5 s) and `valve_position_status`. | Not yet                | Not needed for the kiosk. Load later only if we need QC filtering or sub-second data.                                                      |
| `TWSB_2026-08-17.xlsx`          | < 0.1 MB | Excel version, probably a summary. Not inspected yet.                                                                                                                                     | No                     | Likely duplicates the CSVs.                                                                                                                |
| `bathymetry_salishsea/`         | ~17 MB   | GEBCO 2026 seafloor elevation grid (NetCDF), 45°N to 55°N, 130°W to 120°W, ~300 to 460 m per cell. Plus a PNG preview and PDFs. No ship data.                                             | No                     | Gridded raster, not tabular. Read with `xarray`. Use it as a base map and to look up water depth under the ship. **Credit GEBCO if used.** |
| `BCFerriesData_README.pdf`      | small    | Official description of the data.                                                                                                                                                         | No                     | Documentation. Read it.                                                                                                                    |

`TWSB` is the Tsawwassen to Swartz Bay route. The ship's position ranges over latitude 48.69 to 49.01 and longitude -123.45 to -123.13.

---

## 2. Shared database (Neon Postgres)

- Project: `Ocean Victoria`, branch `production`, database `neondb`, region AWS US East 2 (Ohio)
- Free tier: 1 GB storage. Currently using about 23 MB.
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
| `time_local`                                 | text   | UTC-07:00 | Pacific Daylight Time. Will be dropped. Pacific Daylight Time. Redundant with `time`. |
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

Two rows have `sensor = 'temperature'`. In `readings_raw` they are `tsg_temperature` and `oxysensor_temperature`. `valve_position_status` exists here but not in `readings_raw`.

---

## 4. Things to know about the data

- **One ship, one day:** 2026-08-17, local time 00:00 to 23:59. The ship is docked from 00:00 to ~07:00 and after ~23:00, and runs back and forth in between.
- **Water quality data only exists while underway.** When docked, the seawater pump is off and TSG, oxygen and chlorophyll are empty:

  | State                    | Seconds | Salinity present | Oxygen present | Chlorophyll present |
  | ------------------------ | ------- | ---------------- | -------------- | ------------------- |
  | Docked or slow (≤ 2 m/s) | 46,805  | 0%               | 0%             | 0%                  |
  | Underway (> 2 m/s)       | 39,595  | 80.5%            | 92.3%          | 92.3%               |

- **Gap:** between 17:00 and 19:00 local time the ship is underway but salinity (TSG) is empty.
- Barometric pressure, air temperature and magnetic heading are sampled at 2 Hz in the raw data. `combined` resamples everything to 1 row per second.
