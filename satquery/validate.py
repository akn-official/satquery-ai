"""Input validation: read GeoTIFF/TIFF (PNG/JPEG only for benchmarks), guess modality, check pairs."""
import io
import math

import numpy as np
from PIL import Image

try:
    from rasterio.io import MemoryFile
except ImportError:  # PNG/JPEG still work without rasterio
    MemoryFile = None

MAX_SIDE = 1024  # ponytail: big scenes are downsampled; add tile+stitch when full-res ISRO tiles need it
MAX_PIXELS = 300_000_000  # per band, before downsampling (a full Cartosat-3 MX scene is ~200 Mpx); stops bomb headers
MAX_PIXELS_PIL = 50_000_000  # PNG/JPEG decode in full (no decimated read): 50 Mpx RGB ~ 150 MB
MAX_BANDS = 16            # Sentinel-2 has 13; more is a memory bomb (bands x 1024 x 1024 x 4 bytes)
MIN_SIDE = 8

# band index per role, keyed by band count
BAND_MAPS = {
    3: {"r": 0, "g": 1, "b": 2},                         # plain RGB
    4: {"b": 0, "g": 1, "r": 2, "nir": 3},               # Cartosat-2S MX order
    12: {"b": 1, "g": 2, "r": 3, "nir": 7, "swir": 10},  # BigEarthNet S2 (no B10)
    13: {"b": 1, "g": 2, "r": 3, "nir": 7, "swir": 11},  # full Sentinel-2 L1C
}


class InputError(ValueError):
    """Unsupported or incompatible input. Message goes to the user: abstain, don't guess."""


def _check_dims(name, w, h, bands, max_pixels=MAX_PIXELS):
    if bands > MAX_BANDS:
        raise InputError(f"{name}: {bands} bands, at most {MAX_BANDS} supported")
    if min(w, h) < MIN_SIDE or w * h > max_pixels:
        raise InputError(f"{name}: {w}x{h} px is outside the supported size ({MIN_SIDE} px side to {max_pixels // 10**6} Mpx)")


def read(data, name, modality="auto"):
    name = (name or "upload")[:200]
    ext = name.lower().rsplit(".", 1)[-1]
    try:
        if ext in ("tif", "tiff"):
            if MemoryFile is None:
                raise InputError("rasterio is not installed, cannot read GeoTIFF")
            # driver pinned: GDAL sniffs content, so a VRT renamed .tif could read server files or fetch URLs (SSRF)
            with MemoryFile(data) as mf, mf.open(driver="GTiff") as ds:
                _check_dims(name, ds.width, ds.height, ds.count)
                step = max(1, math.ceil(max(ds.height, ds.width) / MAX_SIDE))
                arr = ds.read(out_shape=(ds.count, max(1, ds.height // step), max(1, ds.width // step)))
                meta = {"crs": ds.crs.to_string() if ds.crs else None,
                        "bounds": tuple(ds.bounds) if ds.crs else None,
                        "dtype": ds.dtypes[0], "size": (ds.width, ds.height)}
        elif ext in ("png", "jpg", "jpeg"):
            img = Image.open(io.BytesIO(data), formats=["PNG", "JPEG"])  # never EPS/PSD/...: EPS runs Ghostscript
            _check_dims(name, *img.size, 3, MAX_PIXELS_PIL)
            img = img.convert("RGB")
            meta = {"crs": None, "bounds": None, "dtype": "uint8", "size": img.size}
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            arr = np.asarray(img).transpose(2, 0, 1)
        else:
            raise InputError(f"{name}: .{ext} not supported (GeoTIFF/TIFF; PNG/JPEG only for benchmark images)")
    except InputError:
        raise
    except Exception as e:  # corrupt file, wrong driver, ...
        raise InputError(f"{name}: cannot read image ({e})") from e

    arr = np.nan_to_num(arr.astype("float32"))
    if modality == "auto":
        # ponytail: 1-2 bands => SAR (RISAT/S1 VV,VH), 3+ => optical; pass modality explicitly for panchromatic
        modality = "sar" if arr.shape[0] <= 2 else "optical"
    if modality not in ("optical", "sar"):
        raise InputError(f"{name}: modality must be auto, optical or sar (got {modality!r})")

    img = {"name": name, "modality": modality, "data": arr, "meta": meta}
    if modality == "sar":
        img["db"] = to_db(arr[0], meta["dtype"])
    else:
        img["bands"] = BAND_MAPS.get(arr.shape[0], {"r": 0, "g": min(1, arr.shape[0] - 1), "b": min(2, arr.shape[0] - 1)})
    return img


def to_db(x, dtype):
    if (x < 0).any():
        return x                                   # already dB
    if dtype.startswith("float"):
        return 10 * np.log10(np.maximum(x, 1e-6))  # linear power (sigma0)
    # integer DN = uncalibrated amplitude; SAR tools use Otsu thresholds, so absolute scale doesn't matter
    return 20 * np.log10(np.maximum(x, 1))


def stretch(x):
    lo, hi = np.percentile(x, (2, 98))
    return np.clip((x - lo) / (hi - lo + 1e-6) * 255, 0, 255).astype("uint8")


def preview(img):
    """HxWx3 uint8 for display and the VLM. SAR -> false colour (VV, VH, VV-VH)."""
    d = img["data"]
    if img["modality"] == "sar":
        vv = img["db"]
        if d.shape[0] >= 2:
            vh = to_db(d[1], img["meta"]["dtype"])
            chans = [vv, vh, vv - vh]
        else:
            chans = [vv, vv, vv]
    else:
        b = img["bands"]
        chans = [d[b["r"]], d[b["g"]], d[b["b"]]]
    return np.stack([stretch(c) for c in chans], -1)


def _overlap(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def configure(imgs):
    """-> 'single' | 'optical_sar' | 'bitemporal'. Raises InputError on incompatible pairs."""
    if len(imgs) == 1:
        return "single"
    if len(imgs) != 2:
        raise InputError("give 1 image, or a pair (optical + SAR, or two dates of the same area)")
    a, b = imgs
    if a["meta"]["size"] != b["meta"]["size"]:
        raise InputError(f"pair is not co-registered: sizes {a['meta']['size']} vs {b['meta']['size']}")
    ca, cb = a["meta"]["crs"], b["meta"]["crs"]
    if ca and cb:
        if ca != cb:
            raise InputError(f"pair CRS differ: {ca} vs {cb}")
        if not _overlap(a["meta"]["bounds"], b["meta"]["bounds"]):
            raise InputError("pair footprints do not overlap")
    if a["modality"] != b["modality"]:
        return "optical_sar"
    if a["data"].shape[0] != b["data"].shape[0]:
        raise InputError(f"bi-temporal pair band counts differ: {a['data'].shape[0]} vs {b['data'].shape[0]}")
    return "bitemporal"
