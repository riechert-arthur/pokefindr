#!/usr/bin/env python3
# Usage: python3 scripts/geo/hero_outlines.py public/geo/us-states.json public/geo/us-lower48-hero.json
"""The landing hero's state outlines (#298): the lower 48 and DC from
us-states.json, simplified (Douglas-Peucker), without islands too small to
see, and rounded to 0.01°. The hero draws them about 0.05° a pixel, so they
look the same at a fraction of the download. The map and the server keep
the full file."""
import json, math, sys

# src/lib/map/states.ts, OUTSIDE_LOWER_48
OUTSIDE = {"AK", "HI", "PR", "GU", "VI", "AS", "MP"}
TOLERANCE = 0.03  # degrees
MIN_AREA = 0.02   # square degrees; drops islets, keeps the Keys' larger pieces and Long Island

def perpendicular(p, a, b):
    if a == b: return math.dist(p, a)
    (x, y), (x1, y1), (x2, y2) = p, a, b
    return abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / math.dist(a, b)

def simplify(points, tol):
    """Douglas-Peucker, iterative."""
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        best, index = 0.0, None
        for k in range(i + 1, j):
            d = perpendicular(points[k], points[i], points[j])
            if d > best: best, index = d, k
        if index is not None and best > tol:
            keep[index] = True
            stack += [(i, index), (index, j)]
    return [p for p, k in zip(points, keep) if k]

def area(ring):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))) / 2

def ring(r):
    out = []
    for x, y in simplify(r, TOLERANCE):
        p = [round(x, 2), round(y, 2)]
        if not out or out[-1] != p: out.append(p)
    if out[0] != out[-1]: out.append(out[0])
    return out if len(out) >= 4 else None

def main(src, dst):
    states = json.load(open(src))
    features = []
    for f in states["features"]:
        if f["properties"]["region"] in OUTSIDE: continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        out = []
        largest = max(area(poly[0]) for poly in polys)
        for poly in polys:
            # Each state keeps its main polygon (DC is smaller than MIN_AREA).
            if area(poly[0]) < MIN_AREA and area(poly[0]) < largest: continue
            outer = ring(poly[0])
            # No outline left: drop the polygon, holes and all (a hole on its own would read as land).
            if not outer: continue
            out.append([outer] + [r for r in map(ring, poly[1:]) if r])
        if out:
            features.append({"type": "Feature", "properties": {"region": f["properties"]["region"]}, "geometry": {"type": "MultiPolygon", "coordinates": out}})
    with open(dst, "w") as fh:
        json.dump({"type": "FeatureCollection", "features": features}, fh, separators=(",", ":"))

if __name__ == "__main__":
    main(*sys.argv[1:3])
