// Banana-peel glider (drop-05-glider, gear-05-glider-pack). Owned by the actors area.
// Contract (keep the exports — showcase.ts and gameplay use them):
//   createGlider(ctx) → GliderProps (giant curved banana peel on a bamboo frame with rope risers; the KONG hangs
//                                    below it by both hands. Origin = the point midway between the kong's fists,
//                                    forward = -Z, up = +Y. Canopy ~5.5 m span, ~3 m chord, ~1.6 m above the origin.)
//   views             → view cameras this piece owns (main: "drop-05-glider"; dev: "wip-glider-*")
//   stage(ctx, id)    → places the glider for a stage hint ("glider" = drop-05 composition; "wip-glider" = dev)
//
// Everything is procedural: the peel is a parametric banana-crescent shell (outer skin + cream underside + rounded
// torn rim), the frame is swept bamboo with node bulges, every junction is a helix rope lashing, the risers are
// swept hemp ropes deformed on the CPU each frame (sway + bank). All maps (colour / normal / roughness) are painted
// on canvas once and shared by every glider instance. Hierarchy: object (level, kong hangs here) → rig (bank/pitch)
// → hi group (frame pitched) | lo mesh (≤ 2k tris, one draw call, for distant gliders).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { WorldCtx } from "../engine/engine";
import type { CamSpec } from "../engine/views";
import type { VegApi } from "../world/veg/api";
import { createKong, type KongActorEx } from "./kong";
import { pose, hold } from "./kong-dev-views";
import { BONES, BONE_LIST, boneIndex, type BoneName, type KongAnimator } from "./kong-rig";
import { actorLook } from "./look";

export interface GliderProps {
  object: THREE.Group;
  /** rope sway, canopy flex, banking */
  update(dt: number, t: number): void;
  /** bank angle in radians (+ = right wing down) and pitch — the frame tilts, the ropes hang */
  setBank(bank: number, pitch: number): void;
  /** where the kong's left / right fists close on the risers, glider-local space (kept current by setHands) */
  handL: THREE.Vector3;
  handR: THREE.Vector3;
  /** move the risers' fist ends (glider-local) — the ropes re-drape to end exactly there; cheap, call every frame */
  setHands(l: THREE.Vector3, r: THREE.Vector3): void;
  /** low-detail version for distant gliders (other players) */
  setLod(lo: boolean): void;
  /** show / hide the rope tails under the fists (hidden on MY glider: they swing through the first-person view) */
  setTails?(on: boolean): void;
  /** WORLD position of where each fist's two risers meet the canopy frame (their mean) — the
   *  first-person fists turn their grip along the rope they hold */
  riserTops?(outL: THREE.Vector3, outR: THREE.Vector3): boolean;
}

const V3 = THREE.Vector3;
type Vec = THREE.Vector3;

// ============================================================================ tunables (metres, glider-local)
const HALF = 2.15;          // half span (x)
const CH = 1.65;            // chord (z) — compact tactical ram-air wing
const VR = 0.25;
const TH = 0.065;           // airfoil cell thickness
const RIDGE_Y = 1.85;       // canopy height above the operator fists
const RIDGE_Z = 0.18;       // centered right above operator
const SWEEP = 0.34;         // gentle ram-air wing sweep
const DROOP_B = 0.48;       // symmetric parafoil anhedral
const DROOP_S = 0.48;
const FRAME_PITCH = 0.05;
const HAND_X = 0.44;
const R_LEAD = 0.016, R_BAR = 0.012, R_TRAIL = 0.012, R_RIB = 0.012, R_STRUT = 0.012, R_ROPE = 0.008;

// ============================================================================ small helpers
function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** tileable value-noise lattice (period px × py) */
function lattice(seed: number, px: number, py: number) {
  const r = mulberry(seed), g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * px + x0], b = g[y0 * px + x1], c = g[y1 * px + x0], d = g[y1 * px + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const perp = (t: Vec) => (Math.abs(t.y) < 0.95 ? new V3(0, 1, 0) : new V3(1, 0, 0)).cross(t).normalize();

function makeCanvas(w: number, h: number) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function colorTex(c: HTMLCanvasElement, repeat: boolean, aniso: number) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function dataTex(data: Uint8Array, w: number, h: number, repeat: boolean, aniso: number) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace; t.flipY = false; t.anisotropy = aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
function readGray(c: HTMLCanvasElement): Float32Array {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data, out = new Float32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}
function normalFromHeight(h: Float32Array, w: number, hh: number, strength: number, wrap: boolean): Uint8Array {
  const out = new Uint8Array(w * hh * 4);
  for (let y = 0; y < hh; y++) {
    const ym = wrap ? (y - 1 + hh) % hh : Math.max(0, y - 1), yp = wrap ? (y + 1) % hh : Math.min(hh - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xm = wrap ? (x - 1 + w) % w : Math.max(0, x - 1), xp = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const dx = (h[y * w + xp] - h[y * w + xm]) * strength, dy = (h[yp * w + x] - h[ym * w + x]) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  }
  return out;
}
function grayData(v: Float32Array): Uint8Array {
  const out = new Uint8Array(v.length * 4);
  for (let i = 0; i < v.length; i++) { const g = Math.round(clamp01(v[i]) * 255); out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g; out[i * 4 + 3] = 255; }
  return out;
}
/** irregular blob path (for speckles) */
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, R: () => number, n = 9) {
  g.beginPath();
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * Math.PI * 2, rr = r * (0.72 + R() * 0.5);
    k === 0 ? g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

// ============================================================================ textures (painted once, shared)
interface Tex {
  peelMap: THREE.Texture; peelNormal: THREE.Texture; peelRough: THREE.Texture;
  innerMap: THREE.Texture; innerNormal: THREE.Texture;
  bambooMap: THREE.Texture; bambooNormal: THREE.Texture; bambooRough: THREE.Texture;
  grainMap: THREE.Texture; ropeMap: THREE.Texture; ropeNormal: THREE.Texture; stemMap: THREE.Texture;
  lodMap: THREE.Texture; lodGlow: THREE.Texture;
}
let TEX: Tex | null = null;

/** peel UV convention: U = (1 - t)/2 along the span (0 = blossom tip +X, 1 = stem -X); V = metres across the chord from
 *  a line VR*CH ahead of the ridge, / (CH*1.05). The ridge line sits at V_RIDGE. */
const V_RIDGE = (VR * CH) / (CH * 1.05);

function paintPeel(aniso: number) {
  // Military Ram-Air Parafoil top skin: olive drab & tactical slate 7-cell ripstop nylon with cell seam ribs
  const W = 1024, H = 512, w2 = 512, h2 = 256;
  const col = makeCanvas(W, H), cg = col.getContext("2d")!;
  const R = mulberry(7);
  const img = cg.createImageData(W, H), d = img.data;
  const cells = 7;
  for (let y = 0; y < H; y++) {
    const V = y / H;
    for (let x = 0; x < W; x++) {
      const U = x / W, i = (y * W + x) * 4;
      const cell = Math.floor(U * cells);
      const cellPos = (U * cells) % 1;
      const seam = Math.exp(-(((Math.min(cellPos, 1 - cellPos)) / 0.025) ** 2));
      const puff = Math.sin(Math.PI * cellPos) * 10;
      const alt = cell === 3 ? -12 : cell % 2 === 1 ? -6 : 6;
      const rip = ((x & 7) === 0 || (y & 7) === 0) ? -5 : 0;
      const n = (R() - 0.5) * 6;
      let r = 68 + alt + puff + rip + n, g = 78 + alt + puff + rip + n, b = 58 + alt * 0.6 + puff + rip + n;
      r = mix(r, 34, seam * 0.75); g = mix(g, 38, seam * 0.75); b = mix(b, 32, seam * 0.75);
      // Dark reinforced leading/trailing edge trim
      if (V < 0.08 || V > 0.92) { r *= 0.65; g *= 0.65; b *= 0.65; }
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  cg.putImageData(img, 0, 0);
  const hf = new Float32Array(w2 * h2), rv = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const cp = ((x / w2) * cells) % 1;
    hf[y * w2 + x] = 0.5 + 0.14 * Math.sin(Math.PI * cp);
    rv[y * w2 + x] = 0.76 + (R() - 0.5) * 0.06;
  }
  return {
    map: colorTex(col, false, aniso), canvas: col,
    normal: dataTex(normalFromHeight(hf, w2, h2, 4, false), w2, h2, false, aniso),
    rough: dataTex(grayData(rv), w2, h2, false, aniso),
  };
}

function paintInner(aniso: number) {
  // Underside of parafoil cells: matte tactical slate / charcoal ripstop
  const W = 512, H = 256;
  const col = makeCanvas(W, H), cg = col.getContext("2d")!;
  const R = mulberry(31), img = cg.createImageData(W, H), d = img.data, hf = new Float32Array(W * H);
  const cells = 7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const U = x / W, V = y / H, i = y * W + x;
    const cp = (U * cells) % 1, seam = Math.exp(-(((Math.min(cp, 1 - cp)) / 0.03) ** 2));
    const dark = V < 0.14 ? 0.45 : 1.0; // dark open ram-air cell intakes along leading edge
    const n = (R() - 0.5) * 5;
    const baseR = mix(54, 28, seam * 0.8) * dark + n;
    const baseG = mix(58, 30, seam * 0.8) * dark + n;
    const baseB = mix(50, 28, seam * 0.8) * dark + n;
    d[i * 4] = baseR; d[i * 4 + 1] = baseG; d[i * 4 + 2] = baseB; d[i * 4 + 3] = 255;
    hf[i] = 0.5 + 0.08 * Math.sin(Math.PI * cp);
  }
  cg.putImageData(img, 0, 0);
  return { map: colorTex(col, false, aniso), canvas: col, normal: dataTex(normalFromHeight(hf, W, H, 2, false), W, H, false, aniso) };
}

function paintBamboo(aniso: number) {
  const W = 64, H = 64, col = makeCanvas(W, H), cg = col.getContext("2d")!;
  cg.fillStyle = "#2b2f2d"; cg.fillRect(0, 0, W, H);
  const hf = new Float32Array(W * H).fill(0.5), rf = new Float32Array(W * H).fill(0.6);
  const eg = makeCanvas(32, 32), eG = eg.getContext("2d")!;
  eG.fillStyle = "#222423"; eG.fillRect(0, 0, 32, 32);
  return {
    map: colorTex(col, true, aniso), canvas: col,
    normal: dataTex(normalFromHeight(hf, W, H, 1, true), W, H, true, aniso),
    rough: dataTex(grayData(rf), W, H, true, aniso),
    grain: colorTex(eg, false, aniso),
  };
}

function paintRope(aniso: number) {
  // Matte black/OD tactical nylon suspension cord
  const W = 64, H = 64, col = makeCanvas(W, H), cg = col.getContext("2d")!;
  cg.fillStyle = "#242723"; cg.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 6) { cg.fillStyle = "rgba(0,0,0,0.28)"; cg.fillRect(0, y, W, 2); }
  const hf = new Float32Array(W * H).fill(0.5);
  return { map: colorTex(col, true, aniso), canvas: col, normal: dataTex(normalFromHeight(hf, W, H, 1, true), W, H, true, aniso) };
}

function paintStem(aniso: number) {
  const col = makeCanvas(32, 32), cg = col.getContext("2d")!;
  cg.fillStyle = "#2b2f2d"; cg.fillRect(0, 0, 32, 32);
  return colorTex(col, true, aniso);
}

function textures(aniso: number): Tex {
  if (TEX) return TEX;
  const peel = paintPeel(aniso), inner = paintInner(aniso), bam = paintBamboo(aniso), rope = paintRope(aniso);
  // LOD atlas: outer peel (top half) | underside (next quarter) | tan, beige, green swatches (bottom quarter)
  const lod = makeCanvas(512, 512), lg = lod.getContext("2d")!;
  lg.drawImage(peel.canvas, 0, 0, 512, 256);
  lg.drawImage(inner.canvas, 0, 256, 512, 128);
  lg.fillStyle = "#363a31"; lg.fillRect(0, 384, 171, 128);
  lg.fillStyle = "#2b2f2d"; lg.fillRect(171, 384, 170, 128);
  lg.fillStyle = "#242723"; lg.fillRect(341, 384, 171, 128);
  const glow = makeCanvas(512, 512), gg = glow.getContext("2d")!;
  gg.fillStyle = "#000"; gg.fillRect(0, 0, 512, 512); gg.drawImage(inner.canvas, 0, 256, 512, 128);
  TEX = {
    peelMap: peel.map, peelNormal: peel.normal, peelRough: peel.rough,
    innerMap: inner.map, innerNormal: inner.normal,
    bambooMap: bam.map, bambooNormal: bam.normal, bambooRough: bam.rough, grainMap: bam.grain,
    ropeMap: rope.map, ropeNormal: rope.normal, stemMap: paintStem(aniso),
    lodMap: colorTex(lod, false, aniso), lodGlow: colorTex(glow, false, aniso),
  };
  return TEX;
}

// ============================================================================ peel surface
function chord(t: number) {
  const a = Math.abs(t);
  if (t >= 0) return CH * Math.pow(Math.max(0, 1 - Math.pow(a, 2.4)), 0.5);
  return 0.26 + (CH - 0.26) * Math.pow(Math.max(0, 1 - Math.pow(a, 1.9)), 0.75);
}
/** droop profile: flat-ish over the middle, steepening toward the tips (circular banana arc, not a parabola) */
function droop(t: number) {
  const t2 = t * t;
  return 0.45 * t2 + (0.55 * (1 - Math.sqrt(Math.max(0, 1 - 0.97 * t2)))) / (1 - Math.sqrt(0.03));
}
function spine(t: number, out: Vec) {
  const d = t >= 0 ? DROOP_B : DROOP_S;
  return out.set(t * HALF, RIDGE_Y - d * droop(t), RIDGE_Z + SWEEP * t * t);
}
/** outer-skin point: t ∈ [-1,1] along the span (+1 = blossom tip, +X), v ∈ [0,1] leading lip → trailing lip */
function peelPoint(t: number, v: number, out = new V3()) {
  const c = chord(t);
  spine(t, out);
  const k = Math.sqrt(Math.min(1, c / 0.3));
  const aL = (0.14 + 0.17 * c) * k, aT = (0.14 + 0.19 * c) * k; // front lip rides high: the underside shows from below-front
  const drop = v < VR ? aL * Math.pow((VR - v) / VR, 1.7) : aT * Math.pow((v - VR) / (1 - VR), 1.9);
  // banana facets: 3 soft longitudinal ridges across the chord (the peel's pentagonal section) — they catch the light
  // from the chase camera (without them it reads as a smooth speckled dome)
  const ridge = RIDGES.reduce((acc, rv) => acc + Math.exp(-(((v - rv) / 0.045) ** 2)), 0) * 0.022 * Math.min(1, c / 0.8);
  out.z += (v - VR) * c;
  out.y -= drop - ridge;
  return out;
}
const RIDGES = [VR, VR + 0.24, VR + 0.48];
function peelNormal(t: number, v: number) {
  const e = 1e-3, a = peelPoint(t - e, v), b = peelPoint(t + e, v), c = peelPoint(t, Math.max(0, v - e)), d = peelPoint(t, Math.min(1, v + e));
  const du = b.sub(a), dv = d.sub(c);
  return dv.cross(du).normalize(); // +Y-ish (outward)
}
function peelUV(t: number, v: number): [number, number] { return [(1 - t) / 2, ((v - VR) * chord(t) + VR * CH) / (CH * 1.05)]; }

function buildCanopy(NU: number, NV: number, rim: boolean): THREE.BufferGeometry {
  const R = mulberry(5), tearN = lattice(6, 64, 1);
  const ts: number[] = [], vmax: number[] = [];
  const notches = [0.22, 0.47, 0.71].map((c) => [c + (R() - 0.5) * 0.08, 0.02 + R() * 0.02, 0.035 + R() * 0.03]);
  for (let i = 0; i <= NU; i++) {
    const q = 1 - (2 * i) / NU;
    ts.push(Math.min(0.9995, 0.45 * q + 0.55 * Math.sin((q * Math.PI) / 2)));
    const s = i / NU;
    let tear = 0.006 + tearN(s * 22, 0) * 0.02;
    for (const [c, w, dpt] of notches) tear += dpt * Math.max(0, 1 - Math.abs(s - c) / w);
    vmax.push(1 - (rim ? tear : 0));
  }
  const cols = NU + 1, rows = NV + 1;
  const P: Vec[] = [], UV: number[] = [], FL: number[] = [], SH: number[] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const t = ts[i], v = (j / NV) * vmax[i];
    P.push(peelPoint(t, v));
    UV.push(...peelUV(t, v));
    FL.push(Math.pow(Math.sin(Math.PI * Math.min(1, v / Math.max(0.5, vmax[i]))), 1.5) * (1 - t * t * 0.6));
    SH.push((0.72 + 0.28 * smooth(0.04, 0.5, v)) * (1 - 0.25 * smooth(0.55, 1, Math.abs(t))));
  }
  const id = (i: number, j: number) => i * rows + j;
  const idx: number[] = [];
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    idx.push(a, b, d, b, c, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(P.flatMap((p) => [p.x, p.y, p.z]), 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  top.setAttribute("aFlex", new THREE.Float32BufferAttribute(FL, 1));
  top.setAttribute("aShade", new THREE.Float32BufferAttribute(new Array(FL.length).fill(1), 1));
  top.setIndex(idx);
  top.computeVertexNormals();
  const n = top.getAttribute("normal") as THREE.BufferAttribute;
  // underside: offset along -normal, reversed winding
  const Pb: Vec[] = P.map((p, k) => p.clone().addScaledVector(new V3(n.getX(k), n.getY(k), n.getZ(k)), -TH));
  const bot = new THREE.BufferGeometry();
  bot.setAttribute("position", new THREE.Float32BufferAttribute(Pb.flatMap((p) => [p.x, p.y, p.z]), 3));
  bot.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
  bot.setAttribute("aFlex", new THREE.Float32BufferAttribute(FL, 1));
  bot.setAttribute("aShade", new THREE.Float32BufferAttribute(SH, 1));
  const idxB: number[] = [];
  for (let k = 0; k < idx.length; k += 3) idxB.push(idx[k], idx[k + 2], idx[k + 1]);
  bot.setIndex(idxB);
  bot.computeVertexNormals();
  const parts = [top.toNonIndexed(), bot.toNonIndexed()];
  if (rim) {
    // rounded torn rim around the whole boundary loop (top → bulge → bottom)
    const loop: Array<[number, number]> = [];
    for (let i = 0; i < NU; i++) loop.push([i, 0]);
    for (let j = 0; j < NV; j++) loop.push([NU, j]);
    for (let i = NU; i > 0; i--) loop.push([i, NV]);
    for (let j = NV; j > 0; j--) loop.push([0, j]);
    loop.push(loop[0]);
    const pos: number[] = [], uv: number[] = [], fl: number[] = [];
    let acc = 0;
    loop.forEach(([i, j], k) => {
      const a = P[id(i, j)], b = Pb[id(i, j)];
      const o = new V3();
      if (j === 0) o.add(a.clone().sub(P[id(i, 1)]));
      if (j === NV) o.add(a.clone().sub(P[id(i, NV - 1)]));
      if (i === 0) o.add(a.clone().sub(P[id(1, j)]));
      if (i === NU) o.add(a.clone().sub(P[id(NU - 1, j)]));
      const nn = new V3(n.getX(id(i, j)), n.getY(id(i, j)), n.getZ(id(i, j)));
      o.addScaledVector(nn, -o.dot(nn)).normalize();
      // a ROLLED lip (not a thin edge): a bead curling out of the top skin and back under, ~1.6× the peel thickness
      const mid = a.clone().add(b).multiplyScalar(0.5), RR = TH * 0.8;
      const ring = [a, a.clone().addScaledVector(o, RR * 0.75).addScaledVector(nn, RR * 0.45), mid.clone().addScaledVector(o, RR * 1.15), b.clone().addScaledVector(o, RR * 0.75).addScaledVector(nn, -RR * 0.3), b];
      if (k > 0) { const [pi, pj] = loop[k - 1]; acc += P[id(pi, pj)].distanceTo(a); }
      ring.forEach((p, r) => { pos.push(p.x, p.y, p.z); uv.push(acc * 2, r / 4); fl.push(FL[id(i, j)]); });
    });
    const ri: number[] = [], RS = 5;
    for (let k = 0; k < loop.length - 1; k++) for (let r = 0; r < RS - 1; r++) {
      const a = k * RS + r, b = (k + 1) * RS + r, c = (k + 1) * RS + r + 1, d = k * RS + r + 1;
      ri.push(a, b, d, b, c, d);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    rg.setAttribute("aFlex", new THREE.Float32BufferAttribute(fl, 1));
    rg.setAttribute("aShade", new THREE.Float32BufferAttribute(new Array(fl.length).fill(1), 1));
    rg.setIndex(ri);
    rg.computeVertexNormals();
    // make sure the rim faces outward (flip winding if the first mid vertex normal points inward)
    const nr = rg.getAttribute("normal") as THREE.BufferAttribute;
    const mid = new V3(pos[6], pos[7], pos[8]), topP = new V3(pos[0], pos[1], pos[2]), botP = new V3(pos[12], pos[13], pos[14]);
    const out = mid.clone().sub(topP.add(botP).multiplyScalar(0.5));
    if (new V3(nr.getX(2), nr.getY(2), nr.getZ(2)).dot(out) < 0) {
      for (let k = 0; k < ri.length; k += 3) { const tmp = ri[k + 1]; ri[k + 1] = ri[k + 2]; ri[k + 2] = tmp; }
      rg.setIndex(ri); rg.computeVertexNormals();
    }
    parts.push(rg.toNonIndexed());
  }
  return mergeGeometries(parts, true)!;
}

// ============================================================================ swept tubes (bamboo, rope)
interface Samp { p: Vec; r: number; v: number }
function tube(s: Samp[], radial: number, uMax = 1): THREE.BufferGeometry {
  const n = s.length, ring = radial + 1;
  const pos = new Float32Array(n * ring * 3), nor = new Float32Array(n * ring * 3), uv = new Float32Array(n * ring * 2);
  const T: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const t = s[Math.min(n - 1, i + 1)].p.clone().sub(s[Math.max(0, i - 1)].p);
    T.push(t.lengthSq() < 1e-12 ? (T[i - 1]?.clone() ?? new V3(1, 0, 0)) : t.normalize());
  }
  let N = perp(T[0]);
  for (let i = 0; i < n; i++) {
    if (i > 0) { N = N.addScaledVector(T[i], -N.dot(T[i])); if (N.lengthSq() < 1e-8) N = perp(T[i]); N.normalize(); }
    const B = new V3().crossVectors(T[i], N);
    const a = s[Math.max(0, i - 1)], b = s[Math.min(n - 1, i + 1)], ds = a.p.distanceTo(b.p);
    const drds = ds > 1e-6 ? (b.r - a.r) / ds : 0;
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2, c = Math.cos(th), si = Math.sin(th);
      const dx = N.x * c + B.x * si, dy = N.y * c + B.y * si, dz = N.z * c + B.z * si, k = i * ring + j;
      pos[k * 3] = s[i].p.x + dx * s[i].r; pos[k * 3 + 1] = s[i].p.y + dy * s[i].r; pos[k * 3 + 2] = s[i].p.z + dz * s[i].r;
      const nn = new V3(dx - T[i].x * drds, dy - T[i].y * drds, dz - T[i].z * drds).normalize();
      nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z;
      uv[k * 2] = (j / radial) * uMax; uv[k * 2 + 1] = s[i].v;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * ring + j, b = (i + 1) * ring + j, c = b + 1, d = a + 1;
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g.toNonIndexed();
}
function cap(p: Vec, T: Vec, r: number, radial: number, facing: 1 | -1): THREE.BufferGeometry {
  const N = perp(T), B = new V3().crossVectors(T, N), pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const ring = (j: number) => { const th = (j / radial) * Math.PI * 2; return [p.clone().addScaledVector(N, Math.cos(th) * r).addScaledVector(B, Math.sin(th) * r), 0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th)] as const; };
  for (let j = 0; j < radial; j++) {
    const [a, au, av] = ring(j), [b, bu, bv] = ring(j + 1);
    const tri = facing === 1 ? [[p, 0.5, 0.5], [a, au, av], [b, bu, bv]] : [[p, 0.5, 0.5], [b, bu, bv], [a, au, av]];
    for (const [q, u, v] of tri as Array<[Vec, number, number]>) { pos.push(q.x, q.y, q.z); nor.push(T.x * facing, T.y * facing, T.z * facing); uv.push(u, v); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

interface FrameParts { body: THREE.BufferGeometry[]; caps: THREE.BufferGeometry[]; lash: THREE.BufferGeometry[] }

/** a bamboo culm along a curve: irregular node spacing, node bulges, atlas-mapped internodes, optional cut caps */
function bamboo(parts: FrameParts, curve: THREE.Curve<Vec>, r0: number, r1: number, seed: number, radial: number, capA: boolean, capB: boolean) {
  const L = curve.getLength(), R = mulberry(seed);
  const nodes: number[] = [];
  for (let s = 0.1 + R() * 0.28; s < L - 0.08; s += 0.42 + R() * 0.14) nodes.push(s);
  const rAt = (s: number) => {
    let dn = 1e9; for (const q of nodes) dn = Math.min(dn, Math.abs(s - q));
    return mix(r0, r1, s / L) * (1 + 0.1 * Math.exp(-((dn / 0.014) ** 2)) + 0.035 * Math.exp(-dn / 0.07));
  };
  const bounds = [0, ...nodes, L], samps: Samp[] = [];
  const NOM = 0.48;
  for (let k = 0; k < bounds.length - 1; k++) {
    const a = bounds[k], b = bounds[k + 1], len = b - a, variant = Math.floor(R() * 4);
    const first = k === 0, last = k === bounds.length - 2;
    let fa = 0, fb = 1;
    if (first && last) { fa = 0.2; fb = Math.min(0.98, 0.2 + len / NOM); }
    else if (first) fa = Math.max(0.02, 1 - len / NOM);
    else if (last) fb = Math.min(0.98, len / NOM);
    const ss = new Set<number>([a, b]);
    for (const o of [0.006, 0.016, 0.04]) { if (!first && a + o < b) ss.add(a + o); if (!last && b - o > a) ss.add(b - o); }
    const nMid = Math.max(1, Math.ceil(len / 0.16));
    for (let m = 1; m < nMid; m++) ss.add(a + (len * m) / nMid);
    const sorted = [...ss].sort((x, y) => x - y);
    for (const s of sorted) {
      const f = fa + ((fb - fa) * (s - a)) / len;
      samps.push({ p: curve.getPointAt(Math.min(1, s / L)), r: rAt(s), v: (variant + Math.min(0.995, Math.max(0.005, f))) / 4 });
    }
  }
  parts.body.push(tube(samps, radial));
  if (capA) parts.caps.push(cap(curve.getPointAt(0), curve.getTangentAt(0).normalize(), rAt(0) * 0.98, radial, -1));
  if (capB) parts.caps.push(cap(curve.getPointAt(1), curve.getTangentAt(1).normalize(), rAt(L) * 0.98, radial, 1));
}

/** helix rope lashing around a member at P with axis T */
function lashing(out: THREE.BufferGeometry[], P: Vec, T: Vec, rs: number, turns: number, rr = 0.021, radial = 5) {
  T = T.clone().normalize();
  const N = perp(T), B = new V3().crossVectors(T, N), R = rs + rr * 0.8, pitch = rr * 2.1, segs = Math.ceil(turns * 10);
  const s: Samp[] = []; let acc = 0; let prev: Vec | null = null;
  for (let i = 0; i <= segs; i++) {
    const th = (turns * Math.PI * 2 * i) / segs, along = pitch * (th / (Math.PI * 2) - turns / 2);
    const p = P.clone().addScaledVector(T, along).addScaledVector(N, Math.cos(th) * R).addScaledVector(B, Math.sin(th) * R);
    if (prev) acc += prev.distanceTo(p);
    prev = p; s.push({ p, r: rr, v: acc / 0.035 });
  }
  out.push(tube(s, radial));
}

// ============================================================================ frame layout (unpitched frame space)
interface Layout {
  lead: THREE.CatmullRomCurve3; bar: THREE.LineCurve3; trail: THREE.CatmullRomCurve3;
  ribs: THREE.CatmullRomCurve3[]; struts: THREE.LineCurve3[];
  stemBase: Vec; stemDir: Vec;
  /** rope attachment points (frame space): [outer R, inner R, inner L, outer L] */
  attach: Vec[];
}
let LAYOUT: Layout | null = null;
const LEAD_OFF = new V3(0, -0.04, 0.035);
function leadPoint(t: number) { return peelPoint(t, 0).add(LEAD_OFF); }
/** point just under the underside at (t, v), offset by the member radius */
function underPoint(t: number, v: number, r: number) { return peelPoint(t, v).addScaledVector(peelNormal(t, v), -(TH + r + 0.014)); }
function nearestOnCurve(c: THREE.Curve<Vec>, x: number) {
  let best = 0, bd = 1e9;
  for (let k = 0; k <= 400; k++) { const u = k / 400, d = Math.abs(c.getPointAt(u).x - x); if (d < bd) { bd = d; best = u; } }
  return best;
}
function layout(): Layout {
  if (LAYOUT) return LAYOUT;
  const pts: Vec[] = [];
  const pA = leadPoint(0.74), pB = leadPoint(0.5), dir = pA.clone().sub(pB).normalize();
  pts.push(pA.clone().addScaledVector(dir, 0.92), pA.clone().addScaledVector(dir, 0.48));
  for (const t of [0.74, 0.5, 0.25, 0, -0.25, -0.5, -0.72, -0.88]) pts.push(leadPoint(t));
  const stemBase = spine(-1, new V3()).add(new V3(-0.01, -0.1, 0.01));
  const sd = spine(-0.97, new V3()).sub(spine(-1, new V3())).multiplyScalar(-1).normalize();
  const stemDir = sd.lerp(new V3(-0.3, -0.45, -0.84).normalize(), 0.62).normalize();
  pts.push(stemBase.clone().add(new V3(0.1, -0.05, -0.02)));
  const lead = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  // straight control bar under the bow: from under the blossom end to under the stem end
  const barA = pts[1].clone().add(new V3(0.12, -0.2, 0.12)), barB = leadPoint(-0.88).add(new V3(-0.1, -0.2, 0.12));
  const barDir = barB.clone().sub(barA).normalize();
  const bar = new THREE.LineCurve3(barA.clone().addScaledVector(barDir, -0.14), barB.clone().addScaledVector(barDir, 0.1));
  // trailing spar just under the trailing lip
  const tp: Vec[] = [];
  // (on the lip, half proud of the top surface: the chase camera behind + above sees the spar and its lashings)
  for (const t of [0.72, 0.5, 0.25, 0, -0.25, -0.5, -0.75]) tp.push(peelPoint(t, 0.975).addScaledVector(peelNormal(t, 0.975), R_TRAIL * 0.15).add(new V3(0, 0, R_TRAIL * 0.6)));
  const tDir0 = tp[0].clone().sub(tp[1]).normalize(), tDir1 = tp[tp.length - 1].clone().sub(tp[tp.length - 2]).normalize();
  tp.unshift(tp[0].clone().addScaledVector(tDir0, 0.18)); tp.push(tp[tp.length - 1].clone().addScaledVector(tDir1, 0.14));
  const trail = new THREE.CatmullRomCurve3(tp, false, "centripetal");
  // keel + two cross ribs follow the underside from the leading spar to the trailing spar
  const ribs = [0.27, 0, -0.27].map((t) => {
    const rp: Vec[] = [];
    for (let k = 0; k <= 9; k++) rp.push(underPoint(t, 0.035 + (0.93 * k) / 9, t === 0 ? R_RIB * 1.15 : R_RIB));
    rp[0] = leadPoint(t).add(new V3(0, 0.0, 0.05));
    return new THREE.CatmullRomCurve3(rp, false, "centripetal");
  });
  // struts: bar → leading spar, right above each fist
  const struts = [HAND_X + 0.15, -(HAND_X + 0.15)].map((x) => {
    const b = bar.getPointAt(Math.max(0, Math.min(1, (x - bar.v1.x) / (bar.v2.x - bar.v1.x))));
    const l = lead.getPointAt(nearestOnCurve(lead, x));
    return new THREE.LineCurve3(b.clone().add(new V3(0, -0.05, 0)), l.clone().add(new V3(0, 0.02, 0)));
  });
  const leadAt = (x: number) => lead.getPointAt(nearestOnCurve(lead, x));
  const attach = [leadAt(1.55), struts[0].v1.clone().add(new V3(0, 0.03, 0)), struts[1].v1.clone().add(new V3(0, 0.03, 0)), leadAt(-1.55)];
  LAYOUT = { lead, bar, trail, ribs, struts, stemBase, stemDir, attach };
  return LAYOUT;
}

// ============================================================================ hi-detail shared geometry + materials
interface Hi { canopy: THREE.BufferGeometry; bamboo: THREE.BufferGeometry; caps: THREE.BufferGeometry; lash: THREE.BufferGeometry; stem: THREE.BufferGeometry; tris: number }
let HI: Hi | null = null;
function hiGeometry(): Hi {
  if (HI) return HI;
  const L = layout();
  const parts: FrameParts = { body: [], caps: [], lash: [] };
  bamboo(parts, L.lead, R_LEAD * 1.12, R_LEAD * 0.86, 3, 12, true, false);
  bamboo(parts, L.bar, R_BAR, R_BAR * 0.92, 4, 10, true, true);
  bamboo(parts, L.trail, R_TRAIL, R_TRAIL * 0.9, 5, 9, true, true);
  // (no ribs under the peel: from below they read as kite battens; the peel is lashed to the spars only)
  L.struts.forEach((c, k) => bamboo(parts, c, R_STRUT, R_STRUT, 20 + k, 8, false, false));
  // lashings: every junction + peel-holding wraps along the leading spar
  const Lg = L.lead.getLength();
  const leadWrap = (x: number, turns: number, extra = 0) => {
    const u = nearestOnCurve(L.lead, x), s = u * Lg;
    lashing(parts.lash, L.lead.getPointAt(u), L.lead.getTangentAt(u), R_LEAD * mix(1.12, 0.86, s / Lg) * 1.05 + extra, turns);
  };
  for (const x of [2.55, 1.55, 1.0, -1.0, -1.55, -2.2]) leadWrap(x, 3 + (Math.abs(x * 7) % 2));
  for (const s of L.struts) { leadWrap(s.v2.x, 4, 0.01); }
  // bar: both ends where it meets the bow, and at the struts
  const barT = L.bar.getTangentAt(0);
  for (const u of [0.035, 0.97]) lashing(parts.lash, L.bar.getPointAt(u), barT, R_BAR, 4);
  for (const s of L.struts) {
    const u = (s.v1.x - L.bar.v1.x) / (L.bar.v2.x - L.bar.v1.x);
    lashing(parts.lash, L.bar.getPointAt(u), barT, R_BAR, 4);
  }
  // bow ends tied down to the bar ends: short vertical wraps binding the two
  const bowTip = L.lead.getPointAt(0.06), barTip = L.bar.getPointAt(0.035);
  // a real rope (not a wrap hanging in the air midway between the tips): three strands
  // from the bow tip down to the bar end, a wrap round each member where it is tied
  for (const k of [-1, 0, 1]) {
    const off = perp(bowTip.clone().sub(barTip)).multiplyScalar(k * 0.018);
    const a = bowTip.clone().add(off), b = barTip.clone().add(off), samp: Samp[] = [];
    for (let i = 0; i <= 8; i++) { const p = a.clone().lerp(b, i / 8); samp.push({ p, r: 0.011, v: (i / 8) * a.distanceTo(b) / 0.035 }); }
    parts.lash.push(tube(samp, 5));
  }
  lashing(parts.lash, bowTip, L.lead.getTangentAt(0.06), R_LEAD * 1.1, 2.5, 0.014);
  lashing(parts.lash, barTip, barT, R_BAR, 2.5, 0.014);
  // trailing spar ↔ ribs
  // trailing spar lashed to the lip every ~0.8 m (fat wraps through the peel: they read from behind)
  for (const x of [1.95, 1.2, 0.4, -0.4, -1.2, -1.95]) { const u = nearestOnCurve(L.trail, x); lashing(parts.lash, L.trail.getPointAt(u), L.trail.getTangentAt(u), R_TRAIL + 0.004, 3, 0.02); }   // seated ON the spar (rings 3 cm proud hung under the lip)
  // stem: a thick band where the bow meets the stem
  const stemBand = L.stemBase.clone().addScaledVector(L.stemDir, 0.1);
  lashing(parts.lash, stemBand, L.stemDir, 0.145, 3.5, 0.02, 6);
  // stem lathe (flared neck → cut face)
  const prof = [[0.2, -0.08], [0.19, 0.0], [0.155, 0.08], [0.135, 0.2], [0.128, 0.33], [0.134, 0.39], [0.128, 0.405], [0.09, 0.415], [0.0, 0.42]].map(([r, y]) => new THREE.Vector2(r, y));
  const stem = new THREE.LatheGeometry(prof, 14);
  stem.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), L.stemDir));
  stem.translate(L.stemBase.x, L.stemBase.y, L.stemBase.z);
  const canopy = buildCanopy(76, 26, true);
  const merge = (g: THREE.BufferGeometry[]) => mergeGeometries(g.map((x) => (x.index ? x.toNonIndexed() : x)), false)!;
  const bamboo2 = merge(parts.body), caps = merge(parts.caps), lash = merge(parts.lash);
  const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;
  HI = { canopy, bamboo: bamboo2, caps, lash, stem, tris: tri(canopy) + tri(bamboo2) + tri(caps) + tri(lash) + tri(stem) };
  return HI;
}

const flexTime = { value: 0 };
function addFlex(m: THREE.Material) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlexTime = flexTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFlex;\nattribute float aShade;\nvarying float vShade;\nuniform float uFlexTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vShade = aShade;
        { float ph = modelMatrix[3].x * 0.21 + modelMatrix[3].z * 0.17;
          transformed.y += aFlex * (0.007 * sin(uFlexTime * 2.1 + position.x * 1.3 + ph) + 0.003 * sin(uFlexTime * 4.7 + position.z * 2.6 + ph)); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vShade;")
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= mix(0.7, 1.0, vShade);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vShade * vShade;");
  };
  m.customProgramCacheKey = () => "glider-flex";
}
interface Mats { outer: THREE.MeshPhysicalMaterial; inner: THREE.MeshStandardMaterial; rim: THREE.MeshStandardMaterial; bamboo: THREE.MeshStandardMaterial; grain: THREE.MeshStandardMaterial; rope: THREE.MeshStandardMaterial; stem: THREE.MeshStandardMaterial; lod: THREE.MeshStandardMaterial }
let MATS: Mats | null = null;
function materials(aniso: number): Mats {
  if (MATS) return MATS;
  const T = textures(aniso);
  const outer = new THREE.MeshPhysicalMaterial({
    map: T.peelMap, normalMap: T.peelNormal, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: T.peelRough, roughness: 1.0,
    clearcoat: 0.05, clearcoatRoughness: 0.7, metalness: 0, envMapIntensity: 0.4,
  });
  const inner = new THREE.MeshStandardMaterial({
    map: T.innerMap, normalMap: T.innerNormal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.85,
  });
  const rim = new THREE.MeshStandardMaterial({ color: 0x33382e, map: T.innerMap, roughness: 0.8 });
  [outer, inner, rim].forEach(addFlex);
  [outer, inner, rim].forEach((m, i) => actorLook(m, { key: `glider-${i}` }));
  const bamboo = new THREE.MeshStandardMaterial({ map: T.bambooMap, normalMap: T.bambooNormal, roughnessMap: T.bambooRough, roughness: 0.75 });
  const grain = new THREE.MeshStandardMaterial({ map: T.grainMap, roughness: 0.85 });
  const rope = new THREE.MeshStandardMaterial({ map: T.ropeMap, normalMap: T.ropeNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.88 });
  const stem = new THREE.MeshStandardMaterial({ map: T.stemMap, roughness: 0.85 });
  const lod = new THREE.MeshStandardMaterial({ map: T.lodMap, roughness: 0.82 });
  MATS = { outer, inner, rim, bamboo, grain, rope, stem, lod };
  return MATS;
}

// ============================================================================ lo-detail (≤ 2k tris, one draw call)
let LO: THREE.BufferGeometry | null = null;
function loGeometry(): THREE.BufferGeometry {
  if (LO) return LO;
  const L = layout();
  const remapUV = (g: THREE.BufferGeometry, f: (u: number, v: number) => [number, number]) => {
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) { const [u, v] = f(uv.getX(k), uv.getY(k)); uv.setXY(k, u, v); }
    return g;
  };
  const can = buildCanopy(16, 5, false);
  // split groups: top → outer region, bottom → underside region
  const pos = can.getAttribute("position"), uvA = can.getAttribute("uv") as THREE.BufferAttribute, g0 = can.groups[0];
  for (let k = 0; k < uvA.count; k++) {
    const top = k < g0.start + g0.count, u = uvA.getX(k), v = uvA.getY(k);
    uvA.setXY(k, u, top ? Math.min(0.998, v) * 0.5 : 0.5 + Math.min(0.998, v) * 0.25);
  }
  can.deleteAttribute("aFlex"); can.deleteAttribute("aShade"); can.clearGroups();
  void pos;
  const sw = (u: number) => (g: THREE.BufferGeometry) => remapUV(g, () => [u, 0.9]);
  const tubeOf = (c: THREE.Curve<Vec>, r: number, n: number, radial: number) => {
    const s: Samp[] = []; for (let k = 0; k <= n; k++) s.push({ p: c.getPointAt(k / n), r, v: 0 });
    return tube(s, radial);
  };
  const parts: THREE.BufferGeometry[] = [can.index ? can.toNonIndexed() : can];
  const P = new THREE.Matrix4().makeRotationX(FRAME_PITCH);
  const hands = [new V3(HAND_X, 0, 0), new V3(HAND_X, 0, 0), new V3(-HAND_X, 0, 0), new V3(-HAND_X, 0, 0)];
  // ropes are built in rig space (pitch applied to the frame parts below), so un-pitch the hands into frame space
  const Pi = P.clone().invert();
  L.attach.forEach((a, k) => parts.push(sw(0.5)(tubeOf(new THREE.LineCurve3(a, hands[k].clone().applyMatrix4(Pi)), R_ROPE * 1.3, 1, 3))));
  const g = mergeGeometries(parts.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (!["position", "normal", "uv"].includes(k)) y.deleteAttribute(k); return y; }), false)!;
  g.applyMatrix4(P);
  LO = g;
  return LO;
}

// ============================================================================ risers (per instance, CPU-animated)
function buildRisers(mat: THREE.Material, handL: Vec, handR: Vec) {
  const L = layout();
  const P = new THREE.Matrix4().makeRotationX(FRAME_PITCH);
  const tops = L.attach.map((a) => a.clone().applyMatrix4(P));
  const hands = [handR, handR, handL, handL];
  const geos: THREE.BufferGeometry[] = [];
  const meta: Array<{ kind: 0 | 1 | 2; rope: number; top: Vec }> = [];
  const pushRope = (samps: Samp[], kind: 0 | 1 | 2, rope: number, top: Vec, radial = 6) => {
    const g = tube(samps, radial);
    const n = g.getAttribute("position").count, w = new Float32Array(n);
    // weight: 0 at the fixed end(s), 1 at the most swinging point (stored per vertex through uv.y ordering)
    const along = new Float32Array(n);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute, vMax = samps[samps.length - 1].v, vMin = samps[0].v;
    for (let k = 0; k < n; k++) along[k] = (uv.getY(k) - vMin) / Math.max(1e-6, vMax - vMin);
    for (let k = 0; k < n; k++) w[k] = along[k];
    g.setAttribute("aAlong", new THREE.BufferAttribute(w, 1));
    geos.push(g); meta.push({ kind, rope, top });
  };
  // four risers: attachment → fist, gently slack
  tops.forEach((a, k) => {
    const h = hands[k], mid = a.clone().lerp(h, 0.5).add(new V3((k < 2 ? 1 : -1) * 0.015, -0.035, 0.02));
    const c = new THREE.QuadraticBezierCurve3(a, mid, h), n = 22, s: Samp[] = [];
    let acc = 0, prev = a;
    for (let i = 0; i <= n; i++) { const p = c.getPoint(i / n); acc += prev.distanceTo(p); prev = p; s.push({ p, r: R_ROPE, v: acc / 0.035 }); }
    pushRope(s, 0, k, a);
  });
  // tails dangling below each fist + a grip knot
  [handR, handL].forEach((h, k) => {
    const x = k === 0 ? HAND_X : -HAND_X, s: Samp[] = [];
    const c = new THREE.CubicBezierCurve3(h, h.clone().add(new V3(x * 0.05, -0.08, -0.2)), h.clone().add(new V3(-x * 0.08, -0.42, -0.34)), h.clone().add(new V3(-x * 0.14, -0.8, -0.3)));
    let acc = 0, prev = h;
    for (let i = 0; i <= 14; i++) { const p = c.getPoint(i / 14); acc += prev.distanceTo(p); prev = p; s.push({ p, r: R_ROPE * (i === 14 ? 1.25 : 1), v: acc / 0.035 }); }
    pushRope(s, 1, k, h);
    const knot: THREE.BufferGeometry[] = [];
    lashing(knot, h.clone().add(new V3(0, -0.03, 0)), new V3(0, 1, 0), R_ROPE * 1.2, 2.5, 0.017, 5);
    const kg = knot[0]; const n = kg.getAttribute("position").count;
    kg.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(n), 1));
    geos.push(kg); meta.push({ kind: 2, rope: k, top: h });
  });
  const counts = geos.map((g) => g.getAttribute("position").count);
  const geo = mergeGeometries(geos, false)!;
  const base = (geo.getAttribute("position") as THREE.BufferAttribute).array.slice() as Float32Array;
  const along = (geo.getAttribute("aAlong") as THREE.BufferAttribute).array as Float32Array;
  (geo.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const owner = new Uint8Array(base.length / 3);
  let o = 0; counts.forEach((c, k) => { owner.fill(k, o, o + c); o += c; });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.name = "glider-risers";
  const dS = meta.map(() => new V3());
  // fist displacement from the build-time hand points: [right, left]; riser k < 2 ends in the right fist
  const baseH = [handR.clone(), handL.clone()], dH = [new V3(), new V3()];
  const handOf = (m: { kind: number; rope: number }) => (m.kind === 0 ? (m.rope < 2 ? 0 : 1) : m.rope);
  let tails = true;
  return {
    mesh,
    /** the mean top of each fist's risers in glider-object space (the canopy frame tilts with the rig): [right, left] */
    tops(rig: THREE.Matrix4, outL: Vec, outR: Vec) { outR.copy(tops[0]).add(tops[1]).multiplyScalar(0.5).applyMatrix4(rig); outL.copy(tops[2]).add(tops[3]).multiplyScalar(0.5).applyMatrix4(rig); },
    setTails(on: boolean) { tails = on; },
    setHands(l: Vec, r: Vec) { dH[0].subVectors(r, baseH[0]); dH[1].subVectors(l, baseH[1]); },
    update(rig: THREE.Matrix4, t: number) {
      meta.forEach((m, k) => { dS[k].copy(m.top); if (m.kind === 0) dS[k].applyMatrix4(rig).sub(m.top); else dS[k].set(0, 0, 0); });
      const arr = (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < owner.length; i++) {
        const m = meta[owner[i]], s = along[i], ph = m.rope * 1.7;
        let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const h = dH[handOf(m)], wh = m.kind === 0 ? s : 1;
        // hidden tails collapse into the fist (degenerate triangles draw nothing) — the grip
        // knot too: on the local glider it is a faceted rope coil bigger than the first-person fist
        if ((m.kind === 1 || m.kind === 2) && !tails) { const b = baseH[m.rope === 0 ? 0 : 1]; x = b.x; y = b.y; z = b.z; }
        x += h.x * wh; y += h.y * wh; z += h.z * wh;
        if (m.kind === 0) {
          const w = Math.sin(Math.PI * s), d = dS[owner[i]];
          x += d.x * (1 - s) + w * 0.014 * Math.sin(t * 1.6 + ph); y += d.y * (1 - s); z += d.z * (1 - s) + w * 0.012 * Math.cos(t * 1.3 + ph);
        } else if (m.kind === 1) {
          const w = Math.pow(s, 1.5);
          x += w * 0.06 * Math.sin(t * 1.9 + ph); z += w * (0.04 * Math.cos(t * 1.4 + ph) + 0.02); y += w * 0.012 * Math.sin(t * 2.3 + ph);
        }
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}

// ============================================================================ public: createGlider
/** opts.hands: glider-local [left, right] fist centres (default (∓HAND_X, 0, 0)) — the risers end exactly in the fists */
export async function createGlider(ctx: WorldCtx, opts: { lo?: boolean; hands?: [THREE.Vector3, THREE.Vector3] } = {}): Promise<GliderProps> {
  const handL = opts.hands?.[0].clone() ?? new V3(-HAND_X, 0, 0), handR = opts.hands?.[1].clone() ?? new V3(HAND_X, 0, 0);
  const aniso = Math.min(8, ctx.assets.maxAniso);
  const M = materials(aniso);
  const object = new THREE.Group(); object.name = "glider";
  const rig = new THREE.Group(); rig.name = "glider-rig"; object.add(rig);
  const lo = new THREE.Mesh(loGeometry(), M.lod); lo.name = "glider-lo"; lo.castShadow = true; rig.add(lo);
  let hi: THREE.Group | null = null;
  let risers: ReturnType<typeof buildRisers> | null = null;
  const buildHi = () => {
    const H = hiGeometry();
    hi = new THREE.Group(); hi.name = "glider-hi";
    const frame = new THREE.Group(); frame.rotation.x = FRAME_PITCH; hi.add(frame);
    const mk = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], name: string) => {
      // no hard shadow from the hi-detail rig: the sun is high, and a sunlit translucent peel must not drop the pilot
      // into black shade (the target art keeps the kong fully lit); the distant lo mesh still casts
      const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = true; frame.add(mesh); return mesh;
    };
    mk(H.canopy, [M.outer, M.inner, M.rim], "glider-peel");
    mk(H.bamboo, M.bamboo, "glider-bamboo").visible = false;
    mk(H.caps, M.grain, "glider-bamboo-ends").visible = false;
    mk(H.lash, M.rope, "glider-lashings").visible = false;
    mk(H.stem, M.stem, "glider-stem").visible = false;
    rig.add(hi);
    risers = buildRisers(M.rope, handL, handR);
    risers.setTails(tailsOn);
    object.add(risers.mesh);
  };
  let isLo = !!opts.lo, tailsOn = true;
  const applyLod = () => {
    if (!isLo && !hi) buildHi();
    lo.visible = isLo;
    if (hi) hi.visible = !isLo;
    if (risers) risers.mesh.visible = !isLo;
  };
  applyLod();
  let bank = 0, pitch = 0, tBank = 0, tPitch = 0, snapped = false, bankV = 0, pitchV = 0;
  const props: GliderProps = {
    object,
    handL, handR,
    update(dt, t) {
      // critically damped springs (exact step, any frame rate) instead of a per-frame lerp: no frame-rate
      // dependent wobble, no overshoot
      const w = 4, x = Math.exp(-w * dt);
      { const e = bank - tBank, c = bankV + w * e; bank = tBank + (e + c * dt) * x; bankV = (bankV - w * c * dt) * x; }
      { const e = pitch - tPitch, c = pitchV + w * e; pitch = tPitch + (e + c * dt) * x; pitchV = (pitchV - w * c * dt) * x; }
      rig.rotation.set(pitch, 0, -bank);
      rig.updateMatrix();
      flexTime.value = t;
      if (!isLo && risers) risers.update(rig.matrix, t);
    },
    setBank(b, p) {
      tBank = b; tPitch = p;
      if (!snapped) { bank = b; pitch = p; snapped = true; rig.rotation.set(pitch, 0, -bank); rig.updateMatrix(); if (risers) risers.update(rig.matrix, 0); }
    },
    setLod(v) { isLo = v; applyLod(); },
    setTails(on) { tailsOn = on; if (risers) { risers.setTails(on); if (!isLo) risers.update(rig.matrix, flexTime.value); } },
    setHands(l, r) {
      if (l !== handL) handL.copy(l);
      if (r !== handR) handR.copy(r);
      if (risers) { risers.setHands(handL, handR); if (!isLo) risers.update(rig.matrix, flexTime.value); }
    },
    riserTops(outL, outR) {
      if (!risers || isLo) return false;
      risers.tops(rig.matrix, outL, outR);
      object.updateWorldMatrix(true, false); outL.applyMatrix4(object.matrixWorld); outR.applyMatrix4(object.matrixWorld);
      return true;
    },
  };
  if (risers) (risers as ReturnType<typeof buildRisers>).update(rig.matrix, 0);
  return props;
}


// ============================================================================ staging + views
/** drop-05 composition (glider-local camera, see DROP_CAM): the glider's fists hang over the lagoon shore just west of
 *  stilt town, ~20 m up; the camera sits front-right of the kong (he faces it three-quarter, right cheek toward the
 *  camera), slightly below the canopy, level horizon; the village fills the right half across the water, the open lagoon
 *  + sea horizon the left, palm crowns cross the bottom edge. */
/** camera in glider-local space, fitted (least squares) to target-art landmarks: fists, ankles, canopy top, spar tip, stem */
// to keep the canopy off the top edge, the landmark fit (fov 55–60) is pulled
// 1.6 m back along its own axis and aimed a touch higher — the whole crescent sits in the top ~40 %, the pilot centre-left
const DROP_CAM = { pos: new V3(0.22, -0.12, -3.1), target: new V3(-0.66, 0.16, 1.92), fov: 58 };
/** world camera position + compass heading of the view (deg, 0 = +X east, 90 = +Z south); the glider pose is derived.
 *  Over the LOBBY ISLET's north-east beach looking south along
 *  its east shore — the char-05 thatched stilt hamlet + watchtower mid-right across the turquoise shallows (the target art's
 *  village), open sea + horizon left, islet palms below */
const DROP_AT = { cam: new V3(62, 25, 1031), heading: 17 };
const DROP = (() => {
  const yaw = Math.atan2(DROP_CAM.target.z - DROP_CAM.pos.z, DROP_CAM.target.x - DROP_CAM.pos.x) - THREE.MathUtils.degToRad(DROP_AT.heading);
  const g = DROP_AT.cam.clone().sub(DROP_CAM.pos.clone().applyAxisAngle(new V3(0, 1, 0), yaw));
  // twist: the kong hangs turned 34° to his left on the risers, so the camera (square to the glider) sees him three-quarter
  // (square to the camera the pilot would hang in a symmetric crucifix)
  return { g, yaw, bank: -0.04, pitch: -0.3, variant: 2, twist: THREE.MathUtils.degToRad(34), lift: 0.3 };
})();
const DEV = { g: new V3(720, 34, -560), yaw: 0 };

function toWorld(o: { g: Vec; yaw: number }, local: Vec): [number, number, number] {
  const p = local.clone().applyAxisAngle(new V3(0, 1, 0), o.yaw).add(o.g);
  return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
}
/** the target art looks DOWN on the village + lagoon (horizon at 33 %) while it sees the pilot from canopy height —
 *  the whole rig (camera + glider + pilot) is tilted nose-down about the glider origin by DROP_TILT around the camera's
 *  right axis, so the pilot + canopy frame is unchanged and the world rises in the frame */
const DROP_TILT = THREE.MathUtils.degToRad(13);
const TILT_M = (() => {
  const p = new V3(...toWorld(DROP, DROP_CAM.pos)), t = new V3(...toWorld(DROP, DROP_CAM.target));
  const right = t.clone().sub(p).cross(new V3(0, 1, 0)).normalize();
  return new THREE.Matrix4().makeTranslation(DROP.g.x, DROP.g.y, DROP.g.z).multiply(new THREE.Matrix4().makeRotationAxis(right, -DROP_TILT)).multiply(new THREE.Matrix4().makeTranslation(-DROP.g.x, -DROP.g.y, -DROP.g.z));
})();
const tiltW = (v: [number, number, number]): [number, number, number] => { const q = new V3(...v).applyMatrix4(TILT_M); return [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; };
const dropCam = (stage: string): CamSpec => ({ pos: tiltW(toWorld(DROP, DROP_CAM.pos)), target: tiltW(toWorld(DROP, DROP_CAM.target)), fov: DROP_CAM.fov, stage });
const devCam = (pos: Vec, target: Vec, fov = 45): CamSpec => ({ pos: toWorld(DEV, pos), target: toWorld(DEV, target), fov, stage: "wip-glider" });

export const views: Record<string, CamSpec> = {
  "drop-05-glider": dropCam("glider"),
  "wip-glider-drop": dropCam("wip-glider-drop"),
  "wip-glider-front": devCam(new V3(0, -0.6, -7.5), new V3(0, 0.7, 0)),
  "wip-glider-side": devCam(new V3(8, 0.6, 0.2), new V3(0, 0.6, 0.2)),
  "wip-glider-top": devCam(new V3(0.6, 9, 3.2), new V3(0, 1.2, 0.3)),
  "wip-glider-under": devCam(new V3(1.2, -3.2, -3.2), new V3(0, 1.2, 0.2), 55),
  "wip-glider-back": devCam(new V3(-1.5, 3.2, 7.5), new V3(0, 0.6, -2), 60),
  "wip-glider-34": devCam(DROP_CAM.pos.clone(), DROP_CAM.target.clone(), DROP_CAM.fov),
  "wip-glider-fist": devCam(new V3(1.5, 0.05, -1.6), new V3(0.1, -0.05, 0), 40),
};

/** brown 2.0 m capsule "kong" hanging from the fists (fallback only, if the kong module fails to load) */
function dummyKong(): THREE.Group {
  const m = new THREE.MeshStandardMaterial({ color: 0x5a3218, roughness: 0.8 });
  const g = new THREE.Group(); g.name = "glider-dummy-kong";
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.0 - 0.84, 8, 16), m);
  body.position.y = 0.2 - 1.0; body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) {
    const a = new V3(s * 0.4, -0.38, 0), b = new V3(s * HAND_X, -0.06, 0), len = a.distanceTo(b);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, len, 10), m);
    arm.position.copy(a).lerp(b, 0.5); arm.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); arm.castShadow = true; g.add(arm);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), m); fist.position.set(s * HAND_X, 0, 0); g.add(fist);
  }
  return g;
}

function place(ctx: WorldCtx, gl: GliderProps, pos: Vec, yaw: number, bank: number, pitch: number) {
  gl.object.position.copy(pos); gl.object.rotation.y = yaw;
  gl.setBank(bank, pitch);
  ctx.scene.add(gl.object);
  ctx.onUpdate((dt, t) => gl.update(dt, t));
}

/** fist centre in the wrist bone frame (kong-parts: the hand ellipsoid sits 0.10 m down the forearm axis) */
// the Blender kong's fists are 1.3× (anatomy FS): centre 0.13 m down the wrist — the risers end IN the fists
const FIST = new V3(0, -0.132, -0.02);
function fists(k: KongActorEx) {
  const l = FIST.clone().applyMatrix4(k.bone("wristL")), r = FIST.clone().applyMatrix4(k.bone("wristR"));
  return { mid: l.clone().add(r).multiplyScalar(0.5), d: r.sub(l) };
}
const FT = { l: new V3(), r: new V3(), inv: new THREE.Matrix4(), up: new V3(0, 1, 0) };
/** Hang `glider` on `kong`'s fists (call after kong.apply(), safe every frame — gameplay uses it in the drop phase).
 *  The fist centres (just past the wristL / wristR bones) become the glider's handL / handR: the glider object is
 *  yawed + positioned so its hand line meets the fists (the glider keeps whatever twist its hand points encode
 *  relative to the kong), then setHands() pins the rope ends exactly into the fists (incl. height differences).
 *  The glider object stays level (bank / pitch live on its inner rig); world or parent space both work. */
export function fitGliderToKong(glider: GliderProps, kong: KongActorEx): void {
  const o = glider.object, l = FT.l, r = FT.r;
  l.copy(FIST).applyMatrix4(kong.bone("wristL")); r.copy(FIST).applyMatrix4(kong.bone("wristR"));
  if (o.parent) { o.parent.updateMatrixWorld(); FT.inv.copy(o.parent.matrixWorld).invert(); l.applyMatrix4(FT.inv); r.applyMatrix4(FT.inv); }
  const hL = glider.handL, hR = glider.handR;
  const yaw = Math.atan2(-(r.z - l.z), r.x - l.x) - Math.atan2(-(hR.z - hL.z), hR.x - hL.x);
  o.rotation.set(0, yaw, 0);
  // origin so that the (rotated) local hand midpoint lands on the fist midpoint
  const mx = (hL.x + hR.x) / 2, my = (hL.y + hR.y) / 2, mz = (hL.z + hR.z) / 2, c = Math.cos(yaw), sn = Math.sin(yaw);
  o.position.set((l.x + r.x) / 2 - (mx * c + mz * sn), (l.y + r.y) / 2 - my, (l.z + r.z) / 2 - (-mx * sn + mz * c));
  o.updateMatrixWorld();
  // exact rope ends: the fists in glider-local space
  l.sub(o.position).applyAxisAngle(FT.up, -yaw); r.sub(o.position).applyAxisAngle(FT.up, -yaw);
  glider.setHands(l, r);
}
// ---------------------------------------------------------------------------- hang pose (target art: drop-05)
/** Target-art hang: arms spread in a V, elbows bent out, fists at head height ~1.3 m apart, torso upright; legs apart with
 *  knees bent, right leg forward (toward the camera), left back. Targets are in the animator's root frame (feet origin,
 *  facing -Z, +X = the kong's right). Applied as a post-process on the bone matrices, so kong-rig's own glide pose
 *  (gameplay) is untouched — adopt it there and drop this when the kong rig gets the same pose. */
const HANG = {
  // fists ~1.3 m apart at head height, elbows bent OUT and down (a V, not a Y)
  wrist: { R: new V3(0.74, 1.72, -0.12), L: new V3(-0.76, 1.68, -0.08) },
  pole: { R: new V3(1, -1.1, 0.3), L: new V3(-1, -1.1, 0.3) },
  // knees bent ~70° (not straight legs), legs spread + both a little forward so BOTH
  // high-tops show (right one tucked, sole toward the camera; left one forward, its outer side + star)
  local: { hipR: [0.45, 0, 0.42], kneeR: [-1.3, 0, 0], ankleR: [0.45, 0, 0], hipL: [0.62, 0, -0.5], kneeL: [-1.05, 0, 0], ankleL: [0.35, 0.25, 0], spine: [-0.04, 0, 0], head: [-0.16, -0.3, 0] } as Partial<Record<BoneName, [number, number, number]>>,
};
const HT = { m: new THREE.Matrix4(), e: new THREE.Euler(), loc: BONE_LIST.map(() => new THREE.Matrix4()), q: new THREE.Quaternion() };
const par = (b: BoneName) => BONES[b].parent;
const OFF = (b: BoneName) => new V3(...BONES[b].offset);
/** rotate bone frame M (at its own position) so local direction `u` points along world `a`, twisting as little as possible */
function aimBone(M: THREE.Matrix4, u: Vec, a: Vec) {
  const pos = new V3().setFromMatrixPosition(M), R = new THREE.Matrix4().extractRotation(M);
  const un = u.clone().normalize(), an = a.clone().normalize();
  const vl = new V3(0, 0, 1).addScaledVector(un, -un.z).normalize(), wl = new V3().crossVectors(un, vl);
  const bw = vl.clone().applyMatrix4(R).addScaledVector(an, 0); bw.addScaledVector(an, -bw.dot(an)).normalize();
  const cw = new V3().crossVectors(an, bw);
  const Bw = new THREE.Matrix4().makeBasis(an, bw, cw), Bl = new THREE.Matrix4().makeBasis(un, vl, wl);
  M.copy(Bw.multiply(Bl.transpose())).setPosition(pos);
}
function applyHangPoseTo(a: KongAnimator) {
  a.postPose = true;
  const W = a.world, idx = boneIndex;
  // 1) legs / spine / head: extra local rotations, children re-follow
  BONE_LIST.forEach((b, i) => { const p = par(b); HT.loc[i].copy(p ? W[idx(p)] : a.root).invert().multiply(W[i]); });
  BONE_LIST.forEach((b, i) => {
    const p = par(b), e = HANG.local[b];
    W[i].multiplyMatrices(p ? W[idx(p)] : a.root, HT.loc[i]);
    if (e) W[i].multiply(HT.m.makeRotationFromEuler(HT.e.set(e[0], e[1], e[2], "XYZ")));
  });
  // 2) arms: 2-bone IK shoulder → elbow → wrist onto the targets, elbows toward the poles
  for (const side of ["R", "L"] as const) {
    const s = idx(`shoulder${side}`), el = idx(`elbow${side}`), w = idx(`wrist${side}`);
    const locE = W[s].clone().invert().multiply(W[el]), locW = W[el].clone().invert().multiply(W[w]);
    const S = new V3().setFromMatrixPosition(W[s]), T = HANG.wrist[side].clone().applyMatrix4(a.root);
    const pole = HANG.pole[side].clone().transformDirection(a.root);
    const L1 = OFF(`elbow${side}`).length(), L2 = OFF(`wrist${side}`).length();
    const d = T.clone().sub(S), dist = THREE.MathUtils.clamp(d.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3), dir = d.normalize();
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const pn = pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, along).addScaledVector(pn, h), Tr = S.clone().addScaledVector(dir, dist);
    aimBone(W[s], OFF(`elbow${side}`), E.clone().sub(S));
    W[el].multiplyMatrices(W[s], locE);
    aimBone(W[el], OFF(`wrist${side}`), Tr.clone().sub(E));
    W[w].multiplyMatrices(W[el], locW);
  }
}
/** Pose `kong` in the target art's hang (spread V arms, bent legs) on top of its animator output — call right after
 *  kong.apply() (and before fitGliderToKong) each frame; staging + optional for gameplay's drop phase. */
export function applyHangPose(kong: KongActorEx) { applyHangPoseTo(kong.animator); }

/** tilt a hung rig (kong bones + fitted glider) by a world matrix — call after applyHangPose + fitGliderToKong */
function tiltRig(k: KongActorEx, g: GliderProps, M: THREE.Matrix4) {
  for (const w of k.animator.world) w.premultiply(M);
  g.object.updateMatrix(); g.object.matrix.premultiply(M); g.object.matrix.decompose(g.object.position, g.object.quaternion, g.object.scale); g.object.updateMatrixWorld(true);
}
/** a kong hanging in its "glide" pose under a glider: the kong (facing yaw + twist) is posed so that its fist midpoint
 *  lands on `at` = the glider origin; the risers are built to end exactly in its measured fists.
 *  lift: the risers end this far ABOVE the glider origin (m) — the drop-05 view hangs the pilot closer under the bar */
async function hangingKong(ctx: WorldCtx, at: Vec, yaw: number, bank: number, pitch: number, variant: number, lo: boolean, twist = 0, lift = 0, tilt: THREE.Matrix4 | null = null): Promise<{ g: GliderProps; k: KongActorEx | null }> {
  let k: KongActorEx | null = null;
  try { k = await createKong(ctx, { variant }); } catch (e) { console.warn("[glider] kong unavailable, using the dummy:", e); }
  if (!k) {
    const g = await createGlider(ctx, { lo });
    place(ctx, g, at, yaw, bank, pitch);
    if (!lo) g.object.add(dummyKong());
    return { g, k: null };
  }
  ctx.scene.add(k.object);
  // settle the pose once at a provisional spot, measure the fists, then shift the kong so their midpoint lands on `at`
  const p0 = pose(at.x, at.y - 2.37, at.z, yaw + twist, { state: "glide", weapon: null });
  for (let i = 0; i < 90; i++) k.apply(p0, 1 / 60);
  applyHangPose(k);
  const f0 = fists(k);
  const p1 = pose(p0.x + at.x - f0.mid.x, p0.y + at.y - f0.mid.y, p0.z + at.z - f0.mid.z, yaw + twist, { state: "glide", weapon: null });
  hold(ctx, k, p1, 1 / 60);
  applyHangPose(k);
  // build the risers for the twisted fists (hand points = the fists seen from a glider yawed to `yaw`), then hang it
  const f1 = fists(k), l = f1.mid.clone().addScaledVector(f1.d, -0.5), r = f1.mid.clone().addScaledVector(f1.d, 0.5);
  const toLocal = (p: Vec) => p.clone().sub(f1.mid).applyAxisAngle(new V3(0, 1, 0), -yaw).add(new V3(0, lift, 0));
  const g = await createGlider(ctx, { lo, hands: [toLocal(l), toLocal(r)] });
  ctx.scene.add(g.object);
  fitGliderToKong(g, k);
  g.setBank(bank, pitch);
  if (tilt) tiltRig(k, g, tilt);
  const kk = k;
  // live: the kong keeps swaying (hold() re-applies its pose each frame) and the glider follows its fists
  ctx.onUpdate((dt, t) => { if (!ctx.shotMode) { applyHangPose(kk); fitGliderToKong(g, kk); if (tilt) tiltRig(kk, g, tilt); } g.update(dt, t); });
  return { g, k };
}

export async function stage(ctx: WorldCtx, id: string): Promise<void> {
  if (id === "glider" || id === "wip-glider-drop") {
    const { g: hero, k: heroKong } = await hangingKong(ctx, DROP.g, DROP.yaw, DROP.bank, DROP.pitch, DROP.variant, false, DROP.twist, DROP.lift, TILT_M);
    // front light (chest #70451f in the canopy's shade vs the target art's #d99955): a warm studio fill on the hero
    // a neutral-warm fill (the orange one pushed the skin to hue 23 vs 30)
    heroKong?.setLook({ fill: "#544a38", fur: 1.12, rim: "#ffe2b0", rimStrength: 0.14 });
    // other players: lo-LOD gliders + kongs placed in camera space (right, up, forward metres) to match the target art
    const cam = views["drop-05-glider"], cp = new V3(...cam.pos), ct = new V3(...cam.target);
    const f = ct.clone().sub(cp).normalize(), r = new V3().crossVectors(f, new V3(0, 1, 0)).normalize(), u = new V3().crossVectors(r, f);
    const distant: GliderProps[] = [];
    const spots: Array<[number, number, number, number, number]> = [
      [-29, 12.5, 37, 0.35, -0.12], [19.5, 9.8, 29, -0.5, 0.1], [-78, 13, 92, 0.2, 0.05], [-52, 15, 150, 0.9, -0.1], [95, 22, 130, -0.2, 0.08],
      [-120, 26, 210, 0.6, 0.1], [40, 30, 240, -0.9, -0.08], [150, 14, 260, 0.3, 0.12], [-190, 8, 280, -0.4, 0.0],
    ];
    for (const [i, [x, y, z, yawOff, bank]] of spots.entries()) {
      const p = cp.clone().addScaledVector(r, x).addScaledVector(u, y).addScaledVector(f, z);
      distant.push((await hangingKong(ctx, p, DROP.yaw + yawOff, bank, 0.02, 5 + i, true)).g);
    }
    // dev: landmarks for the camera fit — world points of the hero's fists / head / feet and the
    // canopy's lead-spar tip, stem end and ridge top, plus the DROP frame they are expressed against
    const L = layout();
    const marks = () => {
      const w = (p: Vec) => p.clone().applyMatrix4(hero.object.matrixWorld);
      const kb = (b: BoneName, o: Vec) => o.clone().applyMatrix4(heroKong!.bone(b));
      const rig = new THREE.Matrix4().makeRotationX(FRAME_PITCH);
      hero.object.updateMatrixWorld(true);
      const riggy = (p: Vec) => w(p.clone().applyMatrix4(rig));
      return {
        fistR: kb("wristR", FIST), fistL: kb("wristL", FIST), headTop: kb("head", new V3(0, 0.44, 0)), footR: kb("ankleR", new V3(0, -0.08, -0.08)), footL: kb("ankleL", new V3(0, -0.08, -0.08)),
        leadTip: riggy(L.lead.getPointAt(0)), stem: riggy(L.stemBase.clone().addScaledVector(L.stemDir, 0.4)), top: riggy(spine(0, new V3())),
      };
    };
    ctx.shared.set("glider:stage", { hero, distant, heroKong, frame: { g: DROP.g.clone(), yaw: DROP.yaw }, marks });
    // the target art's thatched stilt village: the char-05 hamlet on the islet's east shore (same build, same anchor)
    if (id === "glider") {
      try { const { buildHamlet } = await import("./tp-hamlet"); const { hamletAnchor } = await import("./tp-set"); ctx.scene.add(await buildHamlet(ctx, hamletAnchor(ctx))); }
      catch (e) { console.warn("[glider] hamlet unavailable", e); }
    }
    // coconut palms whose crowns cross the bottom edge of the frame (veg module; no-op until it publishes its API)
    const veg = ctx.shared.get("veg") as VegApi | undefined;
    if (veg) {
      const flat = new V3(f.x, 0, f.z).normalize(), rf = new V3().crossVectors(flat, new V3(0, 1, 0)).normalize();
      const plant = (kind: "palm" | "palm-leaning", items: Array<[number, number, number, number]>) => {
        const mats = items.flatMap(([x, z, s, yaw]) => {
          const p = cp.clone().addScaledVector(rf, x).addScaledVector(flat, z);
          const h = ctx.terrain.height(p.x, p.z);
          if (h < 0.35) return [];                 // never a palm standing in the sea
          p.y = h - 0.2;
          return [new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw), new V3(s, s, s))];
        });
        veg.plant(kind, mats);
      };
      // [right, forward, scale, yaw] in metres from the camera; crowns land in the bottom corners, clear of the kong's feet.
      // The camera looks down on the islet (rig tilt) — a dense planted canopy under the glider so the lower third reads
      // as jungle crowns (target art), not the islet's bare sand: palms 17–26 m ahead, banana plants / monstera / bushes /
      // a few broadleaf trees beyond, all kept off the hamlet (right > 4 m and forward > 42 m); the islet's own scatter
      // fills in behind
      const R = mulberry(505), jit = (k: number) => (R() - 0.5) * k;
      const palms: Array<[number, number, number, number]> = [], leaning: Array<[number, number, number, number]> = [];
      for (let x = -34; x <= 30; x += 7) { const fw = 17 + R() * 9; (R() < 0.3 ? leaning : palms).push([x + jit(3), fw, 0.95 + R() * 0.25, R() * 6.28]); }
      plant("palm", palms); plant("palm-leaning", leaning);
      const under = (kind: "banana-plant" | "monstera" | "bush" | "jungle-tree" | "fern", n: number, f0: number, f1: number, s0: number, s1: number) => {
        const items: Array<[number, number, number, number]> = [];
        for (let i = 0; i < n * 3 && items.length < n; i++) {
          const x = -34 + R() * 62, fw = f0 + R() * (f1 - f0);
          if (x > 4 && fw > 42) continue;
          items.push([x, fw, s0 + R() * (s1 - s0), R() * 6.28]);
        }
        if (veg) { const flat2 = flat, rf2 = rf; veg.plant(kind, items.flatMap(([x, z, sc, yaw]) => { const p = cp.clone().addScaledVector(rf2, x).addScaledVector(flat2, z); const h = ctx.terrain.height(p.x, p.z); if (h < 0.4) return []; p.y = h - 0.1; return [new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), yaw), new V3(sc, sc, sc))]; })); }
      };
      under("banana-plant", 34, 24, 50, 1.3, 1.8); under("monstera", 26, 24, 50, 1.4, 2.0); under("bush", 30, 26, 52, 1.3, 2.0); under("fern", 22, 24, 46, 1.4, 1.9);
      under("jungle-tree", 4, 34, 48, 0.55, 0.7);
    }
  } else if (id === "wip-glider") {
    await hangingKong(ctx, DEV.g, DEV.yaw, 0, 0, 2, false, DROP.twist);
    const lo = await createGlider(ctx, { lo: true });
    place(ctx, lo, DEV.g.clone().add(new V3(-9, 1.5, 6)), DEV.yaw + 0.4, 0.2, 0);
  }
}

