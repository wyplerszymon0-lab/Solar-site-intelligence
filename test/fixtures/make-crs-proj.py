# Reference values for crs.js, computed with PROJ (pyproj).
# Regenerate: pip install pyproj; python test/fixtures/make-crs-proj.py > test/fixtures/crs-proj.json
import json, sys
import pyproj
from pyproj import Transformer

cases = []
def add(epsg, key, pts):
    t = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    for name, lat, lon in pts:
        e, n = t.transform(lon, lat)
        cases.append({"crs": key, "epsg": epsg, "name": name, "lat": lat, "lon": lon,
                      "easting": round(e, 4), "northing": round(n, 4)})

utm = [("utm:29N", 32629, [("Lisbon", 38.7223, -9.1393)]),
       ("utm:34N", 32634, [("Warsaw", 52.2297, 21.0122), ("Tromso", 69.6492, 18.9553)]),
       ("utm:56S", 32756, [("Sydney", -33.8688, 151.2093)]),
       ("utm:35S", 32735, [("Johannesburg", -26.2041, 28.0473)]),
       ("utm:36N", 32636, [("Cairo", 30.0444, 31.2357)]),
       ("utm:17S", 32717, [("Quito", -0.1807, -78.4678)]),
       ("utm:6N", 32606, [("Anchorage", 61.2181, -149.9003)]),
       ("utm:13N", 32613, [("zone edge 3.4 deg off", 35.0, -101.6)]),
       ("utm:19S", 32719, [("Atacama", -24.5, -69.25)]),
       ("utm:43N", 32643, [("Rajasthan", 26.9124, 75.7873)])]
for key, epsg, pts in utm: add(epsg, key, pts)
add(2180, "pl1992", [("Warsaw", 52.2297, 21.0122), ("Szczecin", 53.4285, 14.5528), ("Przemysl", 49.7838, 22.7678)])
for zone, epsg, pts in [(5, 2176, [("Szczecin", 53.4285, 14.5528)]), (6, 2177, [("Wroclaw", 51.1079, 17.0385)]),
                        (7, 2178, [("Warsaw", 52.2297, 21.0122)]), (8, 2179, [("Bialystok", 53.1325, 23.1688)])]:
    add(epsg, f"pl2000:{zone}", pts)
add(3763, "pttm06", [("Lisbon", 38.7223, -9.1393), ("Porto", 41.1579, -8.6291), ("Faro", 37.0194, -7.9304)])

json.dump({"source": f"pyproj {pyproj.__version__}, PROJ {pyproj.proj_version_str}", "cases": cases},
          sys.stdout, indent=1)
