// Tactical Assault Rifle (M416 5.56mm / AKM 7.62mm): anodized gunmetal upper/lower receivers, M-LOK/quad-rail
// handguard, fluted free-float barrel with birdcage flash hider, curved 30-round STANAG "mag" pivot, adjustable crane
// stock, holographic/red-dot optic + backup iron sights.
import * as THREE from "three";
import { filletCyl, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, frontHood, sightDot, triggerGuard, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildAr(): GunSpec {
  const b = new PartBuilder();

  // ---- upper & lower receiver
  block(b, [0, 0.048, -0.04], [0.046, 0.052, 0.27], C.gunmetal, "metal", [0, 0, 0], 0.006);
  block(b, [0, 0.008, -0.04], [0.044, 0.038, 0.25], C.gunmetalDark, "metal", [0, 0, 0], 0.005);
  // top picatinny rail across receiver + handguard
  block(b, [0, 0.078, -0.18], [0.024, 0.01, 0.56], C.gunmetalDark, "matte", [0, 0, 0], 0.002);
  for (let z = -0.44; z <= 0.08; z += 0.02) block(b, [0, 0.084, z], [0.025, 0.0035, 0.009], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  // ejection port + forward assist + charging handle
  block(b, [0.023, 0.052, -0.05], [0.005, 0.018, 0.068], C.steelDark, "metal", [0, 0, 0], 0.001);
  block(b, [0.025, 0.046, 0.035], [0.012, 0.012, 0.028], C.gunmetalLight, "metal", [0, 0.2, 0], 0.003);
  block(b, [0, 0.068, 0.098], [0.036, 0.012, 0.024], C.gunmetalDark, "metal", [0, 0, 0], 0.002);

  // ---- M-LOK / quad-rail tactical handguard (z = -0.175..-0.475)
  block(b, [0, 0.044, -0.325], [0.048, 0.056, 0.30], C.odGreen, "matte", [0, 0, 0], 0.007);
  for (const sx of [1, -1]) {
    for (let i = 0; i < 6; i++) block(b, [sx * 0.0245, 0.044, -0.205 - i * 0.042], [0.003, 0.014, 0.024], C.gunmetalDark, "matte", [0, 0, 0], 0.001);
  }
  // angled tactical hand-stop under handguard (aligned with foreAnchor around z = -0.43)
  block(b, [0, 0.008, -0.43], [0.028, 0.022, 0.052], C.polymer, "matte", [0.25, 0, 0], 0.004);

  // ---- gas block + free-float barrel + birdcage flash hider
  const BY = 0.048, mzZ = -0.68;
  b.add(filletCyl(0.012, 0.24, 0.002, 20), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, BY, -0.56), FWD));
  // flash hider
  b.add(filletCyl(0.016, 0.056, 0.002, 20), C.gunmetal, "metal", alignY(new THREE.Vector3(0, BY, mzZ + 0.024), FWD));
  b.add(ringGeo(0.0165, 0.01, 0.012, 0.002, 20), C.gunmetalDark, "matte", alignY(new THREE.Vector3(0, BY, mzZ + 0.004), FWD));
  b.add(filletCyl(0.006, 0.008, 0.001, 12), "#0b0d10", "matte", alignY(new THREE.Vector3(0, BY, mzZ - 0.002), FWD));

  // ---- pistol grip + trigger guard
  triggerGuard(b, [0, -0.008, -0.025], 0.065, 0.042, 0.006, 0.016);
  b.add(rbox(0.033, 0.125, 0.046, 0.007, 3), C.polymer, "matte", tf([0, -0.06, 0.032], [-0.36, 0, 0]));
  b.add(rbox(0.035, 0.014, 0.05, 0.003, 2), C.tan, "matte", tf([0, -0.12, 0.054], [-0.36, 0, 0]));

  // ---- magazine well + curved 30-rd STANAG magazine ("mag" pivot)
  block(b, [0, -0.022, -0.14], [0.044, 0.046, 0.078], C.gunmetalDark, "metal", [0, 0, 0], 0.004);
  const mag = b.sub("mag", [0, -0.032, -0.14]);
  mag.add(rbox(0.028, 0.11, 0.066, 0.004, 2), C.tan, "matte", tf([0, -0.08, -0.145], [-0.1, 0, 0]));
  mag.add(rbox(0.028, 0.10, 0.066, 0.004, 2), C.tan, "matte", tf([0, -0.17, -0.162], [-0.28, 0, 0]));
  mag.add(rbox(0.032, 0.016, 0.072, 0.003, 2), C.polymer, "matte", tf([0, -0.218, -0.175], [-0.28, 0, 0]));

  // ---- buffer tube + tactical crane stock
  b.add(filletCyl(0.02, 0.24, 0.003, 20), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, 0.048, 0.21), FWD));
  block(b, [0, 0.038, 0.27], [0.048, 0.068, 0.18], C.tan, "matte", [0, 0, 0], 0.008);
  block(b, [0, 0.01, 0.31], [0.034, 0.12, 0.11], C.polymer, "matte", [0.12, 0, 0], 0.006);
  block(b, [0, 0.014, 0.368], [0.042, 0.138, 0.022], C.gunmetalDark, "matte", [0, 0, 0], 0.005);

  // ---- holographic / red-dot optic + front backup sight (aligned with VM_HOLD.ar.ads.sight = [0, 0.13, 0.0])
  const opticZ = -0.04;
  block(b, [0, 0.095, opticZ], [0.036, 0.018, 0.078], C.gunmetalDark, "metal", [0, 0, 0], 0.003);
  // open optic hood frame (top + 2 side posts so you see cleanly through the lens to the reticle dot)
  block(b, [0, 0.156, opticZ], [0.038, 0.007, 0.056], C.gunmetal, "metal", [0, 0, 0], 0.002);
  for (const sx of [1, -1]) block(b, [sx * 0.017, 0.128, opticZ], [0.005, 0.052, 0.056], C.gunmetal, "metal", [0, 0, 0], 0.001);
  // glowing holographic red-dot center reticle
  sightDot(b, new THREE.Vector3(0, 0.13, opticZ), 0.0022, "#ff3b30");

  const F = new THREE.Vector3(0, 0.13, -0.44);
  frontHood(b, F, 0.012, 0.003, 0.082, C.gunmetalDark);
  const R = new THREE.Vector3(0, 0.13, 0.0);

  // rarity accent
  const acc = b.sub("accent");
  for (const sx of [1, -1]) block(acc, [sx * 0.024, 0.046, -0.08], [0.003, 0.007, 0.032], C.white, "emissive", [0, 0, 0], 0.001);

  const built = b.build({ name: "ar" });
  return {
    ...built,
    id: "ar",
    muzzle: new THREE.Vector3(0, BY, mzZ - 0.01),
    length: 1.05,
    gripAnchor: new THREE.Vector3(0, -0.06, 0.032),
    foreAnchor: new THREE.Vector3(0, 0.02, -0.43),
    sightY: 0.13,
    fwd: FWD,
    sightLine: { front: F, rear: R },
  };
}
