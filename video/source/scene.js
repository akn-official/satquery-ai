/* SatQuery promo, 1920x1080, 30.72 s at 125 bpm (BRIEF.md). One stage, a virtual camera, 30 framings on the beat grid.
   Sets on the stage: 'sat' (the 1024 px demo scenes at 2x), 'app' (the real UI rebuilt pixel-true in a laptop), 'paper' (report +
   trace.json). Words, card, label and the end card live in screen space. Every number / sentence on screen comes from
   assets/real.json + stats.json (SatQuery's router and qwen3.5:2b run on the synthetic scenes). Pattern: akn-reel-7 scene.js. */
(async function () {
  'use strict';
  const C = await (await fetch('cues.json')).json();
  const RL = await (await fetch('assets/real.json')).json();
  const ST = await (await fetch('assets/stats.json')).json();
  const { P, lerp, eo3, eo4, ei3, eio3, mk, put, show } = PV;
  const V = document.getElementById('v'), bg = document.getElementById('bg'), g = bg.getContext('2d'), W = 1920, H = 1080;
  const world = PV.createWorld(V, bg, W, H);
  const K = { paper: '#fbfcfd', sheet: '#f2f4f6', well: '#e8ebee', rule: '#d4d8dd', rule2: '#a1a7af', ink: '#1b1f27', ink2: '#474e59', ink3: '#666d79',
    sig: 'rgb(228,48,32)', ok: '#2f7a46', desk: '#e3e5e8', table: '#d9dce1', night: '#141c17' };
  const D = C.duration, TAU = 2 * Math.PI, F1 = 1 / C.fps;
  const IMPACTS = [], ev = (t, kind, v = 1000) => { IMPACTS.push({ t: +t.toFixed(4), v, kind }); return t; };
  const pop = (t, a) => t < a ? 0 : 1 - Math.exp(-(t - a) * 14) * Math.cos((t - a) * 26);
  const ovs = (t, a, w = 8.5) => t < a ? 0 : 1 - Math.exp(-(t - a) * 7) * Math.cos((t - a) * w);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* ── physics (reel 6/7 kit), inverse: land time chosen on the grid, start solved ── */
  const GR = 7000;
  function hits(h, e, n) { let t = Math.sqrt(2 * h / GR), v = GR * t; const out = [{ dt: t, v }]; for (let i = 0; i < n; i++) { v *= e; t += 2 * v / GR; out.push({ dt: t, v }); } return out; }
  function dropY(dt, h, e, n) {
    const T0 = Math.sqrt(2 * h / GR); if (dt < T0) return -h + 0.5 * GR * dt * dt;
    let tt = dt - T0, v = GR * T0;
    for (let i = 0; i < n; i++) { v *= e; const T = 2 * v / GR; if (tt < T) return -(v * tt - 0.5 * GR * tt * tt); tt -= T; }
    return 0;
  }
  function body(el, land, h, o = {}) {
    const b = Object.assign({ el, land, h, e: 0.14, n: 1, r0: 0, kind: '' }, o);
    b.t0 = land - Math.sqrt(2 * h / GR); b.hits = hits(h, b.e, b.n).map(x => ({ t: b.t0 + x.dt, v: x.v }));
    if (b.kind) ev(land, b.kind, Math.round(b.hits[0].v));                       // first touch only
    el.style.transformOrigin = '50% 100%';
    return b;
  }
  function state(b, t) {
    if (t < b.t0) return null;
    const y = dropY(t - b.t0, b.h, b.e, b.n);
    const r = b.r0 * (1 - eo3(P(t, b.t0, b.land))) + (t > b.land ? b.r0 * 0.15 * Math.exp(-(t - b.land) / 0.1) * Math.sin(TAU * (t - b.land) / 0.2) : 0);
    let k = 0; b.hits.forEach(x => { if (t >= x.t) k += Math.min(0.12, x.v / 26000) * Math.exp(-(t - x.t) / 0.07); });
    return { x: 0, y, r, sy: 1 - k, sx: 1 + 0.6 * k };
  }
  const apply = (b, t, extra) => { const s = state(b, t); if (!s) { put(b.el, { o: 0 }); return; } put(b.el, Object.assign(s, extra || {})); };

  /* ── stage + camera ── */
  const lens = mk('', `left:0;top:0;width:${W}px;height:${H}px;perspective:1800px;perspective-origin:960px 540px;overflow:hidden;`);
  const cam = mk('', `left:0;top:0;width:${W}px;height:${H}px;`, lens);

  /* ── SAT set: the scenes at 2x (image px -> stage) ── */
  const setSat = mk('', `left:0;top:0;width:${W}px;height:${H}px;`, cam);
  const MAP = mk('', 'left:-64px;top:-484px;width:2048px;height:2048px;overflow:hidden;', setSat);
  const M = (x, y) => [-64 + 2 * x, -484 + 2 * y];
  const lay = (src, px) => mk(PV.img(src, 'width:2048px;height:2048px;'), 'left:0;top:0;width:2048px;height:2048px;', MAP, px ? 'abs px' : 'abs');
  const mT1 = lay('assets/t1.png'), mT2 = lay('assets/t2.png'), mSAR = lay('assets/sar.png'), mChg = lay('assets/m_change.png', 1), mSm = lay('assets/m_sar.png', 1), mFu = lay('assets/m_fuse.png', 1);
  const mCl = mk(PV.img('assets/cloud.png', 'width:2600px;height:2600px;'), 'left:-300px;top:-300px;width:2600px;height:2600px;', MAP);
  const scanH = mk('', 'left:0;top:0;width:2048px;height:6px;background:#fff;box-shadow:0 0 0 2px rgba(27,31,39,0.55);', MAP);
  const scanV = mk('', 'left:0;top:0;width:6px;height:2048px;background:#fff;box-shadow:0 0 0 2px rgba(27,31,39,0.55);', MAP);
  const gb = RL.ground.answer.match(/x ([\d.]+)-([\d.]+), y ([\d.]+)-([\d.]+)/).slice(1).map(Number);   // the VLM's own box (fractions)
  const BX = [gb[0] * 2048, gb[2] * 2048, (gb[1] - gb[0]) * 2048, (gb[3] - gb[2]) * 2048];
  const boxSvg = mk(`<svg width="${BX[2]}" height="${BX[3]}"><rect x="3" y="3" width="${BX[2] - 6}" height="${BX[3] - 6}" fill="none" stroke="#fff" stroke-width="12"/><rect x="3" y="3" width="${BX[2] - 6}" height="${BX[3] - 6}" fill="none" stroke="${K.sig}" stroke-width="6"/></svg>`,
    `left:${BX[0]}px;top:${BX[1]}px;`, MAP);
  const boxRects = [...boxSvg.querySelectorAll('rect')], boxLen = 2 * (BX[2] + BX[3]);
  const boxLbl = mk(`vlm_ground <span style="color:${K.ink3}">·</span> town`, `left:${BX[0]}px;top:${BX[1] - 74}px;height:62px;padding:0 22px;background:${K.paper};border:2px solid ${K.ink};font:500 32px/58px Mono;white-space:nowrap;`, MAP);
  boxLbl.style.transformOrigin = '0 100%';

  /* ── APP set: SatQuery UI, 1440x900 at 1:1 on the stage, inside a laptop ── */
  const setApp = mk('', `left:0;top:0;width:${W}px;height:${H}px;`, cam);
  const LX = 240, LY = 70, A = (x, y) => [LX + x, LY + y];
  mk('<div style="position:absolute;left:740px;top:9px;width:9px;height:9px;border-radius:50%;background:#2c3139"></div>', `left:${LX - 24}px;top:${LY - 24}px;width:1488px;height:948px;border-radius:24px 24px 6px 6px;background:#15171b;box-shadow:inset 0 0 0 2px #2b2e34,0 60px 90px -40px rgba(20,24,32,0.5);`, setApp);
  mk(`<div style="position:absolute;left:700px;top:0;width:280px;height:9px;border-radius:0 0 9px 9px;background:#aeb3ba"></div>`, `left:${LX - 130}px;top:${LY + 924}px;width:1700px;height:30px;border-radius:2px 2px 20px 20px;background:#c5c9cf;box-shadow:inset 0 3px 0 #dde0e4,0 34px 40px -22px rgba(20,24,32,0.55);`, setApp);
  const scr = mk('', `left:${LX}px;top:${LY}px;width:1440px;height:900px;overflow:hidden;background:${K.paper};color:${K.ink};`, setApp);
  const LOGO = (sz, ink = K.ink, pap = '#f7f8fa') => `<svg width="${sz}" height="${sz}" viewBox="0 0 32 32"><rect width="32" height="32" fill="${pap}"/><rect x="8" y="8" width="18" height="18" fill="none" stroke="${ink}" stroke-width="2"/><path d="M8 3v3M13 4v2M17 3v3M21 4v2M26 3v3M3 8h3M4 13h2M3 17h3M4 21h2M3 26h3" stroke="${ink}" stroke-width="1.4"/><rect x="15" y="12" width="7" height="7" fill="${K.sig}"/></svg>`;
  const DL = c => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="square"><path d="M12 3v12M6.5 9.5L12 15l5.5-5.5M4 20h16"/></svg>`;
  // header
  mk(`${LOGO(30)}<b style="font:700 19px Next">SatQuery</b><span style="font:400 14px Next;color:${K.ink2}">SIH26167 · remote-sensing assistant</span>`,
    `left:0;top:0;width:1440px;height:56px;padding-left:20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid ${K.rule};`, scr);
  mk(`<i style="width:9px;height:9px;background:${K.ok}"></i><b style="font:700 14px Next">LITE</b><span style="font:400 14px Next">qwen3.5:2b online</span><span style="margin-left:14px;height:34px;padding:0 16px;border:1px solid ${K.ink2};font:500 14px/32px Next">Server</span>`,
    'right:20px;top:0;height:56px;display:flex;align-items:center;gap:8px;left:auto;', scr);
  // left column
  const LC = mk('', `left:0;top:56px;width:371px;height:844px;border-right:1px solid ${K.rule};`, scr);
  mk('Imagery', 'left:20px;top:22px;font:600 15px Next;', LC);
  mk('One scene, an optical + SAR pair, or two dates of one area.', `left:20px;top:46px;width:330px;font:400 13px/20px Next;color:${K.ink2};`, LC);
  const X = `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="${K.ink2}" stroke-width="1.6"/></svg>`;
  function slot(y, letter, name, size) {
    const b = mk('', `left:20px;top:${y}px;width:330px;height:102px;border:1px solid ${K.rule};`, LC);
    mk(letter, `left:12px;top:12px;width:32px;height:32px;background:${K.ink};color:#fff;font:700 15px/32px Next;text-align:center;`, b);
    mk(name, 'left:56px;top:11px;font:400 15px/20px Mono;letter-spacing:0.02em;', b);
    mk(size, `left:56px;top:33px;font:400 13px/18px Next;color:${K.ink2};`, b);
    mk(X, 'left:298px;top:20px;', b);
    mk(['Auto', 'Optical', 'SAR'].map((s, i) => `<span style="flex:1;text-align:center;${i ? `border-left:1px solid ${K.rule};` : ''}${i === 1 ? `background:${K.ink};color:#fff;` : ''}">${s}</span>`).join(''),
      `left:0;top:62px;width:328px;height:38px;border-top:1px solid ${K.rule};display:flex;font:500 13px/37px Next;`, b);
  }
  slot(96, 'A', 'river_t1.tif', '4.0 MB'); slot(210, 'B', 'river_t2.tif', '4.0 MB');
  mk('Reads as: <b>Bi-temporal pair</b>', 'left:20px;top:326px;font:400 13px Next;', LC);
  mk('', `left:0;top:360px;width:370px;height:1px;background:${K.rule};`, LC);
  mk('Question', 'left:20px;top:382px;font:600 15px Next;', LC);
  mk('', `left:20px;top:406px;width:330px;height:110px;border:1px solid ${K.rule2};`, LC);
  const qTxt = mk(`<span></span><i style="display:inline-block;width:2px;height:1.15em;vertical-align:-0.22em;margin-left:1px;background:${K.ink}"></i>`, 'left:33px;top:415px;width:304px;font:400 16px/26px Next;white-space:pre-wrap;', LC);
  const qSpan = qTxt.firstChild, qCaret = qTxt.lastChild;
  mk('Or try', `left:20px;top:534px;font:400 13px Next;color:${K.ink3};`, LC);
  ['Describe the scene', 'Find the water', 'What changed', 'Fuse optical and SAR', 'Built-up trend'].forEach((s, i) =>
    mk(`<i style="width:7px;height:7px;background:${i === 2 ? K.ink : K.rule2}"></i>${s}`, `left:20px;top:${560 + i * 30}px;display:flex;align-items:center;gap:13px;font:400 14px Next;`, LC));
  const runBtn = mk('Run query', `left:20px;top:774px;width:330px;height:48px;background:${K.ink};color:#fff;font:600 16px/48px Next;text-align:center;`, LC);
  // right column
  const RC = mk('', 'left:371px;top:56px;width:1069px;height:844px;', scr);
  const empty = mk('Ask a question about the imagery on the left.', `left:54px;top:36px;font:400 15px Next;color:${K.ink3};`, RC);
  const res = mk('', 'left:0;top:0;width:1069px;height:844px;', RC);
  const ANS = ['The most significant change is a large area of new or increased water coverage, likely due to flooding.',
    'The change occurred primarily along the river channel and its immediate floodplain, extending into adjacent agricultural fields.'];
  ANS.forEach(s => { if (!RL.change.answer.includes(s)) console.warn('answer excerpt not verbatim:', s); });
  mk('Q. What changed, and where?', `left:54px;top:36px;font:400 14px Next;color:${K.ink2};`, res);
  const repBtn = mk(`${DL('#fff')}Report`, `left:776px;top:26px;width:98px;height:40px;background:${K.ink};color:#fff;font:600 15px Next;display:flex;align-items:center;justify-content:center;gap:8px;`, res);
  mk(`${DL(K.ink)}Trace JSON`, `left:884px;top:26px;width:130px;height:40px;border:1px solid ${K.rule2};font:500 15px Next;display:flex;align-items:center;justify-content:center;gap:8px;`, res);
  const ansEl = mk(ANS.join(' '), 'left:54px;top:84px;width:930px;font:400 21px/32px Next;', res);
  mk('', `left:54px;top:214px;width:960px;height:1px;background:${K.rule};`, res); mk('', `left:54px;top:282px;width:960px;height:1px;background:${K.rule};`, res);
  const confV = RL.change.confidence;
  [['Task', RL.change.trace.task], ['Input', 'Bi-temporal'], ['Served by', 'LITE'], ['Confidence', '']].forEach(([l, v], i) => {
    mk(l, `left:${54 + i * 246}px;top:228px;font:400 13px Next;color:${K.ink3};`, res);
    mk(v, `left:${54 + i * 246}px;top:251px;font:600 14px Next;`, res); });
  const confTxt = mk('', 'left:792px;top:250px;font:500 14px Mono;', res);
  mk('', `left:872px;top:257px;width:64px;height:5px;background:${K.rule};`, res);
  const confBar = mk('', `left:872px;top:257px;width:64px;height:5px;background:${K.ink};transform-origin:0 50%;`, res);
  // viewer with neatline (always visible; layer changes)
  const VW = mk('', 'left:0;top:0;width:1069px;height:844px;', RC);
  mk('0', `left:61px;top:298px;font:400 12px Mono;color:${K.ink3};`, VW); mk('1024 px', `left:421px;top:298px;width:60px;text-align:right;font:400 12px Mono;color:${K.ink3};`, VW);
  const frame = mk('<div class="tick-x t"></div><div class="tick-x b"></div><div class="tick-y l"></div><div class="tick-y r"></div>', `left:61px;top:318px;width:420px;height:420px;background:${K.well};`, VW);
  const vImg = src => mk(PV.img(src, 'width:420px;height:420px;'), 'left:0;top:0;width:420px;height:420px;', frame);
  const vT1 = vImg('assets/t1.png'), vT2 = vImg('assets/t2.png'), vM = vImg('assets/m_change.png');
  const strip = ['input 1', 'input 2', 'change_cva on input 2'].map((s, i) => mk(s, `left:${[61, 141, 221][i]}px;top:752px;height:30px;padding:0 10px;border:1px solid ${K.rule2};font:400 13px/28px Next;white-space:nowrap;`, VW));
  // evidence + trace
  const evid = mk('', 'left:529px;top:318px;width:486px;height:520px;', res);
  mk('Measured evidence', 'left:0;top:0;font:600 15px Next;', evid);
  mk('change_cva', `left:0;top:32px;font:400 13px Mono;color:${K.ink3};`, evid);
  const S0 = ST.change_cva, ROWS = [['changed pct', S0.changed_pct, 2], ['threshold', S0.threshold, 3], ['ndvi delta in changed', S0.ndvi_delta_in_changed, 3], ['ndwi delta in changed', S0.ndwi_delta_in_changed, 3], ['likely', S0.likely]];
  const rowV = ROWS.map(([l, v], i) => { mk(l, `left:0;top:${58 + i * 36}px;width:486px;height:36px;border-bottom:1px solid ${K.rule};font:400 14px/36px Next;color:${K.ink2};`, evid);
    return mk('', `left:186px;top:${58 + i * 36}px;width:300px;text-align:right;font:400 14px/36px Mono;`, evid); });
  const TR = RL.change.trace;
  mk('Trace', 'left:0;top:256px;font:600 15px Next;', evid);
  mk(`task ${TR.task} · plan ${TR.plan.join(' → ')}`, `left:0;top:282px;font:400 13px Mono;color:${K.ink3};`, evid);
  const trRows = TR.steps.map((s, i) => mk(`<span style="width:26px;color:${K.ink3}">${i + 1}</span><span style="width:170px">${s.tool}</span><span style="width:70px;color:${K.ok}">${s.status}</span><span style="flex:1;text-align:right">${s.ms.toLocaleString('en-US').replace(',', ' ')} ms</span>`,
    `left:0;top:${310 + i * 36}px;width:486px;height:36px;border-bottom:1px solid ${K.rule};display:flex;font:400 14px/36px Mono;`, evid));
  const trOut = mk(esc(RL.change.trace.steps[1].output.split('\n')[0].slice(0, 96)) + '…', `left:26px;top:${310 + 2 * 36 + 8}px;width:460px;font:400 13px/20px Next;color:${K.ink3};`, evid);
  // cursor (in screen px of the app)
  const cur = mk('<svg width="30" height="42" viewBox="0 0 12 17"><path d="M1 1v13.2l3.3-3.2 2.2 4.8 2.1-.95-2.2-4.7H10.5z" fill="#111" stroke="#fff" stroke-width="0.9" stroke-linejoin="round"/></svg>', 'left:0;top:0;', scr);
  cur.style.transformOrigin = '3px 3px';
  const CURS = [[6.82, C.run, C.run + 0.12, 7.62, 330, 700, 185, 854, runBtn], [23.12, C.report, C.report + 0.12, 23.98, 990, 300, 1196, 104, repBtn]];
  CURS.forEach(c => ev(c[1], 'press', 2000));

  /* typing: uneven key gaps, one typo + fix in the first question */
  const QU1 = 'What changed, and where?', QU2 = 'Where is the town?';
  function keyTimes(q, t0, sp, typoAt) {
    const out = []; let t = t0; const gaps = [0.11, 0.07, 0.09, 0.06, 0.13, 0.08, 0.06, 0.1, 0.07, 0.16, 0.09, 0.06, 0.08, 0.12, 0.07];
    [...q].forEach((ch, i) => {
      if (i === typoAt) { out.push([t, 'e']); t += 0.08 * sp; out.push([t, 'g']); t += 0.22; out.push([t, '\b']); t += 0.07; out.push([t, '\b']); t += 0.1; }
      out.push([t, ch]); t += gaps[i % gaps.length] * sp * (ch === ' ' ? 1.4 : 1);
    });
    return out;
  }
  const typedAt = (keys, t) => keys.reduce((a, [kt, ch]) => t < kt ? a : ch === '\b' ? a.slice(0, -1) : a + ch, '');
  const K1 = keyTimes(QU1, C.type1, 0.72, 9), K2 = keyTimes(QU2, C.type2, 0.42, -1);
  K1.concat(K2).forEach(([kt]) => ev(kt, 'key', 600)); ev(C.enter2, 'press', 1200);

  /* ── PAPER set: the downloaded report + trace.json, dropped on a desk (top-down) ── */
  const setPaper = mk('', `left:0;top:0;width:${W}px;height:${H}px;`, cam);
  const SHEETS = [{ cx: 760, cy: 560, w: 820, h: 1060, r: -4 }, { cx: 1270, cy: 590, w: 700, h: 940, r: 5 }];
  const mini = s => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid ${K.rule};font:400 17px/34px Next;color:${K.ink2}">${s[0]}<span class="mono" style="color:${K.ink}">${s[1]}</span></div>`;
  const repHtml = `<div style="position:absolute;left:44px;top:40px;display:flex;align-items:center;gap:14px">${LOGO(40)}<b style="font:700 34px Next">SatQuery report</b></div>
    <div class="mono" style="position:absolute;left:44px;top:100px;font:400 15px Mono;color:${K.ink3}">river_t1.tif + river_t2.tif · served by LITE · confidence ${(confV * 100).toFixed(1)} %</div>
    <div style="position:absolute;left:44px;top:150px;width:732px;font:600 22px Next">Q. What changed, and where?</div>
    <div style="position:absolute;left:44px;top:192px;width:732px;font:400 19px/29px Next">${ANS.join(' ')}</div>
    <div style="position:absolute;left:44px;top:340px;width:360px;height:360px;overflow:hidden"><img src="assets/t2.png" style="position:absolute;width:360px"><img src="assets/m_change.png" style="position:absolute;width:360px"></div>
    <div class="mono" style="position:absolute;left:44px;top:708px;font:400 13px Mono;color:${K.ink3}">evidence: change_cva on input 2</div>
    <div style="position:absolute;left:436px;top:340px;width:340px"><div style="font:600 18px/30px Next">Measured evidence</div>${ROWS.map(r => mini([r[0], r[2] ? r[1].toFixed(r[2]) : r[1]])).join('')}</div>
    <div class="mono" style="position:absolute;left:44px;top:760px;width:732px;font:400 15px/26px Mono;color:${K.ink2}">${TR.steps.map((s, i) => `${i + 1}  ${s.tool.padEnd(12, ' ')} ${s.status}  ${s.ms} ms`).join('<br>')}</div>
    <div style="position:absolute;left:44px;top:990px;width:732px;border-top:1px solid ${K.rule};padding-top:12px;font:400 14px Next;color:${K.ink3}">Synthetic test scene. Generated by SatQuery; every number above is measured by a tool listed in the trace.</div>`;
  const trJson = JSON.stringify({ task: TR.task, input_config: TR.input_config, plan: TR.plan, inputs: TR.inputs.map(x => ({ name: x.name, modality: x.modality, bands: x.bands })),
    steps: TR.steps.map(s => ({ tool: s.tool, status: s.status, ms: s.ms, stats: s.stats || undefined })) }, null, 2);
  const shEls = SHEETS.map((s, i) => { const outer = mk('', `left:${s.cx - s.w / 2}px;top:${s.cy - s.h / 2}px;width:${s.w}px;height:${s.h}px;`, setPaper);
    mk(i === 0 ? repHtml : `<pre style="margin:0;position:absolute;left:40px;top:36px;font:400 16px/25px Mono;color:${K.ink}">${esc(trJson).split('\n').slice(0, 34).join('\n')}</pre><div class="mono" style="position:absolute;left:40px;top:${s.h - 50}px;font:400 14px Mono;color:${K.ink3}">satquery-trace.json</div>`,
      `left:0;top:0;width:${s.w}px;height:${s.h}px;background:${i ? K.sheet : '#fff'};transform:rotate(${s.r}deg);box-shadow:0 2px 0 rgba(20,24,32,0.06),0 24px 40px -18px rgba(20,24,32,0.35);overflow:hidden;`, outer);
    return outer; });
  const bSheet = shEls.map((el, i) => body(el, C.sheets + i * 0.48, 1300, { e: 0.1, n: 1, r0: i ? 6 : -5, kind: 'block' }));
  const RP = (lx, ly) => { const s = SHEETS[0], a = s.r * Math.PI / 180, dx = lx - s.w / 2, dy = ly - s.h / 2; return [s.cx + dx * Math.cos(a) - dy * Math.sin(a), s.cy + dx * Math.sin(a) + dy * Math.cos(a)]; };

  /* ── screen space: scene label, fusion card, words, end card, marks ── */
  const lbl = mk('', 'right:44px;left:auto;top:1012px;font:400 21px Mono;color:#fff;white-space:nowrap;text-shadow:0 0 6px rgba(0,0,0,0.6),0 1px 2px rgba(0,0,0,0.7);');
  const FS = ST.fuse_water;
  const card = mk(`<div style="font:600 22px Next;margin-bottom:6px">Optical + SAR water</div><div class="mono" style="font:400 16px Mono;color:${K.ink3};margin-bottom:10px">fuse_water</div>`
    + [['water in both', FS.water_both_pct + ' %'], ['optical only', FS.optical_only_pct + ' %'], ['SAR only', FS.sar_only_pct + ' %'], ['pixel agreement', '']].map((r, i) =>
      `<div style="display:flex;justify-content:space-between;border-top:1px solid ${K.rule};font:400 20px/46px Next;color:${K.ink2}">${r[0]}<span class="mono cv${i}" style="color:${K.ink};font:500 20px/46px Mono">${r[1]}</span></div>`).join(''),
    `left:1280px;top:250px;width:520px;padding:26px 30px 14px;background:${K.paper};border:1px solid ${K.ink};box-shadow:0 30px 60px -30px rgba(0,0,0,0.6);`);
  card.style.transformOrigin = '0 0'; const cardAg = card.querySelector('.cv3');
  /* v2 type track (owner 2026-10-17: "no subtitles; one bold word, Apple style, tap tap tap"). Refs: Apple "Don't Blink", carbon-neutral
     film, iPhone SE kinetic ad, Apple-style SaaS promo: one word or short phrase, centred and huge, hard cut in on the beat, swapped in
     place on the next beat; full-frame type cards (ink / paper, colour flips per beat) as shots of their own between the action. */
  const typeBg = mk('', `left:0;top:0;width:${W}px;height:${H}px;`);
  const typeEl = mk('', `left:0;top:0;width:${W}px;height:${H}px;`);           // show() clears inline display, so the flex box lives one level down
  const typeFlex = mk('', `left:0;top:0;width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;text-align:center;white-space:nowrap;font-family:Next;font-weight:800;letter-spacing:-0.045em;line-height:1;`, typeEl);
  const typeTxt = mk('', 'position:relative;padding:0 0.04em 0.08em;', typeFlex, '');
  /* [in, out, text, bg (null = over the action), size px, colour, dx, dy] */
  const TYPE = [
    [0.48, 1.8, 'Last week.', null, 190, '#fff'], [1.92, 2.4, 'Last night.', null, 190, '#fff'],
    [2.4, 2.88, 'What', 'ink', 330, K.paper], [2.88, 3.36, 'changed?', 'paper', 300, K.sig],
    [10.56, 11.04, 'Measured.', null, 210, '#fff'], [11.04, 11.28, 'Not', 'paper', 330, K.ink], [11.28, 11.52, 'guessed.', 'ink', 300, K.sig],
    [15.36, 16.2, 'Clouds?', null, 230, K.ink], [16.8, 17.04, 'Radar', 'ink', 330, K.paper], [17.04, 17.28, 'sees through.', 'paper', 230, K.ink],
    [20.64, 21.12, 'There.', null, 180, '#fff', -640, 0], [22.56, 22.8, 'Every step,', 'ink', 230, K.paper], [22.8, 23.04, 'on record.', 'paper', 230, K.sig],
  ];
  TYPE.forEach(w => ev(w[0], w[3] ? 'card' : 'tap'));
  function typeAt(t) {
    const tf = Math.round(t * C.fps) / C.fps, w = TYPE.find(x => tf >= x[0] - F1 && tf < x[1] - F1);   // frame-rounded like the camera: no ghost of a card across a cut
    show(typeBg, !!(w && w[3])); if (!show(typeEl, !!w)) return;
    const [a, , txt, bgc, size, col, dx = 0, dy = 0] = w;
    if (bgc) typeBg.style.background = bgc === 'ink' ? K.ink : K.paper;
    if (typeTxt.textContent !== txt) typeTxt.textContent = txt;
    typeTxt.style.fontSize = size + 'px'; typeTxt.style.color = col;
    typeTxt.style.textShadow = bgc ? 'none' : col === '#fff' ? '0 4px 30px rgba(0,0,0,0.45)' : '0 2px 24px rgba(255,255,255,0.7)';
    const k = eo4(P(t, a - F1, a - F1 + 0.16));                                // the punch: lands big, settles in 0.16 s, then holds dead still
    put(typeTxt, { x: dx, y: dy + 10 * (1 - k), s: 1 + 0.16 * (1 - k) });
  }
  // end card: ink iris, paper iris, blocks land on beats, slow push, hold, dissolve to frame 0
  const inkI = mk('', `left:0;top:0;width:${W}px;height:${H}px;background:${K.ink};`);
  const endBox = mk('', `left:0;top:0;width:${W}px;height:${H}px;background:${K.paper};`);
  const endCam = mk('', `left:0;top:0;width:${W}px;height:${H}px;`, endBox);
  const eMark = mk(LOGO(176, K.ink, K.paper), 'left:872px;top:186px;', endCam);
  const eWord = mk('SatQuery', `left:0;top:404px;width:${W}px;text-align:center;font:800 168px/1 Next;letter-spacing:-0.04em;`, endCam);
  const eTag = mk('Ask the image. Get the <span class="evw">evidence.</span>', `left:0;top:618px;width:${W}px;text-align:center;font:500 54px/1.2 Next;color:${K.ink2};`, endCam);
  const eSub = mk('Smart India Hackathon 2026 · SIH26167 · remote-sensing assistant', `left:0;top:760px;width:${W}px;text-align:center;font:400 26px Mono;color:${K.ink3};`, endCam);
  const bEnd = [eMark, eWord, eTag, eSub].map((el, i) => body(el, C.end + 0.48 + i * 0.48, [1100, 1000, 950, 900][i], { e: 0.14, n: 2, r0: [0, -3, 4, -2][i], kind: 'block' }));

  const pen = document.createElement('canvas'); pen.width = W; pen.height = H; pen.className = 'abs'; const pc = pen.getContext('2d');
  const hsh = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ell = (rx, ry, a0 = -2.2, turn = 1.12) => Array.from({ length: 28 }, (_, i) => { const a = a0 + turn * TAU * i / 27; return [rx * Math.cos(a) * (1 + 0.04 * Math.sin(i)), ry * Math.sin(a)]; });
  const MARKS = [
    { at: () => A(1350, 450), pts: ell(96, 40), t0: 12.72, t1: 12.98, out: 13.36, col: K.sig, w: 7 },                                       // circle "9.16"
    { at: () => A(1306, 610), pts: [[-200, 4], [-70, -2], [70, 3], [205, -3]], t0: 13.04, t1: 13.24, out: 13.36, col: K.sig, w: 7 },     // underline the label
    { abs: true, at: () => [0, 0], pts: [], t0: 29.04, t1: 29.34, out: C.fade, col: K.sig, w: 8 },                                          // underline "evidence." (measured at load)
  ];
  MARKS.forEach(m => ev(m.t0, 'mark'));

  /* ── SHOT LIST: [start, set, pose a, pose b, curve, look]. pose = [fx, fy, s, roll, rx] (focus = stage point at screen centre) ── */
  const WH = [3.84, 19.2, 24.0]; WH.forEach(w => ev(w, 'whoosh'));
  const SH_ = [
    [0.0, 'sat', [...M(560, 520), 1.12, 0, 0], [...M(578, 522), 1.18, 0, 0], 'lin', 't1'],          // 1 wide: last week
    [0.96, 'sat', [...M(522, 497), 3.0, -4, 0], [...M(530, 497), 3.15, -4.5, 0], 'lin', 't1'],       // 2 macro: the bridge, Dutch
    [1.92, 'sat', [...M(530, 497), 3.15, -4.5, 0], [...M(536, 497), 3.35, -5, 0], 'lin', 't2'],      // 3 match cut: same frame, the water is there
    [2.4, 'sat', [...M(500, 600), 1.32, 0, 20], [...M(500, 630), 1.25, 0, 20], 'lin', 't2'],         // 4 wide low angle
    [3.36, 'sat', [...M(300, 850), 2.3, 2, 0], [...M(300, 850), 2.7, 2, 0], 'snap', 't2'],           // 5 snap-in: the south fields
    [3.84, 'app', [...A(720, 520), 0.84, 0, 12], [...A(720, 500), 0.9, 0, 12], 'lin'],               // 6 whip: the laptop, low angle
    [4.8, 'app', [...A(185, 515), 2.5, 0, 0], [...A(205, 515), 2.6, 0, 0], 'lin'],                   // 7 close-up: the question
    [5.76, 'app', [...A(150, 500), 3.6, 4, 0], [...A(205, 500), 3.7, 4.5, 0], 'lin'],                // 8 macro: the typo + fix
    [6.72, 'app', [...A(185, 830), 2.2, 0, 0], [...A(185, 846), 2.6, 0, 0], 'snap'],                 // 9 insert: Run
    [7.68, 'app', [...A(880, 240), 1.32, 0, 0], [...A(880, 240), 1.4, 0, 0], 'lin'],                 // 10 medium: the answer arrives
    [8.64, 'app', [...A(642, 584), 1.6, 0, 0], [...A(642, 584), 2048 * 1.19 / 420, 0, 0], 'zoom'],   // 11 zoom-through the viewer
    [9.6, 'sat', [...M(512, 512), 1.19, 0, 0], [...M(512, 512), 1.1, 0, 0], 'lin', 't2m'],           // 12 full bleed: the mask scans in
    [10.56, 'sat', [...M(640, 170), 2.0, 3, 0], [...M(655, 175), 2.1, 3.5, 0], 'lin', 't2m'],        // 13 medium: north reach
    [11.52, 'sat', [...M(380, 760), 4.2, 0, 0], [...M(392, 760), 4.45, 0, 0], 'lin', 't2m'],         // 14 macro: mask pixels at the edge
    [12.48, 'app', [...A(1142, 520), 2.3, 0, 0], [...A(1142, 520), 2.4, 0, 0], 'snap'],              // 15 close-up: evidence digits roll
    [13.44, 'app', [...A(700, 175), 2.1, -4, 0], [...A(780, 175), 2.15, -4.4, 0], 'lin'],            // 16 close-up: the answer, Dutch
    [14.4, 'app', [...A(1100, 300), 3.0, 0, 0], [...A(1112, 300), 3.12, 0, 0], 'lin'],               // 17 insert: confidence
    [15.36, 'sat', [...M(512, 512), 1.1, 0, 0], [...M(512, 512), 1.16, 0, 0], 'lin', 'cloud'],       // 18 wide: clouds (slam after the gap)
    [16.32, 'sat', [...M(512, 512), 1.3, 2, 0], [...M(520, 512), 1.36, 2, 0], 'lin', 'sarwipe'],      // 19 SAR wipes through the cloud
    [17.28, 'sat', [...M(300, 850), 2.8, 0, 0], [...M(300, 860), 2.95, 0, 0], 'lin', 'sar'],          // 20 macro: speckle, SAR water
    [18.24, 'sat', [...M(470, 520), 1.4, 0, 0], [...M(470, 520), 1.34, 0, 0], 'lin', 'fuse'],         // 21 medium: fused + card
    [19.2, 'app', [...A(150, 500), 3.2, -3, 0], [...A(190, 500), 3.3, -3.4, 0], 'lin'],               // 22 whip: second question
    [20.16, 'sat', [...M(618, 574), 1.22, 0, 0], [...M(618, 574), 1.3, 0, 0], 'lin', 'box'],          // 23 the VLM box draws
    [21.12, 'sat', [...M(618, 640), 1.3, 0, 18], [...M(618, 660), 1.24, 0, 18], 'lin', 'box'],        // 24 wide low angle
    [22.08, 'app', [...A(1140, 690), 2.1, 3, 0], [...A(1150, 690), 2.2, 3.4, 0], 'lin'],              // 25 the trace
    [23.04, 'app', [...A(1196, 102), 2.8, 0, 0], [...A(1196, 102), 3.1, 0, 0], 'snap'],               // 26 insert: Report
    [24.0, 'paper', [960, 560, 0.86, -3, 0], [960, 560, 0.93, -2.5, 0], 'lin'],                      // 27 whip: sheets drop, top-down
    [24.96, 'paper', [...RP(224, 520), 2.0, 0, 0], [...RP(330, 540), 2.1, 0, 0], 'lin'],              // 28 macro: the report's map
    [25.92, 'paper', [960, 560, 0.74, 0, 0], [960, 560, 0.68, 0, 0], 'snap'],                         // 29 pull-out, stop-time
    [26.88, 'end', [960, 540, 1, 0, 0], [960, 540, 1, 0, 0], 'lin'],                                  // 30 end card
  ];
  const cutAt = s => s[0] === 0 ? 0 : s[0] - F1;
  SH_.forEach((s, i) => { if (i && !WH.includes(s[0])) ev(s[0], 'cut', 400); });
  function shotAt(t) { let i = 0; while (i + 1 < SH_.length && t >= cutAt(SH_[i + 1])) i++; return i; }
  const snap = u => (1 - Math.exp(-u * 9)) / (1 - Math.exp(-9));
  function poseAt(t) {                                   // the shot comes from the frame-rounded time: all subframes of a frame share it
    const i = shotAt(Math.round(t * C.fps) / C.fps), s = SH_[i], t0 = cutAt(s), t1 = i + 1 < SH_.length ? cutAt(SH_[i + 1]) : D, u = P(t, t0, t1);
    const k = s[4] === 'snap' ? snap(u) : u, a = s[2], b = s[3];
    const p = a.map((v, j) => lerp(v, b[j], k));
    if (s[4] === 'zoom') p[2] = a[2] * Math.pow(b[2] / a[2], ei3(u));
    let wx = 0, wr = 0;
    WH.forEach((w, j) => { const dir = j % 2 ? -1 : 1, c = w - F1;
      if (t > c - 0.12 && t < c) { const q = ei3(P(t, c - 0.12, c)); wx -= dir * 2000 * q; wr -= dir * 3 * q; }
      if (t >= c && t < c + 0.14) { const q = 1 - eo3(P(t, c, c + 0.14)); wx += dir * 2000 * q; wr += dir * 3 * q; } });
    return { i, set: s[1], look: s[5], fx: p[0], fy: p[1], s: p[2], r: p[3] + wr, rx: p[4], wx };
  }
  const project = (cp, x, y) => { const a = cp.r * Math.PI / 180, dx = (x - cp.fx) * cp.s, dy = (y - cp.fy) * cp.s;
    return [960 + cp.wx + dx * Math.cos(a) - dy * Math.sin(a), 540 + dx * Math.sin(a) + dy * Math.cos(a)]; };

  function marks(t, cp) {
    pc.setTransform(1, 0, 0, 1, 0, 0); pc.clearRect(0, 0, W, H);
    const boil = Math.floor(t * 12);
    MARKS.forEach((m, mi) => {
      if (t < m.t0 || t > m.out + 0.25) return;
      const u = P(t, m.t0, m.t1), k = u < 0.55 ? 0.62 * eo3(u / 0.55) : 0.62 + 0.38 * eo3((u - 0.55) / 0.45);
      const a = 1 - P(t, m.out, m.out + 0.22); if (a <= 0 || k <= 0) return;
      const [cx, cy] = m.abs ? [0, 0] : project(cp, ...m.at());
      const pts = m.pts.map(([x, y], i) => [cx + x + 3 * (hsh(boil * 31 + i + mi * 7) - 0.5), cy + y + 3 * (hsh(boil * 17 + i * 3 + mi) - 0.5)]);
      const sm = []; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let j = 0; j < 10; j++) { const s_ = j / 10, s2 = s_ * s_, s3 = s2 * s_;
          sm.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * s_ + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3),
                   0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * s_ + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3)]); } }
      sm.push(pts[pts.length - 1]);
      const n = Math.max(2, Math.floor(sm.length * k));
      pc.globalAlpha = a; pc.strokeStyle = m.col; pc.lineCap = 'round'; pc.lineJoin = 'round';
      for (let i = 1; i < n; i++) { pc.lineWidth = m.w * (0.78 + 0.32 * Math.sin(i * 0.45 + mi)) * (i < 4 ? 0.7 : 1); pc.beginPath(); pc.moveTo(...sm[i - 1]); pc.lineTo(...sm[i]); pc.stroke(); }
    });
    pc.globalAlpha = 1;
  }
  const iris = (el, t, a, b) => { const k = eio3(P(t, a, b)); el.style.clipPath = `circle(${(2300 * k).toFixed(1)}px at 960px 540px)`; };
  const roll = (t, a, d, v, dec) => (v * eo3(P(t, a, a + d))).toFixed(dec);
  const BGC = { sat: K.night, app: K.desk, paper: K.table, end: K.paper };
  ev(C.answer, 'pop'); ev(C.paint, 'scan'); ev(C.sarWipe, 'scan'); ev(C.sarMask, 'scan'); ev(C.fuse + 0.06, 'pop'); ev(C.box, 'box'); ev(C.box + 0.48, 'pop');
  ev(1.92, 'slam'); ev(C.cloud, 'slam'); ev(C.roll, 'roll');

  window.seek = async function (t) {
    const loopBack = t >= C.fade;                          // the end card dissolves onto frame 0
    const cp = loopBack ? poseAt(0) : poseAt(t), tl = loopBack ? 0 : t;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = BGC[cp.set]; g.fillRect(0, 0, W, H);
    cam.style.transformOrigin = `${cp.fx.toFixed(2)}px ${cp.fy.toFixed(2)}px`;
    put(cam, { x: 960 - cp.fx + cp.wx, y: 540 - cp.fy, s: cp.s, r: cp.r, rx: cp.rx });
    show(setSat, cp.set === 'sat'); show(setApp, cp.set === 'app'); show(setPaper, cp.set === 'paper' || cp.set === 'end');

    if (show(lbl, cp.set === 'sat')) lbl.textContent = `${cp.look === 't1' ? 'river_t1.tif' : cp.look === 'sar' ? 'river_sar.tif' : 'river_t2.tif'} · synthetic test scene`;
    if (cp.set === 'sat') {
      const L = cp.look;
      show(mT1, L === 't1'); show(mT2, L !== 't1' && L !== 'sar'); show(mSAR, L === 'sar' || L === 'sarwipe');
      const kw = P(tl, C.sarWipe, C.sarWipe + 0.4); mSAR.style.clipPath = L === 'sarwipe' ? `inset(0 ${(100 * (1 - kw)).toFixed(2)}% 0 0)` : 'none';
      if (show(scanV, L === 'sarwipe' && kw > 0 && kw < 1)) put(scanV, { x: kw * 2048 - 3 });
      if (show(mCl, L === 'cloud' || L === 'sarwipe')) put(mCl, { x: 70 * (tl - C.cloud), y: 20 * (tl - C.cloud) });
      const kp = P(tl, C.paint, C.paint + 0.72);
      if (show(mChg, L === 't2m')) mChg.style.clipPath = `inset(0 0 ${(100 * (1 - kp)).toFixed(2)}% 0)`;
      if (show(scanH, L === 't2m' && kp > 0 && kp < 1)) put(scanH, { y: kp * 2048 - 3 });
      if (show(mSm, L === 'sar')) mSm.style.clipPath = `inset(0 0 ${(100 * (1 - P(tl, C.sarMask, C.sarMask + 0.6))).toFixed(2)}% 0)`;
      if (show(mFu, L === 'fuse')) mFu.style.clipPath = `inset(0 0 ${(100 * (1 - P(tl, C.fuse, C.fuse + 0.4))).toFixed(2)}% 0)`;
      if (show(boxSvg, L === 'box')) boxRects.forEach(r => { r.style.strokeDasharray = boxLen; r.style.strokeDashoffset = (boxLen * (1 - eo3(P(tl, C.box, C.box + 0.4)))).toFixed(1); });
      if (show(boxLbl, L === 'box' && tl > C.box + 0.48)) put(boxLbl, { s: Math.max(0, Math.min(1.08, pop(tl, C.box + 0.48))) });
    }
    if (show(card, cp.set === 'sat' && cp.look === 'fuse' && tl >= C.fuse + 0.06)) {
      put(card, { s: Math.max(0, Math.min(1.08, pop(tl, C.fuse + 0.06))), o: 1 }); cardAg.textContent = roll(tl, C.fuse + 0.3, 0.42, FS.pixel_agreement, 3); }

    if (cp.set === 'app') {
      const after = tl >= C.answer;
      const q = tl < C.clear2 ? (tl < C.type1 ? '' : typedAt(K1, tl)) : typedAt(K2, tl);
      qSpan.textContent = q || '​';
      const typing = (tl > K1[0][0] && tl < K1[K1.length - 1][0] + 0.3) || (tl > C.clear2 && tl < K2[K2.length - 1][0] + 0.3);
      put(qCaret, { o: typing || Math.floor(tl * 2) % 2 === 0 ? 1 : 0 });
      const running = tl >= C.run && tl < C.answer;
      runBtn.textContent = running ? 'Running…' : 'Run query'; runBtn.style.background = running ? K.ink2 : K.ink;
      put(runBtn, { s: tl >= C.run && tl < C.run + 0.12 ? 0.98 : 1 }); put(repBtn, { s: tl >= C.report && tl < C.report + 0.12 ? 0.98 : 1 });
      show(empty, !after);
      if (show(res, after)) { const k = eo3(P(tl, C.answer, C.answer + 0.22)); put(ansEl, { y: 6 * (1 - k), o: k });
        ROWS.forEach((r, i) => { rowV[i].textContent = tl < C.roll ? '' : r[2] ? roll(tl, C.roll + i * 0.06, 0.38, r[1], r[2]) : (tl > C.roll + 0.42 ? r[1] : ''); });
        confTxt.textContent = tl < C.conf ? '' : roll(tl, C.conf, 0.4, confV * 100, 1) + ' %'; put(confBar, { sx: tl < C.conf ? 0 : confV * eo3(P(tl, C.conf, C.conf + 0.4)), sy: 1 });
        trRows.forEach((el, i) => put(el, { o: tl < C.trace ? 1 : P(tl, C.trace + i * 0.24, C.trace + i * 0.24 + 0.05), x: tl < C.trace ? 0 : -14 * (1 - eo3(P(tl, C.trace + i * 0.24, C.trace + i * 0.24 + 0.2))) }));
        put(trOut, { o: tl < C.trace ? 1 : P(tl, C.trace + 0.48, C.trace + 0.55) }); }
      const layer = tl < C.answer ? 0 : tl < C.paint ? 1 : 2;
      show(vT1, layer === 0); show(vT2, layer >= 1); show(vM, layer === 2);
      strip.forEach((el, i) => { el.style.background = i === layer ? K.ink : 'transparent'; el.style.color = i === layer ? '#fff' : K.ink; el.style.borderColor = i === layer ? K.ink : K.rule2; });
      const cc = CURS.find(c => tl >= c[0] && tl < c[3]);
      if (show(cur, !!cc)) { const [a, p, r, z, x0, y0, x1, y1] = cc, k = ovs(tl, a, 7);
        put(cur, { x: lerp(x0, x1, k) - 3, y: lerp(y0, y1, k) - 3, s: tl >= p && tl < r ? 0.84 : 1, o: P(tl, a, a + 0.08) * (1 - P(tl, z - 0.12, z)) }); }
    }
    if (cp.set === 'paper' || cp.set === 'end') bSheet.forEach(b => apply(b, tl));

    typeAt(tl);
    if (show(inkI, t >= C.end && t < C.end + 0.6)) iris(inkI, t, C.end, C.end + 0.36);
    if (show(endBox, t >= C.end + 0.12 && t < D - 0.01)) {
      iris(endBox, t, C.end + 0.12, C.end + 0.5);
      endBox.style.opacity = (1 - eio3(P(t, C.fade, C.fade + 0.5))).toFixed(3);
      endCam.style.transformOrigin = '960px 540px'; put(endCam, { s: 1 + 0.03 * P(t, C.end, C.fade) });
      bEnd.forEach(b => apply(b, t));
    }
    marks(t, cp);
  };

  await PV.loaded(['800 300px "Next"', '400 16px "Next"', '600 15px "Next"', '700 19px "Next"', '400 14px "Mono"', '500 32px "Mono"', '500 54px "Next"', '800 168px "Next"']);
  world.appendChild(lbl); world.appendChild(card); world.appendChild(typeBg); world.appendChild(typeEl); world.appendChild(inkI); world.appendChild(endBox); world.appendChild(pen);
  { const r = eTag.querySelector('.evw').getBoundingClientRect(), y = r.bottom + 4;
    MARKS[2].pts = [[r.left - 6, y + 2], [r.left + r.width * 0.35, y - 3], [r.left + r.width * 0.7, y + 4], [r.right + 8, y - 2]]; }
  (window.__events = window.__events || {}).impacts = IMPACTS.sort((a, b) => a.t - b.t);
  window.__events.stops = C.stops;
  await window.seek(0); PV.ready();
})();
