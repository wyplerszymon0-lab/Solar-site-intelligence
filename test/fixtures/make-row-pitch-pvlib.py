# Reference row pitches on sloping ground for capacity.js (issue #65), computed with pvlib.
# Regenerate: pip install pvlib; python test/fixtures/make-row-pitch-pvlib.py > test/fixtures/row-pitch-pvlib.json
# The app's closed formula is not used here: the pitch is found by bisection as the smallest
# one at which pvlib's shaded_fraction1d is zero at winter-solstice noon. Rows run east-west
# and face the equator; cross_axis_slope is positive on an equator-facing slope.
import json, math
import pvlib
from pvlib.shading import shaded_fraction1d


def pitch(lat, tilt, grade):
    north = lat >= 0
    zenith = abs(lat) + 23.45

    def shaded(p):
        return shaded_fraction1d(
            solar_zenith=zenith, solar_azimuth=180 if north else 0, axis_azimuth=90 if north else 270,
            shaded_row_rotation=tilt, collector_width=1.0, pitch=p,
            cross_axis_slope=math.degrees(math.atan(grade))) > 1e-9
    lo, hi = 0.5, 100.0
    assert shaded(lo) and not shaded(hi)
    while hi - lo > 1e-8:
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if shaded(mid) else (lo, mid)
    return hi


cases = [(lat, tilt, g) for lat, tilt in [(52.23, 39), (38.72, 35), (-33.87, 30), (59.91, 45)]
         for g in (-0.05, -0.02, 0.0, 0.05, 0.1, 0.2)]
print(json.dumps({'source': f'pvlib {pvlib.__version__} shaded_fraction1d, bisection',
                  'cases': [{'lat': a, 'tilt': b, 'grade': g, 'pitch': round(pitch(a, b, g), 6)} for a, b, g in cases]}, indent=1))
