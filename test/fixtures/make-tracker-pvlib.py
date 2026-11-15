# Reference single-axis tracker angles for solar-model.js (issue #53), computed with pvlib.
# Regenerate: pip install pvlib; python test/fixtures/make-tracker-pvlib.py > test/fixtures/tracker-pvlib.json
# The sun positions come from the app's own geometry (declination formula, hour angle), so
# only the tracker rule is compared: horizontal axis pointing south (axis_azimuth 180),
# flat ground. pvlib's rotation is positive towards the west; the app's towards the east.
import json, math
import numpy as np
import pvlib
from pvlib import tracking

positions = []
for lat in [52.23, 38.72, -26.2, 0.0]:
    for n in [17, 80, 172, 264, 355]:
        d = math.radians(23.45 * math.sin(2 * math.pi * (284 + n) / 365))
        phi = math.radians(lat)
        for w in range(-180, 181, 10):
            o = math.radians(w)
            cz = math.cos(phi) * math.cos(d) * math.cos(o) + math.sin(phi) * math.sin(d)
            if cz <= 0.01:
                continue
            az_s = math.atan2(math.sin(o) * math.cos(d),
                              math.sin(phi) * math.cos(d) * math.cos(o) - math.cos(phi) * math.sin(d))
            positions.append((lat, n, w, math.degrees(math.acos(cz)), (math.degrees(az_s) + 180) % 360))

zenith = np.array([p[3] for p in positions])
azimuth = np.array([p[4] for p in positions])
cases = []
for gcr, max_angle, backtrack in [(0.33, 90, False), (0.33, 90, True), (0.33, 60, True), (0.4, 55, True), (0.25, 60, True)]:
    res = tracking.singleaxis(zenith, azimuth, axis_tilt=0, axis_azimuth=180,
                              max_angle=max_angle, backtrack=backtrack, gcr=gcr)
    theta = np.asarray(res['tracker_theta'], dtype=float)
    aoi = np.asarray(res['aoi'], dtype=float)
    cases.append({'gcr': gcr, 'maxAngle': max_angle, 'backtrack': backtrack,
                  'points': [[p[0], p[1], p[2], round(float(t), 4), round(float(a), 4)]
                             for p, t, a in zip(positions, theta, aoi)]})

print(json.dumps({'source': f'pvlib {pvlib.__version__} tracking.singleaxis, axis_tilt 0, axis_azimuth 180',
                  'columns': ['lat', 'day', 'hourAngle', 'trackerTheta', 'aoi'], 'cases': cases}))
