"""Build the kiosk's diver mascot (frontend/public/models/diver.glb) from its 3D-print file.

Reads a 3MF print file (default frontend/ref/diver1.3mf, a Creality Print 6.2 export of
"diver.stl": one mesh, millimetres, Z up, standing on a 50 x 90 x 1 mm print plinth) and writes a
small GLB for three.js:

1. Reads the mesh straight from the 3MF zip (the XML vertex and triangle lists), so no 3MF loader is
   needed. The build and component transforms are only checked: they must be translations, which
   step 4 makes irrelevant.
2. Welds duplicate vertices and splits the mesh into connected parts. The print plinth is its own
   part (a flat slab: 12 triangles, z -40..-39 mm); flat parts are dropped. The diver keeps the round
   rocky base it stands on, which is fused to the boots.
3. Decimates to about --faces triangles (quadric decimation, fast-simplification). Where thin
   features collapse, decimation leaves debris: flat two-triangle flaps and tiny pinched-off pieces.
   Those are removed, then the winding is made consistent and outward. The source figure is
   watertight; the output has no holes but may keep a few non-manifold edges (printed).
4. Moves it to three.js conventions: Y up, the diver faces +Z (towards a default camera), the whole
   figure (base included) is exactly 1.0 tall, the bounding box is centred on x = 0 and z = 0, and the
   bottom of the base is at y = 0. The front is -Y in the 3MF file: the helmet's round face window,
   the belt buckle and the boot toes all point to -Y (checked on renders from the four sides).
   File (x, y, z) becomes three.js (x, z, -y): a rotation of -90 degrees about X, no mirroring.
5. Writes a GLB with smooth vertex normals and one plain material (light grey, not metallic) that
   the kiosk can replace. No Draco or meshopt compression: the kiosk runs offline and three.js would
   need the decoder files.

Prints the triangle counts, the final bounding box and the file size.

Run from the repo root:  python frontend/scripts/build-diver.py [--src PATH] [--out PATH] [--faces N]
Needs the packages in frontend/scripts/requirements-diver.txt, for example in a throwaway venv:
    uv venv /tmp/diver-venv
    uv pip install --python /tmp/diver-venv/bin/python -r frontend/scripts/requirements-diver.txt
    /tmp/diver-venv/bin/python frontend/scripts/build-diver.py
"""

import argparse
import re
import sys
import zipfile
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh

FRONTEND = Path(__file__).resolve().parents[1]
DEFAULT_SRC = FRONTEND / "ref/diver1.3mf"
DEFAULT_OUT = FRONTEND / "public/models/diver.glb"
DEFAULT_FACES = 25_000

# A part is the print plinth when its height is below this fraction of its width (the plinth is
# 1 mm tall and 90 mm long; the diver is about 80 mm tall and 43 mm wide).
FLAT_RATIO = 0.05
# After decimation, parts with fewer than this fraction of the triangles are debris (see tidy_decimated).
MIN_PART = 0.01
# Material of the exported mesh (glTF PBR). The print file has no colours.
BASE_COLOR = [0.82, 0.82, 0.84, 1.0]
ROUGHNESS = 0.6

# 3MF XML. The attribute order is the one 3MF writers use; read_3mf checks that every element matched.
VERTEX_RE = re.compile(r'<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"')
TRIANGLE_RE = re.compile(r'<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"')
TRANSFORM_RE = re.compile(r'transform="([^"]+)"')
UNIT_RE = re.compile(r'<model[^>]*\sunit="([^"]+)"')


def read_3mf(path: Path) -> tuple[np.ndarray, np.ndarray, str]:
    """Return (vertices, triangles, unit) of every mesh in the 3MF, as one mesh."""
    vertices, triangles, unit = [], [], "millimeter"
    with zipfile.ZipFile(path) as zf:
        models = [n for n in zf.namelist() if n.startswith("3D/") and n.endswith(".model")]
        for name in models:
            xml = zf.read(name).decode("utf-8")
            if name == "3D/3dmodel.model" and (m := UNIT_RE.search(xml)):
                unit = m.group(1)
            # Build items and components only place the object. Rotation or scale would change
            # the shape we re-centre, so refuse those rather than silently ignore them.
            for t in TRANSFORM_RE.findall(xml):
                linear = np.array(t.split(), dtype=float)[:9]
                if not np.allclose(linear, [1, 0, 0, 0, 1, 0, 0, 0, 1]):
                    sys.exit(f"{name}: transform {t!r} is not a pure translation; not supported")
            v = VERTEX_RE.findall(xml)
            f = TRIANGLE_RE.findall(xml)
            if len(v) != xml.count("<vertex ") or len(f) != xml.count("<triangle "):
                sys.exit(f"{name}: could not parse every <vertex>/<triangle> element")
            if not v:
                continue
            # Triangle indices are local to each <mesh>; this file has one mesh per .model part.
            if xml.count("<mesh>") != 1:
                sys.exit(f"{name}: expected one <mesh> per model part")
            offset = sum(len(a) for a in vertices)
            vertices.append(np.array(v, dtype=np.float64))
            triangles.append(np.array(f, dtype=np.int64) + offset)
    if not vertices:
        sys.exit(f"{path}: no mesh found")
    return np.concatenate(vertices), np.concatenate(triangles), unit


def weld(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Merge duplicate vertices and drop degenerate triangles and unused vertices."""
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    return mesh


def tidy_decimated(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Remove the debris decimation leaves where thin features (hose coils, grille bars) collapse."""
    # Two triangles on the same three vertices are a flat, zero-volume flap glued onto the surface
    # by non-manifold edges. Dropping both copies leaves the surface around them closed.
    _, inverse, counts = np.unique(
        np.sort(mesh.faces, axis=1), axis=0, return_inverse=True, return_counts=True
    )
    mesh.update_faces(counts[inverse.ravel()] == 1)
    # Tiny closed pieces that pinched off (a few triangles each). The figure itself is one part.
    parts = mesh.split(only_watertight=False)
    mesh = trimesh.util.concatenate([p for p in parts if len(p.faces) >= MIN_PART * len(mesh.faces)])
    mesh.remove_unreferenced_vertices()
    return mesh


def edge_stats(mesh: trimesh.Trimesh) -> tuple[int, int]:
    """(open edges, non-manifold edges): edges with one triangle (holes), with more than two."""
    _, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
    return int((counts == 1).sum()), int((counts > 2).sum())


def remove_plinth(mesh: trimesh.Trimesh) -> tuple[trimesh.Trimesh, int]:
    """Drop the flat parts (the print plinth). Returns the rest and the number of faces dropped."""
    parts = mesh.split(only_watertight=False)
    keep, dropped = [], 0
    for part in parts:
        width = max(part.extents[0], part.extents[1])
        if part.extents[2] < FLAT_RATIO * width:
            print(f"  plinth part: {len(part.faces)} faces, bbox {fmt_bounds(part.bounds)}")
            dropped += len(part.faces)
        else:
            keep.append(part)
    if not keep:
        sys.exit("nothing left after removing flat parts")
    return trimesh.util.concatenate(keep), dropped


def to_threejs(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Y up, facing +Z, 1.0 tall, centred on x/z, bottom at y = 0."""
    # Z-up file with the front at -Y -> Y-up with the front at +Z: (x, y, z) -> (x, z, -y).
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    mesh.apply_scale(1.0 / (hi[1] - lo[1]))
    return mesh


def fmt_bounds(bounds: np.ndarray, digits: int = 2) -> str:
    lo, hi = np.round(bounds, digits)
    return " ".join(f"{a} {l:g}..{h:g}" for a, l, h in zip("xyz", lo, hi))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--src", type=Path, default=DEFAULT_SRC, help="3MF print file")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="GLB to write")
    parser.add_argument("--faces", type=int, default=DEFAULT_FACES, help="target triangle count")
    args = parser.parse_args()

    vertices, triangles, unit = read_3mf(args.src)
    print(f"read {args.src}: {len(vertices)} vertices, {len(triangles)} faces ({unit})")

    mesh = weld(trimesh.Trimesh(vertices, triangles, process=False))
    figure, plinth_faces = remove_plinth(mesh)
    print(f"figure: {len(figure.faces)} faces, bbox {fmt_bounds(figure.bounds)} ({unit}), "
          f"watertight {figure.is_watertight}")

    v, f = fast_simplification.simplify(
        figure.vertices, figure.faces.astype(np.int32), target_count=min(args.faces, len(figure.faces))
    )
    out = tidy_decimated(weld(trimesh.Trimesh(v, f, process=False)))
    # Consistent, outward winding (the vertex normals and back-face culling depend on it).
    trimesh.repair.fix_normals(out)
    out = to_threejs(out)

    # Smooth shading: area-weighted vertex normals, exported as the NORMAL attribute.
    out.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(
            name="diver", baseColorFactor=BASE_COLOR, metallicFactor=0.0, roughnessFactor=ROUGHNESS
        )
    )
    scene = trimesh.Scene()
    scene.add_geometry(out, node_name="diver", geom_name="diver")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(trimesh.exchange.gltf.export_glb(scene, include_normals=True))

    open_edges, nonmanifold_edges = edge_stats(out)
    print(f"input faces:           {len(triangles)}")
    print(f"plinth faces removed:  {plinth_faces}")
    print(f"figure faces:          {len(figure.faces)}")
    print(f"output faces:          {len(out.faces)} ({len(out.vertices)} vertices)")
    # A few non-manifold edges (two surfaces touching along an edge after decimation) are harmless
    # for rendering; open edges would be visible holes.
    print(f"output surface:        watertight {out.is_watertight}, open edges {open_edges}, "
          f"non-manifold edges {nonmanifold_edges}, consistent winding {out.is_winding_consistent}")
    print(f"output bbox:           {fmt_bounds(out.bounds, 3)}")
    print(f"wrote {args.out}: {args.out.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
