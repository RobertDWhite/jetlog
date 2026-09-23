"""Render the travel map as a self-contained SVG (no extra dependencies)."""

from __future__ import annotations

import math
from typing import Iterable

WIDTH = 1200

BACKGROUND = "#0e1726"
LAND = "#1f2d3f"
VISITED = "#2f5f86"
BORDER = "#0e1726"
ROUTE = "#f5a524"
UPCOMING = "#5ad1ff"
AIRPORT = "#ffffff"
TEXT = "#e6edf5"
MUTED = "#8a9bb0"


def _great_circle(lat1: float, lon1: float, lat2: float, lon2: float, steps: int = 48) -> list[tuple[float, float]]:
    """Points along the great circle, longitudes kept continuous (no ±180 jumps)."""
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    d = 2 * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2
                                + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2))
    if d == 0:
        return [(lat1, lon1), (lat2, lon2)]
    points = []
    prev_lon = None
    for i in range(steps + 1):
        f = i / steps
        a = math.sin((1 - f) * d) / math.sin(d)
        b = math.sin(f * d) / math.sin(d)
        x = a * math.cos(p1) * math.cos(l1) + b * math.cos(p2) * math.cos(l2)
        y = a * math.cos(p1) * math.sin(l1) + b * math.cos(p2) * math.sin(l2)
        z = a * math.sin(p1) + b * math.sin(p2)
        lat = math.degrees(math.atan2(z, math.hypot(x, y)))
        lon = math.degrees(math.atan2(y, x))
        if prev_lon is not None:
            while lon - prev_lon > 180:
                lon -= 360
            while lon - prev_lon < -180:
                lon += 360
        prev_lon = lon
        points.append((lat, lon))
    return points


class _Projection:
    """Equirectangular, x squeezed by cos(centre latitude), fitted into WIDTH x height."""

    def __init__(self, lat_min: float, lat_max: float, lon_min: float, lon_max: float) -> None:
        self.k = max(math.cos(math.radians((lat_min + lat_max) / 2)), 0.35)
        self.lon_min, self.lat_max = lon_min, lat_max
        self.scale = WIDTH / ((lon_max - lon_min) * self.k)
        self.height = round((lat_max - lat_min) * self.scale)

    def __call__(self, lat: float, lon: float) -> tuple[float, float]:
        return ((lon - self.lon_min) * self.k * self.scale, (self.lat_max - lat) * self.scale)


def _extent(points: list[tuple[float, float]], world: bool) -> tuple[float, float, float, float]:
    if world or not points:
        return -58.0, 78.0, -170.0, 190.0
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    lat_min, lat_max, lon_min, lon_max = min(lats), max(lats), min(lons), max(lons)
    # pad, then enforce a minimum span and a landscape-ish aspect
    lat_pad = max((lat_max - lat_min) * 0.15, 4)
    lon_pad = max((lon_max - lon_min) * 0.15, 6)
    lat_min, lat_max = max(lat_min - lat_pad, -85), min(lat_max + lat_pad, 85)
    lon_min, lon_max = lon_min - lon_pad, lon_max + lon_pad
    k = max(math.cos(math.radians((lat_min + lat_max) / 2)), 0.35)
    width_deg, height_deg = (lon_max - lon_min) * k, lat_max - lat_min
    target = 1.9  # width / height
    if width_deg / height_deg < target:
        extra = (height_deg * target / k - (lon_max - lon_min)) / 2
        lon_min, lon_max = lon_min - extra, lon_max + extra
    else:
        extra = (width_deg / target - height_deg) / 2
        lat_min, lat_max = max(lat_min - extra, -85), min(lat_max + extra, 85)
    return lat_min, lat_max, lon_min, lon_max


def _rings(geometry: dict) -> Iterable[list]:
    if geometry.get("type") == "Polygon":
        yield from geometry["coordinates"]
    elif geometry.get("type") == "MultiPolygon":
        for polygon in geometry["coordinates"]:
            yield from polygon


def _path(points: Iterable[tuple[float, float]], tolerance: float = 0.8) -> str:
    """SVG path data, dropping points closer than `tolerance` px to keep the file small."""
    out = []
    last = None
    for x, y in points:
        if last and abs(x - last[0]) < tolerance and abs(y - last[1]) < tolerance:
            continue
        out.append(f"{'L' if out else 'M'}{x:.1f} {y:.1f}")
        last = (x, y)
    return "".join(out)


def _country_paths(world: dict, proj: _Projection, lon_min: float, lon_max: float) -> list[str]:
    paths = []
    # draw each country at the offset(s) that put it inside the view, for views past ±180
    offsets = [o for o in (-360, 0, 360) if lon_min < 180 + o and lon_max > -180 + o]
    for feature in world.get("features", []):
        fill = VISITED if (feature.get("properties") or {}).get("visited") else LAND
        d = []
        for offset in offsets:
            for ring in _rings(feature.get("geometry") or {}):
                ring_lons = [p[0] + offset for p in ring]
                if max(ring_lons) < lon_min or min(ring_lons) > lon_max:
                    continue
                seg = _path(proj(p[1], p[0] + offset) for p in ring)
                if seg.count("L") >= 2:
                    d.append(seg + "Z")
        if d:
            paths.append(f'<path d="{"".join(d)}" fill="{fill}"/>')
    return paths


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_map(world: dict, decorations: list, upcoming: list[dict], statistics: dict, extent: str) -> str:
    trajectories, airports = (decorations + [[], []])[:2] if decorations else ([], [])

    routes = [_great_circle(t["first"]["latitude"], t["first"]["longitude"],
                            t["second"]["latitude"], t["second"]["longitude"]) for t in trajectories]
    upcoming_routes = [_great_circle(f["origin"]["latitude"], f["origin"]["longitude"],
                                     f["destination"]["latitude"], f["destination"]["longitude"])
                       for f in upcoming
                       if f["origin"].get("latitude") is not None and f["destination"].get("latitude") is not None]

    fit_points = [p for route in routes + upcoming_routes for p in route]
    fit_points += [(a["latitude"], a["longitude"]) for a in airports]
    lat_min, lat_max, lon_min, lon_max = _extent(fit_points, extent == "world")
    proj = _Projection(lat_min, lat_max, lon_min, lon_max)
    height = proj.height

    max_freq = max((t["frequency"] for t in trajectories), default=1)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {height}" width="{WIDTH}" height="{height}" '
        f'font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">',
        f'<rect width="{WIDTH}" height="{height}" fill="{BACKGROUND}"/>',
        f'<g stroke="{BORDER}" stroke-width="0.6" stroke-linejoin="round">',
        *_country_paths(world, proj, lon_min, lon_max),
        "</g>",
        f'<g fill="none" stroke="{ROUTE}" stroke-linecap="round" stroke-opacity="0.85">',
    ]
    for trajectory, route in zip(trajectories, routes):
        width = 1.2 + 2.8 * math.log1p(trajectory["frequency"]) / math.log1p(max_freq)
        parts.append(f'<path d="{_path((proj(*p) for p in route), 0.3)}" stroke-width="{width:.1f}"/>')
    parts.append("</g>")

    if upcoming_routes:
        parts.append(f'<g fill="none" stroke="{UPCOMING}" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round">')
        parts += [f'<path d="{_path((proj(*p) for p in route), 0.3)}"/>' for route in upcoming_routes]
        parts.append("</g>")

    max_airport = max((a["frequency"] for a in airports), default=1)
    # busiest airports first; skip a label that would overprint one already placed
    labelled: list[tuple[float, float, str]] = []
    for airport in sorted(airports, key=lambda a: a["frequency"], reverse=True)[:30]:
        x, y = proj(airport["latitude"], airport["longitude"])
        if all(abs(x - lx) > 34 or abs(y - ly) > 15 for lx, ly, _ in labelled):
            labelled.append((x, y, airport.get("iata") or airport.get("icao") or ""))
    parts.append(f'<g fill="{AIRPORT}">')
    for airport in airports:
        x, y = proj(airport["latitude"], airport["longitude"])
        r = 2.5 + 3.5 * math.sqrt(airport["frequency"] / max_airport)
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" stroke="{BACKGROUND}" stroke-width="1.2"/>')
    parts.append("</g>")
    parts.append(f'<g fill="{TEXT}" font-size="13" font-weight="600" paint-order="stroke" '
                 f'stroke="{BACKGROUND}" stroke-width="3">')
    for x, y, label in labelled:
        parts.append(f'<text x="{x + 8:.1f}" y="{y - 6:.1f}">{_escape(label)}</text>')
    parts.append("</g>")

    stats = statistics or {}
    summary = (f'{stats.get("totalFlights", 0):,} flights · {stats.get("totalDistance", 0):,} km · '
               f'{stats.get("totalUniqueAirports", 0)} airports · {stats.get("visitedCountries", 0)} countries')
    parts.append(f'<rect x="12" y="{height - 44}" width="{min(WIDTH - 24, 9 * len(summary) + 150)}" height="32" rx="6" '
                 f'fill="{BACKGROUND}" fill-opacity="0.8"/>')
    parts.append(f'<text x="24" y="{height - 23}" font-size="15" fill="{TEXT}">{_escape(summary)}'
                 f'<tspan fill="{MUTED}">  ·  </tspan><tspan fill="{ROUTE}">━ flown</tspan>'
                 f'<tspan fill="{UPCOMING}">  ╌ upcoming</tspan></text>')
    parts.append("</svg>")
    return "\n".join(parts)
