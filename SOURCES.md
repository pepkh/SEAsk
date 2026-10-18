# Data sources and references

This file lists every value SEAsk shows, where it comes from, and how to credit it. It covers the passenger kiosk and the captain's bridge (`/bridge`).

- Licences and attribution wording were checked against each provider's own terms on **2026-10-17**.
- What the hackathon data files contain is in [DATA.md](DATA.md).

**One place for credit text.** The app takes every credit line from [`frontend/src/config/sources.ts`](frontend/src/config/sources.ts), the provider registry: names, short names, credit lines, licences, DOIs and required notices. Change a credit there, not in a component.

**Where the credits appear in the app:**

| Screen | Where | What it shows |
| --- | --- | --- |
| Ferry | Now card, Outside slot | Small source line: DFO, plus OpenWeather or Open-Meteo |
| Ferry | Now card, Look-out slot | The photo credit |
| Lab | "About the data" card | Every provider with its licence, and the CHS notice in full |
| Lab | Tide chart and current card | DFO / CHS line |
| Lab | Weather panel | OpenWeather or Open-Meteo, and Copernicus Marine for waves |
| Lab | Route profile | ONC and GEBCO |
| Dive | Seafloor slice | GEBCO footnote |
| Dive, Quiz, Lab, map, guide | Under each written fact | "Source: …" line |
| Map mode | Map corner | Tile and terrain credit |
| Bridge | Header | "Advisory only. Not for navigation." |
| Bridge | Each panel header | The source of that panel |
| Bridge | Map corner | Short credit for every dataset in use; the full text on tap |
| Bridge | Data status popover | Each dataset with its providers, the ONC devices used, and "Credits and licences" with DOIs and the CHS notice |

---

## 1. How to cite SEAsk's data

**In a report or presentation, cite:**

1. **Ocean Networks Canada:**
   - The ferry and observatory data. ONC's format is `Ocean Networks Canada Society. <year>. <title>. Ocean Networks Canada Society. https://doi.org/<doi>`. The DOIs for each instrument are in [section 6](#6-onc-instruments-and-dois).
   - Also credit BC Ferries (British Columbia Ferry Services Inc.), the contributor named on every ferry DOI. Suggested wording: "Data: Ocean Networks Canada, from instruments aboard BC Ferries vessels." ONC publishes no official wording.
2. **GEBCO:** GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa
3. **Tides and currents:** "Tide and current predictions: Canadian Hydrographic Service, Fisheries and Oceans Canada", and the CHS notice in [section 2](#2-providers).
4. **Wind stations:** "Data Source: Environment and Climate Change Canada".
5. **Open-Meteo:** "Weather data by Open-Meteo.com". Optional citation: Zippenfenig, P. (2023). Open-Meteo.com Weather API. Zenodo. https://doi.org/10.5281/ZENODO.7970649
6. **Copernicus Marine** (waves and global currents through Open-Meteo Marine): "Generated using E.U. Copernicus Marine Service Information; https://doi.org/10.48670/moi-00017; https://doi.org/10.48670/moi-00016".
7. **SalishSeaCast** (bridge currents):
   - Soontiens, N. et al. (2016). Storm surges in the Strait of Georgia simulated with a regional model. *Atmosphere-Ocean* 54, 1-21. https://doi.org/10.1080/07055900.2015.1108899
   - Soontiens, N. and Allen, S. (2017). Modelling sensitivities to mixing and advection in a sill-basin estuarine system. *Ocean Modelling* 112, 17-32. https://doi.org/10.1016/j.ocemod.2017.02.008
   - Acknowledge MEOPAR, Ocean Networks Canada and the Digital Research Alliance of Canada.
8. **Imagery and photos:** EOX, NRCan and each photo's author, as listed in [section 2](#2-providers).

---

## 2. Providers

Every entry here is in `frontend/src/config/sources.ts` under the same id.

| id | Provider | What SEAsk uses | Licence | Credit to show | Restrictions |
| --- | --- | --- | --- | --- | --- |
| `onc` | Ocean Networks Canada Society | **Oceans 3.0 API** `https://data.oceannetworks.ca/api`:<br>• ferry TWSB / TWSB.N1 (own ship)<br>• TWDP / TWDP.N1 (second ferry)<br>• SCVIP and SEVIP (VENUS observatories)<br>• IONA (AIS receiver, wind, pressure)<br>• SOGCS (CODAR radar)<br><br>**Also:**<br>• the hackathon export `TWSB_2026-08-17_*.csv` (DATA.md §1)<br>• climatology Aug 2017–2025 (`build_climatology.py`) | CC BY 4.0 (ONC Data Policy CORP-103) | Ocean Networks Canada: instruments aboard BC Ferries vessels (British Columbia Ferry Services Inc.) and seafloor observatories (CC BY 4.0) | Not for navigation. Token required. |
| `dfo` | Fisheries and Oceans Canada, Canadian Hydrographic Service (CHS) | **IWLS API** `https://api-iwls.dfo-mpo.gc.ca/api/v1`:<br>• tide stations 07270 Swartz Bay, 07528 Miners Bay, 07590 Tsawwassen (`wlp`, `wlp-hilo`)<br>• current station 07527 Active Pass (`wcsp1`, `wcdp1`, `wcp1-events`) | [CHS licence agreement](https://tides.gc.ca/en/licence-agreement) ([FR](https://www.marees.gc.ca/fr/accord-de-licence)), not the Open Government Licence | Tide and current predictions: Canadian Hydrographic Service, Fisheries and Oceans Canada.<br>Plus clause 10's notice in full, shown on the Lab "About the data" card and the bridge data status. | Not for navigation. No commercial derivative products. Data may not be passed on. Figures may differ slightly from the official tables. |
| `eccc` | Environment and Climate Change Canada | **MSC GeoMet** `https://api.weather.gc.ca/collections`: `climate-stations`, `climate-hourly` (replay), `swob-realtime` (live). About 50 stations, e.g. 1108291 Tsawwassen Ferry Terminal. | [ECCC Data Services End-use Licence](https://eccc-msc.github.io/open-data/licence/readme_en/) v2.1.1 | Data Source: Environment and Climate Change Canada | Don't imply official status. If a station's provider is not MSC, name it. |
| `openMeteo` | Open-Meteo | **Forecast** `api.open-meteo.com/v1/forecast` (live), **historical forecast** `historical-forecast-api.open-meteo.com/v1/forecast` (replay), **Marine** `marine-api.open-meteo.com/v1/marine` | CC BY 4.0 | Weather data by Open-Meteo.com (CC BY 4.0) | The free API is **non-commercial only**. Not suitable for coastal navigation. |
| `copernicusMarine` | Copernicus Marine Service (Mercator Ocean International), through Open-Meteo Marine | **Waves:** MeteoFrance MFWAM, `GLOBAL_ANALYSISFORECAST_WAV_001_027`, doi:10.48670/moi-00017.<br>**Global surface currents:** SMOC, `GLOBAL_ANALYSISFORECAST_PHY_001_024`, doi:10.48670/moi-00016. | [Copernicus Marine licence](https://marine.copernicus.eu/user-corner/service-commitments-and-licence) | Generated using E.U. Copernicus Marine Service Information (with the DOIs) | UNVERIFIED: which wave model Open-Meteo's "best match" uses here. If it is DWD's, credit DWD too. |
| `salishSeaCast` | SalishSeaCast Project Contributors, UBC Earth, Ocean & Atmospheric Sciences | **ERDDAP** `https://salishsea.eos.ubc.ca/erddap`:<br>• hindcast `ubcSSg3DuGridFields1hV21-11`, `ubcSSg3DvGridFields1hV21-11`<br>• forecast `ubcSSf3DuGridFields1h`, `ubcSSf3DvGridFields1h`<br>• mesh `ubcSSn2DMeshMaskV21-08` | Apache 2.0 | Current model: SalishSeaCast Project Contributors and UBC (Apache 2.0), with MEOPAR, ONC and the Digital Research Alliance of Canada | Keep the licence notice. Cite the two papers in section 1. |
| `owm` | OpenWeather | **Current weather API** `api.openweathermap.org/data/2.5/weather` (kiosk live weather; bridge live wind fallback) | ODbL (all self-service plans) | Weather data © OpenWeather (ODbL) | The credit must be visible in the app, not only in documentation. |
| `gebco` | GEBCO Bathymetric Compilation Group | GEBCO_2026 Grid, from S3 `bathymetry_salishsea/`: depth under the route (`route_profile.depth_m`) | Public domain | Citation in section 1 | Not for navigation. Don't imply endorsement. |
| `eox` | EOX IT Services GmbH | **EOxCloudless 2025 tiles** (`s2cloudless-2025_3857`), satellite basemap of the kiosk map and the bridge | CC BY-NC-SA 4.0 | EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025) | **Non-commercial.** Commercial dashboards need EOX's paid licence. |
| `nrcan` | Natural Resources Canada | **CBMT base map and labels** (chart basemap) | Open Government Licence – Canada | © His Majesty the King in Right of Canada, as represented by the Minister of Natural Resources Canada (OGL – Canada) | No implied endorsement. |
| `mrdem` | Natural Resources Canada | **MRDEM-30 elevation** (kiosk map terrain, `build-terrain.sh`) | Open Government Licence – Canada | Terrain: NRCan MRDEM-30 (OGL – Canada) | — |
| `seaskFouling` | SEAsk team (our own model, not an outside provider) | **Experimental biofouling index**: a machine-learning model trained on ONC ferry readings (chlorophyll, O₂ saturation), past routes and satellite organic matter (**product name to add**). One run for 17 Aug 2026, `backend/data/seask_experimental_bfi_proxy_2026-08-17.geojson` → `frontend/public/data/2026-08-17/fouling.json` (`backend/scripts/build_fouling.py`). | SEAsk team, unpublished | Biofouling index: SEAsk team machine-learning model (experimental) … | Status `UNVALIDATED_RELATIVE_ENVIRONMENTAL_SCREENING_PROXY`: it ranks places on its model day only. Not for navigation. In live mode the same run is shown, labelled with its date. |
| `photos` | iNaturalist and Wikimedia Commons photographers | 13 species and scene photos. The author, licence and source of each are in [`frontend/public/images/photos/CREDITS.md`](frontend/public/images/photos/CREDITS.md). | CC0, CC BY, CC BY-SA, PD (per photo) | `Photo: author · licence · source`, shown with each photo | No platform credit is needed. CC BY and CC BY-SA need the credit with the photo. |

Not data, so not in the registry:
- **`bridge/derive/sun.ts`:** the NOAA solar position algorithm.
- **`weather/moon.ts`:** the mean lunar month.
- **The procedural 3D ferry and islands.**

---

## 3. Recorded and live data

**What the hackathon provided** (`s3://ocean-hackathon-2026/data/bcferries/`, see `BCFerriesData_README.pdf`):
- **ONC sensor readings for 17 Aug 2026:**
  - `combined.csv`: one row per second
  - `tidy.csv`: the same readings with QC flags
  - `inventory.csv`: sensor counts and quality
- **GEBCO grid.**
- **`TWSB_2026-08-17.xlsx`** (vessel per sailing): **not used yet**.

**Offline mode** (`VITE_LIVE_DATA=false`, or whenever a live source is down) replays that real day. The screen says so: "Recorded · 17 Aug 2026" on the Ferry card, and the RECORDED chip on the Lab.

| What | Recorded-day source | Code |
| --- | --- | --- |
| Ship position, speed, roll, sea and air sensors | `frontend/src/mocks/common/ship-feed.json`: a real round trip (13:41–17:44 UTC), looped. Each row keeps its recorded time (`recorded_time`). | `api/shipFeed.ts`, `backend/scripts/export_sample_data.py` |
| Tides and Active Pass current | `frontend/public/data/2026-08-17/tides.json`: DFO predictions for that day. Uses the station nearest the ship, at the ship's recorded moment. | `tides/recorded.ts`, `api/recorded.ts` |
| Weather and waves | `frontend/public/data/2026-08-17/weather.json`: the Open-Meteo model for that day, at the ship's position and recorded moment. | `weather/recorded.ts` |
| QC % in the Lab table | `frontend/src/mocks/common/qc.json` (see below) | `export_sample_data.py --qc-only` |
| Route profile ("usual values") | `frontend/src/mocks/common/route-profile.json` (ONC readings + GEBCO) | `build_derived.py` |

**QC %** is ONC's quality-control pass rate on 17 Aug 2026:
- **Sea sensors:** counted only while seawater flowed to the sensors (`readings_derived.is_sampling`), because ONC flags the dry berth time bad.
  - TSG: 83.0%. The 17:00–19:00 gap is flagged "probably bad".
  - Oxygen: 95.1%
  - Optics: 95.1%
- **Air sensors:** from `sensors.pct_good`. Air temperature 100.0%, pressure 100.0%.

**Live mode** (`VITE_LIVE_DATA=true`) uses these sources. Each one falls back to the recorded day on its own when it is down.

| Data | Live source |
| --- | --- |
| Ship | ONC `scalardata/location` |
| Tides | DFO IWLS (`/api/tides`) |
| Weather | OpenWeather (`/api/weather`) |
| Waves | Open-Meteo Marine (`/api/weather`) |

The bridge replay reads `/bridge/{date}/*` or its offline copy in `frontend/public/data/{date}/`. Live, it reads `/api/bridge/*`.

---

## 4. Kiosk: every value on screen

**Kind:**
- **measured:** an instrument reading
- **predicted:** a DFO tide or current prediction
- **model:** weather or ocean model output
- **computed:** worked out in the app from other values
- **written:** content text, sourced in [section 7](#7-written-content)
- **set by hand:** see [section 8](#8-values-set-by-hand-not-data)

### Ferry screen (`screens/Ferry`)

| Value | Source | Kind | Code path |
| --- | --- | --- | --- |
| "Recorded · 17 Aug 2026" or LIVE; clock | ship feed source; recorded time of the row | — | `NowCard.tsx`, `hooks/useDataTime.ts` |
| Now passing (island or zone) | ship position + `config/landmarks.json` (hand-set points) + `zones.json` | computed / written | `map/findLandmark.ts` |
| Minutes to the next terminal | ONC NAV speed; `route.json` (18.6 kn service speed when slow) | computed | `ship/sailing.ts` |
| Outside: temperature, wind word, sky | OpenWeather (live) or Open-Meteo (recorded) | model / measured | `weather/WeatherProvider.tsx` |
| Tide gauge and "coming in / going out" | DFO prediction, nearest station | predicted | `tides/useTides.ts`, `tides/trend.ts` |
| Water words (temperature, saltiness, oxygen, plankton) | ONC TWSB TSG, OXYSENSOR, TURBCHLFL; word thresholds set by hand | measured | `screens/Ferry/abstract.ts` |
| Look-out animal, its text and photo | `zones.json` lookout; photo credit | written | `slots.tsx` |
| Ride: speed comparison | ONC NAV speed (km/h thresholds set by hand) | measured | `abstract.ts` |
| Ride: comfort (calm / gentle / rolly) | ONC NAV roll, standard deviation over 60 s, limits 0.5° and 1° | computed | `ship/comfort.ts` |
| Island specialties | `landmarks.json` `knowledge` (**draft**, `checked: false`) | written | `KNOWLEDGE_CHECKLIST.md` |
| Route map position | ONC position on the route fraction; the map drawing is schematic | computed | `RouteMapBubble.tsx`, `components/RouteMap/geometry.ts` |
| Dive bubble "{m} m below", storeys | GEBCO depth under the route (smoothed); 3 m per storey | measured | `ship/slice.ts`, `abstract.ts` |

### Dive screen (`screens/Dive`)

| Value | Source | Kind |
| --- | --- | --- |
| Depth gauge, seafloor slice, "water below you" | GEBCO_2026 depth along the route (footnote credits GEBCO) | measured |
| Animal markers on the slice | `seafloor.json` markers: **illustrative positions**, not observations | written |
| Species name, Latin name, habitat, text, size | `species.json`, sources under `species.<id>` | written |
| Species photos | `config/photos.json` (credit shown) | — |
| Fact cards | `seafloor.json` facts, sources under `seafloor.facts.<i>` | written |

### Lab: "The water" tab (`screens/Lab`)

| Value | Source | Kind |
| --- | --- | --- |
| Speed, course over ground, position | ONC TWSB.N1 NAV (Hemisphere GNSS) | measured |
| Arrival time, km done / 46.2 km | ship position projected on `route.json` | computed |
| Readings table (10 rows) and 15-min sparklines | ONC TWSB: TSG (temperature, salinity, conductivity, sound speed), OXYSENSOR (O₂ saturation), TURBCHLFL (chlorophyll, turbidity, CDOM), TEMPHUMID (air temperature), BARPRESS (pressure) | measured |
| QC % | ONC QC flags on 17 Aug 2026 (`mocks/common/qc.json`, section 3) | measured |
| Track coloured by a reading | ONC readings of this crossing; colour ranges set by hand (`readings.json` tracks) | measured |
| Route profile ("Usually" line, "Now" dot) | `route_profile`: ONC readings of the 17 Aug crossings in 200 bins, GEBCO depth | computed |
| "What's happening here" and its comparison chips | `zones.json` happening (written); chips from `route_profile` anomalies (computed) | written / computed |
| About the data | text, the provider list, the CHS notice | — |

### Lab: "Outside" tab (`screens/Lab/outside`)

| Value | Source | Kind |
| --- | --- | --- |
| Tide curve, high/low, "Now" | DFO, the station nearest the ship (07270 / 07528 / 07590) | predicted |
| Active Pass current, next slack, top speed | DFO 07527 | predicted |
| Why tides happen | `tides.json` explainer, sources under `tides.explainer` | written |
| Temperature, sky, wind, visibility, sunset | OpenWeather (live); Open-Meteo for 17 Aug (recorded: sunset computed, feels-like = air temperature) | model |
| Waves | Open-Meteo Marine (Copernicus Marine models) | model |
| Moon phase | computed (`weather/moon.ts`) | computed |

### Quiz, guide and map

| Value | Source | Kind |
| --- | --- | --- |
| Quiz answers and explanations | `quiz.json`, sources under `quiz.<i>` | written |
| Quiz photos | `photos.json` (credit shown) | — |
| Guide ("Ask the diver") answers | `guide-qa.json`, sources under `guide.<id>`. Fills in the GEBCO depth, ONC salinity and ONC temperature. | written / measured |
| Map tiles and terrain | EOX or NRCan CBMT; NRCan MRDEM-30 (credit in the corner) | — |
| Ferry on the map, sailed track | ONC position and heading | measured |
| Landmark card: kind, height, fact, specialties | `config/landmarks.json` elevation and `landmarks.json` fact, sources under `landmarks.<id>.elevation` and `.fact`; specialties are draft | written |

---

## 5. Bridge: every value on screen

ONC device codes and instruments come from `frontend/public/data/2026-08-17/sources.json` (the ONC inventory of the day). Panel headers name their source.

### Header and data status

| Value | Source |
| --- | --- |
| Clock, mode, replay speed | computed |
| Data status dots and list | load state of each dataset, with its providers (`bridge/sources.ts`) |
| ONC sources used today / also reporting | `onc_inventory` (`backend/scripts/onc_inventory.py`); `usedBy` maps a device to a dataset |
| Credits and licences | the registry, for the datasets in use |

### Own-ship rail

| Value | Source |
| --- | --- |
| SOG, COG, HDG, position | ONC TWSB.N1 NAV (Hemisphere GNSS V104S). Heading falls back to TWSB ORIENTATION + 15.3° declination when live. |
| Voyage: zone, crossing, ETA, departures | ONC position; `crossings` and `readings_derived` (Neon); ETA computed from the mean SOG over 5 min |
| Roll, roll σ 60 s, heave, comfort | ONC TWSB.N1 NAV. Heave has no live channel. |
| Surface water now: sea temperature, salinity, O₂ saturation, chlorophyll, turbidity | ONC TWSB TSG (Sea-Bird TSG 45 SN 0934), OXYSENSOR (Aanderaa Optode 3835 SN 1797), TURBCHLFL (WET Labs ECO Triplet BBFL2 1053) |
| Usual here (p10–p90, Δ) | **Temperature, salinity, O₂:** ONC TWSB August climatology, 2017–2025, no 2019; Aug 3–31; `qualityControl=clean`. **Chlorophyll, turbidity:** today's crossings, because the climatology is unsound for them. |
| Air temperature, pressure, 3-h tendency | ONC TWSB TEMPHUMID (Rotronic), BARPRESS (RM Young 61202V); tendency words from WMO (`derive/baro.ts`) |
| Sensor QC | ONC QC flags (replay); when live, set from whether a value is present |

### Conditions rail

| Value | Source |
| --- | --- |
| Active Pass current, slack, next maximum, chart | DFO 07527 (predicted) |
| Tides at Swartz Bay, Miners Bay, Tsawwassen | DFO 07270, 07528, 07590 (predicted, m above chart datum) |
| Wind at ship (measured or model), gust; nearest station | **Measured:** ECCC stations, blended with weight exp(−(d/6 km)²) out to 18 km. **Model:** Open-Meteo elsewhere. **Live fallback:** OpenWeather. |
| Iona anemometer note | ONC IONA WINDMONITOR. Stuck at 0, so it is flagged and not used. |
| Waves, visibility, cloud, rain | Open-Meteo forecast and marine (waves: Copernicus Marine models) |
| Surface current (radar or model) | **Radar:** ONC SOGCS CODAR where it measured. **Model:** SalishSeaCast near the route, Mercator global (Copernicus Marine, via Open-Meteo) beyond. |
| Sunset, civil dusk | computed (NOAA algorithm) |
| Deep water: temperature, salinity, O₂, chlorophyll, turbidity | **SCVIP** (296 m): CTD SBE19plus 6934, OXYSENSOR SBE 63, FLNTU ECO 4670. FLNTU chlorophyll is QC-bad on 17 Aug. **SEVIP** (165 m): CTD SBE19plus 7287, OXYSENSOR SBE 63, TURBIDITYMETER ECO-NTUS 319. |
| Currents by depth | ONC SCVIP and SEVIP ADCP150KHZ (RDI Workhorse, `RADCPTS`, 600 s ensembles). The hollow surface arrow is the blended surface current. |
| TWDP ferry | ONC TWDP.N1 NAV (Hemisphere V200s); TWDP TSG, OXYSENSOR, TURBCHLFL |
| Traffic: range, bearing, CPA, TCPA | ONC IONA AISRECEIVER (decoded with pyais, `build_ais.py`); CPA computed (`derive/cpa.ts`). Replay only. |
| Biofouling ahead: next hotspot, distance and minutes, the strip along the route, the hotspot list | SEAsk biofouling model (`seaskFouling`), sampled along `route.json` in 200 bins (bilinear, `derive/fouling.ts`); distance and time computed from the ship's route fraction and SOG (service speed below 5 kn). The band is ± half the model's scenario spread. Live mode shows the same 17 Aug run, labelled "17 Aug 2026 run". |
| Biofouling advice line ("fouling settles mostly while a hull is slow or stopped") | Written by the team. **Unchecked:** needs a source before it is shown outside the team. |

### Map, timeline, Ask

| Value | Source |
| --- | --- |
| Basemap | EOX (satellite) or NRCan CBMT (chart) |
| Currents colour field and particles | same blend as the surface current row |
| Wind field, station arrows | ECCC stations + Open-Meteo |
| Biofouling field, hatched cells, F1/F2 route stretches | SEAsk biofouling model; hatched = outside the model's training extent; stretches as in the Biofouling ahead row |
| Own track colour | ONC TWSB readings |
| Vessels, COG vectors, CPA line | ONC Iona AIS; CPA computed |
| Observatory markers, CODAR sites, tide gauges | `onc_stations.json`, CODAR site codes, DFO station positions |
| Route line | `route.json`, simplified from the TWSB track |
| Timeline rows | ONC TWSB readings; wind blend; DFO 07528 and 07527 |
| Ask answers | filled from the same values; the source line under each answer names the dataset (`ask/crewQa.ts`) |

---

## 6. ONC instruments and DOIs

From ONC's API (`GET /api/deployments`, `citation` field). All deployments were active on 2026-08-17.

| Location / device | Instrument | DOI | Used by |
| --- | --- | --- | --- |
| TWSB TSG | Sea-Bird TSG 45 (SN 0934), deployed 2025-10-10 | [10.34943/9fb1ecdb-2b07-42a3-b4a0-5f423b5db196](https://doi.org/10.34943/9fb1ecdb-2b07-42a3-b4a0-5f423b5db196) | kiosk, bridge |
| TWSB OXYSENSOR | Aanderaa Optode 3835 (SN 1797) | [10.34943/3943c511-0e0d-4b3a-b9a2-1f739abcb484](https://doi.org/10.34943/3943c511-0e0d-4b3a-b9a2-1f739abcb484) | kiosk, bridge |
| TWSB TURBCHLFL | WET Labs ECO Triplet (1053) | [10.34943/a6cade0b-2f5d-4081-9d1c-4c3f9640d48b](https://doi.org/10.34943/a6cade0b-2f5d-4081-9d1c-4c3f9640d48b) | kiosk, bridge |
| TWSB.N1 NAV | Hemisphere GNSS V104S | [10.34943/650bbbf7-c3ab-4fb5-9980-5730dfa839c3](https://doi.org/10.34943/650bbbf7-c3ab-4fb5-9980-5730dfa839c3) | kiosk, bridge |
| TWSB BARPRESS | RM Young barometer | [10.34943/4145870e-4d86-43a7-bb51-6c9411055e2f](https://doi.org/10.34943/4145870e-4d86-43a7-bb51-6c9411055e2f) | kiosk, bridge |
| TWSB TEMPHUMID | Rotronic air temperature | [10.34943/42a043e3-f2aa-4dd5-9438-3d6b14eae0dc](https://doi.org/10.34943/42a043e3-f2aa-4dd5-9438-3d6b14eae0dc) | kiosk, bridge |
| TWSB ORIENTATION | compass (live heading fallback) | [10.34943/6db37077-a427-48e8-a59b-c7cab1e2c153](https://doi.org/10.34943/6db37077-a427-48e8-a59b-c7cab1e2c153) | bridge (live) |
| TWSB PVCS01 | pump and valve control (`is_sampling`) | [10.34943/97ee850e-6beb-4700-983e-e4e342b99599](https://doi.org/10.34943/97ee850e-6beb-4700-983e-e4e342b99599) | QC %, derived tables |
| SOGCS | Strait of Georgia CODAR | [10.34943/10483644-44a9-486c-b9d8-a76fd466277e](https://doi.org/10.34943/10483644-44a9-486c-b9d8-a76fd466277e) | bridge |
| SCVIP ADCP150KHZ | RDI Workhorse 150 kHz (SN 17457) | [10.34943/41e992e6-5386-4abf-bef2-6ba88e4fd5fb](https://doi.org/10.34943/41e992e6-5386-4abf-bef2-6ba88e4fd5fb) | bridge |
| SEVIP ADCP150KHZ | RDI Workhorse 150 kHz (SN 8580) | [10.34943/ba11bb9b-22ed-4cd7-9aad-23f41621856b](https://doi.org/10.34943/ba11bb9b-22ed-4cd7-9aad-23f41621856b) | bridge |
| TWDP TSG | Sea-Bird TSG 45 (SN 1002) | [10.34943/60aba3d2-7ae8-43b8-a1fa-46096e52b59b](https://doi.org/10.34943/60aba3d2-7ae8-43b8-a1fa-46096e52b59b) | bridge |
| TWDP OXYSENSOR | Aanderaa Optode (SN 1417) | [10.34943/eb0924b9-ff2d-4864-a256-c9b3e424ac8f](https://doi.org/10.34943/eb0924b9-ff2d-4864-a256-c9b3e424ac8f) | bridge |
| TWDP TURBCHLFL | WET Labs ECO Triplet (1285) | [10.34943/458fe0be-3f86-41ff-a795-09de29e96ccf](https://doi.org/10.34943/458fe0be-3f86-41ff-a795-09de29e96ccf) | bridge |
| TWDP.N1 NAV | Hemisphere V200s | [10.34943/029493d0-c5bd-4cfe-8e54-cfe216ad6046](https://doi.org/10.34943/029493d0-c5bd-4cfe-8e54-cfe216ad6046) | bridge |

**No DOI collected yet:**
- **SCVIP and SEVIP** CTD, OXYSENSOR, FLNTU / TURBIDITYMETER (deep water panel)
- **IONA** AISRECEIVER

Get these from `GET /api/deployments?locationCode=SCVIP` and similar, as above.

---

## 7. Written content

**Where the sources are.** The sources of written facts are in [`frontend/src/mocks/common/content-sources.json`](frontend/src/mocks/common/content-sources.json). It is one file for English and French, keyed by where the fact appears:

| Key | Content |
| --- | --- |
| `species.<id>` | `species.json`: text, Latin name, habitat, size |
| `quiz.<i>` | `quiz.json`: question *i* (from 0), its answer, hint and explanation |
| `seafloor.facts.<i>` | `seafloor.json`: fact card *i* |
| `seafloor.markers` | `seafloor.json`: animal positions on the slice (illustrative) |
| `zones.<zone>.happening`, `zones.<zone>.lookout` | `zones.json` |
| `landmarks.<id>.fact`, `landmarks.<id>.elevation` | `landmarks.json` fact; `config/landmarks.json` `elevationM` |
| `guide.<id>` | `guide-qa.json` answers |
| `tides.explainer` | `tides.json` |

Each entry is `{ sources: [{ name, url, accessed }], checked, note? }`.
- The app shows the publisher name under the fact ("Source: …").
- **Every entry is `checked: false`** until a person on the team has read the source and confirmed the fact. Set `checked: true` then.
- The island specialties (`knowledge` in `landmarks.json`) keep their sources in [`KNOWLEDGE_CHECKLIST.md`](frontend/src/mocks/KNOWLEDGE_CHECKLIST.md).

Facts changed to match their sources on 2026-10-17: see [Corrections](#corrections-made-on-2026-10-17) below.

---

## 8. Values set by hand (not data)

These are design choices. Don't present them as measurements.

- **Word thresholds:**
  - **Water words** (`screens/Ferry/abstract.ts`): temperature 11 / 14 / 17 °C, salinity 27 / 30 PSU, O₂ 80 / 105 %, chlorophyll 1.5 / 4 µg/L
  - **Wind** 4 / 12 / 22 kn
  - **Speed comparison** 25 / 50 km/h
  - **Waves and visibility words** (`weather/describe.ts`)
- **Comparisons:** 3 m per storey (Dive bubble); 8 m per house (guide answer); "you" are 1.3 m tall (species size check).
- **Service speed 18.6 kn** (`route.json`, `scene/constants.ts`): used for the ETA when slow, and for the 3D animation.
- **Terminal coordinates and 600 m dock radius** (`config/terminals.json`); landmark points and radii (`config/landmarks.json`).
- **Track colour ranges** (`readings.json` `tracks`), chosen to match the 17 Aug ranges.
- **Biofouling hotspots** (`bridge/derive/fouling.ts` `FOULING`): a stretch of the route at a score of 65 or more and at least 0.5 nm long. The model's index is relative, so 65 is a design choice (22.5% of the day's 40 scored cells reach it), not a level the model defines.
- **Drawings, not maps:**
  - the schematic route map (`components/RouteMap/geometry.ts`)
  - the Lab track map's lat/lon labels
  - the seafloor animal markers
  - the procedural 3D islands and ferry
  - the map's fixed sun direction
- **Recorded weather mapping:**
  - Open-Meteo cloud, rain and visibility → an OpenWeather condition (`weather/describe.ts` `conditionOf`)
  - feels-like = air temperature

---

## 9. Known limits of the data

Details in DATA.md §4.

- **Docked:** the ferry's sea sensors are empty at the berth (pump off).
- **TSG gap:** TSG data is flagged "probably bad" 17:00–19:00 local on 17 Aug, so crossing 6 has no salinity.
- **Unusable sensors:** `pitch` and `magnetic_heading` are not used. The ONC Iona anemometer is stuck at 0.
- **CODAR coverage:** CODAR covers about 40% of the route. The rest of the surface current is model.
- **Model vs DFO in Active Pass:** the model reaches only ~60% of DFO's peak current there, so the bridge uses DFO for Active Pass.
- **Climatology:** the chlorophyll and turbidity climatology is unsound, so the bridge compares them with today's crossings.
- **Predictions and models:** tides and currents are DFO **predictions**, not measurements. Wind and waves away from stations are **model** values.
- **Live mode gaps:** no heave, synthetic QC flags, and no AIS or ADCP.
- **Biofouling model:** an unvalidated, relative index from one run (17 Aug 2026). Only 40 of its 133 cells have a score (lat 48.73–48.98, lon −123.40 to −123.15): none at either terminal, and Active Pass is land at its 1/24° (about 3 × 4.6 km) cells. The scenario spread (5–31) is large next to the differences between neighbouring cells, which is why the bridge shows hotspots and does not suggest another route. Whether the spread is a range or a standard deviation is still to be confirmed.

---

## 10. Before a public launch

- **Commercial use.** A kiosk on BC Ferries' vessels may count as commercial use. It would need:
  - an **EOX** commercial licence, or the NRCan basemap only
  - an **Open-Meteo** subscription
  - written clarification from **CHS** (chsinfo@dfo-mpo.gc.ca) on its "no commercial derivative products" clause

  A hackathon prototype is arguably non-commercial.
- **ONC.** Confirm the acknowledgement wording for ONC and BC Ferries with ONC. Its citation guide sits behind a login check.
- **Written facts.** Check every entry in `content-sources.json` and `KNOWLEDGE_CHECKLIST.md`, then set `checked: true`.
- **Diver model.** `frontend/ref/diver1.3mf` has no known author or licence. See `frontend/README.md`.
- **Weak sources.** These claims rest on thin sources; check them first:
  - **The pump is off at the dock** (`zones.swartz-bay.happening`) and **"about once a second"** (`guide.onc`): these come from the ONC data itself (DATA.md), not from a public page.
  - **Harbour seals in Active Pass** (`zones.active-pass.lookout`): only Wikipedia names the pass.
  - **Cormorants "on the posts near the dock"** (`zones.swartz-bay.lookout`): the sources cover cormorants near Sidney.
  - **Jellyfish** (`guide.life`): the source covers Puget Sound.
  - **Pyramid age** (`guide.life`): checked from a search snippet only.
  - **"Houses" at 8 m** (`guide.depth`): this is set by hand.
- **Not on screen but worth fixing:**
  - `zones.json` `blurb` (not displayed) still says the Strait is "more than 400 m" deep, which is not true under the route.
  - *Lagenorhynchus obliquidens* (white-sided dolphin) is now listed by WoRMS as a synonym of *Sagmatias obliquidens*. NOAA still uses the old name.
- **Dead links in `KNOWLEDGE_CHECKLIST.md`** (404 on 2026-10-17):
  - `southerngulfislands.com/4-hikes-on-galiano-island/`
  - `particle.phys.uvic.ca/~pof/trips/Saturna/Saturna.html`

### Corrections made on 2026-10-17

- The Lab "QC %" values were typed in. They are now ONC's real pass rates (section 3).
- Without live data, the kiosk now shows the recorded 17 Aug tides and weather. Before, it showed hand-written sample weather and tides of unknown origin.
- The Ferry card said "LIVE" while replaying recorded data. It now says "Recorded · 17 Aug 2026".
- The guide's depth answer now uses the same smoothed GEBCO depth as the Dive bubble.
- **Licences corrected:**
  - **DFO:** the CHS licence, not the Open Government Licence.
  - **ECCC:** its own end-use licence.
  - **OpenWeather:** ODbL.
  - **GEBCO:** citation author and title.
  - **SalishSeaCast:** Apache 2.0.
- **Credits added:**
  - **Copernicus Marine:** for waves and global currents.
  - **Bridge map:** ECCC, SalishSeaCast and Copernicus Marine.
  - **Kiosk:** DFO.

**Written facts changed to match their sources** (English and French):

| Key | Before | After | Why |
| --- | --- | --- | --- |
| `seafloor.facts.0` | About 420 m: "Nearly three Harbour Centre towers stacked on top of each other." | "…That spot is near Texada Island. Under our ferry, the sea is at most about 200 m deep." | 420 m is the Strait's deepest point (DFO, Thomson 1981), near Texada Island. GEBCO under the route reaches about 200 m. |
| `species.bull-kelp` | "…in a single summer" | "…in less than a year" | Bull kelp reaches full size within one year. |
| `zones.swartz-bay.happening` | "Calm water at the terminal… the water mixes slowly" | "Sensors resting at the dock… seawater pump is switched off" | The old claim had no source and the wrong reason. The readings stop because the pump is off at the berth. |
| `zones.active-pass.happening` | "It is colder, saltier… until the ship reaches open water" | "often colder and saltier… dip in the pass" | Deep water can be warmer in winter. The old wording was also wrong for westbound sailings. |
| `zones.active-pass.lookout` | "near the rocks on your left" | "near the rocky shores of the pass" | The ferry sails both ways, so the side changes. |
| `guide.depth` (fallback) | "more than 200 metres… taller than a 60-storey tower" | "up to about 200 metres… about as tall as a 60-storey tower" | The GEBCO maximum on the route is about 200 m. |
| `guide.onc` | "sensors under the ferry check the sea every second" | "sensors on the ferry test sea water pumped in from under the ship, about once a second" | The sensors sample through a hull intake. |
| `guide.life` | "big forests of kelp… glass sponge reefs older than the pyramids" | "big kelp forests near the shore… some reefs in BC are older than the pyramids" | DFO's 9,000-year date is for the Queen Charlotte Sound reefs. |
| `tides.explainer` | "tugs the ocean into a bulge" | "pulls the ocean into two bulges, one facing the Moon and one on the far side" | NOAA: two bulges, hence two highs a day. |
| `landmarks.roberts-bank.fact` | "where container ships and coal trains load" | "where coal trains unload and container ships dock" | BC Geographical Names; CHS PAC 201. |
| `landmarks.swanson-channel.fact` | "Orcas often travel through it" | "Orcas sometimes travel through it" | Sightings are recorded, but no source says "often". |
| `landmarks.saturna-island.fact` | "The most remote Southern Gulf Island" | "A remote, hard-to-reach island" | No source for the superlative. |
| `landmarks.saanich-peninsula.fact` | "The tip of Vancouver Island" | "A peninsula of Vancouver Island, north of Victoria" | BC Geographical Names. |

**Landmark elevations:** all 12 are within 15 m of the best source (NRCan CDEM, CHS PAC 201, BC Parks; USGS for Mount Constitution).

Mount Warburton Pike stays at 401 m. The 497 m sometimes quoted is the top of the TV tower near the summit (CHS PAC 201).
