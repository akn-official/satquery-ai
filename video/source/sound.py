#!/usr/bin/env python3
"""SatQuery promo score: original minimal electro / tech-house, 125 bpm, F# minor (F#m9 Dmaj9 Bm9 C#7sus4). Everything synthesised here.
   Four-on-the-floor, offbeat bass, plucked 16th arp with a filter that opens over the film, clap, open hats, 6 stop-time gaps (music bus
   gated) that slam back on the next cut. SFX come from the picture's IMPACTS (grid times). Phone EQ from reel 6/7.
   python projects/satquery-promo/sound.py  (needs out/satquery-promo/events.json from render.js --events)"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'lib'))
import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d
import synth as S, sonic as SN, lush as LU

C = S.load_cues(HERE)
seed = SN.seed_of('satquery-promo-v1'); S.init(C['duration'], seed=seed); SN.use_room('hall', seed)
R = np.random.default_rng(seed); SR = S.SR; add = S.add
BAR, BEAT = C['bar'], C['beat']
tt = lambda d: np.arange(int(SR * d)) / SR
sos = lambda kind, f, o=2: signal.butter(o, f, kind, fs=SR, output='sos')
nrm = lambda x, v: x / (np.max(np.abs(x)) + 1e-9) * v


def brown(n):
    x = np.cumsum(R.standard_normal(n)); x = signal.lfilter([1, -1], [1, -0.995], x); return nrm(x, 1)


def sweep_bp(x, f0, f1, q=1.2, steps=64):
    out = np.zeros_like(x); n = len(x); b = max(1, n // steps)
    for i in range(0, n, b):
        fc = f0 * (f1 / f0) ** (i / max(1, n - 1)); lo, hi = max(20, fc / (1 + 1 / q)), min(fc * (1 + 1 / q), SR / 2 - 100)
        out[i:i + b] = signal.sosfilt(sos('bandpass', [lo, hi]), x[i:i + b])
    return out


def whoosh(d=0.6, vol=0.2, peak=0.6, f0=250, f1=2600):
    n = int(SR * d); x = brown(n); k = max(1, int(n * peak))
    y = np.concatenate([sweep_bp(x[:k], f0, f1), sweep_bp(x[k:], f1, f0 * 0.7)])
    e = np.concatenate([np.linspace(0, 1, k) ** 2.2, np.exp(-np.linspace(0, 5, n - k))])
    return nrm(y * e, vol)


def impact(vol=0.5, size=1.0):
    t = tt(0.9 * size + 0.3)
    sub = np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-t / 0.035)) / SR) * np.exp(-t / (0.22 * size + 0.08)))
    crack = nrm(signal.sosfilt(sos('bandpass', [700, 3800]), R.standard_normal(len(t))) * np.exp(-t / 0.018), 0.55)
    tail = nrm(signal.sosfilt(sos('highpass', 2500), R.standard_normal(len(t))) * np.exp(-t / (0.12 * size + 0.04)), 0.3)
    return nrm(sub + crack + tail, vol)


def reverse_swell(d=0.8, vol=0.18):
    x = impact(1.0, 1.4)[:int(SR * d)][::-1] * np.linspace(0, 1, int(SR * d)) ** 1.5
    return nrm(x, vol)


def riser(d, vol=0.16):
    t = tt(d); f = 110 * 2 ** (3 * (t / d) ** 1.6)
    saw = sum(np.sin(2 * np.pi * np.cumsum(f * h) / SR) / h for h in range(1, 9))
    return nrm((0.5 * nrm(saw, 1) + 0.7 * nrm(sweep_bp(brown(len(t)), 300, 7000, q=0.8), 1)) * (t / d) ** 2.5, vol)


def ui_click(vol=0.16):
    t = tt(0.05); x = nrm(signal.sosfilt(sos('highpass', 1800), R.standard_normal(len(t))) * np.exp(-t / 0.004), 1)
    return nrm(x + 0.5 * np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.012), vol)


def kick(vol=0.3):
    t = tt(0.3); x = np.sin(2 * np.pi * np.cumsum(55 + 130 * np.exp(-t / 0.022)) / SR) * np.exp(-t / 0.08)
    x += 0.5 * signal.sosfilt(sos('bandpass', [2000, 6000]), R.standard_normal(len(t))) * np.exp(-t / 0.003)   # beater click (phones)
    return np.tanh(1.7 * x) * vol


def clap(vol=0.14):
    t = tt(0.35); n = signal.sosfilt(sos('bandpass', [900, 7000]), R.standard_normal(len(t)))
    env = sum(np.exp(-np.maximum(0, t - a) / 0.006) * (t >= a) for a in (0, 0.011, 0.022)) + 0.8 * np.exp(-np.maximum(0, t - 0.03) / 0.09) * (t >= 0.03)
    return nrm(n * env, vol)


def hat(vol=0.05, open_=False):
    t = tt(0.22 if open_ else 0.05)
    return nrm(signal.sosfilt(sos('bandpass', [6500, 12000], 4), R.standard_normal(len(t))) * np.exp(-t / (0.06 if open_ else 0.01)), vol)


def bass(m, d, vol=0.16):
    """offbeat bass: sine + filtered saw, short, saturated; mids so phones hear the notes"""
    t = tt(d); f = S.midi(m)
    x = 0.6 * np.sin(2 * np.pi * f * t) + 0.8 * signal.sawtooth(2 * np.pi * f * t)
    x = signal.sosfilt(sos('lowpass', 1600, 2), np.tanh(2.0 * x)) * np.minimum(1, t / 0.004) * np.exp(-t / (d * 0.7))
    return nrm(x, vol)


def pluck(m, vol, cut):
    """plucked synth: two detuned saws through a fast-closing low-pass (cut = brightness), no bell partials"""
    t = tt(0.32); f = S.midi(m); x = signal.sawtooth(2 * np.pi * f * t) + signal.sawtooth(2 * np.pi * f * 1.004 * t + 1)
    out = np.zeros_like(x); b = len(x) // 16
    for j in range(0, len(x), b): out[j:j + b] = signal.sosfilt(sos('lowpass', min(SR / 2 - 200, 300 + cut * np.exp(-(j / SR) / 0.05)), 2), x[j:j + b])
    return nrm(out * np.minimum(1, t / 0.003) * np.exp(-t / 0.09), vol)


def keys(ms, d, vol=0.05):
    t = tt(d); x = sum(np.sin(2 * np.pi * S.midi(m) * t) + 0.25 * np.sin(4 * np.pi * S.midi(m) * t) * np.exp(-t / 0.3) for m in ms)
    x *= (1 - 0.18 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.2 * t))) * np.minimum(1, t / 0.01) * np.exp(-t / (d * 0.5))
    return nrm(x, vol)


def pad_air(ms, d, vol=0.045):
    x = LU.pad(ms, d, vol * 2.6, R, attack=0.5, release=0.8, bright=0.7, detune=0.1)
    return x + nrm(signal.sosfilt(sos('bandpass', [3000, 9000]), brown(len(x))) * np.hanning(len(x)), vol * 0.5)


def key_snd(vol=0.05):
    t = tt(0.07); x = signal.sosfilt(sos('bandpass', [1200 + 600 * R.random(), 4200]), R.standard_normal(len(t))) * np.exp(-t / 0.006)
    x += 0.5 * np.sin(2 * np.pi * (140 + 30 * R.random()) * t) * np.exp(-t / 0.018); return nrm(x, vol)


def pop_snd(vol=0.08):
    t = tt(0.12); body = np.sin(2 * np.pi * np.cumsum(170 * np.exp(-t / 0.03) + 70) / SR) * np.exp(-t / 0.035)
    air = signal.sosfilt(sos('bandpass', [900, 3500]), R.standard_normal(len(t))) * np.exp(-t / 0.012)
    return nrm(body + 0.35 * nrm(air, 1), vol)


def marker_snd(vol=0.05):
    t = tt(0.32); x = signal.sosfilt(sos('bandpass', [1800, 6500]), R.standard_normal(len(t)))
    env = (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 9 * t + R.random()))) * np.minimum(1, t / 0.02) * np.exp(-t / 0.2); return nrm(x * env, vol)


def tick(vol=0.03):
    t = tt(0.03); return nrm(signal.sosfilt(sos('highpass', 5000), R.standard_normal(len(t))) * np.exp(-t / 0.004), vol)


CH = [[54, 57, 61, 64, 68], [50, 54, 57, 61, 64], [47, 50, 54, 57, 61], [49, 54, 56, 59, 61]]   # F#m9 Dmaj9 Bm9 C#7sus4
ROOT = [42, 38, 35, 37]
STOPS = C['stops']
in_stop = lambda t: any(a - 0.005 <= t < b for a, b in STOPS)
st = lambda bar, step: bar * BAR + step * BEAT / 4 + (0.02 * BEAT / 2 if step % 2 else 0)   # 52 % swing
def mus(x, t, **k):
    if not in_stop(t): add(x, t, **k)


def drums(b, kick_on=True, clap_on=True, hats=True):
    for s in range(16):
        if kick_on and s % 4 == 0: mus(kick(0.3), st(b, s), name='kick')
        if clap_on and s in (4, 12): mus(clap(0.26), st(b, s), send=0.3, pan=0.05, name='clap')
        if hats:
            if s % 4 == 2: mus(hat(0.05, True), st(b, s), pan=0.2, name='hatO')
            else: mus(hat(0.026 if s % 2 else 0.018), st(b, s), pan=-0.25, name='hat')


def bassline(b, vol=0.15):
    for s, o in ((2, 0), (6, 0), (10, 12), (14, 0), (15, 7)):
        mus(bass(ROOT[b % 4] + o, BEAT / 4 * (0.9 if s == 15 else 1.6), vol), st(b, s), name='bass')


ARP = [0, 2, 1, 3, 2, 4, 3, 1]
def arp(b, vol, cut):
    for s in range(16):
        if s % 3 == 2: continue                           # gaps keep it breathing, not a machine-gun
        mus(pluck(CH[b % 4][ARP[s % 8] % 5] + 12, vol, cut), st(b, s), pan=0.3 * np.sin(s), send=0.35, name='arp')


# ── arrangement (16 bars of 1.92 s) ──
add(SN.drone(42, BAR + 0.4, 0.09, R), 0.0, name='drone'); arp(0, 0.08, 1500)
for b in range(1, 14):
    full = b not in (7,)                                  # bar 7 = the build into the clouds
    drums(b, kick_on=True, clap_on=b > 1, hats=b > 1)
    bassline(b, 0.15)
    arp(b, 0.08 + 0.02 * min(b, 6) / 6, 1800 + 300 * b)
    if b % 2 == 1: mus(keys(CH[b % 4], BAR, 0.07), b * BAR, pan=-0.1, send=0.45, name='keys')
mus(pad_air(CH[2], BAR * 2, 0.04), 15.36, send=0.5, name='cloudPad')      # under the clouds / radar
mus(pad_air(CH[0], BAR, 0.035), 24.0, send=0.5, name='sheetPad')
add(SN.drone(42, 4.2, 0.08, R), 26.88, name='drone2'); add(pad_air(CH[0], 3.9, 0.05), 26.88, send=0.55, name='endPad')
add(keys(CH[1], 1.8, 0.03), 28.8, pan=-0.1, send=0.5, name='endKeys')
add(bass(ROOT[0], 1.2, 0.14), 26.88, name='endBass')

for ch in ('L', 'R', 'RL', 'RR'):                         # gate the music bus in the stop-time gaps, reverb sends too
    x = getattr(S, ch); gt = np.ones(len(x))
    for a, b in STOPS: gt[int((a - 0.008) * SR):int(b * SR)] = 0
    setattr(S, ch, x * uniform_filter1d(gt, int(0.008 * SR)))

# ── designed moments ──
hit = lambda t, vol, size, pan=0.0, send=0.35, name='impact': add(impact(vol, size), t, pan=pan, send=send, name=name)
add(riser(1.4, 0.1), 15.0 - 1.4, name='cloudRiser'); add(reverse_swell(0.6, 0.12), 15.36 - 0.6, name='swell')
add(riser(0.9, 0.09), 9.6 - 0.9, name='zoomRiser')
add(reverse_swell(0.45, 0.1), 26.88 + 0.48 - 0.45, name='endSwell')
add(LU.air(0.6, 0.03, False, R), C['fade'], name='fade')

EV = json.load(open(os.path.join(HERE, '..', '..', 'out', 'satquery-promo', 'events.json'), encoding='utf-8'))['impacts']
last = {}
for e in EV:
    t, k, v = e['t'], e['kind'], min(1.0, e['v'] / 4500)
    if t - last.get(k, -9) < 0.05: continue
    last[k] = t
    if k == 'key': add(key_snd(0.03 + 0.012 * R.random()), t, pan=0.1, send=0.1, name='key')
    elif k == 'press': add(ui_click(0.1), t, name='press'); hit(t, 0.1, 0.4, name='pressHit')
    elif k == 'whoosh': add(whoosh(0.5, 0.17, 0.6, 300, 4200), t - 0.3, pan=0.3, name='whip')     # peak on the cut frame
    elif k == 'pop': add(pop_snd(0.09), t, send=0.25, name='pop')
    elif k == 'scan': add(whoosh(0.8, 0.09, 0.85, 500, 7000), t, pan=-0.2, send=0.2, name='scan')
    elif k == 'box': add(marker_snd(0.06), t, send=0.2, name='box')
    elif k == 'roll': add(riser(0.4, 0.05), t, name='roll')
    elif k == 'slam': add(LU.air(0.5, 0.02, True, R), t - 0.5, name='slamAir'); hit(t, 0.32, 1.1, send=0.45, name='slam')
    elif k == 'cut': add(tick(0.02), t, name='cut')
    elif k == 'card': hit(t, 0.16, 0.45, send=0.25, name='card'); add(clap(0.12), t, send=0.2, name='cardClap')   # tap: each type card lands on the beat
    elif k == 'tap': hit(t, 0.12, 0.4, send=0.25, name='tap')
    elif k == 'block': hit(t, 0.16 + 0.08 * v, 0.7, send=0.4, name='block')
    elif k == 'mark': add(marker_snd(0.05), t, pan=-0.1, send=0.15, name='mark')

for ch in ('L', 'R', 'RL', 'RR'):                         # phone EQ: pull the sub down, lift presence and air
    x = getattr(S, ch); lo = signal.sosfilt(sos('lowpass', 110, 2), x); hi = signal.sosfilt(sos('highpass', 2600, 2), x); pr = signal.sosfilt(sos('bandpass', [800, 4000], 2), x)
    setattr(S, ch, x - 0.6 * lo + 1.4 * hi + 1.3 * pr)
S.master(S.default_out(HERE), body=(1.92, 26.4), target_rms=-15, ceiling=-1.5, unit_reverb=True)
