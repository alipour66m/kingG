// Human Tactical Operator body parts — procedural 3D military soldier (~1.80 m tall) on kong-rig.ts rest skeleton.
// Replaces the legacy ape mesh across hi, lo, and min LODs while preserving all bone attachments and MatKey slots:
//   head    : cranium, balaclava gaiter, FAST combat helmet + arc rails + NVG shroud, tinted ballistic goggles, comms headset
//   torso   : olive combat shirt, armored SAPI plate carrier with triple mag pouches + radio, 24L assault backpack
//   hips    : camo combat trousers, tactical duty belt + titanium buckle + rear dump pouch
//   arms    : rolled combat sleeves, bicep pocket & patch, elbow pads, Mechanix-style armored-knuckle tactical gloves
//   legs    : cargo pockets, drop-leg holster, hard-shell knee pads, bloused trouser calves, laced lug-sole combat boots
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
  skin: hexC("#c89878"), skinShade: hexC("#9c6e52"),
  olive: hexC("#4b543e"), oliveDark: hexC("#373f2d"),
  camoBase: hexC("#c8cbb8"),
  vest: hexC("#58594c"), vestDark: hexC("#434439"), pouch: hexC("#4d4f42"),
  helmet: hexC("#4a4e42"), visor: hexC("#161a1f"), goggleFrame: hexC("#232528"),
  gaiter: hexC("#2a2d29"), hairDark: hexC("#282420"),
  boot: hexC("#332c24"), bootDark: hexC("#1e1c1a"), sole: hexC("#18191b"),
  metalDark: hexC("#25272b"), buckle: hexC("#8c7c58"),
  patch: hexC("#6a624a"), redPatch: hexC("#7a2a24"),
};

const AO_CLOTH: C3 = [0.28, 0.28, 0.24];
const AO_SKIN: C3 = [0.55, 0.34, 0.26];
const AO_NEUTRAL: C3 = [0.30, 0.30, 0.28];

// ------------------------------------------------------------------------------------------------ mesh builder
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

function limbM(a: V, b: V, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  const dir = b.clone().sub(a), len = dir.length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const q = len > 1e-5 ? new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir.normalize()) : new THREE.Quaternion();
  return new THREE.Matrix4().compose(mid, q, new V3(sx, len, sz));
}

// ------------------------------------------------------------------------------------------------ procedural tactical maps
export interface KongMaterials {
  mats: Record<Exclude<MatKey, "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin">, THREE.Material>;
  dispose(): void;
}

function ripstopMaps(hex: string, seed: number) {
  const S = 256, r = rng(seed), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, hex, r, 0.06, 20);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 8) {
    c.fillStyle = "rgba(0,0,0,0.06)"; c.fillRect(i, 0, 1, S); c.fillRect(0, i, S, 1);
    hc.fillStyle = "rgba(255,255,255,0.16)"; hc.fillRect(i, 0, 1, S); hc.fillRect(0, i, S, 1);
  }
  grain(c, S, S, r, 0.04, 2400);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.4), { srgb: false, repeat: [2, 2] }) };
}

function camoMaps() {
  const S = 512, r = rng(91), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#5a5f48", r, 0.06, 30);
  const tones = ["#3f4534", "#6e6953", "#2b2f26", "#787a5e"];
  for (let i = 0; i < 65; i++) {
    c.fillStyle = tones[Math.floor(r() * tones.length)];
    c.beginPath();
    c.ellipse(r() * S, r() * S, 22 + r() * 48, 12 + r() * 28, r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let k = -S; k < S * 2; k += 6) {
    c.strokeStyle = "rgba(0,0,0,0.06)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(k, 0); c.lineTo(k + S, S); c.stroke();
    hc.strokeStyle = "rgba(255,255,255,0.28)"; hc.lineWidth = 1.5; hc.beginPath(); hc.moveTo(k, 0); hc.lineTo(k + S, S); hc.stroke();
  }
  grain(c, S, S, r, 0.05, 4000);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.3), { srgb: false, repeat: [2, 2] }) };
}

function corduraMaps() {
  const S = 256, r = rng(42), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#dcdad0", r, 0.05, 16);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    c.fillStyle = y % 8 === 0 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.05)";
    c.fillRect(0, y, S, 2);
    hc.fillStyle = y % 8 === 0 ? "rgba(60,60,60,0.5)" : "rgba(200,200,200,0.4)";
    hc.fillRect(0, y, S, 2);
  }
  grain(c, S, S, r, 0.04, 2200);
  return { map: tex(el, { repeat: [3, 3] }), normal: tex(heightToNormal(hel, 1.8), { srgb: false, repeat: [3, 3] }) };
}

function bootMaps() {
  const S = 256, r = rng(63), [el, c] = canvas(S, S), [hel, hc] = canvas(S, S);
  base(c, S, S, "#b8b0a4", r, 0.08, 25);
  hc.fillStyle = "#808080"; hc.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    const v = r() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
    hc.fillStyle = v; hc.fillRect(r() * S, r() * S, 2, 2);
  }
  grain(c, S, S, r, 0.05, 2200);
  return { map: tex(el, { repeat: [2, 2] }), normal: tex(heightToNormal(hel, 1.5), { srgb: false, repeat: [2, 2] }) };
}

function packMap() {
  const S = 256, r = rng(24), [el, c] = canvas(S, S);
  base(c, S, S, "#525544", r, 0.07, 25);
  for (let y = 24; y < S; y += 36) {
    c.fillStyle = "rgba(24,26,20,0.55)"; c.fillRect(16, y, S - 32, 12);
    c.fillStyle = "rgba(180,175,150,0.22)"; c.fillRect(16, y + 2, S - 32, 2);
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

  const fur = new THREE.MeshStandardMaterial({ color: "#ffffff", map: fm.map, normalMap: fm.normal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.88, metalness: 0.02, vertexColors: true });
  const hair = fur.clone();
  const skin = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0.0, vertexColors: true });
  const detail = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.24, metalness: 0.35, vertexColors: true });
  const gold = new THREE.MeshStandardMaterial({ color: "#a5966a", metalness: 0.65, roughness: 0.38, vertexColors: true });
  const shorts = new THREE.MeshStandardMaterial({ color: "#ffffff", map: cm.map, normalMap: cm.normal, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.9, vertexColors: true });
  const peel = new THREE.MeshStandardMaterial({ color: "#ffffff", map: vm.map, normalMap: vm.normal, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.72, metalness: 0.05, vertexColors: true });
  const sneaker = new THREE.MeshStandardMaterial({ color: "#ffffff", map: bm.map, normalMap: bm.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.64, metalness: 0.05, vertexColors: true });
  const rubber = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, metalness: 0.04, vertexColors: true });
  const packM = new THREE.MeshStandardMaterial({ color: "#ffffff", map: pk, roughness: 0.84, metalness: 0.04, vertexColors: true });
  const min = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.84, vertexColors: true });

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

  const seg = hi ? 16 : 9;
  // Neck & cranium
  skin.geo(new THREE.CylinderGeometry(0.056, 0.064, 0.11, seg), TRS([0, 0.015, 0.0]), PAL.skinShade);
  skin.geo(new THREE.SphereGeometry(1, seg, seg), TRS([0, 0.135, -0.005], [0, 0, 0], [0.088, 0.112, 0.098]), PAL.skin);
  // Tactical balaclava gaiter covering neck & lower face up to nose bridge
  rub.geo(new THREE.CylinderGeometry(0.086, 0.072, 0.115, seg), TRS([0, 0.065, -0.014]), PAL.gaiter);
  rub.geo(new THREE.SphereGeometry(0.086, seg, 10), TRS([0, 0.105, -0.028], [0, 0, 0], [1, 0.72, 0.96]), PAL.gaiter);

  // FAST Tactical Combat Helmet shell
  const hg = new THREE.SphereGeometry(0.118, hi ? 20 : 10, hi ? 14 : 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  helm.geo(hg, TRS([0, 0.15, 0.006], [-0.08, 0, 0], [1.0, 0.96, 1.1]), PAL.helmet);
  // Helmet nape pad + counterweight pouch
  helm.geo(new RoundedBoxGeometry(0.10, 0.065, 0.055, hi ? 2 : 1, 0.015), TRS([0, 0.135, 0.118]), PAL.vestDark);
  // Front NVG Shroud Mount & side ARC rails
  det.geo(new RoundedBoxGeometry(0.048, 0.052, 0.022, 1, 0.006), TRS([0, 0.205, -0.122], [-0.25, 0, 0]), PAL.metalDark);
  met.geo(new THREE.CylinderGeometry(0.01, 0.01, 0.018, 8), TRS([0, 0.206, -0.132], [Math.PI / 2 - 0.25, 0, 0]), [1, 1, 1]);
  for (const s of [-1, 1]) {
    helm.geo(new RoundedBoxGeometry(0.018, 0.032, 0.12, 1, 0.005), TRS([s * 0.112, 0.155, -0.005], [0, 0, 0]), PAL.vestDark);
    // Comms headset earcup
    rub.geo(new THREE.CylinderGeometry(0.036, 0.036, 0.028, 12), TRS([s * 0.098, 0.125, 0.005], [0, 0, Math.PI / 2]), PAL.metalDark);
  }
  if (hi) {
    // Boom mic from left headset
    rub.geo(new RoundedBoxGeometry(0.008, 0.008, 0.085, 1, 0.003), TRS([-0.088, 0.098, -0.048], [-0.15, -0.3, 0]), PAL.metalDark);
    // Chinstrap
    for (const s of [-1, 1]) rub.geo(new THREE.BoxGeometry(0.012, 0.09, 0.014), TRS([s * 0.072, 0.085, -0.025], [0.22, 0, -s * 0.2]), PAL.gaiter);
  }

  // Tactical ballistic goggles (wrap frame + dark polycarbonate visor)
  rub.geo(new RoundedBoxGeometry(0.158, 0.052, 0.048, hi ? 2 : 1, 0.014), TRS([0, 0.148, -0.088]), PAL.goggleFrame);
  det.geo(new RoundedBoxGeometry(0.142, 0.038, 0.032, hi ? 2 : 1, 0.01), TRS([0, 0.148, -0.098]), PAL.visor);
}

function buildTorso(out: Out, hi: boolean) {
  const shirt = slot(out, "chest", "fur", AO_CLOTH);
  const spineShirt = slot(out, "spine", "fur", AO_CLOTH);
  const vest = slot(out, "chest", "peel", AO_CLOTH);
  const pack = slot(out, "chest", "pack", AO_CLOTH);
  const det = slot(out, "chest", "detail");
  const met = slot(out, "chest", "gold");

  // Combat shirt torso (chest + spine)
  shirt.geo(new RoundedBoxGeometry(0.36, 0.25, 0.21, hi ? 3 : 1, 0.055), TRS([0, 0.09, 0]), PAL.olive);
  shirt.geo(new THREE.CylinderGeometry(0.074, 0.088, 0.07, hi ? 14 : 8), TRS([0, 0.22, 0]), PAL.oliveDark);
  spineShirt.geo(new RoundedBoxGeometry(0.30, 0.21, 0.185, hi ? 2 : 1, 0.045), TRS([0, 0.085, 0]), PAL.oliveDark);

  // Armored Plate Carrier (front + rear SAPI plates + cummerbund + shoulder straps)
  vest.geo(new RoundedBoxGeometry(0.28, 0.29, 0.238, hi ? 3 : 1, 0.03), TRS([0, 0.04, 0.005]), PAL.vest);
  vest.geo(new RoundedBoxGeometry(0.34, 0.12, 0.22, hi ? 2 : 1, 0.025), TRS([0, -0.035, 0.004]), PAL.vestDark);
  for (const s of [-1, 1]) {
    vest.geo(new RoundedBoxGeometry(0.068, 0.038, 0.21, 1, 0.012), TRS([s * 0.105, 0.19, 0.004]), PAL.vestDark);
  }

  // Front triple AR magazine pouch rig + admin pouch + radio
  for (const x of [-0.072, 0, 0.072]) {
    vest.geo(new RoundedBoxGeometry(0.06, 0.11, 0.044, 1, 0.01), TRS([x, -0.035, -0.128]), PAL.pouch);
  }
  vest.geo(new RoundedBoxGeometry(0.14, 0.065, 0.028, 1, 0.008), TRS([0, 0.075, -0.122]), PAL.vestDark);
  if (hi) {
    // Tactical flag patch on upper chest & radio w/ whip antenna on left shoulder
    det.geo(new THREE.BoxGeometry(0.065, 0.035, 0.008), TRS([0, 0.082, -0.136]), PAL.patch);
    det.geo(new RoundedBoxGeometry(0.048, 0.095, 0.032, 1, 0.008), TRS([-0.14, 0.055, -0.118]), PAL.metalDark);
    det.geo(new THREE.CylinderGeometry(0.0035, 0.0045, 0.17, 6), TRS([-0.15, 0.16, -0.12]), PAL.metalDark);
    met.geo(new RoundedBoxGeometry(0.022, 0.016, 0.016, 1, 0.004), TRS([0.09, 0.17, -0.115]), [1, 1, 1]);
  }

  // Tactical 24L Assault Backpack (rear)
  const PW = 0.26, PH = 0.32, PZ = 0.175;
  pack.geo(new RoundedBoxGeometry(PW, PH, 0.11, hi ? 2 : 1, 0.028), TRS([0, 0.03, PZ]), [1, 1, 1]);
  pack.geo(new RoundedBoxGeometry(PW - 0.04, 0.14, 0.055, 1, 0.018), TRS([0, -0.05, PZ + 0.065]), [0.9, 0.9, 0.88]);
  if (hi) {
    pack.geo(new RoundedBoxGeometry(0.04, 0.04, 0.08, 1, 0.015), TRS([0, 0.20, PZ]), [0.7, 0.7, 0.68]);
    // Rolled tactical tarp/pad strapped under pack
    det.geo(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 10), TRS([0, -0.15, PZ + 0.02], [0, 0, Math.PI / 2]), PAL.vestDark);
  }
}

function buildHips(out: Out, hi: boolean) {
  const pants = slot(out, "hips", "shorts", AO_CLOTH);
  const belt = slot(out, "hips", "rubber", AO_NEUTRAL);
  const met = slot(out, "hips", "gold");

  pants.geo(new RoundedBoxGeometry(0.30, 0.16, 0.20, hi ? 2 : 1, 0.045), TRS([0, -0.02, 0]), PAL.camoBase);
  belt.geo(new RoundedBoxGeometry(0.32, 0.05, 0.22, 1, 0.015), TRS([0, 0.04, 0]), PAL.vestDark);
  met.geo(new RoundedBoxGeometry(0.052, 0.042, 0.022, 1, 0.006), TRS([0, 0.04, -0.115]), [1, 1, 1]);
  // Rear dump pouch
  if (hi) belt.geo(new RoundedBoxGeometry(0.11, 0.12, 0.05, 1, 0.014), TRS([-0.08, -0.02, 0.12]), PAL.pouch);
}

function buildLegs(out: Out, hi: boolean) {
  const thighPants = slot(out, "hipR", "shorts", AO_CLOTH);
  const thighBelt = slot(out, "hipR", "rubber", AO_NEUTRAL);
  const knee = v3(BONES.kneeR.offset);

  // Thigh
  thighPants.geo(new THREE.CylinderGeometry(0.088, 0.072, 1, hi ? 14 : 8), limbM(new V3(0, 0.02, 0), knee, 1, 1, 1.06), PAL.camoBase);
  // Cargo pocket on outer thigh
  thighPants.geo(new RoundedBoxGeometry(0.032, 0.15, 0.11, 1, 0.01), TRS([0.078, -0.21, 0]), [0.92, 0.92, 0.9]);
  // Drop-leg tactical pistol holster on right outer thigh
  thighBelt.geo(new RoundedBoxGeometry(0.042, 0.13, 0.08, 1, 0.012), TRS([0.088, -0.15, -0.015]), PAL.metalDark);
  thighBelt.geo(new THREE.CylinderGeometry(0.082, 0.08, 0.024, 12), TRS([0, -0.14, 0]), PAL.gaiter);

  // Shin + Hard-shell tactical knee pad
  const calfPants = slot(out, "kneeR", "shorts", AO_CLOTH);
  const kneeDet = slot(out, "kneeR", "detail", AO_NEUTRAL);
  const kneeStraps = slot(out, "kneeR", "rubber", AO_NEUTRAL);
  const ankle = v3(BONES.ankleR.offset);

  calfPants.geo(new THREE.CylinderGeometry(0.07, 0.052, 1, hi ? 14 : 8), limbM(new V3(0, 0.02, 0), ankle, 1, 1, 1.05), PAL.camoBase);
  kneeDet.geo(new RoundedBoxGeometry(0.085, 0.105, 0.036, hi ? 2 : 1, 0.014), TRS([0, -0.01, -0.068]), PAL.metalDark);
  kneeStraps.geo(new THREE.CylinderGeometry(0.072, 0.072, 0.028, 10), TRS([0, -0.01, 0]), PAL.vestDark);

  // Laced Combat Boot (ankleR is at y=0.12 in rest pose; sole bottom sits at y=-0.12 so sole touches ground cleanly)
  const boot = slot(out, "ankleR", "sneaker", AO_NEUTRAL);
  const sole = slot(out, "ankleR", "rubber", AO_NEUTRAL);

  // Boot ankle collar + quarter + toe box
  boot.geo(new THREE.CylinderGeometry(0.056, 0.058, 0.13, hi ? 12 : 8), TRS([0, 0.015, 0.005]), PAL.boot);
  boot.geo(new RoundedBoxGeometry(0.102, 0.072, 0.245, hi ? 2 : 1, 0.024), TRS([0, -0.062, -0.058]), PAL.boot);
  boot.geo(new RoundedBoxGeometry(0.105, 0.048, 0.095, 1, 0.022), TRS([0, -0.074, -0.135]), PAL.bootDark);
  // Lugged Vibram sole down to y = -0.12
  sole.geo(new RoundedBoxGeometry(0.11, 0.032, 0.262, 1, 0.01), TRS([0, -0.104, -0.058]), PAL.sole);
  if (hi) {
    for (const z of [-0.055, -0.082, -0.108]) sole.geo(new THREE.BoxGeometry(0.055, 0.008, 0.01), TRS([0, -0.024, z]), PAL.sole);
  }
}

function buildArms(out: Out, hi: boolean) {
  const upperShirt = slot(out, "shoulderR", "fur", AO_CLOTH);
  const upperDet = slot(out, "shoulderR", "detail");
  const elbow = v3(BONES.elbowR.offset);

  upperShirt.geo(new THREE.CylinderGeometry(0.068, 0.056, 1, hi ? 12 : 8), limbM(new V3(0, 0.01, 0), elbow), PAL.olive);
  upperShirt.geo(new THREE.SphereGeometry(0.068, 10, 8), TRS([0, 0, 0]), PAL.oliveDark);
  // Shoulder sleeve pocket + tactical patch
  upperShirt.geo(new RoundedBoxGeometry(0.024, 0.095, 0.065, 1, 0.008), TRS([0.058, -0.10, 0]), PAL.oliveDark);
  if (hi) upperDet.geo(new THREE.BoxGeometry(0.008, 0.036, 0.048), TRS([0.071, -0.09, 0]), PAL.patch);

  // Forearm sleeve + elbow pad
  const foreShirt = slot(out, "elbowR", "fur", AO_CLOTH);
  const forePad = slot(out, "elbowR", "rubber", AO_NEUTRAL);
  const wrist = v3(BONES.wristR.offset);
  foreShirt.geo(new THREE.CylinderGeometry(0.054, 0.040, 1, hi ? 12 : 8), limbM(new V3(0, 0.01, 0), wrist), PAL.olive);
  forePad.geo(new RoundedBoxGeometry(0.064, 0.082, 0.032, 1, 0.012), TRS([0, -0.015, 0.044]), PAL.metalDark);
  forePad.geo(new THREE.CylinderGeometry(0.044, 0.043, 0.024, 10), TRS([wrist.x * 0.9, wrist.y * 0.9, wrist.z * 0.9]), PAL.vestDark);

  // Mechanix-style gloved tactical fist (centered neatly on FIST ≈ (0, -0.125, -0.02))
  const glove = slot(out, "wristR", "rubber", AO_NEUTRAL);
  const knuckle = slot(out, "wristR", "detail", AO_NEUTRAL);
  glove.geo(new RoundedBoxGeometry(0.056, 0.088, 0.072, hi ? 2 : 1, 0.016), TRS([0, -0.055, -0.008]), PAL.gaiter);
  knuckle.geo(new RoundedBoxGeometry(0.062, 0.028, 0.032, 1, 0.01), TRS([0.004, -0.088, -0.038]), PAL.metalDark);
  // Curled gloved fingers + thumb closing round the grip pocket (0, -0.125, -0.02)
  glove.geo(new RoundedBoxGeometry(0.05, 0.062, 0.05, 1, 0.018), TRS([0, -0.122, -0.036], [0.22, 0, 0]), PAL.vestDark);
  glove.geo(new RoundedBoxGeometry(0.028, 0.048, 0.028, 1, 0.01), TRS([-0.028, -0.095, -0.042], [0.4, 0, 0.35]), PAL.gaiter);
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
  M("head", new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), TRS([0, 0.15, 0.005], [0, 0, 0], [1, 0.96, 1.1]), PAL.helmet);
  M("head", new THREE.BoxGeometry(0.14, 0.04, 0.04), TRS([0, 0.145, -0.092]), PAL.visor);

  M("chest", new THREE.BoxGeometry(0.35, 0.25, 0.21), TRS([0, 0.09, 0]), PAL.olive);
  M("chest", new THREE.BoxGeometry(0.28, 0.28, 0.24), TRS([0, 0.04, 0]), PAL.vest);
  M("chest", new THREE.BoxGeometry(0.26, 0.30, 0.12), TRS([0, 0.03, 0.175]), PAL.vestDark);
  M("spine", new THREE.BoxGeometry(0.29, 0.21, 0.18), TRS([0, 0.085, 0]), PAL.oliveDark);
  M("hips", new THREE.BoxGeometry(0.30, 0.16, 0.20), TRS([0, -0.02, 0]), PAL.camoBase);

  M("hipR", new THREE.CylinderGeometry(0.085, 0.07, 1, 7), limbM(new V3(0, 0.02, 0), v3(BONES.kneeR.offset)), PAL.camoBase);
  M("kneeR", new THREE.CylinderGeometry(0.068, 0.05, 1, 7), limbM(new V3(0, 0.02, 0), v3(BONES.ankleR.offset)), PAL.camoBase);
  M("ankleR", new THREE.BoxGeometry(0.105, 0.12, 0.24), TRS([0, -0.06, -0.058]), PAL.boot);

  M("shoulderR", new THREE.CylinderGeometry(0.066, 0.054, 1, 6), limbM(new V3(0, 0.01, 0), v3(BONES.elbowR.offset)), PAL.olive);
  M("elbowR", new THREE.CylinderGeometry(0.052, 0.04, 1, 6), limbM(new V3(0, 0.01, 0), v3(BONES.wristR.offset)), PAL.olive);
  M("wristR", new THREE.BoxGeometry(0.06, 0.11, 0.075), TRS([0, -0.08, -0.02]), PAL.gaiter);

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
