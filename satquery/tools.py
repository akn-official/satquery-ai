"""Specialist tools + REGISTRY.

Each tool: fn(images, out, query, **params) -> dict. Keyword params with defaults ARE the permitted
parameters the router may set. Returned keys (all optional): text, stats, mask (bool HxW),
on (image index, or list of indexes, the mask is painted on), conf (0-1).
"""
import re

import numpy as np

from . import vlm
from .validate import preview


class Skip(Exception):
    """Tool not applicable to these inputs (logged in the trace, not fatal)."""


def otsu(x):
    x = x[np.isfinite(x)].ravel()
    if x.size == 0 or x.max() - x.min() < 1e-6:
        return float(x.max()) if x.size else 0.0  # flat input: nothing to split, "> t" and "< t" both mark nothing
    hist, edges = np.histogram(x, 256)
    mids = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist)
    w1 = w0[-1] - w0
    s0 = np.cumsum(hist * mids)
    m0 = s0 / np.maximum(w0, 1)
    m1 = (s0[-1] - s0) / np.maximum(w1, 1)
    return float(mids[np.argmax(w0 * w1 * (m0 - m1) ** 2)])


def nd(a, b):
    return (a - b) / (a + b + 1e-6)


def _find(images, modality):
    for i, im in enumerate(images):
        if im["modality"] == modality:
            return i, im
    raise Skip(f"needs a {modality} image")


def _band(im, role):
    if role not in im["bands"]:
        raise Skip(f"{im['name']} has no {role.upper()} band")
    return im["data"][im["bands"][role]]


def _pct(mask):
    return round(100 * float(mask.mean()), 2)


# ---------- rule / pixel tools (CPU, no model) ----------

def water_optical(images, out, query, ndwi_min=0.0):
    i, im = _find(images, "optical")
    m = nd(_band(im, "g"), _band(im, "nir")) > ndwi_min
    return {"mask": m, "on": i, "stats": {"water_pct": _pct(m)}}


def water_sar(images, out, query, threshold_db=None):
    # ponytail: Otsu always splits the histogram, so a scene with no water still gets a "dark" class;
    # pass threshold_db (e.g. -15 for calibrated sigma0) when that matters
    i, im = _find(images, "sar")
    t = otsu(im["db"]) if threshold_db is None else threshold_db
    m = im["db"] < t
    return {"mask": m, "on": i, "stats": {"water_pct": _pct(m), "threshold_db": round(t, 2)}}


def fuse_water(images, out, query):
    a = out.get("water_optical", {}).get("mask")
    b = out.get("water_sar", {}).get("mask")
    if a is None or b is None:
        raise Skip("needs water_optical and water_sar outputs")
    agree = 1 - float((a ^ b).mean())
    return {"mask": a & b, "on": out["water_optical"]["on"], "conf": round(agree, 3),
            "stats": {"water_both_pct": _pct(a & b), "optical_only_pct": _pct(a & ~b),
                      "sar_only_pct": _pct(b & ~a), "pixel_agreement": round(agree, 3)}}


def builtup_fusion(images, out, query, vv_min_db=-5.0, ndvi_max=0.2):
    # ponytail: bright VV (double bounce) + low NDVI; vv_min_db only meaningful for calibrated sigma0,
    # uncalibrated DN falls back to the 90th percentile
    i, opt = _find(images, "optical")
    _, sar = _find(images, "sar")
    t = vv_min_db if sar["meta"]["dtype"].startswith("float") else float(np.percentile(sar["db"], 90))
    m = sar["db"] > t
    if "nir" in opt["bands"]:
        m &= nd(_band(opt, "nir"), _band(opt, "r")) < ndvi_max
    return {"mask": m, "on": i, "stats": {"builtup_pct": _pct(m), "vv_threshold_db": round(t, 2)}}


def change_cva(images, out, query, threshold=None, noise_k=2.0):
    a, b = images
    xa, xb = (a["db"][None], b["db"][None]) if a["modality"] == "sar" else (a["data"], b["data"])

    # ponytail: per-band z-score as radiometric normalisation; histogram matching if seasons differ a lot
    def z(x):
        return (x - x.mean((1, 2), keepdims=True)) / (x.std((1, 2), keepdims=True) + 1e-6)

    mag = np.sqrt(((z(xa) - z(xb)) ** 2).sum(0))
    # ponytail: noise floor k * median so two near-identical scenes don't get their sensor noise split in half;
    # noise_k is a calibration knob (tune on CDVQA no-change pairs), 0 = plain Otsu
    t = max(otsu(mag), noise_k * float(np.median(mag))) if threshold is None else threshold
    m = mag > t
    stats = {"changed_pct": _pct(m), "threshold": round(t, 3)}
    if stats["changed_pct"] > 60:
        stats["note"] = "most of the scene differs: probably misregistered or radiometrically different, not real change"
    if a["modality"] == "optical" and "nir" in a["bands"] and m.any():
        ndvi = [nd(_band(x, "nir"), _band(x, "r")) for x in (a, b)]
        stats["ndvi_delta_in_changed"] = round(float((ndvi[1] - ndvi[0])[m].mean()), 3)  # <0: vegetation loss
        ndwi = [nd(_band(x, "g"), _band(x, "nir")) for x in (a, b)]  # >0: new water (flood); NDVI alone reads it as veg loss
        stats["ndwi_delta_in_changed"] = dw = round(float((ndwi[1] - ndwi[0])[m].mean()), 3)
        dv = stats["ndvi_delta_in_changed"]
        # ponytail: fixed 0.2 cut-offs; words beat raw deltas for a 2B VLM. Tune on CDVQA once M1 runs.
        stats["likely"] = ("new water / flooding" if dw > 0.2 else "water loss" if dw < -0.2
                           else "vegetation loss" if dv < -0.2 else "vegetation gain" if dv > 0.2 else "mixed / unclear")
    elif not m.any():
        stats["likely"] = "no change"
    return {"mask": m, "on": [0, 1], "stats": stats}  # painted on both dates


# ---------- VLM tools ----------

def _context(out):
    lines = [f"- {k}: " + ", ".join(f"{s}={v}" for s, v in r["stats"].items())
             for k, r in out.items() if r.get("status") == "ok" and r.get("stats")]
    return "\nMeasured evidence from tools:\n" + "\n".join(lines) if lines else ""


def vlm_vqa(images, out, query, max_tokens=200):
    text, conf = vlm.ask(f"{query}\nAnswer briefly.{_context(out)}", [preview(i) for i in images], max_tokens)
    return {"text": text, "conf": conf}


def vlm_caption(images, out, query, max_tokens=200):
    prompt = "Describe the land cover and major objects visible in this remote-sensing image."
    text, conf = vlm.ask(prompt + _context(out), [preview(images[0])], max_tokens)
    return {"text": text, "conf": conf}


def vlm_ground(images, out, query, max_tokens=64):
    # calibration knob: Qwen3-VL answers in 0-1000 coords; Qwen2.5-VL in pixels. Prompt pins 0-1000.
    prompt = f'Locate: "{query}". Reply only with the bounding box [x1, y1, x2, y2] in 0-1000 normalised coordinates.'
    text, conf = vlm.ask(prompt, [preview(images[0])], max_tokens)
    nums = [min(max(float(n), 0), 1000) / 1000 for n in re.findall(r"-?\d+(?:\.\d+)?", text)[:4]]
    if len(nums) < 4:
        return {"text": text, "conf": 0.0, "stats": {"bbox": None}}
    x1, y1, x2, y2 = nums
    h, w = images[0]["data"].shape[1:]
    m = np.zeros((h, w), bool)
    m[int(y1 * h):int(y2 * h), int(x1 * w):int(x2 * w)] = True
    # ponytail: box AND index mask as refinement; MobileSAM box-prompt when masks must be sharper
    for k in ("water_optical", "water_sar"):
        prior = out.get(k, {}).get("mask")
        if prior is not None and (m & prior).any():
            m &= prior
    box = [round(v, 3) for v in nums]
    return {"text": f"Located in box x {box[0]}-{box[2]}, y {box[1]}-{box[3]} (fraction of image width/height); "
                    f"the highlighted region covers {_pct(m)}% of the scene. Raw VLM output: {text}",
            "conf": conf, "mask": m, "on": 0, "stats": {"bbox_norm": box, "area_pct": _pct(m)}}


def vlm_change(images, out, query, max_tokens=200):
    prompt = f"Image 1 is the earlier date, image 2 the later date. {query}\nAnswer briefly: what changed and where."
    text, conf = vlm.ask(prompt + _context(out), [preview(i) for i in images], max_tokens)
    return {"text": text, "conf": conf}


REGISTRY = {f.__name__: f for f in (water_optical, water_sar, fuse_water, builtup_fusion, change_cva,
                                    vlm_vqa, vlm_caption, vlm_ground, vlm_change)}
