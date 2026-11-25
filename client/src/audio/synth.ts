// Procedural WebAudio tactical sound synthesis (zero external audio dependencies).
// Generates round-robin cached AudioBuffers on first request for gunshots, metallic reloads,
// supersonic bullet whizzes, surface impacts, tactical boot footsteps, medical foley, and UI stings.
import type { ManifestFile } from "./loader";

interface Clip {
  id: string;
  buf: AudioBuffer;
  file: ManifestFile;
}

const SYNTH_FILE = { cat: "__synth__", path: "", lufs: { I: -18, P: -14 } } as unknown as ManifestFile;
const VARIANTS = 3;

interface GunSpec {
  crackHz: number;
  crackQ: number;
  f0: number;
  f1: number;
  punchMs: number;
  tailMs: number;
  lpHz: number;
  crackGain: number;
  punchGain: number;
  tailGain: number;
  peak: number;
}

const GUNS: Record<string, GunSpec> = {
  pistol:  { crackHz: 3200, crackQ: 1.1, f0: 215, f1: 54, punchMs: 36, tailMs: 190, lpHz: 6600, crackGain: 0.95, punchGain: 0.72, tailGain: 0.42, peak: 0.70 },
  smg:     { crackHz: 2450, crackQ: 1.3, f0: 190, f1: 60, punchMs: 28, tailMs: 135, lpHz: 5800, crackGain: 0.88, punchGain: 0.68, tailGain: 0.36, peak: 0.65 },
  ar:      { crackHz: 3600, crackQ: 1.0, f0: 245, f1: 66, punchMs: 44, tailMs: 300, lpHz: 7600, crackGain: 1.05, punchGain: 0.82, tailGain: 0.56, peak: 0.76 },
  shotgun: { crackHz: 1850, crackQ: 0.9, f0: 155, f1: 35, punchMs: 68, tailMs: 410, lpHz: 4500, crackGain: 0.95, punchGain: 1.10, tailGain: 0.75, peak: 0.84 },
  sniper:  { crackHz: 4300, crackQ: 1.1, f0: 175, f1: 38, punchMs: 78, tailMs: 760, lpHz: 8200, crackGain: 1.20, punchGain: 1.00, tailGain: 0.82, peak: 0.90 },
  rocket:  { crackHz: 1400, crackQ: 0.8, f0: 130, f1: 34, punchMs: 95, tailMs: 560, lpHz: 3200, crackGain: 0.65, punchGain: 0.95, tailGain: 0.90, peak: 0.80 },
};

function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function noise(n: number, rnd: () => number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

function biquad(data: Float32Array, sr: number, type: "lp" | "hp" | "bp", fc: number, q = 0.707): Float32Array {
  const w0 = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr;
  const cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * q);
  let b0 = 0, b1 = 0, b2 = 0;
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  if (type === "lp") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
  else if (type === "hp") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const out = new Float32Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const ib0 = b0 / a0, ib1 = b1 / a0, ib2 = b2 / a0, ia1 = a1 / a0, ia2 = a2 / a0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    const y0 = ib0 * x0 + ib1 * x1 + ib2 * x2 - ia1 * y1 - ia2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

function addPitchSine(out: Float32Array, sr: number, tStart: number, dur: number, f0: number, f1: number, amp: number, tau: number) {
  const i0 = Math.max(0, Math.floor(tStart * sr));
  const i1 = Math.min(out.length, Math.floor((tStart + dur) * sr));
  let ph = 0;
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / Math.max(0.002, dur * 0.32));
    ph += (2 * Math.PI * f) / sr;
    const atk = Math.min(1, t / 0.0015);
    out[i] += Math.sin(ph) * amp * atk * Math.exp(-t / tau);
  }
}

function addClick(out: Float32Array, sr: number, tAt: number, dur: number, f1: number, f2: number, amp: number, rnd: () => number) {
  const i0 = Math.max(0, Math.floor(tAt * sr));
  const len = Math.max(8, Math.floor(dur * sr));
  const end = Math.min(out.length, i0 + len);
  let ph1 = 0, ph2 = 0;
  for (let i = i0; i < end; i++) {
    const t = (i - i0) / sr;
    const env = Math.exp(-t / (dur * 0.28)) * Math.min(1, t / 0.0008);
    ph1 += (2 * Math.PI * f1) / sr;
    ph2 += (2 * Math.PI * f2) / sr;
    out[i] += (Math.sin(ph1) * 0.55 + Math.sin(ph2) * 0.35 + (rnd() * 2 - 1) * 0.35) * env * amp;
  }
}

function normalize(out: Float32Array, targetPeak: number) {
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return;
  const k = targetPeak / peak;
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * k * 1.15) * targetPeak;
}

function fadeOutEdge(out: Float32Array, sr: number, ms = 8) {
  const fade = Math.min(out.length, Math.floor((ms / 1000) * sr));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
}

export class TacticalSynth {
  private cache = new Map<string, AudioBuffer[]>();
  private lastPick = new Map<string, number>();
  private out: Clip = { id: "", buf: null as unknown as AudioBuffer, file: SYNTH_FILE };

  constructor(private ctx: BaseAudioContext) {}

  has(group: string): boolean {
    return (
      group.startsWith("w/") ||
      group === "fx/whizz" ||
      group.startsWith("imp/") ||
      group.startsWith("hit/") ||
      group.startsWith("step/") ||
      group.startsWith("ui/") ||
      (group.startsWith("loot/") && !group.startsWith("loot/chest-hum"))
    );
  }

  pick(group: string, rnd: () => number): Clip | undefined {
    if (!this.has(group)) return undefined;
    let list = this.cache.get(group);
    if (!list) {
      list = [];
      for (let v = 0; v < VARIANTS; v++) {
        list.push(this.synthesize(group, v));
      }
      this.cache.set(group, list);
    }
    const prev = this.lastPick.get(group) ?? -1;
    let idx = Math.floor(rnd() * list.length);
    if (list.length > 1 && idx === prev) idx = (idx + 1) % list.length;
    this.lastPick.set(group, idx);
    this.out.id = `${group}#synth-${idx}`;
    this.out.buf = list[idx];
    return this.out;
  }

  private synthesize(group: string, v: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    let hash = 2166136261 ^ v;
    for (let i = 0; i < group.length; i++) hash = Math.imul(hash ^ group.charCodeAt(i), 16777619);
    const rnd = makeRng(hash >>> 0);

    let data: Float32Array;
    if (group === "w/equip") data = this.renderEquip(sr, rnd);
    else if (group === "w/dry") data = this.renderDry(sr, rnd);
    else if (group === "w/casing") data = this.renderCasing(sr, rnd);
    else if (group.startsWith("w/")) data = this.renderWeapon(group, sr, rnd);
    else if (group === "fx/whizz") data = this.renderWhizz(sr, rnd);
    else if (group.startsWith("imp/")) data = this.renderImpact(group.slice(4), sr, rnd);
    else if (group.startsWith("hit/")) data = this.renderHit(group.slice(4), sr, rnd);
    else if (group.startsWith("step/")) data = this.renderStep(group.slice(5), sr, rnd);
    else if (group.startsWith("loot/")) data = this.renderLoot(group.slice(5), sr, rnd);
    else data = this.renderUi(group.slice(3), sr, rnd);

    fadeOutEdge(data, sr, 6);
    const buf = this.ctx.createBuffer(1, data.length, sr);
    buf.getChannelData(0).set(data);
    return buf;
  }

  private renderWeapon(group: string, sr: number, rnd: () => number): Float32Array {
    const parts = group.split("/");
    const weapon = parts[1] ?? "ar";
    const layer = parts[2] ?? "body";
    const g = GUNS[weapon] ?? GUNS.ar;

    if (layer.startsWith("rl-") || layer.startsWith("bolt") || layer === "reload") {
      return this.renderReload(layer, weapon, sr, rnd);
    }
    if (layer === "sub") {
      const n = Math.floor(0.18 * sr);
      const out = new Float32Array(n);
      addPitchSine(out, sr, 0, 0.16, g.f0 * 0.7, g.f1 * 0.85, 0.9, g.punchMs / 1000);
      normalize(out, 0.62);
      return out;
    }
    if (layer === "mech") {
      const n = Math.floor(0.055 * sr);
      const out = new Float32Array(n);
      addClick(out, sr, 0.001, 0.014, 2400 + rnd() * 500, 4100 + rnd() * 600, 0.9, rnd);
      addClick(out, sr, 0.022, 0.012, 3100, 5200, 0.45, rnd);
      normalize(out, 0.48);
      return out;
    }
    if (layer === "tail" || layer === "tail-in" || layer === "far-tail") {
      const dur = layer === "tail-in" ? 0.55 : layer === "far-tail" ? 1.35 : Math.max(0.75, g.tailMs / 650);
      const n = Math.floor(dur * sr);
      const raw = noise(n, rnd);
      const fc = layer === "far-tail" ? 680 : layer === "tail-in" ? 1950 : 1250;
      const filt = biquad(biquad(raw, sr, "hp", 95, 0.6), sr, "lp", fc, 0.7);
      const out = new Float32Array(n);
      const tau = dur * 0.30;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const swell = layer === "far-tail" ? Math.min(1, t / 0.08) : Math.min(1, t / 0.008);
        const mod = 1 + 0.14 * Math.sin(t * 28 + rnd() * 0.2);
        out[i] = filt[i] * swell * Math.exp(-t / tau) * mod;
      }
      normalize(out, layer === "far-tail" ? 0.36 : 0.42);
      return out;
    }
    if (layer === "far" || layer === "dist") {
      const dur = layer === "dist" ? 0.52 : Math.max(0.32, g.tailMs / 1000);
      const n = Math.floor(dur * sr);
      const raw = noise(n, rnd);
      const fCrack = biquad(raw, sr, "bp", layer === "dist" ? 650 : g.crackHz * 0.42, 0.9);
      const fBody = biquad(raw, sr, "lp", layer === "dist" ? 420 : 1150, 0.7);
      const out = new Float32Array(n);
      addPitchSine(out, sr, 0, 0.09, g.f0 * 0.65, g.f1 * 0.9, 0.5, 0.032);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const atk = Math.min(1, t / 0.002);
        const cEnv = Math.exp(-t / (layer === "dist" ? 0.045 : 0.03));
        const bEnv = Math.exp(-t / (dur * 0.34));
        out[i] += fCrack[i] * cEnv * atk * 1.1 + fBody[i] * bEnv * 0.65;
      }
      normalize(out, layer === "dist" ? 0.48 : 0.58);
      return out;
    }

    // Near close-range crack + chest thump ("p1" / "body")
    const dur = Math.max(0.22, (g.tailMs * 1.1) / 1000);
    const n = Math.floor(dur * sr);
    const raw = noise(n, rnd);
    const crack = biquad(raw, sr, "bp", g.crackHz * (0.94 + rnd() * 0.12), g.crackQ);
    const body = biquad(biquad(raw, sr, "hp", 80, 0.7), sr, "lp", g.lpHz, 0.7);
    const out = new Float32Array(n);
    addPitchSine(out, sr, 0, g.punchMs / 1000 * 2.2, g.f0, g.f1, g.punchGain, g.punchMs / 1000);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const crackEnv = Math.exp(-t / 0.011) * Math.min(1, t / 0.0005);
      const bodyEnv = Math.exp(-t / (g.tailMs / 3200 + 0.035));
      const hissEnv = weapon === "rocket" ? Math.exp(-t / 0.22) * Math.min(1, t / 0.012) : 0;
      out[i] += crack[i] * crackEnv * g.crackGain + body[i] * bodyEnv * g.tailGain + raw[i] * hissEnv * 0.4;
    }
    normalize(out, g.peak);
    return out;
  }

  private renderReload(layer: string, weapon: string, sr: number, rnd: () => number): Float32Array {
    if (layer === "rl-grip" || layer === "rl-pouch" || layer === "rl-hand") {
      const n = Math.floor(0.14 * sr);
      const f = biquad(noise(n, rnd), sr, "bp", layer === "rl-pouch" ? 1300 : 850, 1.1);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        out[i] = f[i] * Math.sin(Math.min(1, t / 0.14) * Math.PI) * Math.exp(-t / 0.07);
      }
      normalize(out, 0.34);
      return out;
    }
    if (layer === "rl-drop") {
      const n = Math.floor(0.18 * sr);
      const out = new Float32Array(n);
      addClick(out, sr, 0.002, 0.025, 420, 1180, 0.8, rnd);
      addClick(out, sr, 0.055, 0.018, 520, 1450, 0.45, rnd);
      normalize(out, 0.42);
      return out;
    }
    if (layer === "rl-out" || layer === "bolt-up" || layer === "bolt-down") {
      const n = Math.floor(0.13 * sr);
      const out = new Float32Array(n);
      addClick(out, sr, 0.002, 0.018, 1650, 3250, 0.9, rnd);
      addClick(out, sr, 0.032, 0.024, 980, 2100, 0.6, rnd);
      normalize(out, 0.50);
      return out;
    }
    if (layer === "rl-in" || layer === "rl-round") {
      const n = Math.floor(0.15 * sr);
      const out = new Float32Array(n);
      addPitchSine(out, sr, 0.004, 0.05, 340, 115, 0.75, 0.018);
      addClick(out, sr, 0.002, 0.022, 1300, 2850, 0.9, rnd);
      normalize(out, 0.54);
      return out;
    }
    // rl-rack, bolt-back, bolt-fwd, or full reload fallback
    const dur = layer === "reload" ? 0.55 : 0.18;
    const n = Math.floor(dur * sr);
    const out = new Float32Array(n);
    const slideN = biquad(noise(n, rnd), sr, "bp", weapon === "sniper" ? 1900 : 2500, 2.2);
    for (let i = 0; i < Math.floor(0.08 * sr); i++) {
      const t = i / sr;
      out[i] += slideN[i] * Math.exp(-t / 0.03) * 0.45;
    }
    addClick(out, sr, 0.005, 0.02, 1750, 3600, 0.85, rnd);
    addClick(out, sr, 0.075, 0.024, 1450, 3150, 0.95, rnd);
    normalize(out, 0.52);
    return out;
  }

  private renderEquip(sr: number, rnd: () => number): Float32Array {
    const n = Math.floor(0.18 * sr);
    const out = new Float32Array(n);
    const rustle = biquad(noise(n, rnd), sr, "bp", 1200, 1.0);
    for (let i = 0; i < n; i++) out[i] += rustle[i] * Math.exp(-(i / sr) / 0.05) * 0.4;
    addClick(out, sr, 0.02, 0.018, 1900, 3400, 0.7, rnd);
    normalize(out, 0.46);
    return out;
  }

  private renderDry(sr: number, rnd: () => number): Float32Array {
    const n = Math.floor(0.045 * sr);
    const out = new Float32Array(n);
    addClick(out, sr, 0.001, 0.012, 2600, 4800, 1.0, rnd);
    normalize(out, 0.52);
    return out;
  }

  private renderCasing(sr: number, rnd: () => number): Float32Array {
    const n = Math.floor(0.14 * sr);
    const out = new Float32Array(n);
    addClick(out, sr, 0.002, 0.02, 5400 + rnd() * 900, 8200 + rnd() * 800, 0.8, rnd);
    addClick(out, sr, 0.048, 0.015, 5800 + rnd() * 700, 8700, 0.45, rnd);
    normalize(out, 0.34);
    return out;
  }

  private renderWhizz(sr: number, rnd: () => number): Float32Array {
    const dur = 0.21;
    const n = Math.floor(dur * sr);
    const out = new Float32Array(n);
    const nBuf = biquad(noise(n, rnd), sr, "bp", 1900, 1.4);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const dt = t - 0.09; // center aligns with whizzSweep() closest approach at t=0.09
      const bell = Math.exp(-(dt * dt) / (2 * 0.028 * 0.028));
      const freq = 2300 - 1500 * (t / dur);
      ph += (2 * Math.PI * freq) / sr;
      const snap = Math.abs(dt) < 0.004 ? Math.exp(-Math.abs(dt) / 0.0012) : 0;
      out[i] = (nBuf[i] * 0.75 + Math.sin(ph) * 0.32) * bell + (rnd() * 2 - 1) * snap * 1.1;
    }
    normalize(out, 0.62);
    return out;
  }

  private renderImpact(surf: string, sr: number, rnd: () => number): Float32Array {
    const n = Math.floor(0.18 * sr);
    const out = new Float32Array(n);
    const raw = noise(n, rnd);
    if (surf === "metal") {
      addClick(out, sr, 0.001, 0.09, 1850 + rnd() * 450, 3200 + rnd() * 600, 0.9, rnd);
      addClick(out, sr, 0.003, 0.05, 4350, 6100, 0.55, rnd);
      normalize(out, 0.60);
      return out;
    }
    if (surf === "glass") {
      const hp = biquad(raw, sr, "hp", 3400, 0.7);
      for (let i = 0; i < n; i++) out[i] = hp[i] * Math.exp(-(i / sr) / 0.045);
      addClick(out, sr, 0.002, 0.03, 4800, 7400, 0.85, rnd);
      normalize(out, 0.58);
      return out;
    }
    const fc = surf === "wood" ? 750 : surf === "concrete" || surf === "stone" ? 1850 : 620;
    const f = biquad(raw, sr, "bp", fc, 1.1);
    addPitchSine(out, sr, 0, 0.04, surf === "wood" ? 240 : 180, 65, 0.75, 0.015);
    for (let i = 0; i < n; i++) out[i] += f[i] * Math.exp(-(i / sr) / 0.025) * 0.9;
    normalize(out, 0.55);
    return out;
  }

  private renderHit(kind: string, sr: number, rnd: () => number): Float32Array {
    if (kind === "tick" || kind === "marker") {
      const n = Math.floor(0.032 * sr);
      const out = new Float32Array(n);
      addClick(out, sr, 0.001, 0.015, 2450, 4100, 1.0, rnd);
      normalize(out, 0.72);
      return out;
    }
    if (kind === "head") {
      const n = Math.floor(0.14 * sr);
      const out = new Float32Array(n);
      // Helmet dink + crisp hitmarker snap
      addClick(out, sr, 0.001, 0.09, 2180, 3420, 1.0, rnd);
      addPitchSine(out, sr, 0, 0.045, 220, 75, 0.6, 0.016);
      normalize(out, 0.78);
      return out;
    }
    if (kind === "shield") {
      const n = Math.floor(0.11 * sr);
      const out = new Float32Array(n);
      const crack = biquad(noise(n, rnd), sr, "bp", 2800, 1.4);
      for (let i = 0; i < n; i++) out[i] = crack[i] * Math.exp(-(i / sr) / 0.028);
      addClick(out, sr, 0.002, 0.025, 1650, 3800, 0.85, rnd);
      normalize(out, 0.68);
      return out;
    }
    if (kind === "kill") {
      const n = Math.floor(0.16 * sr);
      const out = new Float32Array(n);
      addPitchSine(out, sr, 0, 0.11, 145, 42, 0.95, 0.045);
      addClick(out, sr, 0.002, 0.03, 1850, 3200, 0.9, rnd);
      normalize(out, 0.80);
      return out;
    }
    // body / hurt
    const n = Math.floor(0.10 * sr);
    const out = new Float32Array(n);
    addPitchSine(out, sr, 0, 0.07, kind === "hurt" ? 115 : 155, 45, 0.95, 0.028);
    const f = biquad(noise(n, rnd), sr, "lp", 950, 0.7);
    for (let i = 0; i < n; i++) out[i] += f[i] * Math.exp(-(i / sr) / 0.02) * 0.55;
    normalize(out, 0.65);
    return out;
  }

  private renderStep(spec: string, sr: number, rnd: () => number): Float32Array {
    const isLand = spec.endsWith("-land");
    const isRun = spec.endsWith("-run");
    const isCrouch = spec.endsWith("-crouch");
    const surf = spec.replace(/-(land|run|crouch)$/, "");
    const dur = isLand ? 0.16 : 0.11;
    const n = Math.floor(dur * sr);
    const out = new Float32Array(n);
    const raw = noise(n, rnd);
    const fc = surf === "concrete" || surf === "stone" ? 1350 : surf === "metal" ? 950 : surf === "wood" ? 580 : surf === "water" ? 2100 : 900;
    const grit = biquad(raw, sr, surf === "water" ? "bp" : "lp", fc, 0.9);
    const thumpF = surf === "metal" ? 135 : surf === "wood" ? 155 : 115;
    addPitchSine(out, sr, 0, 0.04, thumpF, 48, isLand ? 0.95 : isRun ? 0.78 : isCrouch ? 0.35 : 0.58, 0.016);
    if (surf === "metal") addClick(out, sr, 0.004, 0.045, 680, 1280, 0.4, rnd);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp(-t / (isLand ? 0.042 : 0.026)) * Math.min(1, t / 0.002);
      out[i] += grit[i] * env * (isLand ? 0.9 : 0.65);
    }
    normalize(out, isLand ? 0.42 : isCrouch ? 0.18 : isRun ? 0.34 : 0.28);
    return out;
  }

  private renderLoot(kind: string, sr: number, rnd: () => number): Float32Array {
    if (kind.startsWith("pick-") || kind.startsWith("rarity-") || kind === "chest-open") {
      const n = Math.floor(0.14 * sr);
      const out = new Float32Array(n);
      if (kind === "pick-weapon") {
        addClick(out, sr, 0.002, 0.022, 1650, 3100, 0.9, rnd);
        addPitchSine(out, sr, 0.01, 0.045, 280, 110, 0.65, 0.018);
      } else if (kind === "pick-ammo") {
        addClick(out, sr, 0.002, 0.02, 2200, 4100, 0.85, rnd);
        addClick(out, sr, 0.036, 0.016, 1800, 3500, 0.55, rnd);
      } else if (kind === "chest-open") {
        addClick(out, sr, 0.002, 0.03, 980, 2100, 0.9, rnd);
        addPitchSine(out, sr, 0.015, 0.09, 240, 85, 0.8, 0.035);
      } else {
        addClick(out, sr, 0.002, 0.018, 1250, 2600, 0.75, rnd);
      }
      normalize(out, 0.48);
      return out;
    }
    if (kind === "shield-break") {
      const n = Math.floor(0.24 * sr);
      const out = new Float32Array(n);
      const crack = biquad(noise(n, rnd), sr, "bp", 2400, 1.0);
      for (let i = 0; i < n; i++) out[i] = crack[i] * Math.exp(-(i / sr) / 0.065);
      addPitchSine(out, sr, 0, 0.14, 340, 75, 0.8, 0.05);
      normalize(out, 0.65);
      return out;
    }
    // Medical gauze wrap & energy drink tactical audio (zero cartoon chimes/crunch)
    const isDrink = kind.includes("smoothie") || kind.includes("banana") || kind.includes("shield");
    if (kind.startsWith("use-") || kind.endsWith("-loop")) {
      const dur = 1.1;
      const n = Math.floor(dur * sr);
      const out = new Float32Array(n);
      const raw = noise(n, rnd);
      const filt = biquad(raw, sr, isDrink ? "hp" : "bp", isDrink ? 3600 : 1850, 1.2);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const pulse = isDrink ? 0.55 + 0.45 * Math.sin(t * 9.0) : Math.pow(Math.abs(Math.sin(t * Math.PI * 2.2)), 1.5);
        out[i] = filt[i] * pulse;
      }
      normalize(out, 0.34);
      return out;
    }
    if (kind.startsWith("start-")) {
      const n = Math.floor(0.14 * sr);
      const out = new Float32Array(n);
      if (isDrink) {
        // Pull-tab snap + hiss
        addClick(out, sr, 0.003, 0.015, 2900, 4800, 0.9, rnd);
        const h = biquad(noise(n, rnd), sr, "hp", 3500, 0.8);
        for (let i = 0; i < n; i++) out[i] += h[i] * Math.exp(-(i / sr) / 0.045) * 0.5;
      } else {
        // Gauze tear / velcro zip
        const f = biquad(noise(n, rnd), sr, "bp", 2300, 1.4);
        for (let i = 0; i < n; i++) out[i] = f[i] * Math.exp(-(i / sr) / 0.05);
      }
      normalize(out, 0.44);
      return out;
    }
    // Completion cue (shield-done / heal-done / done-*)
    const n = Math.floor(0.18 * sr);
    const out = new Float32Array(n);
    addClick(out, sr, 0.002, 0.02, 1600, 2800, 0.65, rnd);
    addPitchSine(out, sr, 0.02, 0.12, isDrink ? 880 : 660, isDrink ? 1100 : 720, 0.45, 0.055);
    normalize(out, 0.40);
    return out;
  }

  private renderUi(kind: string, sr: number, rnd: () => number): Float32Array {
    if (kind === "click") {
      const n = Math.floor(0.022 * sr);
      const out = new Float32Array(n);
      addClick(out, sr, 0.001, 0.01, 2100, 3900, 1.0, rnd);
      normalize(out, 0.38);
      return out;
    }
    if (kind === "countdown" || kind === "countdown-go") {
      const n = Math.floor((kind === "countdown-go" ? 0.28 : 0.16) * sr);
      const out = new Float32Array(n);
      const f = kind === "countdown-go" ? 1320 : 880;
      addPitchSine(out, sr, 0, 0.12, f, f, 0.85, 0.055);
      if (kind === "countdown-go") addPitchSine(out, sr, 0.09, 0.15, 1760, 1760, 0.85, 0.07);
      normalize(out, 0.45);
      return out;
    }
    if (kind === "victory") {
      const n = Math.floor(1.4 * sr);
      const out = new Float32Array(n);
      for (const f of [146.83, 220, 293.66, 440]) addPitchSine(out, sr, 0.02, 1.25, f, f, 0.35, 0.55);
      addPitchSine(out, sr, 0, 0.25, 110, 42, 0.7, 0.09);
      normalize(out, 0.52);
      return out;
    }
    if (kind.startsWith("poi")) {
      // Tactical sector confirmation pulse (no island marimba)
      const n = Math.floor(0.24 * sr);
      const out = new Float32Array(n);
      addPitchSine(out, sr, 0.01, 0.07, 620, 620, 0.55, 0.03);
      addPitchSine(out, sr, 0.09, 0.11, 880, 880, 0.55, 0.045);
      normalize(out, 0.30);
      return out;
    }
    // medal, medal-big, resurgence, elim-self
    const n = Math.floor((kind === "elim-self" ? 0.35 : 0.22) * sr);
    const out = new Float32Array(n);
    if (kind === "elim-self") {
      addPitchSine(out, sr, 0, 0.28, 196, 98, 0.8, 0.12);
    } else {
      addClick(out, sr, 0.002, 0.02, 1800, 3200, 0.6, rnd);
      addPitchSine(out, sr, 0.015, 0.14, kind === "medal-big" ? 740 : 660, kind === "medal-big" ? 990 : 880, 0.65, 0.06);
    }
    normalize(out, 0.46);
    return out;
  }
}
