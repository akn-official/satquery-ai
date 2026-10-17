"""Synthetic demo scenes for the SatQuery promo, measured by SatQuery's own tools (no invented numbers).
Writes assets/{t1,t2,sar,cloud,m_change,m_water,m_sar,m_fuse}.png + assets/stats.json.
Run with the app's venv:  <app>/.venv/Scripts/python gen_scenes.py <app_dir>"""
import json, pathlib, sys
import numpy as np
from PIL import Image
from scipy import ndimage

APP = pathlib.Path(sys.argv[1]); sys.path.insert(0, str(APP))
from satquery import tools, validate
import rasterio
from rasterio.io import MemoryFile

OUT = pathlib.Path(__file__).parent / 'assets'; N = 1024
R = np.random.default_rng(87)


def fbm(oct_=(4, 8, 16, 32, 64, 128, 256), gain=0.55):
    acc, amp, tot = np.zeros((N, N), 'f4'), 1.0, 0.0
    for s in oct_:
        g = Image.fromarray(R.random((s, s)).astype('f4'), 'F').resize((N, N), Image.BICUBIC)
        acc += amp * np.asarray(g); tot += amp; amp *= gain
    a = acc / tot; return (a - a.min()) / (a.max() - a.min())


yy, xx = np.mgrid[0:N, 0:N].astype('f4')
# river: meandering centreline, top to bottom
ys = np.arange(N, dtype='f4'); xc = 470 + 190 * np.sin(ys / 175) + 55 * np.sin(ys / 61 + 1.3)
line = np.zeros((N, N), bool); line[ys.astype(int), np.clip(xc, 0, N - 1).astype(int)] = True
line = ndimage.binary_dilation(line, iterations=2)
dist = ndimage.distance_transform_edt(~line)
n1, n2, n3 = fbm(), fbm(), fbm((32, 64, 128, 256, 512))
elev = 0.55 * n1 + 0.45 * np.clip(dist / 330, 0, 1)
river = dist < 13 + 6 * n3
road_d = np.abs((yy - 300) - 0.38 * (xx - 0)) / np.hypot(1, 0.38)                  # main road, crosses the river
road = road_d < 4.2
road2 = np.abs(xx - 830 - 25 * np.sin(yy / 90)) < 3.4

# fields: rotated parcels, crop per parcel, dark hedges
a = np.deg2rad(17); u = xx * np.cos(a) + yy * np.sin(a); v = -xx * np.sin(a) + yy * np.cos(a)
pu, pv = np.floor(u / 74 + 0.35 * n2), np.floor(v / 46)
pid = (pu * 7919 + pv * 104729) % 9973; crop = (np.sin(pid * 12.9898) * 43758.5453) % 1
hedge = (np.abs(((u / 74 + 0.35 * n2) % 1) - 0.5) > 0.47) | (np.abs(((v / 46) % 1) - 0.5) > 0.46)
C = {  # B, G, R, NIR (reflectance-like DN)
    'green': (48, 92, 62, 190), 'dark': (38, 70, 44, 205), 'yellow': (92, 140, 150, 150), 'soil': (88, 112, 138, 120),
    'forest': (32, 52, 34, 172), 'water': (50, 48, 34, 10), 'flood': (82, 104, 118, 32), 'road': (152, 163, 168, 150),
    'roof': (156, 168, 176, 140), 'tile': (72, 92, 150, 130), 'street': (104, 108, 110, 100)}
img = np.zeros((4, N, N), 'f4')
def paint(m, k):
    for b in range(4): img[b][m] = C[k][b]
paint(np.ones((N, N), bool), 'soil')
paint(crop < 0.42, 'green'); paint((crop >= 0.42) & (crop < 0.6), 'dark'); paint((crop >= 0.6) & (crop < 0.8), 'yellow')
paint(hedge & (crop < 0.8), 'dark')
paint(elev > 0.68, 'forest')
# town on the outer bank of a bend: street grid + roofs
tc = np.array([640, 560]); town = (np.hypot(xx - tc[0], yy - tc[1]) + 120 * (n3 - 0.5) + 90 * (n2 - 0.5) < 150) & (dist > 30)
tu, tv = (xx * np.cos(0.3) + yy * np.sin(0.3)) % 26, (-xx * np.sin(0.3) + yy * np.cos(0.3)) % 22
paint(town, 'street')
cell = (np.floor((xx * np.cos(0.3) + yy * np.sin(0.3)) / 26) * 31 + np.floor((-xx * np.sin(0.3) + yy * np.cos(0.3)) / 22) * 17) % 97
rnd = (np.sin(cell * 78.233) * 43758.5453) % 1
roofs = town & (tu > 3 + 6 * rnd) & (tv > 3 + 5 * ((rnd * 7) % 1)) & (rnd > 0.12); tile = rnd > 0.62
paint(town & (rnd < 0.12), 'dark')
paint(roofs & ~tile, 'roof'); paint(roofs & tile, 'tile')
paint(road | road2, 'road')
# texture: per-pixel grain + low-frequency brightness
gy, gx = np.gradient(ndimage.gaussian_filter(elev, 3) * 60); shade = np.clip(1 + 0.9 * (gx * -0.6 + gy * -0.8), 0.75, 1.2)
pj = 0.9 + 0.2 * ((np.sin(pid * 3.17) * 917.1) % 1)
img *= (shade * np.where(town, 1, pj) * (0.9 + 0.2 * n3))[None]; img += R.normal(0, 3.5, img.shape).astype('f4')
t1 = img.copy(); t2 = img.copy()
for b in range(4): t1[b][river] = C['water'][b] + R.normal(0, 2, river.sum())
level = np.percentile(elev[~river], 13)
flood = (river | ((elev < level) & ~town)) & ~(road & ~river)                      # the raised road stays dry: the bridge
flood = ndimage.binary_opening(flood, iterations=2) | river
for b in range(4): t2[b][flood] = (C['water' if False else 'flood'][b]) * (0.9 + 0.2 * n3[flood]) + R.normal(0, 2.5, flood.sum())
for b in range(4): t2[b][river] = C['water'][b] + R.normal(0, 2, river.sum())

# SAR (same night as T2): water dark, fields mid, town bright (double bounce), speckle L=4
db = np.full((N, N), -11.0, 'f4') + 2.5 * (n1 - 0.5); db[elev > 0.68] = -8.5; db[road | road2] = -14
db[roofs] = -1.5; db[town & ~roofs] = -6; db[flood] = -22
sar = (10 ** (db / 10)) * R.gamma(4, 1 / 4, (N, N)).astype('f4')

def tif(arr, name, dtype):
    arr = arr if arr.ndim == 3 else arr[None]
    with MemoryFile() as mf:
        with mf.open(driver='GTiff', width=N, height=N, count=arr.shape[0], dtype=dtype) as ds: ds.write(arr.astype(dtype))
        return validate.read(mf.read(), name, 'auto')

I1 = tif(np.clip(t1, 1, 255), 't1.tif', 'uint8'); I2 = tif(np.clip(t2, 1, 255), 't2.tif', 'uint8'); IS = tif(sar, 'sar.tif', 'float32')
from PIL import ImageFilter
def show_rgb(x):  # display: true colour, gentle fixed grade (no per-scene percentile stretch), sensor softness
    rgb = np.clip(((x[[2, 1, 0]].transpose(1, 2, 0) / 255) ** 0.92) * 255 * 1.12, 0, 255).astype('u1')
    return Image.fromarray(rgb).filter(ImageFilter.GaussianBlur(0.7)).filter(ImageFilter.UnsharpMask(2, 40, 2))
show_rgb(np.clip(t1, 1, 255)).save(OUT / 't1.png'); show_rgb(np.clip(t2, 1, 255)).save(OUT / 't2.png')
Image.fromarray(validate.preview(IS)).save(OUT / 'sar.png')

ch = tools.change_cva([I1, I2], {}, 'what changed')
wo = tools.water_optical([I2], {}, 'water'); ws = tools.water_sar([IS], {}, 'water')
fu = tools.fuse_water([I2, IS], {'water_optical': wo, 'water_sar': ws}, 'water')
def mask(m, name, col=(228, 48, 32)):
    rgba = np.zeros((N, N, 4), 'u1'); rgba[m] = (*col, 255); Image.fromarray(rgba).save(OUT / f'{name}.png')
mask(ch['mask'], 'm_change'); mask(wo['mask'], 'm_water'); mask(ws['mask'], 'm_sar'); mask(fu['mask'], 'm_fuse')
# cloud deck over T2 (picture only; SAR is unaffected, that is the point of the shot)
cl = np.clip((fbm((8, 16, 32, 64, 128, 256)) - 0.42) * 3.2, 0, 1) ** 1.3
Image.fromarray(np.dstack([np.full((N, N, 3), 246, 'u1'), (cl * 245).astype('u1')])).save(OUT / 'cloud.png')
# the bridge: where the road crosses the river (grounding box)
by_, bx_ = np.nonzero(road & ndimage.binary_dilation(river, iterations=10))
bridge = [int(bx_.min()) - 22, int(by_.min()) - 22, int(bx_.max()) + 22, int(by_.max()) + 22]
stats = {'change_cva': ch['stats'], 'water_optical': wo['stats'], 'water_sar': ws['stats'], 'fuse_water': fu['stats'], 'bridge_px': bridge, 'size': N}
json.dump(stats, open(OUT / 'stats.json', 'w'), indent=1); print(json.dumps(stats, indent=1))
# GeoTIFFs for the real router run (run_real.py)
for arr, nm, dt in ((np.clip(t1, 1, 255), 't1', 'uint8'), (np.clip(t2, 1, 255), 't2', 'uint8'), (sar, 'sar', 'float32')):
    a3 = arr if arr.ndim == 3 else arr[None]
    with rasterio.open(OUT / f'river_{nm}.tif', 'w', driver='GTiff', width=N, height=N, count=a3.shape[0], dtype=dt) as ds: ds.write(a3.astype(dt))
