#!/usr/bin/env python3
"""Validation utilities for Hong Kong 18-district boundary dataset."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from shapely import __version__ as SHAPELY_VERSION
from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import explain_validity
from shapely.ops import unary_union

# Ground-truth administrative mapping from HAD 18 district dataset.
EXPECTED_DISTRICTS = {
    "A": "Central & Western",
    "B": "Wan Chai",
    "C": "Eastern",
    "D": "Southern",
    "E": "Yau Tsim Mong",
    "F": "Sham Shui Po",
    "G": "Kowloon City",
    "H": "Wong Tai Sin",
    "J": "Kwun Tong",
    "K": "Tsuen Wan",
    "L": "Tuen Mun",
    "M": "Yuen Long",
    "N": "North",
    "P": "Tai Po",
    "Q": "Sai Kung",
    "R": "Sha Tin",
    "S": "Kwai Tsing",
    "T": "Islands",
}

# GeoJSON numeric coordinate sanity envelope for HK in WGS84.
LON_MIN, LON_MAX = 113.6, 114.7
LAT_MIN, LAT_MAX = 22.0, 23.0


@dataclass(frozen=True)
class NamedFixture:
    name: str
    point: Tuple[float, float]
    expected_district: str
    note: str


NAMED_FIXTURES = [
    NamedFixture("Central (core)", (114.1540, 22.2810), "A", "district town center fallback point"),
    NamedFixture("Sha Tin", (114.2000, 22.3800), "R", "new town residential center"),
    NamedFixture("Tung Chung", (113.9439, 22.2880), "T", "island area in Lantau"),
    NamedFixture("Cheung Chau", (114.0280, 22.2080), "T", "outlying island urban area"),
]

OUTSIDE_FIXTURES = [
    NamedFixture("Outside-HK maritime control", (114.4, 22.08), "__outside__", "outside HK district boundary"),
    NamedFixture("Offshore control (potentially maritime)", (113.95, 22.2000), "T", "inside Islands boundary near sea-facing waters"),
]


POINT_ROUNDING = 6


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and isinstance(value, (int, float))


def round_point(point: Point) -> List[float]:
    return [round(point.x, POINT_ROUNDING), round(point.y, POINT_ROUNDING)]


def point_key(x: float, y: float) -> Tuple[float, float]:
    return (round(x, POINT_ROUNDING), round(y, POINT_ROUNDING))


def iterate_coordinates(rings: Any) -> Iterable[Tuple[Tuple[float, float], int, int]]:
    """Yield coordinate point and indexes for GeoJSON coordinate validation."""
    for ring_idx, ring in enumerate(rings):
        for vertex_idx, vertex in enumerate(ring):
            lon, lat = vertex
            yield (lon, lat), ring_idx, vertex_idx


def _linear_edges(ring: Sequence[Sequence[float]]) -> Iterable[Tuple[Tuple[float, float], Tuple[float, float], int]]:
    for i in range(len(ring) - 1):
        a = tuple(ring[i])
        b = tuple(ring[i + 1])
        yield a, b, i


def count_coordinates_and_edge_issues(district_id: str, geom_obj: Dict[str, Any], issues: List[str]) -> Tuple[int, int, List[str]]:
    """Return total vertex count, ring count, and geometry issues from raw JSON ring checks."""
    if geom_obj.get("type") != "Polygon":
        return 0, 0, issues

    rings = geom_obj.get("coordinates")
    if not isinstance(rings, list) or not rings:
        issues.append(f"missing_or_invalid_rings[{district_id}]")
        return 0, 0, issues

    ring_count = len(rings)

    vertex_count = 0
    zero_length_edges: List[str] = []
    not_closed: List[str] = []

    for ring_i, ring in enumerate(rings):
        if not isinstance(ring, list) or len(ring) < 4:
            issues.append(f"invalid_ring[{district_id}:ring{ring_i}]")
            continue

        for i, (lon, lat) in enumerate(ring):
            if not finite_number(lon) or not finite_number(lat):
                issues.append(f"invalid_coordinate[{district_id}:ring{ring_i}:v{i}]")
                break
            vertex_count += 1

        if ring[0] != ring[-1]:
            not_closed.append(f"outer")
            issues.append(f"ring_not_closed[{district_id}:ring{ring_i}]")

        for a, b, ei in _linear_edges(ring):
            if a == b:
                zero_length_edges.append(f"{ei}")
                issues.append(f"zero_length_edge[{district_id}:ring{ring_i}:{ei}]")

    if zero_length_edges:
        issues.append(f"zero_length_edges[{district_id}:count={len(zero_length_edges)}]")

    if not_closed:
        issues.append(f"not_closed_rings[{district_id}:{','.join(not_closed)}]")

    if ring_count > 1:
        issues.append(f"hole_count[{district_id}:{ring_count - 1}]")

    return vertex_count, ring_count, issues


def to_geometry(feature: Dict[str, Any]) -> BaseGeometry:
    return shape(feature.get("geometry"))


def is_geometry_valid(g: BaseGeometry, district_id: str, issues: List[str]) -> Dict[str, Any]:
    info = {
        "is_valid": bool(g.is_valid),
        "is_simple": bool(g.is_simple),
        "geometry_type": g.geom_type,
        "validity_reason": None,
    }

    if not g.is_valid:
        info["validity_reason"] = explain_validity(g)
        issues.append(f"invalid_geometry[{district_id}]: {info['validity_reason']}")

    return info


def extract_boundary_contacts(a: BaseGeometry, b: BaseGeometry) -> Tuple[str, int, int, int]:
    """Return (outcome, line_parts, point_parts, segment_like_count)."""
    if a.is_empty or b.is_empty:
        return "none", 0, 0, 0

    inter = a.intersection(b)
    if inter.is_empty:
        return "none", 0, 0, 0

    # Boundary-on-boundary adjacency as requested: share district boundary.
    def visit(geom: BaseGeometry):
        if geom.is_empty:
            return []
        t = geom.geom_type
        if t == "LineString":
            return [geom]
        if t == "MultiLineString":
            return list(geom.geoms)
        if t == "Point":
            return [geom]
        if t == "MultiPoint":
            return list(geom.geoms)
        if t == "GeometryCollection":
            out = []
            for part in geom.geoms:
                out.extend(visit(part))
            return out
        return []

    parts = visit(inter)
    line_count = 0
    point_count = 0
    segment_count = 0

    for part in parts:
        if part.geom_type in {"LineString", "LinearRing"}:
            line_count += 1
            coords = list(part.coords)
            segment_count += max(0, len(coords) - 1)
        elif part.geom_type == "Point":
            point_count += 1
        else:
            # Ignore unsupported tiny parts, but treat as point-like if they are degenerate.
            geom_point = getattr(part, "centroid", None)
            if geom_point is not None and not geom_point.is_empty:
                point_count += 1

    if line_count > 0:
        return "line", line_count, 0, segment_count
    if point_count > 0:
        return "point", 0, point_count, 0
    return "none", 0, 0, 0


def evaluate_fixtures(district_geoms: Dict[str, BaseGeometry], report_issues: List[str]) -> List[Dict[str, Any]]:
    results = []
    for fixture in NAMED_FIXTURES + OUTSIDE_FIXTURES:
        pt = Point(fixture.point)
        matches = []
        for did, geom in district_geoms.items():
            if geom.covers(pt):
                matches.append(did)

        expected = fixture.expected_district
        inside_expected = expected != "__outside__" and expected in matches
        outside_ok = expected == "__outside__" and len(matches) == 0

        status_ok = inside_expected if expected != "__outside__" else outside_ok
        if not status_ok:
            report_issues.append(f"fixture_check_failed[{fixture.name}] expected={fixture.expected_district} got={matches}")

        results.append(
            {
                "fixture_name": fixture.name,
                "point_wgs84": [round(fixture.point[0], POINT_ROUNDING), round(fixture.point[1], POINT_ROUNDING)],
                "expected_district": fixture.expected_district,
                "hit_district_ids": sorted(matches),
                "passes_expected": status_ok,
                "note": fixture.note,
            }
        )

    return results


def validate(path: Path, source: str) -> Dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))

    if raw.get("type") != "FeatureCollection":
        raise ValueError("top-level type must be FeatureCollection")

    features = raw.get("features", [])
    issues: List[str] = []

    if len(features) != 18:
        issues.append(f"feature_count_mismatch: expected 18, got {len(features)}")

    geometry_stats = Counter()
    seen_ids: List[str] = []
    seen_names: List[str] = []

    district_reports = []
    district_polygons: Dict[str, BaseGeometry] = {}

    all_lon: List[float] = []
    all_lat: List[float] = []

    # geometry pass
    for idx, feature in enumerate(features):
        props = feature.get("properties", {})
        did = str(props.get("地區號碼", "")).strip()
        dname = str(props.get("District", "")).strip()
        cname = str(props.get("地區", "")).strip()

        seen_ids.append(did)
        seen_names.append(dname)

        if did not in EXPECTED_DISTRICTS:
            issues.append(f"unknown_district_id[{did}] at feature[{idx}]")
        elif EXPECTED_DISTRICTS[did] != dname:
            issues.append(f"district_name_mismatch[{did}]: expected={EXPECTED_DISTRICTS[did]} got={dname}")

        geom_json = feature.get("geometry") or {}
        geometry_stats[geom_json.get("type")] += 1

        if geom_json.get("type") != "Polygon":
            issues.append(f"unsupported_geometry[{did}]: {geom_json.get('type')}")
            continue

        rings = geom_json.get("coordinates")
        if not isinstance(rings, list):
            issues.append(f"non_list_rings[{did}]")
            continue

        if all_lon == [] or all_lat == []:
            pass

        for (lon, lat), ring_i, _v_i in iterate_coordinates(rings):
            all_lon.append(lon)
            all_lat.append(lat)
            if not (LON_MIN <= lon <= LON_MAX):
                issues.append(f"lon_out_of_bounds[{did}] {lon}")
            if not (LAT_MIN <= lat <= LAT_MAX):
                issues.append(f"lat_out_of_bounds[{did}] {lat}")

        count_coordinates_and_edge_issues(did, geom_json, issues)

        try:
            geom = to_geometry(feature)
        except Exception as exc:  # defensive: invalid GeoJSON payload
            issues.append(f"to_shape_failed[{did}]: {type(exc).__name__}: {exc}")
            continue

        if not isinstance(geom, BaseGeometry):
            issues.append(f"geometry_parse_invalid[{did}]")
            continue

        geometry_info = is_geometry_valid(geom, did, issues)

        if geom.geom_type == "Polygon":
            polys = [geom]
        elif geom.geom_type == "MultiPolygon":
            polys = list(geom.geoms)
            issues.append(f"geometry_type[{did}]: MultiPolygon")
        else:
            issues.append(f"non_polygon_geom_type[{did}]: {geom.geom_type}")
            continue

        # Keep representative point for deterministic point-in-region checks.
        # polygon.representative_point() is deterministic per geometry coords order.
        representative = geom.representative_point()

        ring_area = None
        if polys:
            ring_area = sum(p.area for p in polys)
        ring_count = len(polys[0].exterior.coords) if polys else 0
        hole_count = sum(len(p.interiors) for p in polys)

        district_polygons[did] = geom

        district_reports.append(
            {
                "district_id": did,
                "district_name": dname,
                "district_name_zh": cname,
                "geometry_type": geom.geom_type,
                "source_matched": EXPECTED_DISTRICTS.get(did) == dname,
                "ring_count": ring_count,
                "hole_count": hole_count,
                "is_valid": geometry_info["is_valid"],
                "is_simple": geometry_info["is_simple"],
                "validity_reason": geometry_info["validity_reason"],
                "area_deg2": ring_area,
                "representative_point_wgs84": round_point(representative),
                "representative_point_covered": bool(geom.covers(representative)),
                "bbox": [geom.bounds[0], geom.bounds[1], geom.bounds[2], geom.bounds[3]],
                "source_match_ok": EXPECTED_DISTRICTS.get(did, dname) == dname,
            }
        )

    # adjacency checks between district boundaries
    sorted_districts = sorted(district_reports, key=lambda item: item["district_id"])
    district_order = [item["district_id"] for item in sorted_districts]

    adjacency: List[Dict[str, Any]] = []
    for i, aid in enumerate(district_order):
        for bid in district_order[i + 1 :]:
            a = district_polygons.get(aid)
            b = district_polygons.get(bid)
            if a is None or b is None:
                continue
            outcome, line_parts, point_parts, segment_count = extract_boundary_contacts(a.boundary, b.boundary)
            if outcome == "none":
                continue
            adjacency.append(
                {
                    "district_a": aid,
                    "district_b": bid,
                    "outcome": outcome,
                    "line_parts": line_parts,
                    "point_parts": point_parts,
                    "shared_segment_estimate": segment_count,
                }
            )

    # fixture and control checks
    fixture_checks = evaluate_fixtures(district_polygons, issues)

    # out-of-HK controls without an external coastline source.
    all_features_union = unary_union(list(district_polygons.values()))

    out_of_hk_controls = {
        "lon_ok": all(LON_MIN <= x <= LON_MAX for x in all_lon),
        "lat_ok": all(LAT_MIN <= y <= LAT_MAX for y in all_lat),
        "representative_points_covered": all(item["representative_point_covered"] for item in district_reports),
        "contains_nofeature_point": not any(geom.covers(Point(114.4, 22.08)) for geom in district_polygons.values()),
        "union_valid": bool(all_features_union.is_valid),
        "union_type": all_features_union.geom_type,
    }

    duplicate_id_count = len(seen_ids) - len(set(seen_ids))
    duplicate_name_count = len(seen_names) - len(set(seen_names))

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(path),
        "source_url": source,
        "engine": {
            "geometry_library": "shapely",
            "shapely_version": SHAPELY_VERSION,
            "validation_model": "GEOS predicate graph + explain_validity",
        },
        "expected_district_count": 18,
        "feature_count": len(features),
        "geometry_type_counts": dict(geometry_stats),
        "issues": sorted(set(issues)),
        "issue_count": len(set(issues)),
        "district_reports": sorted(district_reports, key=lambda item: item["district_id"]),
        "district_id": {
            "total": len(set(seen_ids)),
            "missing_ids": [k for k in sorted(EXPECTED_DISTRICTS.keys()) if k not in set(seen_ids)],
            "duplicates": sorted(set(item for item in seen_ids if seen_ids.count(item) > 1)),
            "duplicate_count": duplicate_id_count,
        },
        "district_name": {
            "total": len(set(seen_names)),
            "missing_names": sorted(set(EXPECTED_DISTRICTS.values()) - set(seen_names)),
            "duplicates": sorted(set(item for item in seen_names if seen_names.count(item) > 1)),
            "duplicate_count": duplicate_name_count,
        },
        "adjacency": {
            "pair_count": len(adjacency),
            "line_shared": len([a for a in adjacency if a["outcome"] == "line"]),
            "point_shared": len([a for a in adjacency if a["outcome"] == "point"]),
            "pairs": sorted(adjacency, key=lambda i: (i["district_a"], i["district_b"])),
        },
        "bounds": {
            "lon": {
                "min": min(all_lon) if all_lon else None,
                "max": max(all_lon) if all_lon else None,
            },
            "lat": {
                "min": min(all_lat) if all_lat else None,
                "max": max(all_lat) if all_lat else None,
            },
        },
        "representatives": [
            {
                "district_id": d["district_id"],
                "district_name": d["district_name"],
                "representative_point_wgs84": d["representative_point_wgs84"],
                "inside": d["representative_point_covered"],
            }
            for d in sorted(district_reports, key=lambda x: x["district_id"])
        ],
        "fixtures": fixture_checks,
        "out_of_hk_controls": out_of_hk_controls,
    }

    return report


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_provenance(
    output_path: Path,
    source_url: str,
    source_bytes: bytes,
    geojson_path: Path,
    report: Dict[str, Any],
    source_last_modified: str | None = None,
    source_fetched_at: str | None = None,
):
    payload = {
        "source": {
            "url": source_url,
            "source_last_modified_utc": source_last_modified,
            "source_fetched_at_utc": source_fetched_at,
            "sha256": sha256_bytes(source_bytes),
            "bytes": len(source_bytes),
            "representative_points": report["representatives"],
        },
        "validation": {
            "engine": report["engine"],
            "generated_at": report["generated_at"],
            "feature_count": report["feature_count"],
            "issue_count": report["issue_count"],
            "issues": report["issues"],
            "bounds": report["bounds"],
            "district_id_missing": report["district_id"]["missing_ids"],
            "adjacency": {
                "pair_count": report["adjacency"]["pair_count"],
                "line_shared": report["adjacency"]["line_shared"],
                "point_shared": report["adjacency"]["point_shared"],
            },
            "fixtures": report["fixtures"],
            "out_of_hk_controls": report["out_of_hk_controls"],
            "district_name_mismatches": report["district_name"]["missing_names"],
        },
        "targets": {
            "data_path": str(geojson_path),
        },
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate HK district GeoJSON boundaries")
    parser.add_argument("geojson", type=Path, help="Path to hk-districts.geojson")
    parser.add_argument(
        "--source-url",
        default="https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json",
    )
    parser.add_argument("--provenance-out")
    parser.add_argument("--source-last-modified")
    parser.add_argument("--source-fetched-at")
    parser.add_argument("--emit-representatives", action="store_true")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    report = validate(args.geojson, args.source_url)

    printable = {k: v for k, v in report.items() if k != "district_reports"}
    printable["district_reports"] = sorted(
        report["district_reports"],
        key=lambda item: item["district_id"],
    )
    print(json.dumps(printable, ensure_ascii=False, indent=2))

    if args.provenance_out:
        source_bytes = args.geojson.read_bytes()
        write_provenance(
            Path(args.provenance_out),
            args.source_url,
            source_bytes,
            args.geojson,
            report,
            source_last_modified=args.source_last_modified,
            source_fetched_at=args.source_fetched_at,
        )

    if args.emit_representatives:
        print("\nRepresentatives:")
        for item in sorted(report["representatives"], key=lambda item: item["district_id"]):
            print(f"{item['district_id']} {item['district_name']}: {item['representative_point_wgs84']}")

    if not args.validate_only and report["issue_count"] > 0:
        # keep non-zero exit codes visible to callers.
        raise SystemExit(2)


if __name__ == "__main__":
    main()
