# Reference rear-side irradiation for solar-model.js rearDayIrradiation (issue #67), with pvlib.
# Regenerate (pvlib, from the repo root):
#   node tools/bifacial-moments.mjs > bifacial-moments.json
#   python test/fixtures/make-bifacial-pvlib.py bifacial-moments.json > test/fixtures/bifacial-pvlib.json
# Each moment's inputs come from the app's mean day (tools/bifacial-moments.mjs): pvlib's
# infinite_sheds.get_irradiance_poa computes the rear (tilt 180 - beta, azimuth turned
# round) with the isotropic sky on beam = horizontal beam + circumsolar, diffuse = the rest,
# and the day's rear irradiation is the sum over the moments. Pitch and height in slant widths.
import json, math, sys
import numpy as np
import pvlib
from pvlib.bifacial import infinite_sheds

data = json.load(open(sys.argv[1], encoding='utf-8'))
out = []
for c in data['cases']:
    zen, az, beam, iso = (np.array(v, dtype=float) for v in zip(*c['moments']))
    cosz = np.cos(np.radians(zen))
    r = infinite_sheds.get_irradiance_poa(
        surface_tilt=180 - c['tilt'], surface_azimuth=(c['azimuth'] + 180) % 360,
        solar_zenith=zen, solar_azimuth=az, gcr=c['gcr'], height=c['height'], pitch=1 / c['gcr'],
        ghi=beam + iso, dhi=iso, dni=np.where(cosz > 0, beam / cosz, 0), albedo=c['albedo'])
    out.append({k: c[k] for k in ('name', 'month', 'gcr', 'height', 'albedo')} | {
        'rear': round(float(np.sum(r['poa_global'])), 6),
        'sky': round(float(np.sum(r['poa_sky_diffuse'])), 6),
        'ground': round(float(np.sum(r['poa_ground_diffuse'])), 6),
        'beam': round(float(np.sum(r['poa_direct'])), 6)})
print(json.dumps({'source': f'pvlib {pvlib.__version__} bifacial.infinite_sheds.get_irradiance_poa, rear side, '
                            'isotropic, on the app\'s mean-day moments', 'cases': out}, indent=0))
