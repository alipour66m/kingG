// Human Tactical Operator body parts — sculpted anatomical 3D military soldier (~1.80 m tall) on kong-rig.ts rest skeleton.
// Builds closed, watertight anatomical loft meshes across hips, spine, chest, head, arms, hands, legs, and boots,
// with high-cut FAST helmet, reflective wrap-around ballistic visor, balaclava, Coyote-Tan SAPI plate carrier with
// visible steel/polymer magazines, MOLLE webbing, tactical radio, 24L pack, drop-leg holster, and combat boots.
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
// Strong tonal separation between Ranger Olive combat fatigues and Coyote Tan tactical armor/helmet/boots
const PAL = {
  skin: hexC("#d4a280"), skinShade: hexC("#a87556"),
  olive: hexC("#4e5a3e"), oliveDark: hexC("#3a432e"), oliveCrease: hexC("#2d3423"),
  camoBase: hexC("#c2c6b0"), camoShade: hexC("#989d8a"),
  vest: hexC("#8c7c5c"), vestDark: hexC("#695c43"), vestTrim: hexC("#a1906d"),
  pouch: hexC("#7a6b4e"), magSteel: hexC("#242930"),
  helmet: hexC("#7c6f53"), helmetTrim: hexC("#524937"),
  visor: hexC("#3578a8"), goggleFrame: hexC("#1f2226"),
  gaiter: hexC("#252824"), gaiterShade: hexC("#191b18"),
  boot: hexC("#6b563c"), bootDark: hexC("#4a3a28"), sole: hexC("#18191b"),
  metalDark: hexC("#22262b"), buckle: hexC("#9e8c60"),
  patch: hexC("#857b5c"), flagRed: hexC("#9c3228"),
};

const AO_CLOTH: C3 = [0.28, 0.28, 0.24];
const AO_SKIN: C3 = [0.55, 0.34, 0.26];
const AO_NEUTRAL: C3 = [0.30, 0.30, 0.28];

// ------------------------------------------------------------------------------------------------ mesh builder & watertight loft
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

/** Anatomical elliptical loft through `[y, rx, rz, ox?, oz?, col?]` rings; guarantees outward normals regardless of Y direction. */
interface LoftRing { y: number; rx: number; rz: number; ox?: number; oz?: number; col?: C3 }
function loftGeo(rings: LoftRing[], segs: number, capStart = true, capEnd = true): THREE.BufferGeometry {
  // Always orient rings ascending in Y so triangle winding (a, c, b) consistently produces outward normals.
  const ordered = rings[rings.length - 1].y >= rings[0].y ? rings : rings.slice().reverse();
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const row = segs + 1;
  for (let ri = 0; ri < ordered.length; ri++) {
    const R = ordered[ri], c = R.col ?? [1, 1, 1], v = ri / Math.max(1, ordered.length - 1);
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      pos.push((R.ox ?? 0) + Math.cos(a) * R.rx, R.y, (R.oz ?? 0) + Math.sin(a) * R.rz);
      uv.push(si / segs, v);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let ri = 0; ri < ordered.length - 1; ri++) {
    for (let si = 0; si < segs; si++) {
      const a = ri * row + si, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capStart && ordered[0].rx > 1e-4) {
    const R = ordered[0], c = R.col ?? [1, 1, 1], ci = pos.length / 3;
    pos.push(R.ox ?? 0, R.y, R.oz ?? 0); uv.push(0.5, 0); col.push(c[0], c[1], c[2]);
    for (let si = 0; si < segs; si++) idx.push(ci, si, si + 1);
  }
  if (capEnd && ordered[ordered.length - 1].rx > 1e-4) {
    const R = ordered[ordered.length - 1], c = R.col ?? [1, 1, 1], base = (ordered.length - 1) * row, ci = pos.length / 3;
    pos.push(R.ox ?? 0, R.y, R.oz ?? 0); uv.push(0.5, 1); col.push(c[0], c[1], c[2]);
    for (let si = 0; si < segs; si++) idx.push(ci, base + si + 1, base + si);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function addColoredLoft(mb: MB, rings: LoftRing[], segs: number, uvS: [number, number] = [1, 1]) {
  const g = loftGeo(rings, segs);
  const P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv, C = g.attributes.color;
  const baseI = mb.count, p = new V3(), n = new V3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P as THREE.BufferAttribute, i);
    n.fromBufferAttribute(N as THREE.BufferAttribute, i).normalize();
    mb.vert(p, n, T.getX(i) * uvS[0], T.getY(i) * uvS[1], [C.getX(i), C.getY(i), C.getZ(i)]);
  }
  const ix = g.index!;
  for (let t = 0; t < ix.count; t += 3) mb.tri(baseI + ix.getX(t), baseI + ix.getX(t + 1), baseI + ix.getX(t + 2));
  g.dispose();
}

// ------------------------------------------------------------------------------------------------ procedural tactical maps
export interface KongMaterials {
  mats: Record<Exclude<MatKey, "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin">, THREE.Material>;
  dispose(): void;
}

function ripstopMaps(hex: string, seed: number) {
  const S = 256, r = rng(seed), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, hex, r, 0.06, 22);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 6) {
    c.fillStyle = "rgba(0,0,0,0.07)"; c.fillRect(i, 0, 1, S); c.fillRect(0, i, S, 1);
    hc.fillStyle = "rgba(255,255,255,0.18)"; hc.fillRect(i, 0, 1, S); hc.fillRect(0, i, S, 1);
  }
  grain(c, S, S, r, 0.045, 2400);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.4), { srgb: false, repeat: [2, 2] }) };
}

function camoMaps() {
  const S = 512, r = rng(91), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#616850", r, 0.06, 28);
  const tones = ["#3f4634", "#767157", "#2b3025", "#838569", "#515843"];
  for (let i = 0; i < 80; i++) {
    c.fillStyle = tones[Math.floor(r() * tones.length)];
    c.beginPath();
    c.ellipse(r() * S, r() * S, 18 + r() * 44, 10 + r() * 24, r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let k = -S; k < S * 2; k += 5) {
    c.strokeStyle = "rgba(0,0,0,0.06)"; c.lineWidth = 1.1; c.beginPath(); c.moveTo(k, 0); c.lineTo(k + S, S); c.stroke();
    hc.strokeStyle = "rgba(255,255,255,0.26)"; hc.lineWidth = 1.4; hc.beginPath(); c.moveTo(k, 0); c.lineTo(k + S, S); hc.stroke();
  }
  grain(c, S, S, r, 0.05, 4200);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.4), { srgb: false, repeat: [2, 2] }) };
}

function corduraMaps() {
  const S = 256, r = rng(42), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#dcdad0", r, 0.05, 18);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 6) {
    c.fillStyle = y % 12 === 0 ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.04)";
    c.fillRect(0, y, S, 2);
    hc.fillStyle = y % 12 === 0 ? "rgba(60,60,60,0.5)" : "rgba(200,200,200,0.4)";
    hc.fillRect(0, y, S, 2);
  }
  grain(c, S, S, r, 0.04, 2200);
  return { map: tex(el, { repeat: [3, 3] }), normal: tex(heightToNormal(hel, 1.8), { srgb: false, repeat: [3, 3] }) };
}

function bootMaps() {
  const S = 256, r = rng(63), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#cbc2b6", r, 0.08, 25);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    hc.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";
    hc.fillRect(r() * S, r() * S, 2, 2);
  }
  grain(c, S, S, r, 0.05, 2200);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.5), { srgb: false, repeat: [2, 2] }) };
}

function packMap() {
  const S = 256, r = rng(24), [el, c] = canvas(S, S);
  base(c, S, S, "#7a6d52", r, 0.07, 25);
  for (let y = 24; y < S; y += 32) {
    c.fillStyle = "rgba(35,30,20,0.55)"; c.fillRect(14, y, S - 28, 10);
    c.fillStyle = "rgba(210,195,165,0.22)"; c.fillRect(14, y + 2, S - 28, 2);
  }
  grain(c, S, S, r, 0.05, 2500);
  return tex(el);
}

export function createKongMaterials(): KongMaterials {
  const fm = ripstopMaps("#c8cbb8", 71);
  const cm = camoMaps();
  const vm = corduraMaps();
  const bm = bootMaps();
  const pk = packMap();

  const fur = new THREE.MeshStandardMaterial({ color: "#ffffff", map: fm.map, normalMap: fm.normal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.86, metalness: 0.02, vertexColors: true });
  const hair = fur.clone();
  const skin = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.56, metalness: 0.0, vertexColors: true });
  const detail = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.16, metalness: 0.52, vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: "#b5a374", metalness: 0.65, roughness: 0.34, vertexColors: true });
  const shorts = new THREE.MeshStandardMaterial({ color: "#ffffff", map: cm.map, normalMap: cm.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.88, vertexColors: true });
  const peel = new THREE.MeshStandardMaterial({ color: "#ffffff", map: vm.map, normalMap: vm.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.72, metalness: 0.04, vertexColors: true });
  const sneaker = new THREE.MeshStandardMaterial({ color: "#ffffff", map: bm.map, normalMap: bm.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.62, metalness: 0.05, vertexColors: true });
  const rubber = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.78, metalness: 0.06, vertexColors: true });
  const packM = new THREE.MeshStandardMaterial({ color: "#ffffff", map: pk, roughness: 0.82, metalness: 0.05, vertexColors: true });
  const min = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, vertexColors: true });

  const mats: KongMaterials["mats"] = { fur, hair, skin, detail, gold, shorts, peel, sneaker, pack: packM, rubber, min };
  const texs = [fm.map, fm.normal, cm.map, cm.normal, vm.map, vm.normal, bm.map, bm.normal, pk];
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
  // Neck & anatomical human head (overlaps down into chest collar at y = -0.05)
  addColoredLoft(skin, [
    { y: -0.055, rx: 0.066, rz: 0.064, oz: 0.005, col: PAL.skinShade },
    { y: 0.035, rx: 0.058, rz: 0.058, oz: 0.004, col: PAL.skinShade },
    { y: 0.075, rx: 0.072, rz: 0.082, oz: -0.012, col: PAL.skin },
    { y: 0.130, rx: 0.084, rz: 0.094, oz: -0.008, col: PAL.skin },
    { y: 0.180, rx: 0.086, rz: 0.098, oz: 0.002, col: PAL.skin },
    { y: 0.228, rx: 0.068, rz: 0.080, oz: 0.006, col: PAL.skinShade },
  ], seg);
  // Sculpted nose bridge & brow ridge clearly visible between mask and helmet
  skin.geo(new RoundedBoxGeometry(0.024, 0.038, 0.022, 1, 0.008), TRS([0, 0.128, -0.098], [0.22, 0, 0]), PAL.skin);
  skin.geo(new RoundedBoxGeometry(0.112, 0.020, 0.024, 1, 0.007), TRS([0, 0.158, -0.088]), PAL.skinShade);

  // Lower-face tactical balaclava / gaiter (stops below eyes at y=0.118 so upper face & goggles read cleanly!)
  addColoredLoft(rub, [
    { y: -0.05, rx: 0.070, rz: 0.068, oz: 0.005, col: PAL.gaiterShade },
    { y: 0.035, rx: 0.064, rz: 0.066, oz: 0.003, col: PAL.gaiter },
    { y: 0.082, rx: 0.082, rz: 0.092, oz: -0.010, col: PAL.gaiter },
    { y: 0.118, rx: 0.086, rz: 0.096, oz: -0.011, col: PAL.gaiterShade },
  ], seg);

  // Sculpted high-cut FAST Ballistic Helmet shell (Coyote Tan)
  addColoredLoft(helm, [
    { y: 0.155, rx: 0.112, rz: 0.126, oz: 0.005, col: PAL.helmetTrim },
    { y: 0.180, rx: 0.116, rz: 0.130, oz: 0.005, col: PAL.helmet },
    { y: 0.215, rx: 0.106, rz: 0.120, oz: 0.006, col: PAL.helmet },
    { y: 0.246, rx: 0.076, rz: 0.088, oz: 0.008, col: PAL.helmet },
    { y: 0.264, rx: 0.028, rz: 0.034, oz: 0.008, col: PAL.helmet },
  ], hi ? 20 : 10);
  // Helmet rear counterweight battery pouch + top low-profile IR strobe
  helm.geo(new RoundedBoxGeometry(0.094, 0.056, 0.042, hi ? 2 : 1, 0.012), TRS([0, 0.165, 0.125], [0.14, 0, 0]), PAL.vestDark);
  if (hi) det.geo(new RoundedBoxGeometry(0.032, 0.014, 0.044, 1, 0.004), TRS([0, 0.262, 0.020]), PAL.metalDark);

  // Low-profile titanium NVG Shroud Mount on helmet front (compact, realistic — no tall frog antennae)
  det.geo(new RoundedBoxGeometry(0.046, 0.044, 0.020, 1, 0.005), TRS([0, 0.205, -0.124], [-0.26, 0, 0]), PAL.metalDark);
  met.geo(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 8), TRS([0, 0.208, -0.132], [Math.PI / 2 - 0.26, 0, 0]), [1, 1, 1]);

  // ARC side rails, Peltor tactical comms headset earcups & boom mic
  for (const s of [-1, 1]) {
    helm.geo(new RoundedBoxGeometry(0.016, 0.028, 0.122, 1, 0.005), TRS([s * 0.112, 0.174, -0.004], [-0.08, 0, 0]), PAL.vestDark);
    rub.geo(new THREE.CylinderGeometry(0.034, 0.036, 0.026, 14), TRS([s * 0.098, 0.126, 0.002], [0, 0, Math.PI / 2]), PAL.metalDark);
    det.geo(new THREE.CylinderGeometry(0.024, 0.026, 0.030, 12), TRS([s * 0.102, 0.126, 0.002], [0, 0, Math.PI / 2]), PAL.vestDark);
  }
  if (hi) {
    rub.geo(new RoundedBoxGeometry(0.007, 0.007, 0.085, 1, 0.003), TRS([-0.088, 0.098, -0.048], [-0.14, -0.32, 0]), PAL.metalDark);
    for (const s of [-1, 1]) rub.geo(new THREE.BoxGeometry(0.011, 0.095, 0.012), TRS([s * 0.072, 0.084, -0.022], [0.22, 0, -s * 0.2]), PAL.gaiter);
  }

  // Wrap-around Tactical Ballistic Goggles cleanly in front of upper face (blue-iridium polycarbonate visor + matte frame)
  const gAngle = Math.PI * 0.62;
  const gFrame = new THREE.CylinderGeometry(0.110, 0.108, 0.044, hi ? 16 : 8, 1, false, Math.PI - gAngle / 2, gAngle);
  rub.geo(gFrame, TRS([0, 0.142, -0.005], [0.04, 0, 0]), PAL.goggleFrame);
  const gLens = new THREE.CylinderGeometry(0.113, 0.111, 0.032, hi ? 16 : 8, 1, false, Math.PI - gAngle * 0.44, gAngle * 0.88);
  det.geo(gLens, TRS([0, 0.142, -0.008], [0.04, 0, 0]), PAL.visor);
}

function buildTorso(out: Out, hi: boolean) {
  const shirt = slot(out, "chest", "fur", AO_CLOTH);
  const spineShirt = slot(out, "spine", "fur", AO_CLOTH);
  const vest = slot(out, "chest", "peel", AO_CLOTH);
  const pack = slot(out, "chest", "pack", AO_CLOTH);
  const det = slot(out, "chest", "detail");
  const met = slot(out, "chest", "gold");

  const seg = hi ? 16 : 10;
  // Spine abdomen/waist (y = -0.14..+0.24 overlaps deep into hips and up into chest -> ZERO waist gap!)
  addColoredLoft(spineShirt, [
    { y: -0.14, rx: 0.152, rz: 0.102, col: PAL.oliveDark },
    { y: -0.02, rx: 0.144, rz: 0.098, col: PAL.oliveDark },
    { y: 0.09, rx: 0.148, rz: 0.099, col: PAL.olive },
    { y: 0.23, rx: 0.165, rz: 0.104, col: PAL.olive },
  ], seg);

  // Chest upper torso + broad deltoid shoulder sockets reaching ±0.215 + folded collar
  addColoredLoft(shirt, [
    { y: -0.06, rx: 0.156, rz: 0.100, col: PAL.oliveDark },
    { y: 0.05, rx: 0.178, rz: 0.108, col: PAL.olive },
    { y: 0.145, rx: 0.212, rz: 0.112, col: PAL.olive },
    { y: 0.195, rx: 0.168, rz: 0.098, col: PAL.oliveDark },
    { y: 0.235, rx: 0.078, rz: 0.076, col: PAL.oliveDark },
    { y: 0.262, rx: 0.072, rz: 0.072, col: PAL.oliveCrease },
  ], seg);

  // Coyote Tan Crye JPC Plate Carrier + shoulder pads + SAPI bevel
  addColoredLoft(vest, [
    { y: -0.125, rx: 0.174, rz: 0.118, oz: 0.004, col: PAL.vestDark },
    { y: -0.02, rx: 0.160, rz: 0.126, oz: 0.004, col: PAL.vest },
    { y: 0.09, rx: 0.154, rz: 0.126, oz: 0.004, col: PAL.vest },
    { y: 0.170, rx: 0.128, rz: 0.110, oz: 0.004, col: PAL.vestTrim },
  ], hi ? 14 : 8);
  for (const s of [-1, 1]) {
    vest.geo(new RoundedBoxGeometry(0.080, 0.036, 0.210, 1, 0.014), TRS([s * 0.108, 0.192, 0.005], [0, 0, -s * 0.14]), PAL.vestDark);
  }

  // Front triple Kydex magazine pouches with protruding curved rifle mags
  for (const x of [-0.072, 0, 0.072]) {
    vest.geo(new RoundedBoxGeometry(0.056, 0.105, 0.042, 1, 0.01), TRS([x, -0.055, -0.136]), PAL.pouch);
    if (hi) det.geo(new RoundedBoxGeometry(0.042, 0.044, 0.026, 1, 0.005), TRS([x, 0.008, -0.136], [0.08, 0, 0]), PAL.magSteel);
  }
  // Upper chest admin pouch + unit patch + tactical PRC-152 radio & whip antenna
  vest.geo(new RoundedBoxGeometry(0.145, 0.068, 0.028, 1, 0.008), TRS([0, 0.078, -0.132], [-0.08, 0, 0]), PAL.vestDark);
  if (hi) {
    det.geo(new THREE.BoxGeometry(0.062, 0.032, 0.008), TRS([0, 0.084, -0.146], [-0.08, 0, 0]), PAL.patch);
    det.geo(new THREE.BoxGeometry(0.022, 0.026, 0.009), TRS([-0.02, 0.084, -0.147], [-0.08, 0, 0]), PAL.flagRed);
    for (const y of [-0.02, -0.055, -0.09]) vest.geo(new THREE.BoxGeometry(0.22, 0.012, 0.008), TRS([0, y, -0.156]), PAL.vestTrim);
    det.geo(new RoundedBoxGeometry(0.046, 0.092, 0.032, 1, 0.007), TRS([-0.146, 0.052, -0.120], [0, 0.2, 0]), PAL.metalDark);
    det.geo(new THREE.CylinderGeometry(0.0032, 0.0044, 0.175, 6), TRS([-0.156, 0.158, -0.124]), PAL.metalDark);
    met.geo(new THREE.TorusGeometry(0.012, 0.0035, 6, 10), TRS([0.098, 0.162, -0.118]), [1, 1, 1]);
  }

  // Coyote Tan 24L Assault Backpack
  addColoredLoft(pack, [
    { y: -0.12, rx: 0.132, rz: 0.066, oz: 0.176, col: [0.85, 0.85, 0.82] },
    { y: -0.02, rx: 0.138, rz: 0.072, oz: 0.182, col: [1, 1, 1] },
    { y: 0.095, rx: 0.132, rz: 0.068, oz: 0.178, col: [1, 1, 1] },
    { y: 0.175, rx: 0.108, rz: 0.052, oz: 0.170, col: [0.92, 0.92, 0.9] },
  ], hi ? 12 : 8);
  pack.geo(new RoundedBoxGeometry(0.21, 0.13, 0.052, 1, 0.016), TRS([0, -0.045, 0.244]), [0.9, 0.9, 0.88]);
  if (hi) {
    pack.geo(new RoundedBoxGeometry(0.05, 0.035, 0.065, 1, 0.012), TRS([0, 0.195, 0.168]), [0.72, 0.72, 0.7]);
    det.geo(new THREE.CylinderGeometry(0.042, 0.042, 0.24, 10), TRS([0, -0.145, 0.190], [0, 0, Math.PI / 2]), PAL.vestDark);
  }
}

function buildHips(out: Out, hi: boolean) {
  const pants = slot(out, "hips", "shorts", AO_CLOTH);
  const belt = slot(out, "hips", "rubber", AO_NEUTRAL);
  const met = slot(out, "hips", "gold");

  addColoredLoft(pants, [
    { y: -0.10, rx: 0.158, rz: 0.105, col: PAL.camoShade },
    { y: -0.02, rx: 0.160, rz: 0.106, col: PAL.camoBase },
    { y: 0.075, rx: 0.152, rz: 0.102, col: PAL.camoBase },
  ], hi ? 14 : 8);
  belt.geo(new RoundedBoxGeometry(0.326, 0.048, 0.224, 1, 0.014), TRS([0, 0.048, 0]), PAL.vestDark);
  met.geo(new RoundedBoxGeometry(0.056, 0.042, 0.022, 1, 0.005), TRS([0, 0.048, -0.115]), [1, 1, 1]);
  if (hi) {
    belt.geo(new RoundedBoxGeometry(0.115, 0.115, 0.052, 1, 0.014), TRS([-0.085, -0.010, 0.122]), PAL.pouch);
    belt.geo(new RoundedBoxGeometry(0.092, 0.098, 0.048, 1, 0.012), TRS([0.085, -0.008, 0.118]), PAL.vestDark);
  }
}

function buildLegs(out: Out, hi: boolean) {
  const thighPants = slot(out, "hipR", "shorts", AO_CLOTH);
  const thighBelt = slot(out, "hipR", "rubber", AO_NEUTRAL);
  const knee = v3(BONES.kneeR.offset);

  const lSeg = hi ? 14 : 8;
  // Hip socket sphere cap + muscular outward-facing thigh loft down to kneeR
  thighPants.geo(new THREE.SphereGeometry(0.090, 10, 8), TRS([0, 0.01, 0]), PAL.camoShade);
  addColoredLoft(thighPants, [
    { y: 0.02, rx: 0.092, rz: 0.096, col: PAL.camoShade },
    { y: -0.11, rx: 0.090, rz: 0.095, oz: -0.004, col: PAL.camoBase },
    { y: -0.26, rx: 0.079, rz: 0.083, oz: -0.002, col: PAL.camoBase },
    { y: knee.y - 0.015, rx: 0.068, rz: 0.072, col: PAL.camoShade },
  ], lSeg);
  // Cargo pocket + tight contoured drop-leg holster strap (hugs thigh cleanly — no floating disc!)
  thighPants.geo(new RoundedBoxGeometry(0.030, 0.145, 0.105, 1, 0.01), TRS([0.080, -0.21, 0]), [0.92, 0.92, 0.9]);
  thighBelt.geo(new RoundedBoxGeometry(0.042, 0.135, 0.082, 1, 0.012), TRS([0.094, -0.15, -0.016]), PAL.metalDark);
  addColoredLoft(thighBelt, [
    { y: -0.132, rx: 0.092, rz: 0.097, oz: -0.004, col: PAL.gaiter },
    { y: -0.156, rx: 0.091, rz: 0.096, oz: -0.004, col: PAL.gaiter },
  ], lSeg);
  if (hi) {
    addColoredLoft(thighBelt, [
      { y: -0.205, rx: 0.085, rz: 0.090, oz: -0.003, col: PAL.gaiter },
      { y: -0.225, rx: 0.084, rz: 0.089, oz: -0.003, col: PAL.gaiter },
    ], lSeg);
  }

  // Knee sphere cap + sculpted shin & calf muscle + contoured knee pad
  const calfPants = slot(out, "kneeR", "shorts", AO_CLOTH);
  const kneeDet = slot(out, "kneeR", "detail", AO_NEUTRAL);
  const kneeStraps = slot(out, "kneeR", "rubber", AO_NEUTRAL);
  const ankle = v3(BONES.ankleR.offset);

  calfPants.geo(new THREE.SphereGeometry(0.068, 10, 8), TRS([0, 0, 0]), PAL.camoShade);
  addColoredLoft(calfPants, [
    { y: 0.02, rx: 0.068, rz: 0.072, col: PAL.camoShade },
    { y: -0.12, rx: 0.072, rz: 0.078, oz: 0.008, col: PAL.camoBase },
    { y: -0.24, rx: 0.064, rz: 0.068, oz: 0.004, col: PAL.camoBase },
    { y: ankle.y + 0.04, rx: 0.056, rz: 0.058, col: PAL.camoShade },
    { y: ankle.y - 0.01, rx: 0.050, rz: 0.052, col: PAL.camoShade },
  ], lSeg);
  const kp = new THREE.CylinderGeometry(0.080, 0.076, 0.095, hi ? 12 : 6, 1, false, Math.PI * 0.72, Math.PI * 0.56);
  kneeDet.geo(kp, TRS([0, -0.01, -0.006]), PAL.metalDark);
  addColoredLoft(kneeStraps, [
    { y: 0.004, rx: 0.071, rz: 0.075, col: PAL.vestDark },
    { y: -0.020, rx: 0.071, rz: 0.075, col: PAL.vestDark },
  ], lSeg);

  // Sculpted Coyote Suede Combat Boot (sole at y = -0.12)
  const boot = slot(out, "ankleR", "sneaker", AO_NEUTRAL);
  const sole = slot(out, "ankleR", "rubber", AO_NEUTRAL);

  addColoredLoft(boot, [
    { y: -0.088, rx: 0.054, rz: 0.062, col: PAL.bootDark },
    { y: -0.03, rx: 0.054, rz: 0.060, oz: 0.004, col: PAL.boot },
    { y: 0.04, rx: 0.053, rz: 0.057, oz: 0.005, col: PAL.boot },
    { y: 0.095, rx: 0.057, rz: 0.059, oz: 0.005, col: PAL.bootDark },
  ], hi ? 12 : 8);
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

  // Shoulder deltoid socket ball overlapping chest edge + smoothly interpolating upper arm loft to elbow
  upperShirt.geo(new THREE.SphereGeometry(0.070, 12, 10), TRS([-0.015, 0.0, 0.0]), PAL.oliveDark);
  addColoredLoft(upperShirt, [
    { y: 0.025, rx: 0.066, rz: 0.068, ox: -0.006, oz: 0.0, col: PAL.oliveDark },
    { y: -0.06, rx: 0.066, rz: 0.068, ox: elbow.x * 0.25, oz: elbow.z * 0.25, col: PAL.olive },
    { y: -0.18, rx: 0.058, rz: 0.060, ox: elbow.x * 0.65, oz: elbow.z * 0.65, col: PAL.olive },
    { y: elbow.y - 0.01, rx: 0.050, rz: 0.052, ox: elbow.x, oz: elbow.z, col: PAL.oliveDark },
  ], aSeg);
  upperShirt.geo(new RoundedBoxGeometry(0.022, 0.092, 0.064, 1, 0.008), TRS([0.058, -0.11, 0]), PAL.oliveDark);
  if (hi) upperDet.geo(new THREE.BoxGeometry(0.008, 0.034, 0.048), TRS([0.070, -0.10, 0]), PAL.patch);

  // Forearm sleeve + elbow ball cap + exposed forearm wrist + tight watch + seamless glove overlap
  const foreShirt = slot(out, "elbowR", "fur", AO_CLOTH);
  const foreSkin = slot(out, "elbowR", "skin", AO_SKIN);
  const forePad = slot(out, "elbowR", "rubber", AO_NEUTRAL);
  const wrist = v3(BONES.wristR.offset);

  foreShirt.geo(new THREE.SphereGeometry(0.051, 10, 8), TRS([0, 0, 0]), PAL.oliveDark);
  addColoredLoft(foreShirt, [
    { y: 0.015, rx: 0.052, rz: 0.054, ox: 0, oz: 0, col: PAL.oliveDark },
    { y: -0.09, rx: 0.052, rz: 0.052, ox: wrist.x * 0.35, oz: wrist.z * 0.35, col: PAL.olive },
    { y: -0.185, rx: 0.047, rz: 0.047, ox: wrist.x * 0.68, oz: wrist.z * 0.68, col: PAL.oliveDark },
  ], aSeg);
  // Exposed tanned forearm extending cleanly past wrist.y (-0.28) into the tactical glove cuff!
  addColoredLoft(foreSkin, [
    { y: -0.175, rx: 0.040, rz: 0.040, ox: wrist.x * 0.68, oz: wrist.z * 0.68, col: PAL.skinShade },
    { y: wrist.y - 0.02, rx: 0.036, rz: 0.036, ox: wrist.x, oz: wrist.z, col: PAL.skin },
  ], aSeg);
  const ep = new THREE.CylinderGeometry(0.059, 0.056, 0.075, hi ? 10 : 6, 1, false, -Math.PI * 0.25, Math.PI * 0.5);
  forePad.geo(ep, TRS([0, -0.015, 0.004]), PAL.metalDark);
  // Tight watch strap hugging wrist cleanly
  addColoredLoft(forePad, [
    { y: wrist.y + 0.042, rx: 0.040, rz: 0.040, ox: wrist.x * 0.9, oz: wrist.z * 0.9, col: PAL.vestDark },
    { y: wrist.y + 0.022, rx: 0.040, rz: 0.040, ox: wrist.x * 0.94, oz: wrist.z * 0.94, col: PAL.vestDark },
  ], aSeg);

  // Mechanix-style gloved tactical fist starting at y = +0.012 (seamless wrist cuff!) down to FIST = (0, -0.125, -0.02)
  const glove = slot(out, "wristR", "rubber", AO_NEUTRAL);
  const knuckle = slot(out, "wristR", "detail", AO_NEUTRAL);
  glove.geo(new RoundedBoxGeometry(0.056, 0.110, 0.068, hi ? 2 : 1, 0.018), TRS([0, -0.045, -0.006]), PAL.gaiter);
  knuckle.geo(new RoundedBoxGeometry(0.060, 0.026, 0.030, 1, 0.01), TRS([0.004, -0.088, -0.036]), PAL.metalDark);
  glove.geo(new RoundedBoxGeometry(0.048, 0.060, 0.048, 1, 0.018), TRS([0, -0.122, -0.034], [0.22, 0, 0]), PAL.vestDark);
  glove.geo(new RoundedBoxGeometry(0.026, 0.046, 0.026, 1, 0.01), TRS([-0.028, -0.095, -0.040], [0.4, 0, 0.35]), PAL.gaiter);
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
  M("head", new THREE.SphereGeometry(0.122, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), TRS([0, 0.16, 0.005], [0, 0, 0], [1, 0.96, 1.1]), PAL.helmet);
  M("head", new THREE.BoxGeometry(0.145, 0.04, 0.042), TRS([0, 0.148, -0.092]), PAL.visor);

  M("chest", new THREE.CylinderGeometry(0.185, 0.155, 0.28, 8), TRS([0, 0.09, 0], [0, 0, 0], [1.1, 1, 0.68]), PAL.olive);
  M("chest", new THREE.BoxGeometry(0.28, 0.28, 0.24), TRS([0, 0.04, 0]), PAL.vest);
  M("chest", new THREE.BoxGeometry(0.26, 0.30, 0.12), TRS([0, 0.03, 0.175]), PAL.vestDark);
  M("spine", new THREE.BoxGeometry(0.29, 0.28, 0.18), TRS([0, 0.05, 0]), PAL.oliveDark);
  M("hips", new THREE.BoxGeometry(0.30, 0.18, 0.20), TRS([0, -0.01, 0]), PAL.camoBase);

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
  M("wristR", new THREE.BoxGeometry(0.058, 0.12, 0.072), TRS([0, -0.06, -0.02]), PAL.gaiter);

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
