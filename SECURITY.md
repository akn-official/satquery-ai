# SECURITY.md: SatQuery AI security model (s6, 2026-10-17)

The full audit lives **outside the repo**, as the audit skill requires: `C:\Users\ashra\security-audit-skill\azie-hackathon-check\run-1\`. It contains `REPORT.md`, `NEEDS-VALIDATION.md`, `findings.json`, `coverage-ledger.json` and `architecture.md`. This file is the short version for the team.

## Who can reach what
| Mode | Who can reach `/query` | Control |
|---|---|---|
| LITE (laptop, uvicorn on 127.0.0.1:8000) | Local processes, and web pages open in your browser | No token (by design). Cross-site browser POSTs get **403** (Origin check). `ALLOWED_HOSTS` blocks DNS rebinding |
| MAIN (Kaggle, public `*.trycloudflare.com`) | Anyone with the URL | **Token required** (`X-SatQuery-Token`, checked before the body is parsed). Cross-site browser POSTs get 403. CORS allows only the laptop UI origins |
| Gradio fallback (`python -m satquery.ui`, 127.0.0.1:7860) | Local only | Gradio's own origin check, `max_file_size="512mb"` |

## Controls in code
- **Uploads** (`satquery/validate.py`):
  - GDAL may only open uploads as GeoTIFF (`driver="GTiff"`). Before this pin, a VRT file renamed `.tif` made the server fetch any URL (SSRF) and read any raster file on its disk. Both were reproduced locally, then fixed.
  - PIL may only open PNG and JPEG (`formats=[...]`). Before this pin, EPS bytes renamed `.png` would reach Ghostscript.
  - Size caps:
    - at most 16 bands;
    - at most 300 Mpx per band for TIFF (decimated read to 1024 px);
    - at most 50 Mpx for PNG/JPEG (decoded in full);
    - at least 8 px on each side.
- **Request guard** (`satquery/server.py` `guard`, headers only, runs before multipart parsing):
  - foreign `Origin` gets 403;
  - `Transfer-Encoding` gets 411 (otherwise a chunked body could slip past the size cap);
  - a missing or oversize `Content-Length` gets 411 or 413 (`MAX_UPLOAD_MB`, default 512);
  - a wrong or missing token gets 401 (only when `SATQUERY_TOKEN` is set).
- **Endpoint:**
  - 1–2 files, checked before any part is read;
  - query at most 2000 characters;
  - `params` must be JSON objects of finite numbers or null (no NaN or Infinity, no lists, strings or bools, no deep nesting);
  - at most `MAX_BUSY` (4) queries in flight, otherwise 503.
- **VLM:** `max_tokens` capped at 1024 whatever the client sends. The VLM URL comes from env only.
- **Output:**
  - every string in the HTML report is `html.escape`d, and the report carries its own CSP (`default-src 'none'`);
  - the React UI has no HTML sinks;
  - responses carry CSP, nosniff, `no-referrer` and `X-Frame-Options: DENY`;
  - OpenAPI/docs are off.
- **Browser UI:** the MAIN URL must be `https://` (plain http only for localhost). The token goes only to MAIN, and a 401/413/422 from MAIN is shown instead of silently falling back to LITE.
- **Gradio UI:** decodes MAIN's images as PNG only, requires an https `MAIN_URL`, and keeps one report temp dir per process.
- **Kaggle notebook:**
  - takes the token from the Kaggle secret `SATQUERY_TOKEN`, or makes a fresh one and prints it in interactive runs only;
  - refuses Save & Run All without a secret, because the version log would keep the token;
  - binds uvicorn to 127.0.0.1;
  - asserts that a tokenless `/query` returns 401 **before** opening the tunnel, so stale dataset code fails closed;
  - requires exactly one attached dataset.

## Env knobs
`SATQUERY_TOKEN`, `CORS_ORIGINS` (comma list; default is the laptop UI origins on :8000 and :5173), `ALLOWED_HOSTS` (default `127.0.0.1,localhost,*.trycloudflare.com`), `MAX_UPLOAD_MB` (512), `MAX_BUSY` (4). In the Gradio UI: `MAIN_URL` and `MAIN_TOKEN`. If you serve LITE on another port or host, add it to `CORS_ORIGINS` and `ALLOWED_HOSTS`, or browsers get 403/400.

## Audit result (run-1, quick profile, 10 agents)
- **0 confirmed.** This Windows machine has no OS sandbox, so the audit agents could only read source, and a lead cannot be confirmed without a local run.
- **5 leads needed validation. All 5 are fixed in code and re-tested over HTTP (22/22 pass):**
  - chunked-body size bypass;
  - cross-site POST to LITE;
  - Gradio EPS decode of MAIN images;
  - notebook serving stale code without auth;
  - token printed into saved version output.
- **3 units deferred by the final critic:**
  - Gradio's own routes;
  - list-valued params broadcasting into huge arrays: **fixed** (numbers only);
  - error-text disclosure: accepted, since the trace shows tool errors on purpose and `/health` reveals only the localhost VLM URL and model.

## Still open (accepted risks / to do)
- **Re-upload the Kaggle dataset before the next MAIN run.** The uploaded zip still has the old code, with no token and the SSRF-able `validate.py`. The new notebook now refuses to start the tunnel on it.
- Ollama `curl | sh`, cloudflared `latest` and the pip requirements are unpinned and unchecksummed. Pin versions with hashes when time allows.
- GDAL decodes every block of a TIFF of up to 300 Mpx × 16 bands, with no time limit (a CPU cost, bounded by `MAX_BUSY`).
- The MAIN token sits in localStorage on the laptop UI origin, shared by anything else served on 127.0.0.1:8000.
- Gradio framework routes are not audited.
