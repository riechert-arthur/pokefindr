#!/usr/bin/env python3
# Usage: python3 scripts/geo/split_antimeridian.py public/geo/countries-110m.json
"""Split polygon rings that cross the antimeridian (an even number of >180° jumps)
into pieces on each side, so MapLibre doesn't draw them across the whole map.
Rings that cross once (circling a pole, like Antarctica) are left alone."""
import json, sys

def jumps(ring):
    return sum(1 for a, b in zip(ring, ring[1:]) if abs(a[0] - b[0]) > 180)

def unwrap(ring):
    out = [list(ring[0])]
    for x, y in ring[1:]:
        px = out[-1][0]
        while x - px > 180: x -= 360
        while x - px < -180: x += 360
        out.append([x, y])
    return out

def clip(ring, keep, edge):
    """Sutherland–Hodgman against one vertical line: keep(x) says which side stays."""
    out = []
    for i in range(len(ring) - 1):
        a, b = ring[i], ring[i + 1]
        ina, inb = keep(a[0]), keep(b[0])
        if ina: out.append(a)
        if ina != inb:
            t = (edge - a[0]) / (b[0] - a[0])
            out.append([edge, a[1] + t * (b[1] - a[1])])
    if out and out[0] != out[-1]: out.append(out[0])
    return out if len(out) >= 4 else None

def split_ring(ring):
    u = unwrap(ring)
    lo, hi = min(p[0] for p in u), max(p[0] for p in u)
    pieces = []
    for low, high in [(-540, -180), (-180, 180), (180, 540)]:
        if hi <= low or lo >= high: continue
        part = clip(u, lambda x: x >= low, low)
        part = part and clip(part, lambda x: x <= high, high)
        if part:
            shift = 360 if high <= -180 else -360 if low >= 180 else 0
            pieces.append([[round(x + shift, 3), y] for x, y in part])
    return pieces

def fix(geometry):
    polys = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    out = []
    for poly in polys:
        outer, holes = poly[0], poly[1:]
        if jumps(outer) == 0 or jumps(outer) % 2 == 1:
            out.append(poly)
            continue
        # Holes don't cross the line in this data; keep each with the piece it falls in.
        for piece in split_ring(outer):
            xs = [p[0] for p in piece]
            mine = [h for h in holes if min(xs) <= h[0][0] <= max(xs)]
            out.append([piece, *mine])
    return {"type": "MultiPolygon", "coordinates": out} if len(out) > 1 else {"type": "Polygon", "coordinates": out[0]}

path = sys.argv[1]
data = json.load(open(path))
for f in data["features"]:
    before = f["geometry"]
    f["geometry"] = fix(before)
json.dump(data, open(path, "w"), separators=(",", ":"))
