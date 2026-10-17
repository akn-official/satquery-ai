# prompt.md — session memory (read FIRST every new chat)

## Standing orders
- New chat: read `handoff.md` first (current status + next steps), keep it updated too.
- Installs: user said "install what's needed" 2026-10-16 s2 (Ollama installed via winget). Still ask before big/system installs.
- Always use `/ponytail` (lazy senior dev: least code, stdlib/native first) + `/caveman` (terse talk) every session.
- Keep THIS file updated at end of every session. User clears chats often; this file = memory.
- Research allowed: built-in browser first (it blocks search engines: DuckDuckGo/Bing denied s4); Playwright fallback (logged in to Reddit/Quora/X/etc, user gave full permission).
- Kaggle: user signed in to Kaggle (`aspirekineticnetwork`, phone-verified) in the **Playwright plugin** browser (`mcp__plugin_playwright_playwright__*`; the other `mcp__playwright__*` instance is often locked). Claude drives Kaggle there: import notebook, attach dataset, Run All, read output from iframes. Never enter credentials or solve CAPTCHAs; ask the user.
- Playwright file uploads only work from inside the project folder (copy files into `.playwright-mcp/` first).
- Budget: near-free. No paid keys. Nothing ≥ ₹2000 recharge.

## Task
SIH 2026, **PS ID SIH26167** (row #94 on sih.gov.in/sih2026PS), ISRO/SAC, Software, Space Technology:
**SatQuery AI — Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries.**
Friend's challenge → join hackathon team. User goal: know what goes backend vs frontend, which API keys, agents (cloud/local), what to build.

## Key facts (verified 2026-10-16)
- Idea submission for SIH26167 closed 5 Oct 2026; the team submitted (confirmed).
- Mandatory: RS fine-tune on BigEarthNet.txt (M1), single-img VQA (M2), +caption OR grounding (M3), bi-temporal change VQA/desc (M4), optical+SAR joint (M5), agentic tool registry w/ auditable trace (M6), GUI + report (M7).
- Hidden eval: Cartosat-2S (4-band MX) + RISAT SAR GeoTIFF pairs. Public eval: VRSBench, RSVQA, CDVQA.
- 30+ competitor repos on GitHub. Differentiate via fine-tune numbers + trace + GeoTIFF robustness.

## Constraints
- Team laptops: MAX 4 GB VRAM. No local training. Local = UI + tiny Q4 GGUF fallback only.
- Team submitted idea for SIH26167 already (confirmed by user 2026-10-16).

## Decisions so far (v2, supersede v1)
- Stack: Python FastAPI backend + React frontend `web/` (Vite, Tailwind v4, Phosphor, Atkinson Hyperlegible; CSS-only motion). Gradio `ui.py` = fallback only.
- UI must not look AI-made (user, s4). Design skills (impeccable, emil-design-eng, gpt-taste, ui-ux-pro-max, frontend-design, ui-component-registry) = inspiration, not templates. Rules in `web/README.md`: light survey-sheet look, ink + rules, one data colour = mask red, no glow/gradients/pills/scrambles.
- Two serve modes, same code: MAIN = Kaggle T4 notebook + cloudflared tunnel (code via private Kaggle dataset `satquery-app`); LITE = laptop Ollama + CPU tools. UI falls back MAIN→LITE. Both verified live 2026-10-16.
- VLM gotchas (verified): qwen3.5 thinking must be OFF (`VLM_REASONING=none`), else empty answers; bbox = 0-1000 normalized; strip markdown/emoji; give the 2B model word labels (e.g. `likely`), not raw deltas.
- Core VLM: Qwen3.5-2B (or Qwen3-VL-2B) + own QLoRA on BigEarthNet.txt subset + VRSBench, trained on Kaggle, exported GGUF Q4 (~2.4 GB). EarthDial-4B only optional on MAIN. TEOChat dropped.
- M1 safety net: fine-tune RemoteCLIP ViT-B/32 multi-label on BigEarthNet 19 classes.
- Tools: indices (NDWI/NDBI), SAR dB threshold, CVA+Otsu change, VLM bbox→MobileSAM grounding.
- No paid keys. HF token + Kaggle + cloudflared. Optional Gemini/Groq free key TEXT ONLY, never imagery.
- Security (s6): untrusted uploads are parsed with pinned formats (GDAL `GTiff`, PIL PNG/JPEG) + size caps; MAIN `/query` needs `SATQUERY_TOKEN` (Kaggle secret or per-run); header-only `guard` middleware (Origin, Transfer-Encoding, Content-Length, token) runs before body parsing; tool params numbers only. Keep these when touching `validate.py` / `server.py`.
- Agent = plain Python router + registry dict. No LangChain/CrewAI.
- Kaggle: one account per person, no pooled proxy (ban reports on Reddit).
- Reddit works via Playwright when user logged in: use `fetch('/search.json?...')` inside browser_evaluate.

## Files
- `REPORT.md` — full research report v2. Source of truth for plan.
- `satquery/validate.py` — read GeoTIFF/PNG, modality guess (≤2 bands=SAR), band maps (4-band = Cartosat B,G,R,NIR), SAR→dB, pair checks → single|optical_sar|bitemporal.
- `satquery/tools.py` — tools + REGISTRY. Kwargs w/ defaults = permitted params. Rule tools real (NDWI, SAR Otsu water, fuse, built-up, CVA change). VLM tools call vlm.py.
- `satquery/vlm.py` — OpenAI-compatible client (env VLM_URL default Ollama :11434/v1, VLM_MODEL default qwen3.5:2b, VLM_REASONING default none). Offline → pipeline continues on evidence.
- `satquery/router.py` — keyword intent → plan → run → trace/evidence/confidence/overlays. Masks painted solid rgb(228,48,32) = UI legend colour; change both together.
- `satquery/server.py` — FastAPI `/query`, `/health`, `/samples` (static, for the UI sample buttons), `handle()` shared w/ UI, HTML report.
- `web/` — React UI (src/App.jsx, src/index.css tokens, src/api.js). Build → web/dist, served by FastAPI at `/` (+ `/samples` for the sample-scene buttons). See web/README.md.
- `samples/` — synthetic demo GeoTIFFs.
- `satquery/ui.py` — Gradio (fallback). Tries MAIN_URL (Kaggle tunnel) then in-process LITE.
- `kaggle/main_server.ipynb` — MAIN server: code via REPO_URL or Kaggle Dataset zip → Ollama on T4 → uvicorn → cloudflared → prints trycloudflare URL to paste into the UI's **Server** button. Generated once; edit the .ipynb directly.
- `test_smoke.py` — synthetic GeoTIFF end-to-end asserts. `requirements.txt`.
- `test_behaviour.py` — identity / reverse-order / overlay-vs-truth / routing checks, prints PASS/FAIL (s5: 7/9).
- `thought.md` — upgrade ideas found by testing, ranked. Add new ideas there, not in handoff.
- `SECURITY.md` — security model, env knobs, audit summary (s6). Full audit artefacts outside the repo: `~/security-audit-skill/azie-hackathon-check/run-1/`.

## How to run (Windows, Python 3.12 venv; system py3.14 lacks wheels)
- `.venv\Scripts\python test_smoke.py` → "smoke ok"
- `.venv\Scripts\python -m uvicorn satquery.server:app --port 8000` → React UI http://127.0.0.1:8000 (after `cd web && npm run build`)
- Ollama installed 2026-10-16 (tray app serves :11434) on user laptop (GPU: Quadro T1000 4 GB). qwen3.5:2b pulled + working.
- MAIN: see handoff.md "How to run MAIN again" (re-version dataset after code changes → Run All notebook33eb0448bc → paste URL **and token** via UI **Server** button → stop session after. Re-version is due: s4 + s6 changed satquery/, web/dist, notebook; the notebook refuses to open the tunnel on stale code).

## Status log
- 2026-10-16 s1: researched official PS, datasets, models, free compute. Wrote REPORT.md v1.
- 2026-10-16 s1b: user has 4 GB VRAM. Reddit research done. REPORT.md rewritten as v2 (low-hardware plan). Next: scaffold repo per REPORT §6–7 (FastAPI + Gradio, validator, router, registry, stub tools, LITE mode first).
- 2026-10-16 s1c: scaffold built (satquery/ pkg). Smoke test + HTTP + Gradio client tests pass with VLM offline. Not yet tested with a real VLM (no Ollama). Next: install Ollama + qwen3.5:2b and check thinking-mode output / bbox coord format; then Kaggle MAIN notebook (REPORT §7 step 3); then M1 fine-tune.
- 2026-10-16 s2: React frontend `web/` built + verified via Playwright (desktop + mobile). Ollama + qwen3.5:2b working via UI (thinking OFF via reasoning_effort=none; bbox 0-1000; 3.1 GB VRAM; 4-10 s/answer). Added NDWI delta + `likely` label to change_cva. Next: Kaggle MAIN notebook, then M1 fine-tune.
- 2026-10-16 s3: wrote `kaggle/main_server.ipynb`; ran it on Kaggle (private dataset aspirekineticnetwork/satquery-app + notebook33eb0448bc, GPU T4 x2). Laptop UI showed MAIN · online, query 5.5 s warm (first call 48 s cold). Final check: smoke, build, LITE + MAIN health all green; Kaggle dataset == local code. handoff.md rewritten with M1–M7 status table. Kaggle session stopped after (13 min of the 30 h/week quota used); UI MAIN URL cleared → LITE. Next: M1 fine-tune on Kaggle, then eval scripts.
- 2026-10-16 s4: anti-AI-slop UI redesign (research via Reddit JSON in Playwright; built-in browser blocked search engines). Light survey-sheet UI, Atkinson fonts, sample-scene loader, neatline viewer, solid red masks, report CSS. Verified desktop + 390 px, smoke ok. Kaggle dataset needs a new version before MAIN. Next: M1 fine-tune.
- 2026-10-16/17 s6: user asked: fix .md-listed bugs, break the app, Cloudflare-style security audit, update docs. Fixed identity (otsu flat guard + noise floor), masks on both dates, markdown-rule strip, test gate → behaviour 9/9. Break testing found VRT-in-.tif SSRF/local file read, EPS→Ghostscript, several 500s, no auth on MAIN; fixed + token flow in UI/Gradio/notebook. Audit (quick, 10 agents; no sandbox on Windows → 0 confirmed) gave 5 leads + 1 critic gap, all fixed; HTTP retest 22/22. Docs updated, `SECURITY.md` added. Session hit the usage limit mid-audit once; resumed agents with SendMessage. Next: re-upload Kaggle dataset, then M1.
- 2026-10-16 s5: ran 4 behaviour tests (user's list) via new `test_behaviour.py`: 7/9 pass. FAIL: identity pair -> change_cva 100 % changed (Otsu on zero magnitude); mask painted on T2 only. PASS: reverse order flips NDWI sign + label; mask IoU 1.00 vs truth (synthetic); routing uses SAR for opt+SAR. VLM wording still invents objects / misquotes numbers. Upgrades in thought.md (not applied; user asked to write them down). Next: fix identity guard, then M1.
