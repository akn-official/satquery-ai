# SatQuery AI: SIH 2026 PS SIH26167 (ISRO/SAC) research report, v2

Date: 2026-10-16 · v2 adds the low-hardware constraint (team laptops have at most **4 GB VRAM**) and Reddit research.
Covers what to build, the backend/frontend split, which keys you need, the agent design, models, data, hardware and cost. Target cost: ₹0.

---

## 0. TL;DR

1. **The PS ID is SIH26167** (row #94 on sih.gov.in, ISRO, Software, Space Technology). Idea submission for it closed on 5 Oct 2026; your team submitted, so that's fine.
2. **A 4 GB laptop is enough to *run* the app, not to train it.** Train on Kaggle's free GPUs. Serve heavy inference from a Kaggle notebook. The laptop runs the UI plus a tiny quantised fallback model.
3. **Use one small multimodal model for everything** (Qwen3.5-2B or Qwen3-VL-2B). Fine-tune it with QLoRA on BigEarthNet.txt and export it to GGUF. At Q4 it is about 2.4 GB, so it fits in 4 GB.
4. **No paid keys and no LangChain.** The "agent" is a Python router plus a tool registry, and the PS only judges the visible trace anyway.
5. **Belt and braces for M1 (RS adaptation):** also fine-tune a small CLIP/ViT on BigEarthNet's 19 land-cover labels. It is cheap, gives reliable numbers, and covers M1 even if the VLM LoRA comes out weak.

---

## 1. What the PS demands (official text, condensed)

**Inputs:** a single optical/MS **or** SAR image, a co-registered optical+SAR pair, or a bi-temporal pair. The format is GeoTIFF/TIFF; PNG/JPEG is accepted only for the public benchmarks.

| # | Mandatory | Note |
|---|---|---|
| M1 | Fine-tune or adapt at least one visual or VL component on BigEarthNet.txt (or other open data) | "Generic LLM/VLM without RS adaptation will NOT satisfy" |
| M2 | Single-image **VQA** | |
| M3 | Plus captioning **or** text-guided grounding | |
| M4 | Bi-temporal **change description or change-VQA** | Change map is optional |
| M5 | **Optical+SAR** joint extraction | Built-up and water |
| M6 | **Agentic orchestration** from a predefined registry, with an auditable trace | Only the trace is judged |
| M7 | GUI/web app with upload check, visual evidence, confidence, execution summary and **downloadable report** | |

**Evaluation** uses the VRSBench and RSVQA test splits (caption/grounding/VQA), the CDVQA test split (change-VQA), and a **hidden ISRO/SAC set of Cartosat-2S optical (4-band MX: B, G, R, NIR) and RISAT SAR pairs**. Scores are normalised and combined.

The SAC mentors are Aminur Hossain, Sanjay K Singh and S Devakanth Naidu; their emails are on the PS page.

---

## 2. Hardware reality: 4 GB VRAM (with Reddit evidence)

Measurements from r/LocalLLaMA on an RTX 3050 Ti 4 GB laptop with Ollama, Q4_K_M and 4k context:

| Model | VRAM | Speed | Fits? |
|---|---|---|---|
| qwen3.5:0.8b | ~1.4 GB | 122 tok/s | yes |
| **qwen3.5:2b-q4_K_M** | ~2.4 GB | 96 tok/s | **yes, the sweet spot** (multimodal and does tool calls) |
| qwen3.5:4b | ~3.4 GB | 25 tok/s | about a third spills to CPU, slow |
| 9b | ~8 GB | 8.6 tok/s | no |

Source: r/LocalLLaMA "Local agent workspace on a 4GB laptop GPU (RTX 3050 Ti)" (2026-07).

Other Reddit data points:
- **Fine-tuning a 3B with 4-bit LoRA on a 3050 4 GB took about 2 days** (r/huggingface, 2026-08). So don't train on the laptop; use Kaggle.
- On vision, **Qwen3.5-2B beats Gemma-4-E2B** (r/LocalLLaMA Raspberry Pi 5 benchmark, 2026-04). Gemma is better at text reasoning, Qwen at images.
- **Kaggle's free tier gives 2× T4 (about 30 GB VRAM total) for roughly 30 h/week.** People run Qwen 27B there at 10–40 tok/s and expose it through ngrok or cloudflared as an OpenAI-compatible API (r/AI_India and r/LocalLLM, 2026-08/09).
  - **Warning from the same thread:** "I did something similar in the past. My account got banned." Pooling friends' accounts behind one proxy is a ToS grey area, and Kaggle's terms say one person per account, for personal non-commercial use. Rule: each teammate uses only their own account, for their own sessions, with no shared proxy farm.
- A 450M VLM (LFM2.5-VL) on Sentinel-2 with `llama-server` plus Streamlit is a working public example. The Liquid AI cookbook also has a VRSBench fine-tune recipe (r/LocalLLaMA wildfire post, 2026-05). Commenters' consensus: "out of the box a 450M VLM isn't good, you must fine-tune to close the gap."
- r/remotesensing on S1+S2 fusion: when scenes are co-registered, "simply adding the extra bands can be considered fusion". Watch dtypes: S2 is int16 reflectance, S1 RTC is float32 **linear** (convert to dB). This validates the simple band-stack and threshold approach for M5.
- SIH threads (r/Btechtards, r/developersIndia) had no technical content for this PS. No public Reddit thread about SatQuery or SIH26167 exists, so the competition is visible only on GitHub (30+ repos).

**Plan that follows from this:**

```
TRAIN      → Kaggle T4 (free, own account each)        QLoRA, export GGUF
SERVE-MAIN → Kaggle notebook: FastAPI + model on T4    cloudflared tunnel URL
SERVE-LITE → laptop 4GB: llama.cpp/Ollama GGUF Q4 2B   + CPU rule tools
UI         → laptop: React web UI served by FastAPI (talks to MAIN, falls back to LITE)
```
The demo must still work if Kaggle is down, so LITE mode is not optional.

---

## 3. Keys, agents, accounts

| Thing | Need? | Note |
|---|---|---|
| OpenAI / Claude / Gemini **paid** | **No** | |
| **Hugging Face** account + token | **Yes** (free) | Downloads, plus a free model repo for your LoRA/GGUF |
| **Kaggle** account, phone-verified | **Yes** (free) | Training and the MAIN server |
| **cloudflared** quick tunnel | **Yes** (free, no account) | Exposes Kaggle FastAPI to the laptop. ngrok also works but needs a free authtoken |
| Ollama or llama.cpp | **Yes** (free) | Laptop LITE mode |
| Gemini Flash free key / Groq free key | **Optional** | Only for parsing query intent from *text*. **Never send imagery**: the free tier may use data for training, and ISRO data is sensitive. A keyword router covers this anyway |
| LangChain / CrewAI / AutoGen | **No** | The judged trace must come from a fixed registry. A plain Python router is more auditable and lighter on RAM |
| Vector DB, user accounts, cloud DB | **No** | Out of scope |
| Shared access token for MAIN | **Yes** (free, s6) | The tunnel is public: `/query` on MAIN needs `SATQUERY_TOKEN` (a Kaggle secret, or generated per run). See `SECURITY.md` |

**The agent is about 60 lines of Python:**
```
intent = classify(query)            # keyword table; fallback = same VLM asked "which task?"
config = validate(images)           # single | optical+SAR | bi-temporal  (+ reasons if rejected)
plan   = PLANS[(intent, config)]    # ordered tool names from REGISTRY
for t in plan: out[t] = REGISTRY[t].run(imgs, **REGISTRY[t].allowed(params))
answer, conf = fuse(out)            # VLM text + index/mask evidence agreement
trace  = [{tool, params, ms, conf, output_ref} ...]   # shown in UI + report
```

---

## 4. Models: picked for 4 GB laptop + free T4

| Role | Primary | Laptop (LITE) | Kaggle (MAIN) |
|---|---|---|---|
| **Core VLM**: VQA, caption, grounding boxes, SAR as false-colour, 2-image change Q&A | **Qwen3.5-2B** (`Qwen/Qwen3.5-2B`, GGUF at `unsloth/Qwen3.5-2B-GGUF`) **plus your own QLoRA on BigEarthNet.txt + VRSBench** | Q4 GGUF ~2.4 GB ✔ | bf16/4-bit ✔ |
| Alt core | `Qwen/Qwen3-VL-2B-Instruct` (strong boxes and grounding, official GGUF) | ✔ | ✔ |
| Already RS-adapted starting point | `AdaptLLM/remote-sensing-Qwen2.5-VL-3B-Instruct` (EMNLP'25) or `AdaptLLM/remote-sensing-Qwen2-VL-2B-Instruct` (GGUF exists) | 2B ✔, 3B tight | ✔ |
| Heavy expert (MAIN only) | **EarthDial-4B** (`akshaydudhane/EarthDial_4B_RGB` / `_MS`): RGB, MS, SAR, temporal | ✖ | ✔ (~8 GB fp16) |
| M1 safety net: classifier | **RemoteCLIP ViT-B/32** (`MVRL/remote-clip-vit-base-patch32`), fine-tuned multi-label on BigEarthNet's 19 classes (S2 RGB + S1 composite) | ✔ CPU/GPU <1 GB | ✔ |
| Grounding mask | VLM bbox → **MobileSAM / SAM2-tiny** box prompt | ✔ (~0.5 GB, CPU OK) | ✔ |
| Change map | CVA + Otsu on co-registered pair (numpy, CPU) | ✔ | ✔ |
| Optical+SAR rules | NDWI(G,NIR) ∩ VV < ~-15 dB → water; NDBI / high VV + texture → built-up (tune thresholds) | ✔ CPU | ✔ |
| Tiny fallback | `LiquidAI/LFM2.5-VL-450M` (Liquid cookbook has a VRSBench fine-tune) | ✔ even on CPU | |

Why one 2B core: one fine-tune, one GGUF, one prompt format, and it runs on every machine you own. Lazy and robust. Only add EarthDial on MAIN if eval numbers show a clear gain.

Dropped from v1: TEOChat-7B, which is too heavy for the laptop and not needed when the 2B model gets two images plus CVA stats. GeoChat-7B is optical-only and old.

---

## 5. Datasets (free)

| Name | Use | Where | Size / tip |
|---|---|---|---|
| **BigEarthNet.txt** | M1 fine-tune: S1+S2, 464k pairs, 9.6M texts (captions, binary/MCQ VQA, referring boxes); the `bench` split has 1,082 pairs for eval | HF `BIFOLD-BigEarthNetv2-0/BigEarthNet.txt` (one parquet, ~470 MB) + images from bigearth.net (BigEarthNet v2.0) | Full images are ~100+ GB. **Take a 20–50k pair subset.** Patches are 120×120 px, so they're cheap to train on |
| VRSBench | Eval for caption/grounding/VQA; also good training data | HF `xiang709/VRSBench` | ~12 GB |
| VRSBench-SAR | SAR caption/VQA/refer annotations | HF `xiang709/VRSBench-SAR` | Small (cc-by-nc) |
| RSVQA LR/HR | VQA eval | HF `dmarsili/RSVQA-LR-2k`, `-HR-2k` | Small |
| CDVQA | Change-VQA eval (built on SECOND) | HF `ljx620/CDVQA`, github YZHJessica/CDVQA | The HF copy is ~123 GB, so use the test subset only |
| AdaptLLM remote-sensing-visual-instructions | Extra instruction data | HF | Optional |

Kaggle tip: attach datasets as Kaggle *inputs* (they don't count against the 20 GB working disk) or stream subsets from HF.

Realistic test data matching the hidden set: Bhuvan (bhuvan.nrsc.gov.in) Cartosat/Resourcesat samples, and Sentinel-1/2 from Copernicus Browser (free login) over Indian rivers and cities, for optical-SAR and bi-temporal pairs.

---

## 6. Backend vs frontend

**Backend (Python 3.11 + FastAPI): this is the product**
- `validate.py`: rasterio checks bands, dtype, CRS, transform, overlap and size. It guesses SAR vs optical (1–2 float bands or a dB range means SAR). It converts linear SAR to dB, maps 4-band MX (B, G, R, NIR) to RGB for the VLM, and keeps NIR for the index tools. On a bad input it abstains and gives a reason.
- `router.py`: intent, plan table and trace.
- `registry.py`: name → (fn, allowed_params, version).
- `tools/`: `vlm.py` (llama.cpp server **or** transformers, same prompt), `clip_cls.py`, `indices.py`, `sar.py`, `change.py`, `ground.py` (bbox → MobileSAM).
- `report.py`: an HTML report (overlays + answer + trace table) that the user prints to PDF from the browser.
- `eval/`: VRSBench, RSVQA, CDVQA and BigEarthNet.txt bench runners → one results table.
- Endpoints: `POST /query` and `GET /health` (the report comes back inside the `/query` JSON; no `/report/{id}` was needed). **The same code runs on Kaggle (MAIN) and on the laptop (LITE)**; only `VLM_URL` and `SATQUERY_TOKEN` change.

**Frontend: thin**
- ~~Gradio, one file~~ **Update 2026-10-16:** the frontend is now a React app (`web/`: Vite, Tailwind v4, Phosphor icons, Atkinson Hyperlegible fonts, CSS-only motion) served by FastAPI at `/`. It has upload, sample scenes, answer + confidence, image + mask overlays, evidence tables, trace, and report download. s4 redesigned it to avoid the generic AI-generated look (rules in `web/README.md`). Gradio `satquery/ui.py` stays as a fallback.
- Leaflet map view: only if time remains. Function wins SIH, not polish.
- *As built:* the backend is the `satquery/` package (`validate.py`, `tools.py` with REGISTRY, `router.py`, `vlm.py`, `server.py`), a flatter layout than the one sketched above. See `handoff.md`.

---

## 7. Build order (about 3 weeks part-time)

Progress 2026-10-16: steps 1–3 done (frontend became React, not Gradio; MAIN verified live on Kaggle). The UI polish from step 6 was pulled forward in s4 (redesign). s5 behaviour tests (identity, reverse order, overlay, routing): 7/9 pass, see `handoff.md`; fix list in `thought.md`. s6 fixed the failing two (9/9), ran break testing and a security audit, and hardened the server (see `SECURITY.md`). Step 4 (M1) is next.

1. **Days 1–2:** UI, FastAPI, validator, router with stub tools, and trace JSON, end to end on the laptop.
2. **Days 3–4:** Plug in Qwen3.5-2B GGUF via Ollama/llama.cpp (LITE) plus the CPU tools (indices, SAR, CVA). Every mandatory M2–M7 flow works at zero-shot quality.
3. **Days 5–6:** Kaggle notebook: same backend, model on T4, cloudflared URL. The laptop UI switches between MAIN and LITE.
4. **Days 7–11 (M1):** Unsloth/PEFT QLoRA on a BigEarthNet.txt subset (S2 RGB + S1 false-colour) plus VRSBench, 1–2 epochs, each teammate on their own quota. Merge the weights and export GGUF Q4. In parallel, fine-tune RemoteCLIP on the 19 BigEarthNet labels. Produce a **before vs after table** on the `bench` split.
5. **Days 12–15:** Eval scripts for VRSBench, RSVQA and CDVQA subsets. Confidence = token probability × agreement between tools (e.g. VLM says "water" and NDWI agrees). Add abstain rules.
6. **Days 16+:** Cartosat/RISAT robustness (4-band MX, large tiles via tile-and-stitch, dB), the downloadable report, and UI polish.

---

## 8. Cost

| Item | ₹ |
|---|---|
| Kaggle GPU (training + MAIN) | 0 |
| HF hosting of LoRA/GGUF | 0 |
| cloudflared / ngrok free | 0 |
| Ollama / llama.cpp / Gradio / FastAPI | 0 |
| Optional Gemini/Groq free key (text only) | 0 |
| **Total** | **0** |

Avoid HF Pro/ZeroGPU, Colab Pro, paid APIs and cloud VMs. Lightning AI's free tier (reported ~80 GPU h/month, phone verification) is a possible backup, but I couldn't verify it because its pricing page didn't load.

---

## 9. Risks

| Risk | Fix |
|---|---|
| Judged as a "generic VLM" | Your own LoRA on BigEarthNet.txt, a RemoteCLIP fine-tune, and a before/after table |
| Kaggle session dies mid-demo | LITE mode on the laptop. Keep the model pre-downloaded and test offline |
| Kaggle account ban | One account per person, no proxy farm, no idle keep-alive abuse. Run only during dev/demo |
| 2B model weak on SAR | Add VRSBench-SAR and BigEarthNet S1 to the fine-tune mix. Rule tools give evidence. Report confidence and abstain |
| Cartosat 4-band vs RGB training | Map B, G, R → RGB, give NIR to the tools, and test on Bhuvan samples |
| Laptop OOM | Load one model at a time (Ollama auto-unloads), keep MobileSAM on CPU, use 2k context |
| Crowded PS (30+ repos) | Most public repos skip fine-tuning and eval (one lists "RS-adapted VLM: not built"). Numbers + trace + GeoTIFF robustness are the differentiators |

---

## 10. Sources

**Official and data**
- PS: https://sih.gov.in/sih2026PS (search "SatQuery")
- BigEarthNet.txt: https://arxiv.org/abs/2603.29630 · https://huggingface.co/datasets/BIFOLD-BigEarthNetv2-0/BigEarthNet.txt
- VRSBench: https://huggingface.co/datasets/xiang709/VRSBench · CDVQA: https://github.com/YZHJessica/CDVQA · RSVQA: https://rsvqa.sylvainlobry.com

**Models**
- Qwen3.5-2B: https://huggingface.co/Qwen/Qwen3.5-2B · GGUF: https://huggingface.co/unsloth/Qwen3.5-2B-GGUF
- Qwen3-VL-2B: https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct
- AdaptLLM RS: https://huggingface.co/AdaptLLM/remote-sensing-Qwen2.5-VL-3B-Instruct
- EarthDial: https://huggingface.co/akshaydudhane/EarthDial_4B_RGB · RemoteCLIP: https://huggingface.co/MVRL/remote-clip-vit-base-patch32
- LFM2.5-VL + satellite cookbook: https://docs.liquid.ai/examples/customize-models/satellite-vlm

**Reddit**
- 4 GB laptop speeds: https://reddit.com/r/LocalLLaMA/comments/1v6l726/
- 3B fine-tune on 4 GB took 2 days: https://reddit.com/r/huggingface/comments/1vrkq6u/
- Kaggle as a free backend, plus the ban warning: https://reddit.com/r/AI_India/comments/1w48q24/ · https://reddit.com/r/LocalLLM/comments/1vg1adc/
- Qwen3.5-2B vs Gemma-4-E2B vision: https://reddit.com/r/LocalLLaMA/comments/1sg621w/
- 450M satellite VLM pipeline: https://reddit.com/r/LocalLLaMA/comments/1t36myv/
- S1+S2 fusion tips: https://reddit.com/r/remotesensing/comments/1e56vvk/

**Other**
- Kaggle terms (one person per account, personal non-commercial use): https://kaggle.com/terms
- Competitor example with an honest status table: https://github.com/rhydham-mittal27/satquery
- Free GPU overview: https://gpuperhour.com/blog/free-cloud-gpus-and-credits

Not checked: Quora. Reddit coverage was enough, and Quora rarely has 2026 VLM content.
