"""List the ONC sensors at the ship's locations, to check `app/sources/onc_sensors.json`.

For each location (ONC_LOCATION_CODE, ONC_NAV_LOCATION_CODE) it lists the device categories,
then prints each sensor's sensorCategoryCode, sensorName, unitOfMeasure and latest sample.

Run from backend/:  .venv/bin/python scripts/onc_discover.py
Needs ONC_TOKEN in backend/.env (your Oceans 3.0 profile, "Web Services API" tab).
"""

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

TOKEN = os.environ.get("ONC_TOKEN", "").strip()
BASE_URL = (os.environ.get("ONC_BASE_URL", "").strip() or "https://data.oceannetworks.ca/api").rstrip("/")
LOCATIONS = [
    os.environ.get("ONC_LOCATION_CODE", "").strip() or "TWSB",
    os.environ.get("ONC_NAV_LOCATION_CODE", "").strip() or "TWSB.N1",
]


def get(client: httpx.Client, path: str, **params) -> tuple[int, object]:
    """GET an ONC endpoint. Returns (status, JSON). Never prints the URL: it holds the token."""
    try:
        response = client.get(f"{BASE_URL}/{path}", params={**params, "token": TOKEN})
    except httpx.HTTPError as exc:
        return 0, {"errors": [{"errorCode": type(exc).__name__, "errorMessage": "request failed"}]}
    try:
        return response.status_code, response.json()
    except ValueError:
        return response.status_code, None


def describe_error(status: int, body: object) -> str:
    errors = body.get("errors", []) if isinstance(body, dict) else []
    text = "; ".join(f"{e.get('errorCode')} {e.get('parameter')}: {e.get('errorMessage')}" for e in errors)
    return f"HTTP {status} {text}".replace(TOKEN, "***").strip()


def latest(sensor: dict) -> str:
    data = sensor.get("data") or {}
    values, times = data.get("values") or [], data.get("sampleTimes") or []
    flags = data.get("qaqcFlags") or []
    if not values:
        return "-"
    flag = flags[-1] if flags else "?"
    return f"{values[-1]} @ {times[-1] if times else '?'} (qc {flag})"


def main() -> None:
    if not TOKEN:
        sys.exit("ONC_TOKEN is not set. Add it to backend/.env (see .env.example), then run again.")

    with httpx.Client(timeout=30) as client:
        for location in LOCATIONS:
            status, categories = get(client, "deviceCategories", locationCode=location)
            if status == 401:
                sys.exit(f"ONC rejected the token: {describe_error(status, categories)}")
            if status != 200 or not isinstance(categories, list):
                print(f"\n{location}: no device categories ({describe_error(status, categories)})")
                continue

            for category in categories:
                code = category.get("deviceCategoryCode")
                print(f"\n== {location} / {code} ({category.get('deviceCategoryName')})")
                status, body = get(
                    client, "scalardata/location",
                    locationCode=location, deviceCategoryCode=code, getLatest="true", rowLimit=1,
                )
                if status != 200:
                    # No recent data: list the sensors without values.
                    status, body = get(
                        client, "scalardata/location",
                        locationCode=location, deviceCategoryCode=code, returnOptions="excludeScalarData",
                    )
                if status != 200 or not isinstance(body, dict):
                    print(f"   {describe_error(status, body)}")
                    continue
                sensors = body.get("sensorData") or []
                if not sensors:
                    print("   (no scalar sensors)")
                for sensor in sensors:
                    print(
                        f"   {sensor.get('sensorCategoryCode', ''):<26} {sensor.get('sensorName', ''):<34} "
                        f"{sensor.get('unitOfMeasure', ''):<10} {latest(sensor)}"
                    )


if __name__ == "__main__":
    main()
