// Precision Bolt-Action Sniper Rifle (Kar98k 7.62mm / AWM .300 Magnum): OD green / gunmetal chassis,
// free-floated fluted barrel with slotted muzzle brake, "bolt" pivot, 6x tactical scope with turrets & rings,
// detachable box magazine, folding bipod, and adjustable cheek-rest stock.
import * as THREE from "three";
import { filletCyl, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, screw, triggerGuard, tube, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildSniper(): GunSpec {
  const b = new PartBuilder();
  const Y = 0.05;

  // ---- tactical OD green precision chassis & forend
  block(b, [0, Y, -0.10], [0.056, 0.068, 0.54], C.odGreen, "matte", [0, 0, 0], 0.008);
  // sloped forend nose + picatinny bipod mount
  block(b, [0, Y - 0.018, -0.34], [0.046, 0.028, 0.14], C.gunmetalDark, "matte", [0, 0, 0], 0.004);
  // folded bipod legs under forend
  for (const sx of [1, -1]) {
    tube(b, [sx * 0.032, Y - 0.036, -0.27], [0, 0, 1], 0.009, 0.18, C.gunmetal, "metal", 0.002, 12);
    tube(b, [sx * 0.032, Y - 0.036, -0.175], [0, 0, 1], 0.012, 0.024, C.gunmetalDark, "matte", 0.002, 12);
  }

  // ---- detachable box magazine
  block(b, [0, Y - 0.052, -0.05], [0.036, 0.058, 0.11], C.gunmetalDark, "metal", [0, 0, 0], 0.004);
  block(b, [0, Y - 0.082, -0.05], [0.04, 0.012, 0.116], C.gunmetal, "metal", [0, 0, 0], 0.002);

  // ---- precision pistol grip + trigger guard (aligned with VM_HOLD.sniper.r.at = [0, -0.03, 0.118])
  triggerGuard(b, [0, Y - 0.038, 0.028], 0.074, 0.042, 0.006, 0.016);
  b.add(rbox(0.038, 0.13, 0.052, 0.008, 3), C.polymer, "matte", tf([0, Y - 0.085, 0.122], [-0.42, 0, 0]));

  // ---- precision stock + adjustable cheek riser + rubber buttpad
  block(b, [0, Y + 0.004, 0.30], [0.048, 0.068, 0.28], C.odGreen, "matte", [0, 0, 0], 0.008);
  block(b, [0, Y - 0.048, 0.33], [0.036, 0.04, 0.22], C.odDark, "matte", [0.16, 0, 0], 0.005);
  // cheek riser
  block(b, [0, Y + 0.056, 0.31], [0.044, 0.036, 0.15], C.polymer, "matte", [0, 0, 0], 0.006);
  // buttpad
  block(b, [0, Y - 0.015, 0.445], [0.046, 0.145, 0.026], C.gunmetalDark, "matte", [0, 0, 0], 0.005);

  // ---- heavy free-float barrel + slotted tactical muzzle brake
  const BY = Y + 0.044, BZ0 = -0.72, BZ1 = 0.02;
  tube(b, [0, BY, (BZ0 + BZ1) / 2], [0, 0, 1], 0.016, BZ1 - BZ0, C.gunmetal, "metal", 0.003, 24);
  // muzzle brake
  block(b, [0, BY, BZ0 + 0.03], [0.042, 0.032, 0.072], C.gunmetalDark, "metal", [0, 0, 0], 0.004);
  for (const z of [BZ0 + 0.015, BZ0 + 0.035, BZ0 + 0.05]) {
    block(b, [0, BY, z], [0.044, 0.014, 0.009], "#0c0e11", "matte", [0, 0, 0], 0.001);
  }
  b.add(filletCyl(0.008, 0.01, 0.001, 14), "#0b0d10", "matte", alignY(new THREE.Vector3(0, BY, BZ0 - 0.005), FWD));

  // ---- steel action receiver + ejection port + picatinny rail
  const RT = Y + 0.072;
  block(b, [0, RT - 0.004, 0.01], [0.05, 0.048, 0.24], C.gunmetalDark, "metal", [0, 0, 0], 0.006);
  block(b, [0.024, RT + 0.002, -0.01], [0.005, 0.018, 0.078], C.steel, "chrome", [0, 0, 0], 0.001);
  block(b, [0, RT + 0.025, -0.02], [0.024, 0.01, 0.24], C.gunmetalDark, "matte", [0, 0, 0], 0.002);

  // ---- bolt pivot (lifted + pulled back in 1P reload)
  const bolt = b.sub("bolt", [0.02, RT, 0.1]);
  tube(bolt, [0, RT + 0.004, 0.08], [0, 0, 1], 0.012, 0.08, C.steelDark, "metal", 0.002, 14);
  tube(bolt, [0.035, RT - 0.002, 0.105], [1, -0.25, 0.2], 0.006, 0.06, C.steel, "metal", 0.002, 12);
  bolt.add(new THREE.SphereGeometry(0.015, 16, 12), C.gunmetalDark, "metal", tf([0.068, RT - 0.012, 0.114]));

  // ---- 6x precision sniper optic (aligned with VM_HOLD.sniper.ads.sight = [0, 0.25, 0.07])
  const SY = 0.25, S0 = -0.34, S1 = 0.08;
  // scope rings + mounts
  for (const z of [-0.18, 0.0]) {
    block(b, [0, (RT + 0.03 + SY - 0.024) / 2, z], [0.026, SY - 0.024 - RT - 0.015, 0.028], C.gunmetalDark, "metal", [0, 0, 0], 0.003);
    b.add(ringGeo(0.031, 0.022, 0.026, 0.003, 28), C.gunmetalDark, "metal", tf([0, SY, z], [Math.PI / 2, 0, 0]));
    screw(b, [0.015, RT + 0.038, z], [1, 0, 0], 0.004);
  }
  // scope main tube
  tube(b, [0, SY, (S0 + S1) / 2], [0, 0, 1], 0.022, S1 - S0, C.gunmetal, "metal", 0.002, 24);
  // objective bell (front) + eyepiece bell (rear)
  b.add(filletCyl(0.034, 0.11, 0.003, 28, 0.023, 0.034), C.gunmetal, "metal", tf([0, SY, S0 + 0.045], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(0.029, 0.08, 0.003, 28, 0.029, 0.022), C.gunmetalDark, "matte", tf([0, SY, S1 - 0.03], [Math.PI / 2, 0, 0]));
  // dark recessed optics lenses
  b.add(filletCyl(0.029, 0.006, 0.001, 24), "#0d1a26", "gloss", tf([0, SY, S0 - 0.008], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(0.024, 0.006, 0.001, 24), "#0d1a26", "gloss", tf([0, SY, S1 + 0.008], [Math.PI / 2, 0, 0]));
  // elevation + windage turrets
  tube(b, [0, SY + 0.028, -0.09], [0, 1, 0], 0.014, 0.024, C.gunmetalDark, "metal", 0.002, 16);
  tube(b, [0.028, SY, -0.09], [1, 0, 0], 0.014, 0.024, C.gunmetalDark, "metal", 0.002, 16);

  // rarity accent
  const acc = b.sub("accent");
  for (const sx of [1, -1]) block(acc, [sx * 0.029, Y + 0.01, -0.14], [0.003, 0.007, 0.034], C.white, "emissive", [0, 0, 0], 0.001);

  const built = b.build({ name: "sniper" });
  return {
    ...built,
    id: "sniper",
    muzzle: new THREE.Vector3(0, BY, BZ0 - 0.02),
    length: 1.18,
    gripAnchor: new THREE.Vector3(0, Y - 0.08, 0.12),
    foreAnchor: new THREE.Vector3(0, Y - 0.02, -0.22),
    sightY: SY,
    fwd: FWD,
  };
}
