"""Runs SatQuery's real router (tools + local qwen3.5:2b) on the demo scenes; the film quotes assets/real.json."""
import json, pathlib, sys
APP = pathlib.Path(sys.argv[1]); sys.path.insert(0, str(APP))
from satquery import router, validate
A = pathlib.Path(__file__).parent / 'assets'
ld = lambda n, m: validate.read((A / f'river_{n}.tif').read_bytes(), f'river_{n}.tif', m)
t1, t2, sar = ld('t1', 'optical'), ld('t2', 'optical'), ld('sar', 'sar')
out = {}
for key, q, ims in (('change', 'What changed, and where?', [t1, t2]), ('ground', 'Where is the bridge?', [t2]),
                    ('fuse', 'Find the water in the optical and SAR images', [t2, sar])):
    r = router.run(q, ims); r.pop('images'); out[key] = r
    print(key, r['trace']['plan'], r['confidence'], '\n ', r['answer'][:400].replace('\n', ' '))
    for s in r['trace']['steps']: print('   ', s['tool'], s['status'], s['ms'], 'ms', str(s['output'])[:160].replace('\n', ' '))
json.dump(out, open(A / 'real.json', 'w'), indent=1, default=str)
