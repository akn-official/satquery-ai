"""Agent controller: classify task -> check inputs -> plan from REGISTRY -> run -> fuse -> auditable trace."""
import inspect
import math
import time

import numpy as np

from . import tools, vlm
from .validate import InputError, configure, preview

INTENTS = (  # first match wins, so "where did it change" is change, not grounding
    ("change", ("change", "increase", "decrease", "before", "after", "between", "grown", "lost")),
    ("ground", ("highlight", "locate", "where is", "show", "mark", "outline", "find")),
    ("caption", ("describe", "caption", "summar", "overview", "what is in")),
)
WATER_WORDS = ("water", "river", "lake", "flood", "reservoir", "pond", "sea")


def classify(query):
    # ponytail: keyword table; ask the VLM "which task?" when queries get too varied for keywords
    q = query.lower()
    return next((intent for intent, words in INTENTS if any(w in q for w in words)), "vqa")


def plan(intent, config, images, query):
    if config == "bitemporal":
        return ["change_cva", "vlm_change"]
    if config == "optical_sar":
        return ["water_optical", "water_sar", "fuse_water", "builtup_fusion", "vlm_vqa"]
    water = any(w in query.lower() for w in WATER_WORDS)
    evidence = ["water_sar" if images[0]["modality"] == "sar" else "water_optical"] if water else []
    if intent == "caption":
        return evidence + ["vlm_caption"]
    if intent == "ground":
        return evidence + ["vlm_ground"]
    return evidence + ["vlm_vqa"]  # also a "change" question on a single image (trace shows config=single)


def permitted(fn):
    return {k: p.default for k, p in inspect.signature(fn).parameters.items()
            if p.default is not inspect.Parameter.empty}


def run(query, images, params=None):
    params = params or {}
    if not isinstance(params, dict) or not all(isinstance(v, dict) for v in params.values()):
        raise InputError('tool parameters must be {"tool_name": {"param": value}}')
    for tool, ps in params.items():  # numbers only: a list would broadcast against the HxW arrays (memory bomb)
        for k, v in ps.items():
            if v is not None and (isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)):
                raise InputError(f"tool parameter {tool}.{k} must be a finite number or null")
    config = configure(images)
    intent = classify(query)
    steps = plan(intent, config, images, query)
    out, log = {}, []
    for name in steps:
        fn = tools.REGISTRY[name]
        allowed = permitted(fn)
        p = {**allowed, **{k: v for k, v in params.get(name, {}).items() if k in allowed}}
        t0 = time.perf_counter()
        try:
            res, status = fn(images, out, query, **p), "ok"
        except tools.Skip as e:
            res, status = {"text": str(e)}, "skipped"
        except vlm.Offline as e:
            res, status = {"text": str(e)}, "vlm_offline"
        except Exception as e:  # keep the run auditable instead of a bare 500
            res, status = {"text": f"{type(e).__name__}: {e}"}, "error"
        res["status"] = status
        out[name] = res
        log.append({"tool": name, "params": p, "status": status, "ms": round((time.perf_counter() - t0) * 1000),
                    "stats": res.get("stats"), "conf": res.get("conf"),
                    "output": res.get("text")})

    vlm_text = next((out[s]["text"] for s in reversed(steps) if s.startswith("vlm_") and out[s]["status"] == "ok"), None)
    evidence = [f"{k}: " + ", ".join(f"{s}={v}" for s, v in r["stats"].items())
                for k, r in out.items() if r["status"] == "ok" and r.get("stats")]
    confs = [r["conf"] for r in out.values() if r["status"] == "ok" and r.get("conf") is not None]

    pics = [(f"input {i + 1}: {im['name']} ({im['modality']})", preview(im)) for i, im in enumerate(images)]
    for name, r in out.items():
        if r["status"] == "ok" and r.get("mask") is not None:
            ons = r["on"] if isinstance(r["on"], list) else [r["on"]]
            for j in ons:
                base = preview(images[j]).astype("float32")
                base[r["mask"]] = (228, 48, 32)  # solid = UI legend colour; a blend over green vegetation turns brown
                pics.append((f"evidence: {name}" + (f" on input {j + 1}" if len(ons) > 1 else ""), base.astype("uint8")))

    return {
        "query": query,
        "answer": vlm_text or "VLM unavailable; answer from measured evidence only.",
        "evidence": evidence,
        "confidence": round(float(np.mean(confs)), 3) if confs else None,
        "trace": {"task": intent, "input_config": config, "plan": steps,
                  "inputs": [{"name": im["name"], "modality": im["modality"], "bands": int(im["data"].shape[0]),
                              "size": im["meta"]["size"], "crs": im["meta"]["crs"]} for im in images],
                  "steps": log},
        "images": pics,
    }
