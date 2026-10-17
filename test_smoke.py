"""Smoke test: synthetic GeoTIFFs through the whole pipeline with the VLM offline. Run: python test_smoke.py"""
import os

os.environ["VLM_URL"] = "http://127.0.0.1:9/v1"  # dead port -> exercises the VLM-offline path

import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from satquery import router, server, validate

rng = np.random.default_rng(0)


def tif(arr, dtype):
    with MemoryFile() as mf:
        with mf.open(driver="GTiff", width=arr.shape[2], height=arr.shape[1], count=arr.shape[0], dtype=dtype,
                     crs="EPSG:32643", transform=from_origin(500000, 2000000, 10, 10)) as ds:
            ds.write(arr.astype(dtype))
        return mf.read()


def steps(res):
    return {s["tool"]: s for s in res["trace"]["steps"]}


H = W = 64
water = np.zeros((H, W), bool)
water[:, :20] = True                                                       # 31.25 % water
opt = np.full((4, H, W), 1000.0) + rng.normal(0, 20, (4, H, W))           # Cartosat order B,G,R,NIR
opt[3] += 2000                                                             # land: NIR high
opt[1][water] = 1500
opt[3][water] = 200                                                        # water: G > NIR
opt[3][40:50, 40:50] = 1100                                                # bare / built-up patch: low NDVI
sar = np.full((2, H, W), 0.1) * rng.uniform(0.8, 1.2, (2, H, W))         # linear sigma0, land ~ -10 dB
sar[:, water] = 0.005                                                      # water ~ -23 dB
sar[:, 40:50, 40:50] = 1.0                                                 # built-up ~ 0 dB

# intent routing
assert router.classify("What changed between these two dates, and where did the change occur?") == "change"
assert router.classify("Highlight the water body referred to in the query.") == "ground"
assert router.classify("Describe the land-cover and major objects visible in this image.") == "caption"
assert router.classify("How many buildings are there?") == "vqa"

# optical + SAR pair
res = server.handle("Use the optical and SAR images together to identify built-up and water-covered regions.",
                    [("opt.tif", tif(opt, "uint16")), ("sar.tif", tif(sar, "float32"))])
s = steps(res)
assert res["trace"]["input_config"] == "optical_sar", res["trace"]
assert abs(s["water_optical"]["stats"]["water_pct"] - 31.25) < 1, s["water_optical"]
assert abs(s["water_sar"]["stats"]["water_pct"] - 31.25) < 1, s["water_sar"]
assert s["fuse_water"]["stats"]["pixel_agreement"] > 0.98, s["fuse_water"]
assert abs(s["builtup_fusion"]["stats"]["builtup_pct"] - 100 * 100 / (H * W)) < 0.5, s["builtup_fusion"]
assert s["vlm_vqa"]["status"] == "vlm_offline"
assert "fuse_water" in res["report_html"] and len(res["images"]) == 6  # 2 inputs + 4 masks

# bi-temporal pair: water widens by 10 columns
opt2 = opt.copy()
opt2[1][:, 20:30] = 1500
opt2[3][:, 20:30] = 200
res = server.handle("Has the built-up area increased, decreased, or remained unchanged?",
                    [("t1.tif", tif(opt, "uint16")), ("t2.tif", tif(opt2, "uint16"))])
s = steps(res)
assert res["trace"]["plan"] == ["change_cva", "vlm_change"]
assert abs(s["change_cva"]["stats"]["changed_pct"] - 100 * 10 / W) < 2, s["change_cva"]
assert s["change_cva"]["stats"]["ndvi_delta_in_changed"] < 0
assert s["change_cva"]["stats"]["ndwi_delta_in_changed"] > 0  # widened water = new water, not just veg loss
assert s["change_cva"]["stats"]["likely"] == "new water / flooding"

# single SAR, water question -> SAR evidence + VLM
res = server.handle("Is there a river in this image?", [("sar.tif", tif(sar, "float32"))])
assert res["trace"]["plan"] == ["water_sar", "vlm_vqa"]

# incompatible pair -> abstain with reason
try:
    server.handle("what changed?", [("a.tif", tif(opt, "uint16")), ("b.tif", tif(opt[:, :32], "uint16"))])
    raise AssertionError("size mismatch not caught")
except validate.InputError as e:
    assert "co-registered" in str(e)

print("smoke ok")
