import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
path = re.search(r'd="(M[^"]+)"', (ROOT / 'hong-kong-land.svg').read_text()).group(1)
coast = [[tuple(map(float, xy.split(','))) for xy in re.findall(r'[ML]([\d.-]+,[\d.-]+)', ring)] for ring in path.split('Z') if ring]
features = json.loads((ROOT.parent.parent / 'data/reference/hk-districts.geojson').read_text())['features']

def project(p):
    return ((p[0] - 113.92) / .51 * 1000, (22.56 - p[1]) / .4 * 845)

districts = []
for feature in features:
    geometry = feature['geometry']
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    for polygon in polygons:
        ring = [project(p) for p in polygon[0]]
        districts.append(ring)

def bounded(rings):
    return [(ring, (min(x for x,y in ring), min(y for x,y in ring), max(x for x,y in ring), max(y for x,y in ring))) for ring in rings]

def contains(x, y, rings):
    for ring, (left, top, right, bottom) in rings:
        if not (left <= x <= right and top <= y <= bottom):
            continue
        inside = False
        previous = ring[-1]
        for current in ring:
            ax, ay = previous
            bx, by = current
            if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:
                inside = not inside
            previous = current
        if inside:
            return True
    return False

coast, districts = bounded(coast), bounded(districts)
# Demonstration memory clusters, not verified photograph coordinates or coverage.
sites = [(114.156,22.286,60), (114.17,22.297,48), (114.175,22.28,45),
         (114.194,22.284,30), (114.163,22.329,40), (114.265,22.38,37),
         (113.947,22.287,35), (114.028,22.446,34), (114.119,22.372,32)]
sites = [(*project((x,y)), radius) for x,y,radius in sites]
palette = ['#9A6959','#5A717A','#7D7890','#AE8961','#48605E']
marks = []
for row, y in enumerate(range(10, 838, 10)):
    for col, x in enumerate(range(10, 993, 10)):
        x += 3 if row % 2 else 0
        if contains(x, y, coast) and contains(x, y, districts):
            score, nearest = min(((math.hypot(x-sx,y-sy)/radius,i) for i,(sx,sy,radius) in enumerate(sites)))
            grain = ((row * 73 + col * 37) % 97) / 97
            marks.append((x,y,row,col,score,nearest,grain))

def write(name, stages, view='0 0 1000 845', width=1000, height=845):
    paths = {}
    for x,y,row,col,score,nearest,grain in marks:
        active = nearest < stages and score < .72 + grain * .62
        colour = palette[(nearest + (1 if grain > .82 else 0)) % len(palette)] if active else '#CBD0C8'
        if active:
            d = f'M{x-3},{y+3}l3,-6l3,6M{x},{y-3}v7'
        else:
            d = f'M{x-2},{y+2}l2,-4l2,4'
        paths.setdefault(colour, []).append(d)
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{view}">'
    for colour, segments in paths.items():
        svg += f'<path d="{"".join(segments)}" fill="none" stroke="{colour}" stroke-width="{2.1 if colour != "#CBD0C8" else 1.25}" stroke-linecap="round" stroke-linejoin="round"/>'
    svg += '</svg>'
    (ROOT / name).write_text(svg)

write('memory-print-empty.svg', 0)
write('memory-print-hong-kong.svg', 9)
write('memory-print-first-chapter.svg', 3)
write('memory-print-harbour.svg', 9, '370 455 280 200', 560, 400)
(ROOT / 'memory-print.provenance.json').write_text(json.dumps({
    'geography': ['hong-kong-land.svg', '../../data/reference/hk-districts.geojson'],
    'method': 'Coastal land intersected with Hong Kong district outer boundaries; deterministic staggered chevron lattice.',
    'marks': len(marks),
    'colour_semantics': 'Illustrative memory clusters. Colour and area are not GPS accuracy, verified photo positions, travel routes, or territorial coverage.',
    'production_requirement': 'Use verified asset locations for membership. Optional local photo palette analysis supplies colour. Exact point evidence remains separately inspectable.',
    'style': 'Folded mark print, not a photograph pin map or a reproduction of the reference dot pattern.'
}, indent=2))
print(json.dumps({'marks': len(marks), 'outputs': ['memory-print-hong-kong.svg','memory-print-first-chapter.svg','memory-print-harbour.svg']}))
