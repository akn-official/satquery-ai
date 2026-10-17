"""Gradio UI. Tries MAIN (Kaggle tunnel URL in env MAIN_URL) first, falls back to the in-process LITE pipeline.

Run: python -m satquery.ui
"""
import base64
import io
import json
import os
import re
import tempfile

import gradio as gr
import httpx
from PIL import Image

from .server import handle
from .validate import InputError

MAIN_URL = os.getenv("MAIN_URL", "").rstrip("/")  # e.g. https://xxxx.trycloudflare.com
MAIN_TOKEN = os.getenv("MAIN_TOKEN", "")          # printed by the Kaggle notebook next to the URL
if MAIN_URL and not re.match(r"https://|http://(localhost|127\.0\.0\.1)[:/]", MAIN_URL + "/"):
    raise SystemExit("MAIN_URL must be https:// (the token would travel in clear text)")
REPORT_DIR = tempfile.mkdtemp()  # one dir per UI process; the report is overwritten per query
EXAMPLES = [
    "Describe the land-cover and major objects visible in this image.",
    "Highlight the water body referred to in the query.",
    "What changed between these two dates, and where did the change occur?",
    "Use the optical and SAR images together to identify built-up and water-covered regions.",
    "Has the built-up area increased, decreased, or remained unchanged?",
]


def ask(query, file_a, mod_a, file_b, mod_b, params):
    picked = [(p, m) for p, m in ((file_a, mod_a), (file_b, mod_b)) if p]
    if not picked:
        raise gr.Error("Upload at least one image.")
    files = []
    for p, _ in picked:
        with open(p, "rb") as f:
            files.append((os.path.basename(p), f.read()))
    mods = [m for _, m in picked]
    try:
        params = json.loads(params or "{}")
    except json.JSONDecodeError as e:
        raise gr.Error(f"Params must be JSON: {e}")

    res, served = None, "LITE (this laptop)"
    if MAIN_URL:
        try:
            r = httpx.post(f"{MAIN_URL}/query", timeout=300, headers={"X-SatQuery-Token": MAIN_TOKEN},
                           data={"q": query, "modalities": ",".join(mods), "params": json.dumps(params)},
                           files=[("files", f) for f in files])
            if r.status_code in (401, 413, 422):  # answers, not outages: don't hide them behind LITE
                raise gr.Error(r.text)
            r.raise_for_status()
            res, served = r.json(), f"MAIN ({MAIN_URL})"
        except httpx.HTTPError:
            pass  # MAIN down -> LITE
    if res is None:
        try:
            res = handle(query, files, mods, params)
        except InputError as e:
            raise gr.Error(str(e))

    # PNG only: MAIN's bytes are untrusted, and Pillow sniffing would also run EPS (Ghostscript), PSD, ...
    gallery = [(Image.open(io.BytesIO(base64.b64decode(i["png"])), formats=["PNG"]), i["label"]) for i in res["images"]]
    report = os.path.join(REPORT_DIR, "satquery_report.html")
    with open(report, "w", encoding="utf-8") as f:
        f.write(res["report_html"])
    md = (f"**Answer:** {res['answer']}\n\n**Confidence:** {res['confidence']}\n\n**Evidence:**\n"
          + "\n".join(f"- {e}" for e in res["evidence"]) + f"\n\n_Served by {served}_")
    return md, gallery, res["trace"], report


MODS = ["auto", "optical", "sar"]
with gr.Blocks(title="SatQuery AI") as demo:
    gr.Markdown("# SatQuery AI\nOne image, an optical + SAR pair, or two dates of the same area. GeoTIFF/TIFF (PNG/JPEG for benchmarks).")
    with gr.Row():
        with gr.Column():
            file_a = gr.File(label="Image A (optical, or earlier date)", type="filepath")
            mod_a = gr.Dropdown(MODS, value="auto", label="Image A modality")
        with gr.Column():
            file_b = gr.File(label="Image B (optional: SAR, or later date)", type="filepath")
            mod_b = gr.Dropdown(MODS, value="auto", label="Image B modality")
    query = gr.Textbox(label="Question", value=EXAMPLES[0])
    gr.Examples(EXAMPLES, query)
    with gr.Accordion("Tool parameters (JSON, optional)", open=False):
        params = gr.Textbox(value="{}", label='e.g. {"water_sar": {"threshold_db": -15}}')
    go = gr.Button("Ask", variant="primary")
    answer = gr.Markdown()
    gallery = gr.Gallery(label="Inputs and visual evidence", columns=3)
    trace = gr.JSON(label="Execution trace")
    report = gr.File(label="Download report (HTML, print to PDF)")
    go.click(ask, [query, file_a, mod_a, file_b, mod_b, params], [answer, gallery, trace, report])

if __name__ == "__main__":
    demo.launch(max_file_size="512mb")  # same cap as the server's MAX_UPLOAD_MB default
