"""Behaviour tests on samples/ (run with Ollama up for VLM answers): identity pair, reverse order, overlay vs truth, routing.

.venv\\Scripts\\python test_behaviour.py   -> prints a report; PNG overlays land in .playwright-mcp/behaviour/
Prints PASS/FAIL per check instead of stopping at the first failure, so one run gives the whole picture; exits 1 on any FAIL.
"""
import pathlib

import numpy as np
from PIL import Image

from satquery import router, tools, validate

S = pathlib.Path(__file__).parent / "samples"
OUT = pathlib.Path(__file__).parent / ".playwright-mcp" / "behaviour"
OUT.mkdir(parents=True, exist_ok=True)
CHANGE_Q = "What changed between these two dates, and where did the change occur?"
results = []


def load(name, mod):
    return validate.read((S / name).read_bytes(), name, mod)


def check(name, ok, detail):
    results.append((name, ok))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {detail}")


def step(res, tool):
    return next((s for s in res["trace"]["steps"] if s["tool"] == tool), None)


def save(res, tag):
    for i, (label, rgb) in enumerate(res["images"]):
        Image.fromarray(rgb).save(OUT / f"{tag}_{i}_{label.split(':')[0].replace(' ', '')}.png")


t1, t2 = load("cartosat_t1.tif", "optical"), load("cartosat_t2_flood.tif", "optical")

print("\n1. Identity pair (T1 vs T1)")
r = router.run(CHANGE_Q, [t1, load("cartosat_t1.tif", "optical")])
st = step(r, "change_cva")["stats"]
check("changed_pct ~ 0", st["changed_pct"] < 1, f"changed_pct={st['changed_pct']} threshold={st['threshold']}")
print("  VLM:", r["answer"][:400].replace("\n", " "))
save(r, "identity")

print("\n2. Reverse order (T1->T2 vs T2->T1)")
fwd, rev = router.run(CHANGE_Q, [t1, t2]), router.run(CHANGE_Q, [t2, t1])
sf, sr = step(fwd, "change_cva")["stats"], step(rev, "change_cva")["stats"]
check("changed_pct similar", abs(sf["changed_pct"] - sr["changed_pct"]) < 1, f"{sf['changed_pct']} vs {sr['changed_pct']}")
check("NDWI delta flips sign", sf["ndwi_delta_in_changed"] * sr["ndwi_delta_in_changed"] < 0,
      f"{sf['ndwi_delta_in_changed']} vs {sr['ndwi_delta_in_changed']}")
check("label reverses", sf["likely"] != sr["likely"], f"'{sf['likely']}' vs '{sr['likely']}'")
print("  VLM fwd:", fwd["answer"][:300].replace("\n", " "))
print("  VLM rev:", rev["answer"][:300].replace("\n", " "))
save(fwd, "forward")
save(rev, "reverse")

print("\n3. Evidence overlay vs truth (flood pair)")
# truth: pixels that turned to water (NDWI crosses 0 between dates); the samples share their noise field
ndwi = [tools.nd(tools._band(im, "g"), tools._band(im, "nir")) for im in (t1, t2)]
truth = (ndwi[0] <= 0) & (ndwi[1] > 0)
cva = tools.change_cva([t1, t2], {}, CHANGE_Q)["mask"]
iou = (cva & truth).sum() / max((cva | truth).sum(), 1)
check("mask matches new-water pixels (IoU > 0.5)", iou > 0.5,
      f"IoU={iou:.2f}, truth={truth.mean() * 100:.2f}% of scene, mask={cva.mean() * 100:.2f}%")
painted_on = [lbl for lbl, _ in fwd["images"] if lbl.startswith("evidence")]
check("mask shown over both dates", len(painted_on) >= 2, f"evidence layers: {painted_on}")

print("\n4. Routing")
single = router.run("Describe the land-cover and major objects visible in this image.", [t1])
sar = load("risat_sar.tif", "sar")
fused = router.run("Use the optical and SAR images together to identify built-up and water-covered regions.", [t1, sar])
print("  single plan:", single["trace"]["plan"], "| config:", single["trace"]["input_config"])
print("  opt+SAR plan:", fused["trace"]["plan"], "| config:", fused["trace"]["input_config"])
check("single uses no SAR/fusion tools", not any("sar" in p or "fus" in p for p in single["trace"]["plan"]), "")
ws = step(fused, "water_sar")
check("water_sar ran on the SAR input", ws["status"] == "ok", f"stats={ws['stats']}")
fw = step(fused, "fuse_water")
check("fusion used both masks", fw["status"] == "ok", f"stats={fw['stats']}")
print("  VLM single:", single["answer"][:300].replace("\n", " "))
print("  VLM fused:", fused["answer"][:300].replace("\n", " "))
save(fused, "optsar")

print(f"\n{sum(ok for _, ok in results)}/{len(results)} checks passed")
raise SystemExit(0 if all(ok for _, ok in results) else 1)  # gate for the Kaggle re-upload
