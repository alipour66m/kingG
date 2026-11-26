// Tactical SMG (UMP45 .45 ACP / Vector 9mm): compact gunmetal upper receiver, polymer lower, picatinny rails,
// vertical foregrip, angled detachable stick magazine ("mag" pivot), folding skeleton stock, and tactical ghost-ring/reflex sights.
import * as THREE from "three";
import { filletCyl, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, frontHood, rearPeep, sightDot, triggerGuard, tube, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildSmg(): GunSpec {
  const b = new PartBuilder();

  // ---- upper receiver + monolithic top picatinny rail
  block(b, [0, 0.045, -0.135], [0.048, 0.058, 0.44], C.gunmetal, "metal", [0, 0, 0], 0.006);
  // top rail + slots
  block(b, [0, 0.078, -0.135], [0.024, 0.01, 0.42], C.gunmetalDark, "matte", [0, 0, 0], 0.002);
  for (let z = -0.32; z <= 0.05; z += 0.018) block(b, [0, 0.084, z], [0.025, 0.004, 0.008], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  // ejection port + charging handle
  block(b, [0.023, 0.054, -0.08], [0.005, 0.02, 0.068], C.gunmetalDark, "matte", [0, 0, 0], 0.001);
  block(b, [-0.026, 0.058, -0.22], [0.018, 0.009, 0.022], C.steelDark, "metal", [0, 0, 0], 0.002);

  // ---- lower receiver + handguard shroud + side rails
  block(b, [0, 0.002, -0.13], [0.044, 0.038, 0.41], C.polymer, "matte", [0, 0, 0], 0.005);
  for (const sx of [1, -1]) {
    block(b, [sx * 0.026, 0.024, -0.27], [0.006, 0.014, 0.14], C.gunmetalDark, "matte", [0, 0, 0], 0.002);
    // cooling slots on handguard
    for (let i = 0; i < 4; i++) block(b, [sx * 0.024, 0.046, -0.24 - i * 0.028], [0.004, 0.012, 0.016], C.gunmetalDark, "matte", [0, 0, 0], 0.001);
  }
  // bottom rail
  block(b, [0, -0.019, -0.28], [0.024, 0.008, 0.15], C.gunmetalDark, "matte", [0, 0, 0], 0.002);

  // ---- barrel + tactical suppressor/compensator shroud
  const mzZ = -0.50;
  b.add(filletCyl(0.013, 0.12, 0.002, 20), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, 0.036, -0.40), FWD));
  b.add(filletCyl(0.02, 0.11, 0.003, 24), C.gunmetal, "metal", alignY(new THREE.Vector3(0, 0.036, -0.45), FWD));
  b.add(ringGeo(0.0205, 0.012, 0.016, 0.002, 24), C.gunmetalDark, "matte", alignY(new THREE.Vector3(0, 0.036, mzZ + 0.006), FWD));
  b.add(filletCyl(0.007, 0.008, 0.001, 14), "#0b0d10", "matte", alignY(new THREE.Vector3(0, 0.036, mzZ - 0.001), FWD));

  // ---- vertical tactical foregrip (aligned with VM_HOLD.smg.l.at = [0, -0.06, -0.362])
  block(b, [0, -0.028, -0.36], [0.032, 0.018, 0.038], C.gunmetalDark, "matte", [0, 0, 0], 0.003);
  b.add(filletCyl(0.017, 0.105, 0.004, 18), C.polymer, "matte", tf([0, -0.082, -0.36], [0.06, 0, 0]));
  for (let i = 0; i < 4; i++) b.add(ringGeo(0.018, 0.016, 0.006, 0.001, 18), C.gunmetalDark, "matte", tf([0, -0.055 - i * 0.018, -0.36], [0.06, 0, 0]));

  // ---- pistol grip + trigger guard
  triggerGuard(b, [0, -0.012, -0.028], 0.064, 0.04, 0.006, 0.016);
  b.add(rbox(0.034, 0.125, 0.048, 0.008, 3), C.polymer, "matte", tf([0, -0.065, 0.042], [-0.28, 0, 0]));
  b.add(rbox(0.036, 0.016, 0.052, 0.004, 2), C.gunmetalDark, "matte", tf([0, -0.128, 0.06], [-0.28, 0, 0]));

  // ---- magazine well + angled stick magazine ("mag" pivot)
  block(b, [0, -0.028, -0.165], [0.042, 0.042, 0.066], C.gunmetalDark, "matte", [0, 0, 0], 0.004);
  const mag = b.sub("mag", [0, -0.035, -0.165]);
  mag.add(rbox(0.028, 0.21, 0.044, 0.004, 2), C.polymer, "matte", tf([0, -0.125, -0.195], [-0.28, 0, 0]));
  // witness window + brass rounds hint + mag floorplate
  mag.add(rbox(0.029, 0.08, 0.014, 0.001, 1), C.brass, "metal", tf([0, -0.115, -0.192], [-0.28, 0, 0]));
  mag.add(rbox(0.034, 0.016, 0.05, 0.003, 2), C.gunmetalDark, "matte", tf([0, -0.228, -0.165], [-0.28, 0, 0]));

  // ---- folding skeletal stock
  block(b, [0, 0.042, 0.095], [0.042, 0.052, 0.036], C.gunmetalDark, "metal", [0, 0, 0], 0.004);
  block(b, [0, 0.052, 0.215], [0.024, 0.022, 0.22], C.polymer, "matte", [0.04, 0, 0], 0.004);
  block(b, [0, 0.006, 0.215], [0.02, 0.016, 0.22], C.polymer, "matte", [-0.18, 0, 0], 0.004);
  block(b, [0, 0.02, 0.325], [0.032, 0.11, 0.024], C.gunmetalDark, "matte", [0, 0, 0], 0.005);

  // ---- tactical reflex / hooded iron sights (aligned with VM_HOLD.smg.ads.sight = [0, 0.1, 0.02])
  const F = new THREE.Vector3(0, 0.105, -0.32);
  frontHood(b, F, 0.013, 0.0032, 0.082, C.gunmetalDark);
  const R = new THREE.Vector3(0, 0.102, 0.02);
  rearPeep(b, R, 0.015, 0.0032, 0.082, C.gunmetalDark);
  sightDot(b, new THREE.Vector3(0, 0.105, -0.14), 0.0022, "#ff3a3a");

  // ---- offset micro red-dot on a side mount (stays clear of the iron sight line)
  block(b, [-0.027, 0.079, -0.105], [0.016, 0.008, 0.036], C.gunmetalDark, "metal", [0, 0, 0], 0.002);
  block(b, [-0.033, 0.094, -0.105], [0.022, 0.022, 0.034], C.gunmetal, "metal", [0, 0, 0.5], 0.004);
  b.add(filletCyl(0.0085, 0.003, 0.0006, 16), "#2a1216", "gloss", tf([-0.0335, 0.0945, -0.0875], [Math.PI / 2, 0, 0.5]));
  sightDot(b, new THREE.Vector3(-0.0335, 0.0945, -0.0862), 0.0016, "#ff3030");

  // ---- barrel shroud cooling rings
  for (let i = 0; i < 4; i++) b.add(ringGeo(0.0213, 0.019, 0.006, 0.0006, 24), C.gunmetalDark, "matte", alignY(new THREE.Vector3(0, 0.036, -0.41 - i * 0.028), FWD));

  // ---- controls: selector, magazine release, bolt-hold, sling QD
  block(b, [-0.0235, 0.014, 0.006], [0.004, 0.010, 0.022], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  block(b, [0.0215, -0.004, -0.14], [0.005, 0.012, 0.012], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  block(b, [0.0245, 0.026, -0.02], [0.004, 0.008, 0.02], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  b.add(new THREE.TorusGeometry(0.007, 0.0017, 8, 18), C.steelDark, "metal", tf([-0.026, 0.02, 0.1], [0, Math.PI / 2, 0]));

  // ---- folding stock hinge + latch + cheek pad
  tube(b, [0, 0.042, 0.1135], [1, 0, 0], 0.011, 0.056, C.steelDark, "metal", 0.002, 14);
  block(b, [0, 0.07, 0.215], [0.026, 0.01, 0.12], C.polymer, "matte", [0, 0, 0], 0.003);
  for (let i = 0; i < 4; i++) block(b, [0, 0.02 + i * 0.022 - 0.03, 0.3385], [0.026, 0.004, 0.004], C.gunmetal, "matte", [0, 0, 0], 0.0008);

  // ---- magazine: side ribs following the raked stick
  for (let i = 0; i < 8; i++) {
    const dy = -0.08 + i * 0.0229;
    for (const sx of [1, -1]) mag.add(rbox(0.0016, 0.004, 0.03, 0.0006, 1), C.gunmetalDark, "matte", tf([sx * 0.0145, -0.125 + dy * Math.cos(0.28), -0.195 - dy * Math.sin(0.28)], [-0.28, 0, 0]));
  }

  // rarity accent
  const acc = b.sub("accent");
  for (const sx of [1, -1]) block(acc, [sx * 0.025, 0.044, -0.02], [0.003, 0.008, 0.03], C.white, "emissive", [0, 0, 0], 0.001);

  const built = b.build({ name: "smg" });
  return {
    ...built,
    id: "smg",
    muzzle: new THREE.Vector3(0, 0.036, mzZ - 0.01),
    length: 0.84,
    gripAnchor: new THREE.Vector3(0, -0.06, 0.042),
    foreAnchor: new THREE.Vector3(0, -0.06, -0.36),
    sightY: F.y,
    fwd: FWD,
    sightLine: { front: F, rear: R },
  };
}
