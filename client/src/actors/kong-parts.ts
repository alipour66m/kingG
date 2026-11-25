// Human Tactical Operator body parts — sculpted anatomical 3D military soldier (~1.80 m tall) on kong-rig.ts rest skeleton.
// Builds tapered anatomical loft meshes, sculpted head/helmet + folded NVGs + curved ballistic visor + balaclava,
// angled SAPI plate carrier with protruding curved mags, MOLLE webbing, tactical radio, 24L pack, drop-leg holster,
// contoured knee pads, and Vibram-lug combat boots.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { base, canvas, grain, heightToNormal, rng, tex } from "./paint";
import { BONES, type BoneName } from "./kong-rig";

export type MatKey = "fur" | "hair" | "skin" | "detail" | "gold" | "shorts" | "peel" | "sneaker" | "pack" | "rubber" | "min"
  | "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin";
export interface PartGeo { bone: BoneName; mat: MatKey; geo: THREE.BufferGeometry }
export interface KongParts { parts: PartGeo[]; tris: number; petals: number }

type C3 = [number, number, number];
type P3 = [number, number, number];
const V3 = THREE.Vector3;
type V = THREE.Vector3;
const v3 = (p: P3) => new V3(p[0], p[1], p[2]);
const hexC = (h: string): C3 => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ------------------------------------------------------------------------------------------------ tactical palette
const PAL = {
  skin: hexC("#cf9e7c"), skinShade: hexC("#9e6e50"),
  olive: hexC("#4e5940"), oliveDark: hexC("#37402c"), oliveCrease: hexC("#2c3324"),
  camoBase: hexC("#c6cab6"), camoShade: hexC("#9ea391"),
  vest: hexC("#5a5c4d"), vestDark: hexC("#3f4136"), vestTrim: hexC("#6c6e5b"),
  pouch: hexC("#4c4e40"), magSteel: hexC("#282c32"),
  helmet: hexC("#484d40"), helmetTrim: hexC("#31352b"),
  visor: hexC("#111720"), goggleFrame: hexC("#1f2226"),
  gaiter: hexC("#262925"), gaiterShade: hexC("#1a1c19"),
  boot: hexC("#362d24"), bootDark: hexC("#211c17"), sole: hexC("#151618"),
  metalDark: hexC("#22252a"), metalSpec: hexC("#4a525c"), buckle: hexC("#8f7e56"),
  patch: hexC("#7a7052"), flagRed: hexC("#8a2b24"),
};

const AO_CLOTH: C3 = [0.28, 0.28, 0.24];
const AO_SKIN: C3 = [0.55, 0.34, 0.26];
const AO_NEUTRAL: C3 = [0.30, 0.30, 0.28];

// ------------------------------------------------------------------------------------------------ mesh builder & anatomical loft
class MB {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  constructor(public aoTint: C3 = AO_NEUTRAL, public aoK = 1) {}
  get count() { return this.pos.length / 3; }
  vert(p: V, n: V, u: number, v: number, c: C3) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  geo(g: THREE.BufferGeometry, m: THREE.Matrix4 | null, c: C3 | ((p: V, n: V) => C3), uvS: [number, number] = [1, 1]) {
    const G = m ? g.clone().applyMatrix4(m) : g;
    if (!G.attributes.normal) G.computeVertexNormals();
    const flip = m ? m.determinant() < 0 : false;
    const P = G.attributes.position, N = G.attributes.normal, T = G.attributes.uv;
    const baseI = this.count, p = new V3(), n = new V3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P as THREE.BufferAttribute, i);
      n.fromBufferAttribute(N as THREE.BufferAttribute, i).normalize();
      const u = T ? T.getX(i) * uvS[0] : 0, v = T ? T.getY(i) * uvS[1] : 0;
      this.vert(p, n, u, v, typeof c === "function" ? c(p, n) : c);
    }
    const ix = G.index ? G.index.array : null, cnt = ix ? ix.length : P.count;
    for (let t = 0; t < cnt; t += 3) {
      const a = baseI + (ix ? ix[t] : t), b = baseI + (ix ? ix[t + 1] : t + 1), d = baseI + (ix ? ix[t + 2] : t + 2);
      if (flip) this.tri(a, d, b); else this.tri(a, b, d);
    }
    if (m) G.dispose();
    g.dispose();
  }
  mirrored() {
    const o = new MB(this.aoTint, this.aoK);
    o.pos = this.pos.map((x, i) => (i % 3 === 0 ? -x : x));
    o.nor = this.nor.map((x, i) => (i % 3 === 0 ? -x : x));
    o.uv = this.uv.slice(); o.col = this.col.slice();
    for (let t = 0; t < this.idx.length; t += 3) o.idx.push(this.idx[t], this.idx[t + 2], this.idx[t + 1]);
    return o;
  }
  get tris() { return this.idx.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const TRS = (p: P3, e: P3 = [0, 0, 0], s: P3 = [1, 1, 1]) =>
  new THREE.Matrix4().compose(v3(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])), v3(s));

/** Anatomical elliptical loft through `[y, rx, rz, ox?, oz?, color?]` rings with smooth normals and caps. */
interface LoftRing { y: number; rx: number; rz: number; ox?: number; oz?: number; col?: C3 }
function loftGeo(rings: LoftRing[], segs: number, capBottom = true, capTop = true): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const row = segs + 1;
  for (let ri = 0; ri < rings.length; ri++) {
    const R = rings[ri], c = R.col ?? [1, 1, 1], v = ri / Math.max(1, rings.length - 1);
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      pos.push((R.ox ?? 0) + Math.cos(a) * R.rx, R.y, (R.oz ?? 0) + Math.sin(a) * R.rz);
      uv.push(si / segs, v);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capBottom && rings[0].rx > 1e-4) {
    const R = rings[0], c = R.col ?? [1, 1, 1], ci = pos.length / 3;
    pos.push(R.ox ?? 0, R.y, R.oz ?? 0); uv.push(0.5, 0); col.push(c[0], c[1], c[2]);
    for (let si = 0; si < segs; si++) idx.push(ci, si + 1, si);
  }
  if (capTop && rings[rings.length - 1].rx > 1e-4) {
    const R = rings[rings.length - 1], c = R.col ?? [1, 1, 1], base = (rings.length - 1) * row, ci = pos.length / 3;
    pos.push(R.ox ?? 0, R.y, R.oz ?? 0); uv.push(0.5, 1); col.push(c[0], c[1], c[2]);
    for (let si = 0; si < segs; si++) idx.push(ci, base + si, base + si + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Add a pre-colored BufferGeometry directly into MB preserving per-ring vertex colors. */
function addColoredLoft(mb: MB, rings: LoftRing[], segs: number, m: THREE.Matrix4 | null = null, uvS: [number, number] = [1, 1]) {
  const g = loftGeo(rings, segs);
  const C = g.attributes.color as THREE.BufferAttribute;
  const colAt = (_p: V, _n: V, i?: number) => {
    const k = i ?? 0;
    return [C.getX(k), C.getY(k), C.getZ(k)] as C3;
  };
  const G = m ? g.clone().applyMatrix4(m) : g;
  if (!G.attributes.normal) G.computeVertexNormals();
  const flip = m ? m.determinant() < 0 : false;
  const P = G.attributes.position, N = G.attributes.normal, T = G.attributes.uv;
  const baseI = mb.count, p = new V3(), n = new V3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P as THREE.BufferAttribute, i);
    n.fromBufferAttribute(N as THREE.BufferAttribute, i).normalize();
    mb.vert(p, n, T.getX(i) * uvS[0], T.getY(i) * uvS[1], colAt(p, n, i));
  }
  const ix = G.index!;
  for (let t = 0; t < ix.count; t += 3) {
    const a = baseI + ix.getX(t), b = baseI + ix.getX(t + 1), d = baseI + ix.getX(t + 2);
    if (flip) mb.tri(a, d, b); else mb.tri(a, b, d);
  }
  if (m) G.dispose();
  g.dispose();
}

// ------------------------------------------------------------------------------------------------ procedural tactical maps
export interface KongMaterials {
  mats: Record<Exclude<MatKey, "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin">, THREE.Material>;
  dispose(): void;
}

function ripstopMaps(hex: string, seed: number) {
  const S = 256, r = rng(seed), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, hex, r, 0.07, 24);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 6) {
    c.fillStyle = "rgba(0,0,0,0.08)"; c.fillRect(i, 0, 1, S); c.fillRect(0, i, S, 1);
    hc.fillStyle = "rgba(255,255,255,0.2)"; hc.fillRect(i, 0, 1, S); hc.fillRect(0, i, S, 1);
  }
  grain(c, S, S, r, 0.05, 2600);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.5), { srgb: false, repeat: [2, 2] }) };
}

function camoMaps() {
  const S = 512, r = rng(91), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#5a6049", r, 0.07, 32);
  const tones = ["#3a4030", "#6f6a52", "#262a21", "#7a7c60", "#4b513e"];
  for (let i = 0; i < 85; i++) {
    c.fillStyle = tones[Math.floor(r() * tones.length)];
    c.beginPath();
    c.ellipse(r() * S, r() * S, 18 + r() * 44, 10 + r() * 24, r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let k = -S; k < S * 2; k += 5) {
    c.strokeStyle = "rgba(0,0,0,0.07)"; c.lineWidth = 1.1; c.beginPath(); c.moveTo(k, 0); c.lineTo(k + S, S); c.stroke();
    hc.strokeStyle = "rgba(255,255,255,0.28)"; hc.lineWidth = 1.4; hc.beginPath(); hc.moveTo(k, 0); hc.lineTo(k + S, S); hc.stroke();
  }
  grain(c, S, S, r, 0.05, 4500);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.4), { srgb: false, repeat: [2, 2] }) };
}

function corduraMaps() {
  const S = 256, r = rng(42), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#dcdad0", r, 0.06, 18);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 6) {
    c.fillStyle = y % 12 === 0 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.05)";
    c.fillRect(0, y, S, 2);
    hc.fillStyle = y % 12 === 0 ? "rgba(50,50,50,0.55)" : "rgba(205,205,205,0.4)";
    hc.fillRect(0, y, S, 2);
  }
  grain(c, S, S, r, 0.045, 2500);
  return { map: tex(el, { repeat: [3, 3] }), normal: tex(heightToNormal(hel, 1.9), { srgb: false, repeat: [3, 3] }) };
}

function bootMaps() {
  const S = 256, r = rng(63), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#b8b0a4", r, 0.09, 28);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < 2000; i++) {
    hc.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.11)";
    hc.fillRect(r() * S, r() * S, 2, 2);
  }
  grain(c, S, S, r, 0.05, 2200);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.6), { srgb: false, repeat: [2, 2] }) };
}

function skinMaps() {
  const S = 256, r = rng(17), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#f0e8e0", r, 0.03, 14);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    hc.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    hc.fillRect(r() * S, r() * S, 2, 2);
  }
  grain(c, S, S, r, 0.02, 1200);
  return { map: tex(el), normal: tex(heightToNormal(hel, 0.6), { srgb: false }) };
}

function packMap() {
  const S = 256, r = rng(24), [el, c] = canvas(S, S);
  base(c, S, S, "#525544", r, 0.08, 28);
  for (let y = 24; y < S; y += 32) {
    c.fillStyle = "rgba(20,22,17,0.6)"; c.fillRect(14, y, S - 28, 10);
    c.fillStyle = "rgba(180,175,150,0.22)"; c.fillRect(14, y + 2, S - 28, 2);
  }
  grain(c, S, S, r, 0.05, 2500);
  return tex(el);
}

export function createKongMaterials(): KongMaterials {
  const fm = ripstopMaps("#c8cbb8", 71);
  const cm = camoMaps();
  const vm = corduraMaps();
  const bm = bootMaps();
  const sm = skinMaps();
  const pk = packMap();

  const fur = new THREE.MeshStandardMaterial({ color: "#ffffff", map: fm.map, normalMap: fm.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.86, metalness: 0.02, vertexColors: true });
  const hair = fur.clone();
  const skin = new THREE.MeshStandardMaterial({ color: "#ffffff", map: sm.map, normalMap: sm.normal, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.58, metalness: 0.0, vertexColors: true });
  const detail = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.16, metalness: 0.48, vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: "#b09d6e", metalness: 0.68, roughness: 0.34, vertexColors: true });
  const shorts = new THREE.MeshStandardMaterial({ color: "#ffffff", map: cm.map, normalMap: cm.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.88, vertexColors: true });
  const peel = new THREE.MeshStandardMaterial({ color: "#ffffff", map: vm.map, normalMap: vm.normal, normalScale: new THREE.Vector2(0.65, 0.65), roughness: 0.72, metalness: 0.04, vertexColors: true });
  const sneaker = new THREE.MeshStandardMaterial({ color: "#ffffff", map: bm.map, normalMap: bm.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.60, metalness: 0.06, vertexColors: true });
  const rubber = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78, metalness: 0.06, vertexColors: true });
  const packM = new THREE.MeshStandardMaterial({ color: "#ffffff", map: pk, roughness: 0.82, metalness: 0.05, vertexColors: true });
  const min = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, vertexColors: true });

  const mats: KongMaterials["mats"] = { fur, hair, skin, detail, gold, shorts, peel, sneaker, pack: packM, rubber, min };
  const texs = [fm.map, fm.normal, cm.map, cm.normal, vm.map, vm.normal, bm.map, bm.normal, sm.map, sm.normal, pk];
  return {
    mats,
    dispose() { for (const m of Object.values(mats)) m.dispose(); for (const t of texs) t.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ part assembly
type Out = Map<string, { bone: BoneName; mat: MatKey; mb: MB }>;
function slot(out: Out, bone: BoneName, mat: MatKey, tint: C3 = AO_NEUTRAL, aoK = 0.8) {
  const k = `${bone}|${mat}`;
  if (!out.has(k)) out.set(k, { bone, mat, mb: new MB(tint, aoK) });
  return out.get(k)!.mb;
}

function buildHead(out: Out, hi: boolean) {
  const skin = slot(out, "head", "skin", AO_SKIN);
  const helm = slot(out, "head", "peel", AO_CLOTH);
  const det = slot(out, "head", "detail", AO_NEUTRAL, 0.5);
  const rub = slot(out, "head", "rubber", AO_NEUTRAL);
  const met = slot(out, "head", "gold");

  const seg = hi ? 18 : 10;
  // Sculpted neck + anatomical jawline/face/cranium
  addColoredLoft(skin, [
    { y: -0.025, rx: 0.064, rz: 0.062, oz: 0.005, col: PAL.skinShade },
    { y: 0.04, rx: 0.056, rz: 0.056, oz: 0.004, col: PAL.skinShade },
    { y: 0.075, rx: 0.068, rz: 0.078, oz: -0.015, col: PAL.skin },
    { y: 0.125, rx: 0.084, rz: 0.095, oz: -0.012, col: PAL.skin },
    { y: 0.175, rx: 0.088, rz: 0.100, oz: 0.002, col: PAL.skin },
    { y: 0.225, rx: 0.072, rz: 0.084, oz: 0.008, col: PAL.skinShade },
  ], seg);
  // Sculpted nose bridge & brow ridge under goggles
  skin.geo(new RoundedBoxGeometry(0.024, 0.044, 0.026, 1, 0.008), TRS([0, 0.132, -0.098], [0.22, 0, 0]), PAL.skin);
  skin.geo(new RoundedBoxGeometry(0.116, 0.022, 0.032, 1, 0.008), TRS([0, 0.165, -0.084]), PAL.skinShade);

  // Tactical breathable half-face balaclava / gaiter covering neck, chin & nose bridge
  addColoredLoft(rub, [
    { y: -0.02, rx: 0.074, rz: 0.072, oz: 0.004, col: PAL.gaiterShade },
    { y: 0.035, rx: 0.068, rz: 0.068, oz: 0.002, col: PAL.gaiter },
    { y: 0.082, rx: 0.086, rz: 0.098, oz: -0.018, col: PAL.gaiter },
    { y: 0.128, rx: 0.088, rz: 0.104, oz: -0.016, col: PAL.gaiterShade },
  ], seg);

  // Sculpted high-cut FAST Ballistic Helmet dome + brim flare
  addColoredLoft(helm, [
    { y: 0.138, rx: 0.114, rz: 0.128, oz: 0.006, col: PAL.helmetTrim },
    { y: 0.165, rx: 0.118, rz: 0.132, oz: 0.005, col: PAL.helmet },
    { y: 0.205, rx: 0.108, rz: 0.122, oz: 0.006, col: PAL.helmet },
    { y: 0.242, rx: 0.078, rz: 0.090, oz: 0.008, col: PAL.helmet },
    { y: 0.260, rx: 0.032, rz: 0.038, oz: 0.008, col: PAL.helmet },
  ], hi ? 20 : 10);
  // Helmet rear battery pack + counterweight pouch + top IR strobe
  helm.geo(new RoundedBoxGeometry(0.092, 0.056, 0.044, hi ? 2 : 1, 0.012), TRS([0, 0.155, 0.126], [0.14, 0, 0]), PAL.vestDark);
  if (hi) det.geo(new RoundedBoxGeometry(0.034, 0.016, 0.048, 1, 0.005), TRS([0, 0.258, 0.018]), PAL.metalDark);

  // Titanium NVG Shroud Mount + folded Dual-Tube AN/PVS-31 Night Vision Optics on helmet brow
  det.geo(new RoundedBoxGeometry(0.044, 0.046, 0.020, 1, 0.005), TRS([0, 0.202, -0.126], [-0.28, 0, 0]), PAL.metalDark);
  met.geo(new THREE.CylinderGeometry(0.009, 0.009, 0.022, 8), TRS([0, 0.210, -0.138], [Math.PI / 2 - 0.3, 0, 0]), [1, 1, 1]);
  if (hi) {
    // Flip bridge + twin optical tubes folded upward cleanly over the forehead
    det.geo(new RoundedBoxGeometry(0.086, 0.016, 0.022, 1, 0.004), TRS([0, 0.236, -0.132], [-0.4, 0, 0]), PAL.metalSpec);
    for (const s of [-1, 1]) {
      det.geo(new THREE.CylinderGeometry(0.016, 0.018, 0.068, 10), TRS([s * 0.032, 0.248, -0.112], [0.85, 0, s * 0.06]), PAL.metalDark);
      met.geo(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 10), TRS([s * 0.032, 0.268, -0.136], [0.85, 0, s * 0.06]), [0.25, 0.65, 0.85]);
    }
  }

  // ARC side rails, Peltor ComTac comms headset earcups + headband + boom mic
  for (const s of [-1, 1]) {
    helm.geo(new RoundedBoxGeometry(0.018, 0.030, 0.128, 1, 0.005), TRS([s * 0.114, 0.165, -0.004], [-0.08, 0, 0]), PAL.vestDark);
    rub.geo(new THREE.CylinderGeometry(0.035, 0.038, 0.028, 14), TRS([s * 0.098, 0.120, 0.004], [0, 0, Math.PI / 2]), PAL.metalDark);
    det.geo(new THREE.CylinderGeometry(0.024, 0.026, 0.032, 12), TRS([s * 0.102, 0.120, 0.004], [0, 0, Math.PI / 2]), PAL.vestDark);
  }
  if (hi) {
    rub.geo(new RoundedBoxGeometry(0.007, 0.007, 0.088, 1, 0.003), TRS([-0.088, 0.095, -0.048], [-0.14, -0.32, 0]), PAL.metalDark);
    for (const s of [-1, 1]) rub.geo(new THREE.BoxGeometry(0.011, 0.092, 0.013), TRS([s * 0.072, 0.082, -0.022], [0.24, 0, -s * 0.2]), PAL.gaiter);
  }

  // Curved wrap-around tactical ballistic goggles (curved cylinder arc segment rather than a flat box!)
  const gAngle = Math.PI * 0.56;
  const gFrame = new THREE.CylinderGeometry(0.104, 0.102, 0.048, hi ? 16 : 8, 1, true, Math.PI - gAngle / 2, gAngle);
  rub.geo(gFrame, TRS([0, 0.150, -0.008], [0.06, 0, 0]), PAL.goggleFrame);
  const gLens = new THREE.CylinderGeometry(0.106, 0.104, 0.036, hi ? 16 : 8, 1, false, Math.PI - gAngle * 0.46, gAngle * 0.92);
  det.geo(gLens, TRS([0, 0.150, -0.011], [0.06, 0, 0]), PAL.visor);
}

function buildTorso(out: Out, hi: boolean) {
  const shirt = slot(out, "chest", "fur", AO_CLOTH);
  const spineShirt = slot(out, "spine", "fur", AO_CLOTH);
  const vest = slot(out, "chest", "peel", AO_CLOTH);
  const pack = slot(out, "chest", "pack", AO_CLOTH);
  const det = slot(out, "chest", "detail");
  const met = slot(out, "chest", "gold");

  const seg = hi ? 16 : 10;
  // Sculpted V-taper anatomical upper torso + combat shirt collar
  addColoredLoft(shirt, [
    { y: -0.035, rx: 0.154, rz: 0.098, col: PAL.oliveDark },
    { y: 0.04, rx: 0.172, rz: 0.106, col: PAL.olive },
    { y: 0.135, rx: 0.194, rz: 0.110, col: PAL.olive },
    { y: 0.195, rx: 0.152, rz: 0.094, col: PAL.oliveDark },
    { y: 0.235, rx: 0.076, rz: 0.076, col: PAL.oliveDark },
    { y: 0.258, rx: 0.072, rz: 0.072, col: PAL.oliveCrease },
  ], seg);
  // Sculpted tapered waist / spine connecting ribs to hips smoothly
  addColoredLoft(spineShirt, [
    { y: -0.02, rx: 0.146, rz: 0.096, col: PAL.oliveDark },
    { y: 0.08, rx: 0.142, rz: 0.094, col: PAL.oliveDark },
    { y: 0.18, rx: 0.156, rz: 0.100, col: PAL.olive },
  ], seg);

  // Crye-style Armored Plate Carrier (beveled SAPI plates + padded cummerbund + shoulder pads)
  addColoredLoft(vest, [
    { y: -0.085, rx: 0.168, rz: 0.116, oz: 0.004, col: PAL.vestDark },
    { y: -0.02, rx: 0.152, rz: 0.122, oz: 0.004, col: PAL.vest },
    { y: 0.09, rx: 0.148, rz: 0.124, oz: 0.004, col: PAL.vest },
    { y: 0.165, rx: 0.122, rz: 0.108, oz: 0.004, col: PAL.vestTrim },
  ], hi ? 14 : 8);
  for (const s of [-1, 1]) {
    vest.geo(new RoundedBoxGeometry(0.074, 0.036, 0.205, 1, 0.014), TRS([s * 0.104, 0.192, 0.005], [0, 0, -s * 0.12]), PAL.vestDark);
  }

  // Front triple Kydex magazine pouches with protruding curved 5.56/7.62 magazines + MOLLE strips
  for (const x of [-0.072, 0, 0.072]) {
    vest.geo(new RoundedBoxGeometry(0.056, 0.105, 0.042, 1, 0.01), TRS([x, -0.045, -0.132]), PAL.pouch);
    if (hi) det.geo(new RoundedBoxGeometry(0.042, 0.045, 0.026, 1, 0.005), TRS([x, 0.018, -0.132], [0.08, 0, 0]), PAL.magSteel);
  }
  // Upper chest admin pouch + woven patch + tactical PRC-152 radio & whip antenna
  vest.geo(new RoundedBoxGeometry(0.145, 0.068, 0.028, 1, 0.008), TRS([0, 0.082, -0.128], [-0.08, 0, 0]), PAL.vestDark);
  if (hi) {
    det.geo(new THREE.BoxGeometry(0.062, 0.032, 0.008), TRS([0, 0.088, -0.142], [-0.08, 0, 0]), PAL.patch);
    det.geo(new THREE.BoxGeometry(0.022, 0.026, 0.009), TRS([-0.02, 0.088, -0.143], [-0.08, 0, 0]), PAL.flagRed);
    // Horizontal MOLLE straps across carrier
    for (const y of [-0.01, -0.045, -0.08]) vest.geo(new THREE.BoxGeometry(0.22, 0.012, 0.008), TRS([0, y, -0.152]), PAL.vestTrim);
    // Tactical Radio + Whip Antenna + Chest Carabiner
    det.geo(new RoundedBoxGeometry(0.046, 0.092, 0.032, 1, 0.007), TRS([-0.142, 0.055, -0.118], [0, 0.2, 0]), PAL.metalDark);
    det.geo(new THREE.CylinderGeometry(0.0032, 0.0044, 0.175, 6), TRS([-0.152, 0.162, -0.122]), PAL.metalDark);
    met.geo(new THREE.TorusGeometry(0.012, 0.0035, 6, 10), TRS([0.095, 0.165, -0.115]), [1, 1, 1]);
  }

  // Sculpted 24L Assault Backpack (tapered organic profile + lower pouch + bedroll + straps)
  addColoredLoft(pack, [
    { y: -0.115, rx: 0.132, rz: 0.066, oz: 0.174, col: [0.85, 0.85, 0.82] },
    { y: -0.02, rx: 0.138, rz: 0.072, oz: 0.180, col: [1, 1, 1] },
    { y: 0.095, rx: 0.132, rz: 0.068, oz: 0.176, col: [1, 1, 1] },
    { y: 0.175, rx: 0.108, rz: 0.052, oz: 0.168, col: [0.92, 0.92, 0.9] },
  ], hi ? 12 : 8);
  pack.geo(new RoundedBoxGeometry(0.21, 0.13, 0.052, 1, 0.016), TRS([0, -0.045, 0.242]), [0.9, 0.9, 0.88]);
  if (hi) {
    pack.geo(new RoundedBoxGeometry(0.05, 0.035, 0.065, 1, 0.012), TRS([0, 0.195, 0.165]), [0.72, 0.72, 0.7]);
    det.geo(new THREE.CylinderGeometry(0.042, 0.042, 0.24, 10), TRS([0, -0.145, 0.188], [0, 0, Math.PI / 2]), PAL.vestDark);
  }
}

function buildHips(out: Out, hi: boolean) {
  const pants = slot(out, "hips", "shorts", AO_CLOTH);
  const belt = slot(out, "hips", "rubber", AO_NEUTRAL);
  const met = slot(out, "hips", "gold");

  addColoredLoft(pants, [
    { y: -0.095, rx: 0.156, rz: 0.104, col: PAL.camoShade },
    { y: -0.02, rx: 0.158, rz: 0.106, col: PAL.camoBase },
    { y: 0.055, rx: 0.148, rz: 0.100, col: PAL.camoBase },
  ], hi ? 14 : 8);
  belt.geo(new RoundedBoxGeometry(0.324, 0.048, 0.222, 1, 0.014), TRS([0, 0.038, 0]), PAL.vestDark);
  met.geo(new RoundedBoxGeometry(0.056, 0.042, 0.022, 1, 0.005), TRS([0, 0.038, -0.114]), [1, 1, 1]);
  if (hi) {
    belt.geo(new RoundedBoxGeometry(0.115, 0.115, 0.052, 1, 0.014), TRS([-0.085, -0.018, 0.122]), PAL.pouch);
    belt.geo(new RoundedBoxGeometry(0.092, 0.098, 0.048, 1, 0.012), TRS([0.085, -0.015, 0.118]), PAL.vestDark);
  }
}

function buildLegs(out: Out, hi: boolean) {
  const thighPants = slot(out, "hipR", "shorts", AO_CLOTH);
  const thighBelt = slot(out, "hipR", "rubber", AO_NEUTRAL);
  const knee = v3(BONES.kneeR.offset);

  const lSeg = hi ? 14 : 8;
  // Muscular sculpted thigh (hip down to kneeR y=-0.43)
  addColoredLoft(thighPants, [
    { y: 0.02, rx: 0.092, rz: 0.096, col: PAL.camoShade },
    { y: -0.11, rx: 0.090, rz: 0.096, oz: -0.004, col: PAL.camoBase },
    { y: -0.26, rx: 0.080, rz: 0.084, oz: -0.002, col: PAL.camoBase },
    { y: knee.y, rx: 0.068, rz: 0.072, col: PAL.camoShade },
  ], lSeg);
  // Cargo pocket + tactical drop-leg Kydex holster + straps
  thighPants.geo(new RoundedBoxGeometry(0.034, 0.145, 0.105, 1, 0.01), TRS([0.078, -0.21, 0]), [0.92, 0.92, 0.9]);
  thighBelt.geo(new RoundedBoxGeometry(0.044, 0.135, 0.082, 1, 0.012), TRS([0.090, -0.15, -0.016]), PAL.metalDark);
  thighBelt.geo(new THREE.CylinderGeometry(0.086, 0.084, 0.022, 12), TRS([0, -0.14, 0]), PAL.gaiter);
  if (hi) thighBelt.geo(new THREE.CylinderGeometry(0.080, 0.078, 0.018, 12), TRS([0, -0.21, 0]), PAL.gaiter);

  // Sculpted Shin + Gastrocnemius Calf Bulge + Contoured Tactical Knee Pad
  const calfPants = slot(out, "kneeR", "shorts", AO_CLOTH);
  const kneeDet = slot(out, "kneeR", "detail", AO_NEUTRAL);
  const kneeStraps = slot(out, "kneeR", "rubber", AO_NEUTRAL);
  const ankle = v3(BONES.ankleR.offset);

  addColoredLoft(calfPants, [
    { y: 0.02, rx: 0.068, rz: 0.072, col: PAL.camoShade },
    { y: -0.12, rx: 0.072, rz: 0.078, oz: 0.008, col: PAL.camoBase },
    { y: -0.25, rx: 0.064, rz: 0.068, oz: 0.004, col: PAL.camoBase },
    { y: ankle.y + 0.04, rx: 0.056, rz: 0.058, col: PAL.camoShade },
    { y: ankle.y, rx: 0.050, rz: 0.052, col: PAL.camoShade },
  ], lSeg);
  // Curved outer hard-shell knee pad
  const kp = new THREE.CylinderGeometry(0.076, 0.072, 0.098, hi ? 12 : 6, 1, false, Math.PI * 0.72, Math.PI * 0.56);
  kneeDet.geo(kp, TRS([0, -0.01, -0.005]), PAL.metalDark);
  kneeStraps.geo(new THREE.CylinderGeometry(0.071, 0.070, 0.024, 12), TRS([0, -0.005, 0.002]), PAL.vestDark);

  // Sculpted Tactical Combat Boot (ankleR at y=0.12 -> sole bottom at y=-0.12)
  const boot = slot(out, "ankleR", "sneaker", AO_NEUTRAL);
  const sole = slot(out, "ankleR", "rubber", AO_NEUTRAL);

  addColoredLoft(boot, [
    { y: -0.088, rx: 0.054, rz: 0.062, col: PAL.bootDark },
    { y: -0.03, rx: 0.054, rz: 0.060, oz: 0.004, col: PAL.boot },
    { y: 0.04, rx: 0.052, rz: 0.056, oz: 0.006, col: PAL.boot },
    { y: 0.085, rx: 0.056, rz: 0.058, oz: 0.006, col: PAL.bootDark },
  ], hi ? 12 : 8);
  // Contoured boot vamp, toe cap, heel counter & speed laces
  boot.geo(new RoundedBoxGeometry(0.100, 0.068, 0.242, hi ? 2 : 1, 0.024), TRS([0, -0.064, -0.058]), PAL.boot);
  boot.geo(new RoundedBoxGeometry(0.104, 0.046, 0.098, 1, 0.022), TRS([0, -0.075, -0.136]), PAL.bootDark);
  boot.geo(new RoundedBoxGeometry(0.102, 0.065, 0.068, 1, 0.02), TRS([0, -0.065, 0.032]), PAL.bootDark);
  sole.geo(new RoundedBoxGeometry(0.108, 0.032, 0.260, 1, 0.01), TRS([0, -0.104, -0.058]), PAL.sole);
  if (hi) {
    for (const z of [-0.045, -0.072, -0.098, -0.122]) {
      sole.geo(new THREE.BoxGeometry(0.052, 0.008, 0.009), TRS([0, -0.024, z]), PAL.sole);
    }
  }
}

function buildArms(out: Out, hi: boolean) {
  const upperShirt = slot(out, "shoulderR", "fur", AO_CLOTH);
  const upperDet = slot(out, "shoulderR", "detail");
  const elbow = v3(BONES.elbowR.offset);
  const aSeg = hi ? 12 : 8;

  // Anatomical deltoid cap -> bicep -> elbow taper
  addColoredLoft(upperShirt, [
    { y: 0.035, rx: 0.062, rz: 0.064, col: PAL.oliveDark },
    { y: -0.04, rx: 0.066, rz: 0.068, col: PAL.olive },
    { y: -0.15, rx: 0.058, rz: 0.060, col: PAL.olive },
    { y: elbow.y, rx: 0.050, rz: 0.052, col: PAL.oliveDark },
  ], aSeg);
  // Bicep Velcro pocket & unit flag patch
  upperShirt.geo(new RoundedBoxGeometry(0.022, 0.092, 0.064, 1, 0.008), TRS([0.058, -0.105, 0]), PAL.oliveDark);
  if (hi) upperDet.geo(new THREE.BoxGeometry(0.008, 0.034, 0.048), TRS([0.070, -0.095, 0]), PAL.patch);

  // Anatomical forearm + rolled cuff + elbow pad
  const foreShirt = slot(out, "elbowR", "fur", AO_CLOTH);
  const foreSkin = slot(out, "elbowR", "skin", AO_SKIN);
  const forePad = slot(out, "elbowR", "rubber", AO_NEUTRAL);
  const wrist = v3(BONES.wristR.offset);
  addColoredLoft(foreShirt, [
    { y: 0.015, rx: 0.052, rz: 0.054, col: PAL.oliveDark },
    { y: -0.08, rx: 0.052, rz: 0.052, col: PAL.olive },
    { y: -0.155, rx: 0.046, rz: 0.046, col: PAL.oliveDark },
  ], aSeg);
  // Subtle exposed wrist/lower forearm before tactical glove
  addColoredLoft(foreSkin, [
    { y: -0.150, rx: 0.039, rz: 0.039, col: PAL.skinShade },
    { y: wrist.y, rx: 0.036, rz: 0.036, col: PAL.skin },
  ], aSeg);
  const ep = new THREE.CylinderGeometry(0.055, 0.052, 0.075, hi ? 10 : 6, 1, false, -Math.PI * 0.25, Math.PI * 0.5);
  forePad.geo(ep, TRS([0, -0.015, 0.004]), PAL.metalDark);
  forePad.geo(new THREE.CylinderGeometry(0.042, 0.041, 0.022, 10), TRS([wrist.x * 0.92, wrist.y * 0.92, wrist.z * 0.92]), PAL.vestDark);

  // Mechanix-style gloved tactical fist (centered cleanly on FIST = (0, -0.125, -0.02))
  const glove = slot(out, "wristR", "rubber", AO_NEUTRAL);
  const knuckle = slot(out, "wristR", "detail", AO_NEUTRAL);
  glove.geo(new RoundedBoxGeometry(0.054, 0.086, 0.070, hi ? 2 : 1, 0.016), TRS([0, -0.055, -0.008]), PAL.gaiter);
  knuckle.geo(new RoundedBoxGeometry(0.060, 0.026, 0.030, 1, 0.01), TRS([0.004, -0.088, -0.038]), PAL.metalDark);
  glove.geo(new RoundedBoxGeometry(0.048, 0.060, 0.048, 1, 0.018), TRS([0, -0.122, -0.036], [0.22, 0, 0]), PAL.vestDark);
  glove.geo(new RoundedBoxGeometry(0.026, 0.046, 0.026, 1, 0.01), TRS([-0.028, -0.095, -0.042], [0.4, 0, 0.35]), PAL.gaiter);
}

// ------------------------------------------------------------------------------------------------ assembly
export function buildKongParts(detail: "hi" | "lo" = "hi"): KongParts {
  const hi = detail === "hi";
  const out: Out = new Map();
  buildHead(out, hi);
  buildTorso(out, hi);
  buildHips(out, hi);
  buildLegs(out, hi);
  buildArms(out, hi);
  const parts: PartGeo[] = [];
  let tris = 0;
  for (const { bone, mat, mb } of out.values()) {
    if (!mb.count) continue;
    parts.push({ bone, mat, geo: mb.build() });
    tris += mb.tris;
    if (bone.endsWith("R")) {
      const m = mb.mirrored();
      parts.push({ bone: bone.replace(/R$/, "L") as BoneName, mat, geo: m.build() });
      tris += m.tris;
    }
  }
  return { parts, tris: Math.round(tris), petals: 0 };
}

// ------------------------------------------------------------------------------------------------ far LOD
/** ~750-tri tactical soldier silhouette for 40-200 m (one vertex-coloured material) */
export function buildKongMin(): KongParts {
  const out: Out = new Map();
  const M = (bone: BoneName, g: THREE.BufferGeometry, m: THREE.Matrix4, c: C3) => slot(out, bone, "min", AO_NEUTRAL, 0.7).geo(g, m, c);

  M("head", new THREE.SphereGeometry(0.092, 8, 6), TRS([0, 0.13, -0.005]), PAL.skin);
  M("head", new THREE.SphereGeometry(0.122, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), TRS([0, 0.15, 0.005], [0, 0, 0], [1, 0.96, 1.1]), PAL.helmet);
  M("head", new THREE.BoxGeometry(0.145, 0.04, 0.042), TRS([0, 0.148, -0.092]), PAL.visor);

  M("chest", new THREE.CylinderGeometry(0.175, 0.155, 0.25, 8), TRS([0, 0.09, 0], [0, 0, 0], [1.1, 1, 0.68]), PAL.olive);
  M("chest", new THREE.BoxGeometry(0.28, 0.28, 0.24), TRS([0, 0.04, 0]), PAL.vest);
  M("chest", new THREE.BoxGeometry(0.26, 0.30, 0.12), TRS([0, 0.03, 0.175]), PAL.vestDark);
  M("spine", new THREE.BoxGeometry(0.29, 0.21, 0.18), TRS([0, 0.085, 0]), PAL.oliveDark);
  M("hips", new THREE.BoxGeometry(0.30, 0.16, 0.20), TRS([0, -0.02, 0]), PAL.camoBase);

  const limbCyl = (r0: number, r1: number, a: P3, b: P3) => {
    const va = v3(a), vb = v3(b), d = vb.clone().sub(va), len = d.length(), mid = va.clone().add(vb).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    return { g: new THREE.CylinderGeometry(r0, r1, len, 7), m: new THREE.Matrix4().compose(mid, q, new V3(1, 1, 1)) };
  };
  const th = limbCyl(0.088, 0.068, [0, 0.02, 0], BONES.kneeR.offset); M("hipR", th.g, th.m, PAL.camoBase);
  const sh = limbCyl(0.068, 0.050, [0, 0.02, 0], BONES.ankleR.offset); M("kneeR", sh.g, sh.m, PAL.camoBase);
  M("ankleR", new THREE.BoxGeometry(0.105, 0.12, 0.24), TRS([0, -0.06, -0.058]), PAL.boot);

  const ua = limbCyl(0.066, 0.050, [0, 0.01, 0], BONES.elbowR.offset); M("shoulderR", ua.g, ua.m, PAL.olive);
  const fa = limbCyl(0.052, 0.038, [0, 0.01, 0], BONES.wristR.offset); M("elbowR", fa.g, fa.m, PAL.olive);
  M("wristR", new THREE.BoxGeometry(0.058, 0.11, 0.072), TRS([0, -0.08, -0.02]), PAL.gaiter);

  const parts: PartGeo[] = [];
  let tris = 0;
  for (const { bone, mat, mb } of out.values()) {
    parts.push({ bone, mat, geo: mb.build() });
    tris += mb.tris;
    if (bone.endsWith("R")) {
      const m = mb.mirrored();
      parts.push({ bone: bone.replace(/R$/, "L") as BoneName, mat, geo: m.build() });
      tris += m.tris;
    }
  }
  return { parts, tris: Math.round(tris), petals: 0 };
}
