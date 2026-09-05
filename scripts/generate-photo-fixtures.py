from pathlib import Path
import json
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "experiments/photo-import/fixtures"
OUT.mkdir(parents=True, exist_ok=True)


def tags(path, *values):
    subprocess.run(["exiftool", "-overwrite_original", *values, str(path)], check=True, capture_output=True)


def jpeg(name, *values):
    path = OUT / name
    Image.new("RGB", (32, 32), (32, 86, 75)).save(path, "JPEG")
    if values:
        tags(path, *values)
    return path


gps = ["-GPSLatitude=22.2819", "-GPSLatitudeRef=N", "-GPSLongitude=114.1589", "-GPSLongitudeRef=E"]
dated = jpeg("gps-dated.jpg", *gps, "-DateTimeOriginal=2026:09:05 17:30:00", "-OffsetTimeOriginal=+08:00", "-SerialNumber=SYNTHETIC-DO-NOT-RETAIN")
jpeg("gps-undated.jpg", *gps)
jpeg("gps-no-offset.jpg", *gps, "-DateTimeOriginal=2026:09:05 17:30:00")
jpeg("missing-gps.jpg")
jpeg("partial-gps.jpg", "-GPSLatitude=22.2819", "-GPSLatitudeRef=N")
jpeg("invalid-latitude.jpg", *gps, "-GPSLatitude=100")
jpeg("southern-western.jpg", "-GPSLatitude=33.8", "-GPSLatitudeRef=S", "-GPSLongitude=70.6", "-GPSLongitudeRef=W")
heic = OUT / "gps-dated.heic"
subprocess.run(["sips", "-s", "format", "heic", str(dated), "--out", str(heic)], check=True, capture_output=True)
tags(heic, *gps, "-DateTimeOriginal=2026:09:05 17:30:00", "-OffsetTimeOriginal=+08:00")
Image.new("RGB", (4, 4)).save(OUT / "unsupported.png")
(OUT / "corrupt.jpg").write_bytes(bytes.fromhex("ffd8ffe1001045786966000049492a00"))
cases = [
    {"file": "gps-dated.jpg", "status": "accepted", "latitude": 22.2819, "longitude": 114.1589},
    {"file": "gps-dated.heic", "status": "accepted", "latitude": 22.2819, "longitude": 114.1589},
    {"file": "gps-undated.jpg", "status": "accepted", "latitude": 22.2819, "longitude": 114.1589},
    {"file": "gps-no-offset.jpg", "status": "accepted", "latitude": 22.2819, "longitude": 114.1589},
    {"file": "missing-gps.jpg", "status": "missing-gps"},
    {"file": "partial-gps.jpg", "status": "malformed-gps"},
    {"file": "invalid-latitude.jpg", "status": "malformed-gps"},
    {"file": "southern-western.jpg", "status": "accepted", "latitude": -33.8, "longitude": -70.6},
    {"file": "unsupported.png", "status": "unsupported-format"},
    {"file": "corrupt.jpg", "status": "malformed-file"},
]
for case in cases:
    if case["status"] == "accepted":
        case["districtStatus"] = "assigned" if case["longitude"] > 0 else "outside-dataset"
        case["districtId"] = "A" if case["longitude"] > 0 else None
(OUT / "manifest.json").write_text(json.dumps(cases, indent=2) + "\n")
print(f"Generated {len(cases)} synthetic fixtures in {OUT}")
