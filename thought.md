# thought.md: upgrade ideas (not applied yet)

Found while running the behaviour tests on 2026-10-16 (s5, `test_behaviour.py`, results in `handoff.md` → "Behaviour tests"). These are ranked by value for the hidden evaluation over effort. Nothing here is built; pick from the top.

## 1. ~~Fix: identical images report 100 % change (test 1 fails)~~ DONE s6
- **Done:** `otsu()` returns the max on flat input; `change_cva` threshold = max(Otsu, `noise_k` × median), `likely: no change`, note above 60 %. Test 1 passes.
- **Seen:** T1 vs T1 → `change_cva` changed_pct 100.0, threshold −0.498.
- **Why:** the change magnitude is all zeros. `otsu()` then sees a single histogram bin and returns its lower edge, so `mag > −0.498` marks every pixel.
- **Upgrade:** in `change_cva`, treat a near-flat magnitude (`mag.max() - mag.min() < 1e-6`, or Otsu's between-class variance ≈ 0) as "no change": empty mask, `likely = "no change"`. About 3 lines.
- **Also:** add a noise floor. Use `t = max(otsu(mag), k * median(mag))` so two near-identical real scenes don't get their sensor noise split in half. Here `k` is a calibration knob, tuned on CDVQA no-change pairs.
- **Also:** if changed_pct is above about 60 %, say "probably misregistered or radiometrically different" instead of claiming change.

## 2. Show the change mask on both dates (test 3 display fails): mask part DONE s6
- **Done:** `change_cva` returns `"on": [0, 1]`; the router paints `evidence: change_cva on input 1/2`; the UI layer strip labels them `evidence T1/T2`. The compare slider below is still open.
- **Seen:** the evidence layer is painted on T2 only (`"on": 1`).
- **Upgrade:** let a tool return `"on": [0, 1]`; `router.run` then paints one evidence layer per date (`evidence: change_cva (T1)`, `(T2)`). About 5 lines.
- **UI upgrade:** add a before/after compare slider in the viewer, with T1 and T2 stacked and the top one clipped by `clip-path: inset(0 X% 0 0)` (no new library). This is the most convincing flood demo for judges.

## 3. Give the VLM the "where" in words
- **Seen:** the VLM said "lower-left quadrant". That is roughly right (the mask runs along the river flanks, lower-left to bottom-centre), but it is the VLM's visual guess: the tools give only percentages, so nothing measured backs the "where" part of the question.
- **Upgrade:** a `_where(mask)` helper that returns bbox, centroid and a 3×3-grid phrase ("mostly west-centre, spanning top to bottom"), added to the stats of every mask tool. It is cheap, and the trace, report and VLM all get it.

## 4. Stop the VLM from misquoting numbers
- **Seen:** in reverse order it wrote "NDVI decrease (−1.164) and NDWI increase (−1.164)". Both are wrong; the real values are NDVI +0.917 and NDWI −1.164.
- **Upgrade (cheapest first):**
  - Pass the VLM only word labels (`likely`, direction, location) and keep the numbers out of the prompt. The UI already shows the measured values.
  - Post-check: regex every number in the answer against `stats` and flag or strip any that aren't in the evidence.
  - Answer template: the first sentence is written deterministically from the tools ("6.6 % of the scene changed, likely new water / flooding, mostly west-centre."), and the VLM adds the description after it.

## 5. VLM invents objects (hallucination)
- **Seen:** "green feature replaced by a large white circular shape", but the circle is in both dates.
- **Upgrade:**
  - For change, send the VLM the overlay image (mask in red) plus T2, and prompt "describe only what is inside the red area".
  - Agreement check: if the VLM says "no change" while the tool says change (or the reverse), lower confidence and show both. In test 1 the VLM was right and the tool was wrong.
  - The real fix is M1 (QLoRA on BigEarthNet.txt + VRSBench + a CDVQA subset).

## 6. A single-image caption runs no measuring tool
- **Seen:** "Describe the scene" → plan `[vlm_caption]` only, so the answer has no measured evidence.
- **Upgrade:** a cheap `landcover_stats` tool for every optical single image (NDVI veg %, NDWI water %, bright/low-NDVI built-up %). It runs before the caption, so captions are grounded and the evidence table is never empty.

## 7. Router ignores the question for pairs
- **Seen:** optical + SAR always runs the same five tools, whatever is asked. Bi-temporal always runs `change_cva` + `vlm_change`, even for "describe the second image".
- **Upgrade:** make the plan depend on `(config, intent)`, e.g. optical_sar + ground → water tools + `vlm_ground` on the optical image. It is still a plain table; no agent framework needed.

## 8. Test data is too easy
- **Seen:** overlay IoU is 1.00 because `cartosat_t1/t2` share one noise field and are perfectly co-registered. Real Cartosat/RISAT pairs will score much lower.
- **Upgrade:**
  - Add a harder synthetic pair (independent noise, a 1–2 px shift, a brightness change) to `samples/`, with the true change mask saved alongside.
  - Then get real Sentinel-1/2 pairs over an Indian flood (e.g. Assam, July) from Copernicus Browser.

## 9. Small things
- ~~The caption answer leaked a markdown rule (`---`).~~ DONE s6: `vlm.py` drops lines of 3+ `-`, `*` or `_`.
- ~~`test_behaviour.py` only prints PASS/FAIL.~~ DONE s6: exits 1 on any FAIL.
- Report: put the per-date overlays and the `likely`/where sentence at the top of the HTML report, above the trace.
