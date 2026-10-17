# SatQuery AI

An agentic vision-language assistant for remote-sensing images, driven by plain-language questions. Smart India Hackathon 2026, problem statement **SIH26167**.

[![SatQuery promo (click to play)](video/satquery-promo-cover.png)](video/satquery-promo.mp4)

**[Watch the promo (30 s, 1080p)](video/satquery-promo.mp4)**. The scenes in the film are synthetic test scenes; every number, answer, trace and box on screen is real SatQuery output on them (see [video/source/BRIEF.md](video/source/BRIEF.md)).

## What it does

| Feature | Status |
|---|---|
| Single-image VQA | Works (qwen3.5:2b + measured tool evidence) |
| Captioning and grounding | Both work. Grounding = VLM box ∩ index mask |
| Bi-temporal change VQA | Works (CVA + Otsu, NDVI/NDWI deltas, a `likely` label) |
| Optical + SAR joint analysis | Works (NDWI + SAR water, fusion, built-up fusion) |
| Agent with a tool registry and an auditable trace | Works (router + REGISTRY, per-step trace) |
| GUI + downloadable report | Works (React UI, HTML report, trace JSON) |
| Remote-sensing fine-tune on BigEarthNet | Not started |

Two serving modes from the same code: **MAIN** (Kaggle T4 notebook + cloudflared tunnel, `kaggle/main_server.ipynb`) and **LITE** (laptop Ollama + CPU tools). The UI tries MAIN first and falls back to LITE.

## Run (laptop, Windows)

```
python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
ollama pull qwen3.5:2b                                              # and keep Ollama running
cd web && npm install && npm run build && cd ..
.venv\Scripts\python -m uvicorn satquery.server:app --port 8000     # UI + API at http://127.0.0.1:8000
.venv\Scripts\python test_smoke.py                                  # expect "smoke ok"
.venv\Scripts\python test_behaviour.py                              # behaviour tests, exit 1 on FAIL
```

## Layout

- `satquery/`: backend (validation, tools + REGISTRY, router, VLM client, FastAPI server, Gradio fallback).
- `web/`: React UI (design rules in `web/README.md`).
- `kaggle/`: MAIN server notebook.
- `samples/`: synthetic test GeoTIFFs.
- `video/`: the promo, its cover and shot sheet, and `source/` (scene, score and scene-generation scripts; renders with the promo-video-generator toolkit).
- `REPORT.md` (research), `SECURITY.md` (security model + audit), `handoff.md` / `prompt.md` (project state), `output/pdf/` (operating and presentation guide).
