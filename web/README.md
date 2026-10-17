# SatQuery AI web UI

React 19 + Vite + Tailwind v4 + Phosphor icons. It talks to the FastAPI backend (`satquery/server.py`). No animation library: motion is CSS only.

- `npm run build`: writes `dist/`, which FastAPI serves at `/`. Rebuild after any UI edit.
- `npm run dev`: hot reload at http://localhost:5173. It proxies `/query`, `/health` and `/samples` to uvicorn on :8000.
- `src/App.jsx`: the whole UI (query column, sample scenes, answer, viewer, evidence, trace, downloads).
- `src/index.css`: design tokens (OKLCH palette, fonts, neatline ticks).
- `src/api.js`: the MAIN URL and its access token live in localStorage (`satquery.main`, `satquery.token`), set from the Server panel. The URL must be `https://` (plain http only for localhost). Queries try MAIN first (with header `X-SatQuery-Token`), then LITE (same origin). A 401/413/422 from MAIN is shown, not hidden behind LITE.
- The server sends a CSP (`default-src 'self'`, `connect-src 'self' https: http://localhost:* http://127.0.0.1:*`): no inline scripts, no third-party assets. Keep fonts bundled and never add `dangerouslySetInnerHTML`. See `../SECURITY.md`.
- Sample-scene buttons fetch `/samples/*.tif` from the laptop server (`satquery/server.py` mounts `samples/`). The Kaggle zip has no `samples/`, so a MAIN-served UI shows an error there; drop files instead.

## Design rules (2026-10-16 redesign, anti-AI-slop)
- Scene: judges and ISRO scientists watching on a hall projector, then reading the report. So: light theme, large legible type.
- Look: a survey sheet. Cool paper, ink, 1px rules. No cards in cards, no glow, no gradients, no pills, no tracked uppercase labels.
- Type: Atkinson Hyperlegible Next (UI) + Atkinson Hyperlegible Mono (numbers, files, trace). Not Inter/Geist.
- Colour: ink for actions and selection. The only strong colour is data: `rgb(228,48,32)`, the solid mask colour painted by `router.py`. Change both together.
- The image viewer has a neatline: pixel ticks every 10% and the scene width in px.
- Motion: 120–220 ms, transform/opacity only, ease-out, `prefers-reduced-motion` respected. No text scrambles or count-ups.
