"""FastAPI backend. Laptop (LITE) and Kaggle (MAIN) run this same file; only VLM_URL/VLM_MODEL differ.

Kaggle: uvicorn satquery.server:app --host 0.0.0.0 --port 8000  +  cloudflared tunnel --url http://localhost:8000
"""
import asyncio
import base64
import hmac
import html
import io
import json
import os
import pathlib
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from . import router, validate, vlm

# Security knobs (env). Defaults suit the laptop; the Kaggle notebook sets SATQUERY_TOKEN because its tunnel is public.
TOKEN = os.getenv("SATQUERY_TOKEN", "")  # set => POST /query needs header X-SatQuery-Token
ORIGINS = os.getenv("CORS_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5173,http://localhost:5173")
HOSTS = os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost,*.trycloudflare.com")  # blocks DNS rebinding to the laptop
MAX_UPLOAD = int(os.getenv("MAX_UPLOAD_MB", "512")) * 2**20  # whole request body
MAX_QUERY = 2000  # characters
MAX_BUSY = int(os.getenv("MAX_BUSY", "4"))  # queries in flight; more get 503 instead of an unbounded queue
busy = 0
CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
       "connect-src 'self' https: http://localhost:* http://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")

ALLOWED_ORIGINS = [o.strip() for o in ORIGINS.split(",") if o.strip()]

app = FastAPI(title="SatQuery AI", docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")  # registered first = innermost of the three, so its 4xx answers still get CORS headers
async def guard(request: Request, call_next):
    """Header-only checks, run before FastAPI parses (and spools) the multipart body."""
    h = request.headers
    if request.method == "POST":
        # CORS only hides responses; a no-cors form POST from any website still runs. Browsers always send Origin
        # cross-site, so refuse foreign origins (same-origin = the page this server itself served).
        origin = h.get("origin")
        if origin and origin not in ALLOWED_ORIGINS and urlsplit(origin).netloc != h.get("host"):
            return PlainTextResponse("cross-site request refused", 403)
        if "transfer-encoding" in h:  # h11 frames by T-E and ignores Content-Length; the size check needs C-L
            return PlainTextResponse("chunked uploads not accepted; send Content-Length", 411)
        size = h.get("content-length")
        if size is None or not size.isdigit():
            return PlainTextResponse("Content-Length required", 411)
        if int(size) > MAX_UPLOAD:
            return PlainTextResponse(f"upload larger than {MAX_UPLOAD // 2**20} MB", 413)
        if TOKEN and request.url.path == "/query" and not hmac.compare_digest(
                h.get("x-satquery-token", "").encode(), TOKEN.encode()):
            return PlainTextResponse("missing or wrong access token (set it in the UI's Server panel)", 401)
    resp = await call_next(request)
    resp.headers.update({"Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff",
                         "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY"})
    return resp


# laptop UI (127.0.0.1:8000) -> Kaggle MAIN is cross-origin; nothing else needs CORS
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["x-satquery-token"])
app.add_middleware(TrustedHostMiddleware, allowed_hosts=[h.strip() for h in HOSTS.split(",") if h.strip()])

WEB = pathlib.Path(__file__).parent.parent / "web" / "dist"  # React UI, built with: cd web && npm run build


def _png(rgb):
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def report_html(res):
    e = html.escape
    rows = "".join(f"<tr><td>{i + 1}</td><td>{e(s['tool'])}</td><td>{e(s['status'])}</td><td>{s['ms']}</td>"
                   f"<td><code>{e(json.dumps(s['params']))}</code></td><td>{e(json.dumps(s['stats']))}</td>"
                   f"<td>{e(str(s['conf']))}</td><td>{e(s['output'] or '')}</td></tr>"
                   for i, s in enumerate(res["trace"]["steps"]))
    imgs = "".join(f"<figure><img src='data:image/png;base64,{i['png']}'><figcaption>{e(i['label'])}</figcaption></figure>"
                   for i in res["images"])
    t = res["trace"]
    return f"""<!doctype html><meta charset="utf-8"><title>SatQuery AI report</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<style>body{{font:15px/1.5 "Segoe UI",system-ui,sans-serif;color:#1c2029;background:#fbfcfd;margin:32px auto;padding:0 24px;max-width:1100px}}
h1{{font-size:24px}}h2{{font-size:16px;margin-top:32px;padding-bottom:6px;border-bottom:1px solid #d5d9e0}}
table{{border-collapse:collapse;width:100%;font-size:13px}}td,th{{border-bottom:1px solid #d5d9e0;padding:6px 8px 6px 0;vertical-align:top;text-align:left}}
code,pre{{font:13px ui-monospace,Consolas,monospace}}figure{{display:inline-block;margin:0 12px 12px 0}}
img{{max-width:320px;border:1px solid #1c2029;image-rendering:pixelated}}figcaption{{font:12px ui-monospace,Consolas,monospace;color:#5d6470}}</style>
<h1>SatQuery AI report</h1>
<p><b>Query:</b> {e(res['query'])}<br><b>Task:</b> {e(t['task'])} &middot; <b>Input config:</b> {e(t['input_config'])}
&middot; <b>Confidence:</b> {e(str(res['confidence']))}</p>
<h2>Answer</h2><p>{e(res['answer'])}</p>
<h2>Evidence</h2><ul>{''.join(f'<li>{e(x)}</li>' for x in res['evidence'])}</ul>
<h2>Inputs</h2><pre>{e(json.dumps(t['inputs'], indent=1))}</pre>
<h2>Execution trace</h2><table><tr><th>#</th><th>tool</th><th>status</th><th>ms</th><th>params</th><th>stats</th><th>conf</th><th>output</th></tr>{rows}</table>
<h2>Visual evidence</h2>{imgs}"""


def handle(query, files, modalities=None, params=None):
    """files: [(filename, bytes)]. Shared by the HTTP endpoint and the UI's in-process LITE path."""
    if not query.strip():
        raise validate.InputError("empty query")
    if len(query) > MAX_QUERY:
        raise validate.InputError(f"query longer than {MAX_QUERY} characters")
    if not 1 <= len(files) <= 2:  # before decoding anything
        raise validate.InputError("give 1 image, or a pair (optical + SAR, or two dates of the same area)")
    mods = modalities or []
    imgs = [validate.read(data, name, mods[i] if i < len(mods) and mods[i] else "auto")
            for i, (name, data) in enumerate(files)]
    res = router.run(query, imgs, params)
    res["images"] = [{"label": label, "png": _png(rgb)} for label, rgb in res["images"]]
    res["report_html"] = report_html(res)
    return res


@app.get("/health")
def health():
    try:
        online = httpx.get(f"{vlm.VLM_URL}/models", timeout=1).is_success
    except httpx.HTTPError:
        online = False
    return {"ok": True, "vlm_url": vlm.VLM_URL, "vlm_model": vlm.VLM_MODEL, "vlm_online": online}


def _no_nan(c):
    raise ValueError(f"{c} is not allowed in tool parameters")


@app.post("/query")
async def query(q: str = Form(...), files: list[UploadFile] = File(...),
                modalities: str = Form(""), params: str = Form("{}")):  # access token: checked in guard
    global busy
    if not 1 <= len(files) <= 2:  # before reading any part into memory
        raise HTTPException(422, "give 1 image, or a pair (optical + SAR, or two dates of the same area)")
    try:
        p = json.loads(params, parse_constant=_no_nan)
    except (ValueError, RecursionError) as e:  # bad JSON, NaN/Infinity, huge ints, deep nesting
        raise HTTPException(422, f"tool parameters: {str(e)[:200]}")
    if busy >= MAX_BUSY:
        raise HTTPException(503, "server busy, try again in a moment")
    busy += 1  # single event loop: no lock needed
    try:
        uploads = [(f.filename, await f.read()) for f in files]
        return await asyncio.to_thread(handle, q, uploads, [m.strip() for m in modalities.split(",")] if modalities else None,
                                       p)  # thread: VLM calls must not block /health
    except validate.InputError as e:
        raise HTTPException(422, str(e))
    finally:
        busy -= 1


SAMPLES = WEB.parent.parent / "samples"  # the UI's "load a sample scene" buttons fetch these
if SAMPLES.is_dir():
    app.mount("/samples", StaticFiles(directory=SAMPLES), name="samples")
if WEB.is_dir():  # mounted last so /query and /health win
    app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
