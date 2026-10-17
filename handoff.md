# handoff.md: SatQuery AI (SIH26167), status 2026-10-17 (end of s6)

Read this first in a new chat, then `prompt.md` (standing orders + decisions), then `REPORT.md` (research v2; the plan's source of truth). Upgrade ideas from testing live in `thought.md`. Security model and audit summary: `SECURITY.md`.

## What it is
SIH 2026 PS **SIH26167** (ISRO/SAC): an agentic vision-language assistant for remote-sensing images, driven by text queries. The team has already submitted the idea.

| # | Mandatory feature | Status |
|---|---|---|
| M1 | RS fine-tune on BigEarthNet.txt | **Not started**: the next big task |
| M2 | Single-image VQA | Works (zero-shot qwen3.5:2b + tool evidence) |
| M3 | Captioning **or** grounding | Both work. Grounding = VLM bbox (0–1000) ∩ index mask |
| M4 | Bi-temporal change-VQA | Works (CVA + Otsu with a `noise_k`·median floor, NDVI/NDWI deltas, `likely` label incl. `no change`, VLM). Mask painted on both dates. Identity bug fixed s6 |
| M5 | Optical + SAR joint analysis | Works (NDWI + SAR Otsu water, fusion, built-up fusion) |
| M6 | Agent with tool registry + auditable trace | Works (router + REGISTRY, per-step trace) |
| M7 | GUI + downloadable report | Works (React UI, HTML report, trace JSON) |

Hidden evaluation uses Cartosat-2S (4-band MX) and RISAT SAR GeoTIFF pairs. **Everything so far is tested on synthetic GeoTIFFs only.**

## Constraints
- Laptops have at most **4 GB VRAM** (this machine: Quadro T1000 4 GB). No local training.
- Budget ₹0: no paid keys.
- Serving runs in two modes from the same code:
  - **MAIN:** Kaggle T4 notebook + cloudflared tunnel.
  - **LITE:** laptop Ollama + CPU tools.
  - The UI tries MAIN first and falls back to LITE.

## Status: verified 2026-10-17 (s6)
| Check | Result | When |
|---|---|---|
| `test_smoke.py` (VLM offline path) | `smoke ok` | s6 |
| `cd web && npm run build` | builds clean | s6 |
| `npx oxlint src` | clean | s6 |
| HTTP attack retest (token, Origin, CL+TE, params, size caps, CSP) | 22/22 pass on local test servers | s6 |
| In-process fuzz (VRT/SSRF, EPS, 200 bands, 1x5000, NaN, None filename, bad params …) | 0 crashes, all clean 422s; SSRF listener got 0 hits | s6 |
| Browser (built-in pane): LITE flood + optical/SAR samples, MAIN with wrong/right token, 375 px | works; wrong token shows "MAIN refused"; no horizontal scroll | s6 |
| LITE `/health` + `/samples/*.tif` (laptop :8000) | `vlm_online: true`, samples 200 | s4 |
| New UI, Playwright desktop 1440 + mobile 390 | flood + optical/SAR samples answered end to end; no horizontal scroll | s4 |
| MAIN `/health` (Kaggle tunnel) | `vlm_online: true` | s3 |
| Laptop UI with the MAIN URL saved | status read `MAIN · qwen3.5:2b online`; flood query answered by MAIN in 5.5 s | s3 (old UI) |
| Kaggle dataset vs local code | **stale since s4** (s6 changed `satquery/*`, `web/dist`, the notebook). The uploaded zip has the old unauthenticated, SSRF-able code; the new notebook refuses to open the tunnel on it. Upload a new version before MAIN | s6 |
| Gradio fallback `satquery.ui` | imports OK | s6 |
| `test_behaviour.py` (4 behaviour tests) | **9/9 pass** (was 7/9 in s5); exits 1 on any FAIL | s6 |
| Security audit (security-audit skill, quick, 10 agents) | 0 confirmed, 5 needs-validation leads (all fixed), 3 deferred units; see `SECURITY.md` | s6 |

## Behaviour tests (s5, 2026-10-16; s6 re-run: 9/9)
Script: `.venv\Scripts\python test_behaviour.py` (in-process pipeline, Ollama on). Overlays saved to `.playwright-mcp/behaviour/`. Data: the synthetic `samples/` only.

| # | Test | Result | Numbers |
|---|---|---|---|
| 1 | **Identity pair** (T1 as both dates) | **s5 FAIL → s6 PASS** (changed_pct 0.0, `likely: no change`; `otsu()` returns max on flat input) | `change_cva` changed_pct **100.0 %**, threshold −0.498. Cause: the magnitude is all zeros, so `otsu()` gets one histogram bin and returns its lower edge; `mag > −0.498` marks every pixel. The VLM looked at the images and said "identical, no visible change", then called the 100 % an artefact. The tool contradicts itself and the answer only partly recovers. |
| 2 | **Reverse order** (T2 → T1) | **PASS (tool)**, VLM text shaky | changed_pct 6.59 % both ways (CVA magnitude is symmetric). NDWI delta +1.164 → −1.164, NDVI −0.917 → +0.917, label `new water / flooding` → `water loss`. The VLM got the direction right but misquoted numbers in reverse ("NDVI decrease (−1.164) and NDWI increase (−1.164)"). Forward it invented "replaced by a large white circular shape" (the circle is in both dates). |
| 3 | **Evidence overlay** (is the flood really detected?) | **Detection PASS; display s5 FAIL → s6 PASS** (`"on": [0, 1]`, layers `change_cva on input 1/2`) | Mask vs truth (pixels whose NDWI crosses 0 between dates): **IoU 1.00**, 6.59 % of scene. So the flood is measured, not just described. But the mask is painted only on T2 (`"on": 1`), not on both dates as the test asks. Caveat: IoU 1.00 is because the synthetic pair shares one noise field; real scenes will be far lower. |
| 4 | **Routing** (single vs optical + SAR) | **PASS** | Single "describe" → plan `[vlm_caption]` only (no SAR/fusion tools, but also no measured tool at all). Optical + SAR → `[water_optical, water_sar, fuse_water, builtup_fusion, vlm_vqa]`. SAR is really used: `water_sar` water 12.63 % at −16.91 dB, fusion pixel agreement 0.983 (both 10.94 %, SAR-only 1.69 %, optical-only 0 %), `builtup_fusion` thresholds SAR backscatter. The VLM also receives the SAR preview. |

Overall (s5): the measuring tools behave well except the identity case (fixed s6); most of the weakness is in the 2B VLM's wording (invented objects, misquoted numbers). That is M1's job. Fix ideas, in order, are in `thought.md`.

## Done
- **Research** → `REPORT.md` v2. **Session memory** → `prompt.md`.
- **Backend `satquery/`**:
  - `validate.py`: GeoTIFF/PNG read, modality guess, Cartosat band map (B, G, R, NIR), SAR→dB, pair checks.
  - `tools.py`: `REGISTRY`.
    - CPU tools: `water_optical` (NDWI), `water_sar` (Otsu dB), `fuse_water`, `builtup_fusion`, `change_cva`.
    - `change_cva` adds `ndvi_delta_in_changed`, `ndwi_delta_in_changed` and a word label `likely` ("new water / flooding", "vegetation loss" …).
    - VLM tools: `vlm_vqa`, `vlm_caption`, `vlm_ground`, `vlm_change`. `vlm_ground` returns a readable sentence plus the raw output.
  - `router.py`: keyword intent → plan → run → trace, evidence, confidence, overlays. Masks are painted solid `rgb(228,48,32)` (s4; a 60 % blend turned brown over green vegetation). The UI legend uses the same colour.
  - `vlm.py`: OpenAI-compatible client, configured by env vars:
    - `VLM_URL`, `VLM_MODEL`, `VLM_MAX_SIDE`.
    - `VLM_REASONING` (default `none`). This turns qwen3.5 thinking off; with thinking on, every token went to reasoning and the answer came back empty.
    - It strips markdown and emoji from answers, and raises an error on an empty answer.
  - `server.py`: FastAPI `/query` (runs in a thread, so `/health` never blocks), `/health` (reports `vlm_online`), HTML report (light stylesheet, system fonts, works offline, own CSP), serves `samples/` at `/samples` (s4, only if the folder exists) and `web/dist` at `/`. s6 security: `guard` middleware (foreign Origin → 403, Transfer-Encoding → 411, Content-Length cap → 413, `SATQUERY_TOKEN` → 401, all before body parsing), CORS allowlist, TrustedHost, `MAX_BUSY` 503, params numbers-only, security headers, docs off. Details in `SECURITY.md`.
  - `ui.py`: Gradio fallback UI (`MAIN_URL` + `MAIN_TOKEN` env, https only, then LITE). Decodes MAIN images as PNG only.
- **React frontend `web/`** (redesigned s4 to drop the AI-slop look; rules in `web/README.md`):
  - Stack: Vite 8, React 19, Tailwind v4, Phosphor icons, Atkinson Hyperlegible Next + Mono. `motion`, Geist and the vendored React Bits were removed; motion is CSS only.
  - Light "survey sheet" look for projector demos: ink + 1px rules, one data colour (mask red `rgb(228,48,32)`, painted solid by `router.py`).
  - `src/App.jsx`: sticky query column (image slots A/B + modality, question, example list, tool-param JSON, pinned Run button), sample-scene loader in the empty state (fetches `/samples/*.tif`, served by `server.py`), answer + readings row (task, input, served by, confidence), neatline image viewer with pixel ticks + layer strip, evidence tables, expandable trace, report and trace downloads, server status + Server panel.
  - `src/index.css`: design tokens (OKLCH palette, fonts, neatline ticks, CSS transitions).
  - `src/api.js` holds the MAIN URL + access token (localStorage keys `satquery.main`, `satquery.token`, set from the **Server** panel; URL must be https except localhost) with fallback to LITE. 401/413/422 from MAIN are shown, not hidden behind LITE.
  - Sample-scene buttons need the laptop server (`/samples`). The Kaggle zip has no `samples/`, so on a MAIN-served UI they show an error and you drop files instead.
  - Verified with Playwright on desktop and at 390 px mobile width (no horizontal scroll).
- **`samples/`**: synthetic 256 px demo GeoTIFFs: `cartosat_t1.tif`, `cartosat_t2_flood.tif`, `risat_sar.tif`. The UI's empty state loads them in one click (flood pair, optical + SAR, single scene).
- **LITE model**: Ollama 0.40.5 (winget; the tray app serves :11434), `qwen3.5:2b` (Q8_0, 2.7 GB, vision + thinking).
  - About 3.1 GB VRAM in use; 4–10 s per answer.
  - Grounding bbox comes back in **0–1000 normalized** coords.
  - Ollama returns logprobs, so VLM confidence works.
- **MAIN `kaggle/main_server.ipynb`**, run and verified:
  - Kaggle account `aspirekineticnetwork` (phone-verified).
  - Private dataset `aspirekineticnetwork/satquery-app` (Kaggle auto-unzips the upload).
  - Notebook `notebook33eb0448bc` (GPU T4 x2, Internet on).
  - Run All → URL takes about 6 min. The first VLM call is cold (48 s); after that a query takes about 5 s.

## How to run MAIN again (each demo)
1. Code changed? (**Yes since s4.**) On the laptop, run in PowerShell from the project root:
   ```
   tar -a -cf satquery-app.zip --exclude=__pycache__ satquery web/dist requirements.txt
   ```
   Then on Kaggle: dataset `satquery-app` → **New Version** → upload the zip.
2. kaggle.com → Code → `notebook33eb0448bc` → Edit → **Run All** (needs GPU T4 + Internet on).
   - Optional but needed for **Save & Run All**: Add-ons → Secrets → add `SATQUERY_TOKEN` (any long random string) and attach it to the notebook. Without it the notebook makes a fresh token and prints it (interactive runs only).
   - The notebook now checks that a tokenless `/query` gets 401 before it opens the tunnel. If it stops with "loaded code does not enforce SATQUERY_TOKEN", the dataset is stale: redo step 1.
3. Copy the `MAIN URL: https://….trycloudflare.com` and `TOKEN:` lines from the output. In the laptop UI click **Server** (top right), paste both, **Save**. The status should read `MAIN qwen3.5:2b online` with a green square. Gradio: set `MAIN_URL` and `MAIN_TOKEN` env vars.
4. The URL (and the generated token) change every run. `/query` needs the token; `/health` is open. Share both with the team only.
5. Stop the session (power button) when done. GPU quota is 30 h/week, and T4 x2 burns it while idle.
6. The Kaggle login lives in the Playwright browser profile. Claude cannot sign in or solve CAPTCHAs for you.

## Session log
- **s1–s3:** research (`REPORT.md`), backend, React UI, LITE on Ollama, MAIN on Kaggle. Details in `prompt.md` status log.
- **s4 (2026-10-16): anti-AI-slop UI redesign.**
  - Research: Reddit (a 3.2M-post ranking of "looks vibe-coded" tells, the unslop-ui threads, a Claude UI thread) via Playwright, since the built-in browser blocks search engines. Domain reference: NASA Worldview.
  - Old UI matched most tells: dark + mint glow, Geist, grid backdrop, 2rem-rounded cards, "01/02/03" steps, pill chips, text scramble, spotlight card.
  - Rebuilt per `web/README.md`. Files changed: `web/src/App.jsx`, `web/src/index.css`, `web/src/main.jsx`, `web/index.html`, `web/public/favicon.svg`, `web/vite.config.js`, `web/package.json` (fonts swapped, `motion` removed), `web/src/bits/` deleted, `satquery/server.py` (`/samples`, report CSS), `satquery/router.py` (solid mask colour).
  - Not done: dark theme (skipped on purpose; the projector scene picks light), check on a real phone, re-uploading the Kaggle dataset.
- **s5 (2026-10-16): behaviour tests.** Added `test_behaviour.py` (identity, reverse order, overlay vs truth, routing). 7/9 checks pass; results in "Behaviour tests" above. No product code changed; fixes are proposed in `thought.md`.
- **s6 (2026-10-16/17): bug fixes, break testing, security audit.**
  - Fixed `thought.md` items 1, 2, 9: flat-input guard in `otsu()` + `noise_k` floor in `change_cva` (identical pair → 0 %, near-identical noisy pair → ~1 % instead of ~50 %), >60 % change note, `likely: no change`, masks on both dates, markdown-rule strip in `vlm.py`, `test_behaviour.py` exits 1 on FAIL. Behaviour 9/9.
  - Break testing (in-process + HTTP + browser) found and fixed: **VRT-in-.tif SSRF + local raster read** (GDAL content sniffing), EPS-in-.png → Ghostscript, 500s on 200-band / 1×5000 / None filename / non-dict params, no auth on public MAIN, CORS `*`, no size/concurrency caps, uncapped VLM `max_tokens`.
  - Security audit (Cloudflare-style `security-audit` skill, quick profile, 4 hunters + critic + 5 verifiers): 5 leads (chunked-TE size bypass, cross-site POST to LITE, Gradio EPS decode of MAIN images, notebook serving stale code without auth, token in saved version output) + critic gap (list params → numpy broadcast bomb). All fixed and re-tested (22/22). Summary `SECURITY.md`; full report outside the repo in `~/security-audit-skill/azie-hackathon-check/run-1/`.
  - Files changed: `satquery/{tools,router,vlm,validate,server,ui}.py`, `web/src/{App.jsx,api.js}`, `kaggle/main_server.ipynb`, `test_behaviour.py`, docs. Kaggle dataset still needs re-uploading.

## Not done / next (in order)
0. **Re-upload the Kaggle dataset** (step 1 of "How to run MAIN") before any MAIN run: the uploaded code has no token and the SSRF bug.
1. **M1 fine-tune on Kaggle** (biggest gap):
   - QLoRA of Qwen3.5-2B (or Qwen3-VL-2B) on a 20–50k BigEarthNet.txt subset plus VRSBench; export GGUF; serve via Ollama `Modelfile`.
   - Fine-tune RemoteCLIP multi-label on the 19 BigEarthNet classes (safety net).
   - Produce a before/after table.
   - Today the zero-shot 2B still hallucinates details (e.g. it invents a "white circle replaced vegetation"), even with the tool labels.
2. **Eval scripts**: VRSBench, RSVQA, CDVQA, BigEarthNet.txt bench split → one results table. Tune the `likely` thresholds on CDVQA.
3. **Real data**: Cartosat/RISAT-like GeoTIFFs (Bhuvan, Copernicus Browser, Sentinel-1/2 over India). Test band order, dB calibration and large tiles (tile + stitch).
4. **MobileSAM** box-prompt refinement for grounding masks.
5. Optional: a public GitHub repo, so Kaggle can `git clone` (set `REPO_URL`) instead of the dataset zip.
6. Security leftovers (see `SECURITY.md`): pin Ollama/cloudflared/pip versions with hashes; audit Gradio's own routes; run the audit leads' sandbox reproductions if a Linux box with a sandbox is available.

## Needed from user/team
- Kaggle account per teammate, phone-verified (done for `aspirekineticnetwork`).
- Hugging Face account + read token (free), for the M1 datasets/models.
- Optional: real Cartosat/RISAT or Sentinel-1/2 GeoTIFFs over an Indian area.

## Run (laptop)
```
.venv\Scripts\python test_smoke.py                                # expect "smoke ok"
.venv\Scripts\python test_behaviour.py                            # 4 behaviour tests, exit 1 on FAIL; Ollama only for VLM text (s6: 9/9)
cd web && npm install && npm run build && cd ..                     # once, or after UI edits
.venv\Scripts\python -m uvicorn satquery.server:app --port 8000     # UI + API at http://127.0.0.1:8000
cd web && npm run dev                                               # UI hot reload at :5173, proxies /query /health /samples to :8000
.venv\Scripts\python -m satquery.ui                                 # Gradio fallback, http://127.0.0.1:7860
```
- The venv is Python 3.12 (`.venv`), because system Python 3.14 lacks gradio/rasterio wheels.
- Ollama must be running for real answers: the tray app, or `ollama serve`.
- `.playwright-mcp/` holds test screenshots/logs only and is safe to delete (its `satquery-app.zip` is the old, vulnerable upload).
- Serving LITE on another port/host? Add it to `CORS_ORIGINS` and `ALLOWED_HOSTS` (env), or the browser gets 403/400. Knobs in `SECURITY.md`.

## Known ceilings (marked `ponytail:` in code)
- Scenes are downsampled to 1024 px max; tile and stitch later.
- Modality auto-guess: 2 bands or fewer means SAR. Pass the modality explicitly for panchromatic images.
- `change_cva` noise floor `noise_k` (default 2.0 × median magnitude) is a calibration knob; tune on CDVQA no-change pairs. A change over 60 % of the scene is flagged as probable misregistration.
- SAR water uses Otsu, which always splits the image, so a scene with no water still yields a "water" class. Override with `threshold_db`.
- The built-up threshold in dB is only meaningful for calibrated sigma0.
- Intent detection is a keyword table.
- Grounding uses bbox ∩ index mask (no SAM yet).
- `change_cva` `likely` label uses fixed ±0.2 NDVI/NDWI cut-offs.
- Confidence = mean of VLM token probability and tool agreement. It is None if the server omits logprobs.
- LITE has no token (local by design; cross-site browser POSTs are refused). MAIN needs the token. GDAL decode time for big TIFFs has no deadline (bounded by `MAX_BUSY`).
- UI is light only (no dark theme) and desktop-first; on phones the sample buttons sit below the query column.
