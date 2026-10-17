#!/usr/bin/env bash
# Builds offline quantized-mesh terrain for map mode from NRCan MRDEM-30 (DTM, 30 m).
# Needs Docker and internet (once). Output: public/tiles/terrain (layer.json + tiles).
# Run: bash scripts/build-terrain.sh
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE=tumgis/ctb-quantized-mesh:latest
DEM_URL=https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif
OUT=public/tiles/terrain
# Same as CONTEXT_AREA in src/config/tiles.ts (west south east north)
AREA="-124.2 48.2 -122.4 49.5"

# The image has an old CA bundle, so it uses the host bundle to check the HTTPS certificate.
CA_BUNDLE=${CA_BUNDLE:-$( [ -f /etc/ssl/cert.pem ] && echo /etc/ssl/cert.pem || echo /etc/ssl/certs/ca-certificates.crt )}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
run() {
  docker run --rm --platform linux/amd64 \
    -v "$CA_BUNDLE:/certs/ca.pem:ro" -e CURL_CA_BUNDLE=/certs/ca.pem \
    -v "$WORK:/work" -v "$PWD/$OUT:/out" "$IMAGE" "$@"
}
mkdir -p "$OUT"

# 1. Read only the map area from the cloud-optimized GeoTIFF and reproject it to WGS 84 (about 30 m).
#    No-data (the sea) becomes 0 m. The water surface in the app is at 1 m, so it covers the sea.
run gdalwarp -t_srs EPSG:4326 -te $AREA -tr 0.0003 0.0003 -r bilinear -dstnodata 0 \
  -co COMPRESS=DEFLATE "/vsicurl/$DEM_URL" /work/dem-nodata.tif
run gdal_translate -a_nodata none /work/dem-nodata.tif /work/dem.tif

# 2. Make the terrain tiles (quantized mesh with vertex normals) and layer.json.
run ctb-tile -f Mesh -N -o /out /work/dem.tif
run ctb-tile -f Mesh -N -l -o /out /work/dem.tif

# 3. ctb-tile always gzips the tiles. Unzip them, so a plain static server can serve them
#    (a gzipped file needs a "Content-Encoding: gzip" header, which static servers do not send).
find "$OUT" -name '*.terrain' -print0 |
  xargs -0 -P 4 -n 200 sh -c 'for f; do if gzip -t "$f" 2>/dev/null; then gunzip -c "$f" > "$f.raw" && mv "$f.raw" "$f"; fi; done' sh

echo "Terrain written to $OUT"
