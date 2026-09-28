"""H3 helpers: binning, neighbourhoods (k-ring), centroids, boundaries, and
grid enumeration over the district bounding box.

Targets h3-py v4 (``latlng_to_cell`` / ``cell_to_latlng`` / ``grid_disk``) but
falls back to v3 names if an older wheel is installed, so the rest of the code
never has to care which is present.
"""
from __future__ import annotations

import math
from functools import lru_cache

import h3

# ---------------------------------------------------------------------------
# Version-compat shims (v4 preferred, v3 fallback)
# ---------------------------------------------------------------------------
_V4 = hasattr(h3, "latlng_to_cell")


def latlng_to_cell(lat: float, lng: float, res: int) -> str:
    if _V4:
        return h3.latlng_to_cell(lat, lng, res)
    return h3.geo_to_h3(lat, lng, res)  # type: ignore[attr-defined]


def cell_to_latlng(cell: str) -> tuple[float, float]:
    if _V4:
        return h3.cell_to_latlng(cell)
    return h3.h3_to_geo(cell)  # type: ignore[attr-defined]


def cell_to_boundary(cell: str) -> list[tuple[float, float]]:
    if _V4:
        return h3.cell_to_boundary(cell)
    return h3.h3_to_geo_boundary(cell)  # type: ignore[attr-defined]


def grid_disk(cell: str, k: int) -> list[str]:
    """Cell plus all cells within k rings (inclusive)."""
    if _V4:
        return list(h3.grid_disk(cell, k))
    return list(h3.k_ring(cell, k))  # type: ignore[attr-defined]


@lru_cache(maxsize=65536)
def k_ring(cell: str, k: int = 1) -> tuple[str, ...]:
    """Cell + k-ring neighbours (cached; hot path for near-repeat)."""
    return tuple(grid_disk(cell, k))


def _polygon_to_cells(loop: list[tuple[float, float]], res: int) -> set[str]:
    """Enumerate all cells whose centroid falls in the (lat,lng) polygon loop."""
    if _V4:
        try:
            shape = h3.LatLngPoly(loop)
            return set(h3.h3shape_to_cells(shape, res))
        except Exception:
            # older 4.x used polygon_to_cells with a plain list + geo_json param
            return set(h3.polygon_to_cells(loop, res))  # type: ignore[attr-defined]
    return set(h3.polyfill_geojson(  # type: ignore[attr-defined]
        {"type": "Polygon", "coordinates": [[[lng, lat] for lat, lng in loop]]}, res
    ))


# ---------------------------------------------------------------------------
# District grid
# ---------------------------------------------------------------------------
def cells_in_bbox(bbox: tuple[float, float, float, float], res: int) -> list[str]:
    """All res-`res` cells covering the bbox (minlat, minlng, maxlat, maxlng)."""
    minlat, minlng, maxlat, maxlng = bbox
    loop = [
        (minlat, minlng),
        (minlat, maxlng),
        (maxlat, maxlng),
        (maxlat, minlng),
    ]
    cells = _polygon_to_cells(loop, res)
    if not cells:
        # Degenerate/tiny bbox: fall back to the four corners + centre.
        for lat, lng in loop + [((minlat + maxlat) / 2, (minlng + maxlng) / 2)]:
            cells.add(latlng_to_cell(lat, lng, res))
    return sorted(cells)


def centroid(cell: str) -> dict[str, float]:
    lat, lng = cell_to_latlng(cell)
    return {"lat": lat, "lng": lng}


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
_EARTH_R_M = 6_371_000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_R_M * math.asin(math.sqrt(a))


@lru_cache(maxsize=8192)
def cell_centroid_cached(cell: str) -> tuple[float, float]:
    return cell_to_latlng(cell)
