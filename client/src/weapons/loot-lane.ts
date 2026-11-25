// Tactical throwable & deployable loot models (origin = bottom centre, +Z front):
//   bananaBomb -> M67 Frag Grenade (olive drab steel sphere, safety spoon lever, pull-ring pin, glowing fuze "ember" pivot)
//   crateWallPack / crateWall -> Deployable Ballistic Cover (reinforced OD green & gunmetal composite armor barrier)
//   cashStack -> Tactical Requisition Credits & brass dog-tag
import * as THREE from "three";
import { PartBuilder, type Built } from "./lib/builder";
import { filletCyl, rbox, ringGeo, tf } from "./lib/geo";

export function bananaBomb(): Built {
  const b = new PartBuilder();
  // olive-drab M67 frag grenade body
  b.add(new THREE.SphereGeometry(0.068, 20, 16), "#465134", "matte", tf([0, 0.072, 0]));
  // segmented waist seam + steel fuze collar
  b.add(ringGeo(0.07, 0.064, 0.012, 0.002, 24), "#2b3036", "metal", tf([0, 0.072, 0], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(0.024, 0.032, 0.004, 16), "#434952", "metal", tf([0, 0.146, 0]));
  b.add(filletCyl(0.016, 0.018, 0.003, 14), "#c8a248", "metal", tf([0, 0.168, 0]));
  // safety spoon lever curving down side
  b.add(rbox(0.02, 0.088, 0.012, 0.003, 2), "#383e46", "metal", tf([0.058, 0.118, 0], [0, 0, -0.32]));
  // silver pull-ring pin
  b.add(new THREE.TorusGeometry(0.018, 0.0035, 6, 18), "#d9dde2", "chrome", tf([-0.032, 0.158, 0.01], [0.2, 0.4, 0]));
  // fuse ember pivot (kept for live fuse sparks when cooking/thrown)
  const em = b.sub("ember", [0, 0.18, 0]);
  em.add(new THREE.SphereGeometry(0.011, 10, 8), "#ff7a1a", "emissive", tf([0, 0.18, 0]));
  const built = b.build({ name: "banana-bomb" });
  const g = new THREE.Group(); g.name = "banana-bomb"; g.add(built.root);
  return { root: g, meshes: built.meshes, tris: built.tris, pivots: built.pivots };
}

export function crateWallPack(): Built {
  const b = new PartBuilder();
  // folded composite ballistic armor plates strapped in a compact carry pack
  const tones = ["#3a4230", "#2f353b", "#454e38"];
  for (let i = 0; i < 3; i++) b.add(rbox(0.56, 0.044, 0.22, 0.008), tones[i], "matte", tf([0, 0.024 + i * 0.048, 0]));
  for (const x of [-0.2, 0.2]) {
    b.add(rbox(0.045, 0.16, 0.23, 0.006), "#1e2227", "metal", tf([x, 0.085, 0]));
  }
  // top carry handle + amber tactical stripe
  b.add(rbox(0.22, 0.018, 0.04, 0.005), "#22252a", "matte", tf([0, 0.162, 0]));
  b.add(rbox(0.18, 0.006, 0.06, 0.002), "#c8a248", "matte", tf([0, 0.146, 0.04]));
  const built = b.build({ name: "crate-wall-pack" });
  const g = new THREE.Group(); g.name = "crate-wall-pack"; built.root.scale.setScalar(0.72); g.add(built.root);
  return { root: g, meshes: built.meshes, tris: built.tris, pivots: built.pivots };
}

/** Deployed tactical ballistic barrier (shared/sim/cover.ts COVER: 2.4 × 1.3 × 0.4 m) */
export function crateWall(w = 2.4, h = 1.3, t = 0.4): Built {
  const b = new PartBuilder();
  const cw = w / 3;
  // three armored ballistic shield panels side-by-side with steel H-frames
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + cw * (i + 0.5);
    // lower heavy steel base + upper sloped OD composite armor plate
    b.add(rbox(cw - 0.03, h * 0.56, t * 0.72, 0.012), "#2c3138", "metal", tf([x, h * 0.28, 0]));
    b.add(rbox(cw - 0.04, h * 0.44, t * 0.56, 0.012), "#424c35", "matte", tf([x, h * 0.76, -t * 0.06], [-0.14, 0, 0]));
    // vertical steel reinforcement ribs
    for (const sx of [-1, 1]) {
      b.add(rbox(0.055, h * 0.96, t * 0.82, 0.008), "#1c2026", "metal", tf([x + sx * (cw * 0.45), h * 0.48, 0]));
    }
    // viewing slit / amber stencil stripe on upper panel
    b.add(rbox(cw * 0.5, 0.05, t * 0.62, 0.004), "#15181c", "matte", tf([x, h * 0.84, -t * 0.08], [-0.14, 0, 0]));
    b.add(rbox(cw * 0.42, 0.035, t * 0.78, 0.003), "#c8a248", "matte", tf([x, h * 0.46, 0]));
  }
  // rear A-frame steel stabilizer struts (+Z faces the deployer)
  for (const x of [-w / 3, w / 3]) {
    b.add(rbox(0.08, 0.06, t * 1.4, 0.008), "#1d2126", "metal", tf([x, 0.03, t * 0.22]));
    b.add(rbox(0.07, h * 0.75, 0.06, 0.008), "#252930", "metal", tf([x, h * 0.34, t * 0.26], [0.46, 0, 0]));
  }
  return b.build({ name: "crate-wall" });
}

/** Military requisition credits stack + brass dog-tag */
export function cashStack(): Built {
  const b = new PartBuilder();
  for (let k = 0; k < 7; k++) b.add(rbox(0.2, 0.012, 0.1, 0.004), k % 2 ? "#4a6b48" : "#3e5c3d", "matte", tf([0, 0.006 + k * 0.013, 0], [0, (k % 3 - 1) * 0.04, 0]));
  b.add(rbox(0.04, 0.1, 0.106, 0.005), "#c8a248", "matte", tf([0, 0.048, 0]));
  for (const [x, z, r] of [[0.13, 0.06, 0.6], [-0.12, -0.05, -0.5]] as Array<[number, number, number]>) b.add(rbox(0.2, 0.006, 0.1, 0.003), "#466644", "matte", tf([x, 0.004, z], [0, r, 0]));
  b.add(rbox(0.055, 0.008, 0.034, 0.003), "#c8a248", "metal", tf([0.02, 0.1, 0.01], [0, 0.3, 0]));
  return b.build({ name: "cash-stack" });
}
