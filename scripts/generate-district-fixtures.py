import hashlib
import json
from pathlib import Path
import shapely
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parents[1]
raw = (ROOT / "data/reference/hk-districts.geojson").read_bytes()
districts = [(f["properties"]["地區號碼"], shape(f["geometry"])) for f in json.loads(raw)["features"]]
audit = json.loads((ROOT / "docs/evidence/geography-main-audit.json").read_text())
points = [(f"interior-{key}", geom.representative_point()) for key, geom in districts]
points += [(f"grid-{x}-{y}", Point(113.8 + x * 0.035, 22.1 + y * 0.03)) for x in range(21) for y in range(21)]
for index, item in enumerate(audit["boundary_ambiguity_samples"]):
    points.append((f"boundary-{index}", Point(item["longitude"], item["latitude"])))
    for axis in range(2):
        for sign in [-1, 1]:
            xy = [item["longitude"], item["latitude"]]
            xy[axis] += sign * 0.00000005
            points.append((f"near-boundary-{index}-{axis}-{sign}", Point(xy)))
cases = []
for name, point in points:
    matches = [{"id": key, "relation": "interior" if geom.contains(point) else "boundary"} for key, geom in districts if geom.covers(point)]
    cases.append({"name": name, "longitude": point.x, "latitude": point.y, "matches": sorted(matches, key=lambda m: m["id"])})
output = {"sourceSha256": hashlib.sha256(raw).hexdigest(), "geosVersion": shapely.geos_version_string, "note": "Geometry-derived controls, not surveyed GPS truth.", "cases": cases}
(ROOT / "experiments/photo-import/fixtures/district-oracle.json").write_text(json.dumps(output, separators=(",", ":")) + "\n")
print(f"Wrote {len(cases)} independent GEOS oracle cases")
