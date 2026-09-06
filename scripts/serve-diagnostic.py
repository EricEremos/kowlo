from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STATIC_FILES = {
    ROOT / "node_modules/exifr/dist/full.esm.mjs",
    ROOT / "node_modules/point-in-polygon-hao/dist/pointInPolygon.js",
    ROOT / "data/reference/hk-districts.geojson",
    ROOT / "data/reference/hk-place-points.geojson",
    ROOT / "data/reference/hk-place-names.json",
    ROOT / "src/geography/place-catalog.mjs",
    ROOT / "src/geography/nearby-places.mjs",
    ROOT / "src/geography/memory-print.mjs",
    ROOT / "src/journal/local-journal.mjs",
    ROOT / "src/journal/geojson-export.mjs",
    ROOT / "docs/design-assets/memory-print-empty.svg",
    ROOT / "docs/design-assets/kowlo-symbol.svg",
}


class DiagnosticHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript"}

    def do_GET(self):
        path = urlsplit(self.path).path
        resolved = Path(self.translate_path(path)).resolve()
        allowed = [ROOT / "experiments/photo-import", ROOT / "experiments/offline-journal", ROOT / "app"]
        if not (any(resolved.is_relative_to(directory) for directory in allowed) or resolved in STATIC_FILES):
            self.send_error(404)
            return
        if resolved.is_dir():
            self.send_error(404)
            return
        super().do_GET()

    def end_headers(self):
        worker = urlsplit(self.path).path == "/experiments/photo-import/worker.mjs"
        connect = "'none'" if worker else "'self'"
        atlas = urlsplit(self.path).path.startswith('/app/')
        images = "'self'" if atlas else "'none'"
        fonts = "'self'" if atlas else "'none'"
        self.send_header("Content-Security-Policy", f"default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src {connect}; img-src {images}; font-src {fonts}; form-action 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8787), partial(DiagnosticHandler, directory=str(ROOT)))
    print("Diagnostic: http://127.0.0.1:8787/experiments/photo-import/index.html", flush=True)
    server.serve_forever()
