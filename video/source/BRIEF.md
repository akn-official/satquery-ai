# SatQuery promo v1 (2026-10-17)

App: `Azie Hackathon check/` (SatQuery AI, SIH26167). Rules: global paper `~/.claude/research/motion-design/index.html` (rounds 1-8) + the app's own design rules (`web/README.md`: survey-sheet look, Atkinson Hyperlegible Next/Mono, ink + 1px rules, one data colour rgb(228,48,32), no gradients/glow/pills).

- 1920x1080@60 (judges' projector, YouTube), 30.72 s = 16 bars at 125 bpm (bar 1.92, beat 0.48). 8 subframes, shutter 0.7.
- No voice. Music + a handful of words on screen, about the viewer's job: "Last week. / Last night. / What changed?" -> "Measured, not guessed." -> "Clouds? Radar sees through." -> "It shows you where." -> "Every step, on the record." -> end "SatQuery / Ask the image. Get the evidence."
- Truth: demo scenes are synthetic (gen_scenes.py), labelled on every map shot. Every number, the answer excerpt, the trace and the town box come from SatQuery's real router + qwen3.5:2b run on them (run_real.py -> assets/real.json, stats.json). The bridge box missed (VLM 70 px off), so the grounding beat uses "Where is the town?", which hit.
- Virtual camera (reel 7 pattern): 30 framings, linear drift, snap-settle on 6, zoom-through viewer -> full-bleed map (matched scale), low angles (rx), Dutch tilts, whips at 3.84 / 19.2 / 24.0, hard cuts 1 frame before the grid.
- Story: T1 -> match cut T2 (flood) -> laptop, the question typed with a typo -> Run -> answer -> zoom-through, red mask scans in -> evidence digits roll + hand-drawn circle -> clouds over optical, SAR wipe sees through, fused agreement card -> "Where is the town?" -> VLM box draws -> trace -> Report -> report + trace.json sheets drop -> end card, dissolve to frame 0 (loop).
- Score: new genre for the log: minimal electro / tech-house 125, F# minor, four-on-the-floor, offbeat bass, plucked arp, clap, 6 stop-time gaps (music bus gated), slams at 1.92 and 15.36.
