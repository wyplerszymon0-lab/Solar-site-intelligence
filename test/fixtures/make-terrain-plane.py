# Reference terrain planes for geometry.js terrainPlane (issue #63), computed with pyproj and numpy.
# Regenerate: pip install pyproj numpy; python test/fixtures/make-terrain-plane.py > test/fixtures/terrain-plane-pyproj.json
# Horizontal coordinates: pyproj's exact WGS84 geodetic → ECEF, rotated into the local
# east-north-up frame at the points' mean latitude and longitude. Elevation stays the z of
# the plane, as for a DEM slope. Plane: numpy least squares z = a + b·east + c·north.
import json, math
import numpy as np
import pyproj

to_ecef = pyproj.Transformer.from_crs('EPSG:4979', 'EPSG:4978', always_xy=True)


def enu(lat, lon, lat0, lon0):
    x, y, z = to_ecef.transform(lon, lat, 0.0)
    x0, y0, z0 = to_ecef.transform(lon0, lat0, 0.0)
    p, l = math.radians(lat0), math.radians(lon0)
    rot = np.array([[-math.sin(l), math.cos(l), 0],
                    [-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)]])
    return rot @ np.array([x - x0, y - y0, z - z0])


def site(name, lat_c, lon_c, step_lat, step_lon, east_grade, north_grade, noise, seed):
    rng = np.random.default_rng(seed)
    pts = []
    for i in range(7):
        for j in range(7):
            lat, lon = lat_c + (i - 3) * step_lat, lon_c + (j - 3) * step_lon
            lon = (lon + 540) % 360 - 180
            pts.append([round(lat, 7), round(lon, 7), 0.0])
    lat0 = float(np.mean([p[0] for p in pts]))
    lon0 = lon_c  # the grid is symmetric about it, also across the antimeridian
    en = np.array([enu(p[0], p[1], lat0, lon0) for p in pts])
    for k, p in enumerate(pts):
        p[2] = round(300 + east_grade * en[k, 0] + north_grade * en[k, 1] + float(rng.normal(0, noise)), 3)
    a = np.c_[np.ones(len(pts)), en]
    z = np.array([p[2] for p in pts])
    (_, b, c), *_ = np.linalg.lstsq(a, z, rcond=None)
    r = z - a @ np.linalg.lstsq(a, z, rcond=None)[0]
    g = math.hypot(b, c)
    return {
        'name': name, 'lat0': lat0, 'lon0': lon0, 'points': pts,
        'en': [[round(float(e), 4), round(float(n), 4)] for e, n in en],
        'slopeDeg': math.degrees(math.atan(g)), 'aspectDeg': (math.degrees(math.atan2(-b, -c)) + 360) % 360,
        'gradeEastPct': b * 100, 'gradeNorthPct': c * 100, 'rmsM': float(np.sqrt(np.mean(r ** 2))),
    }


print(json.dumps({
    'source': f'pyproj {pyproj.__version__} (PROJ {pyproj.proj_version_str}), numpy {np.__version__} lstsq',
    'sites': [
        # 3 × 3 km at 60° N: rising east 3 %, falling north 5 %, 0.5 m of noise
        site('oslo-3km', 60.0, 10.0, 0.0045, 0.009, 0.03, -0.05, 0.5, 63),
        # 1.2 km in the south, falling north-east (the equator-facing side there)
        site('sydney-1km', -33.87, 151.21, 0.0018, 0.0022, -0.04, -0.04, 0.2, 64),
        # 600 m across the antimeridian (Fiji), rising south
        site('fiji-antimeridian', -16.8, 180.0, 0.0009, 0.0009, 0.0, -0.08, 0.1, 65),
    ],
}, indent=1))
