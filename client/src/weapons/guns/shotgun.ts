// Tactical Combat Shotgun (S12K 12 Gauge): heavy matte steel receiver, vented rib barrel + underbarrel tubular
// magazine, ribbed tactical polymer forend, fixed tactical stock, ghost-ring/fiber-bead sights.
import * as THREE from "three";
import { filletCyl, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { accentGem, block, sightDot, triggerGuard, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildShotgun(): GunSpec {
  const b = new PartBuilder();

  // ---- steel receiver
  block(b, [0, 0.024, -0.03], [0.048, 0.068, 0.24], C.gunmetal, "metal", [0, 0, 0], 0.007);
  // ejection port + bolt carrier (silver steel accent)
  block(b, [0.024, 0.036, -0.045], [0.005, 0.022, 0.072], C.steel, "chrome", [0, 0, 0], 0.001);
  block(b, [0.032, 0.032, -0.02], [0.014, 0.01, 0.014], C.gunmetalDark, "metal", [0, 0, 0], 0.002);
  // top picatinny rail strip
  block(b, [0, 0.062, -0.03], [0.024, 0.009, 0.21], C.gunmetalDark, "matte", [0, 0, 0], 0.002);

  // ---- long 12-gauge barrel + underbarrel magazine tube + barrel clamp
  const BY = 0.04, TY = 0.008, mzZ = -0.58;
  b.add(filletCyl(0.016, 0.46, 0.002, 24), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, BY, -0.35), FWD));
  b.add(ringGeo(0.017, 0.011, 0.02, 0.002, 24), C.gunmetal, "metal", alignY(new THREE.Vector3(0, BY, mzZ + 0.01), FWD));
  b.add(filletCyl(0.0095, 0.01, 0.001, 16), "#0b0d10", "matte", alignY(new THREE.Vector3(0, BY, mzZ - 0.002), FWD));
  // underbarrel tube
  b.add(filletCyl(0.0135, 0.40, 0.002, 20), C.gunmetal, "metal", alignY(new THREE.Vector3(0, TY, -0.32), FWD));
  b.add(filletCyl(0.015, 0.022, 0.003, 20), C.gunmetalDark, "matte", alignY(new THREE.Vector3(0, TY, -0.52), FWD));
  // barrel-to-tube clamp
  block(b, [0, (BY + TY) / 2, -0.49], [0.036, 0.056, 0.024], C.gunmetalDark, "metal", [0, 0, 0], 0.004);

  // ---- ribbed tactical forend (aligned with VM_HOLD.shotgun.l.at = [0, -0.085, -0.265])
  b.add(filletCyl(0.027, 0.21, 0.006, 20), C.polymer, "matte", alignY(new THREE.Vector3(0, TY - 0.004, -0.265), FWD));
  for (let i = 0; i < 7; i++) {
    b.add(ringGeo(0.0285, 0.025, 0.008, 0.002, 20), C.gunmetalDark, "matte", alignY(new THREE.Vector3(0, TY - 0.004, -0.19 - i * 0.024), FWD));
  }

  // ---- pistol grip + trigger guard
  triggerGuard(b, [0, -0.016, -0.015], 0.068, 0.044, 0.006, 0.016);
  b.add(rbox(0.036, 0.128, 0.052, 0.008, 3), C.polymer, "matte", tf([0, -0.062, 0.048], [-0.45, 0, 0]));
  b.add(rbox(0.038, 0.016, 0.056, 0.003, 2), C.gunmetalDark, "matte", tf([0, -0.118, 0.088], [-0.45, 0, 0]));

  // ---- tactical fixed stock + rubber buttpad
  block(b, [0, 0.012, 0.22], [0.042, 0.072, 0.26], C.polymer, "matte", [0.08, 0, 0], 0.008);
  block(b, [0, -0.002, 0.35], [0.044, 0.125, 0.026], C.gunmetalDark, "matte", [0, 0, 0], 0.005);

  // ---- rarity accent
  const acc = b.sub("accent");
  for (const sx of [1, -1]) accentGem(b, acc, [sx * 0.025, 0.024, -0.09], [sx, 0, 0], 0.008);

  // ---- tactical ghost-ring + fiber-bead sight (aligned with VM_HOLD.shotgun.ads.sight = [0, 0.07, 0.02])
  const F = new THREE.Vector3(0, 0.072, mzZ + 0.02);
  block(b, [0, 0.062, mzZ + 0.02], [0.01, 0.016, 0.014], C.gunmetalDark, "metal", [0, 0, 0], 0.002);
  sightDot(b, new THREE.Vector3(0, F.y, F.z + 0.004), 0.0028, "#ffaa22");
  const R = new THREE.Vector3(0, 0.072, 0.02);
  b.add(new THREE.TorusGeometry(0.012, 0.0028, 8, 28), C.gunmetalDark, "metal", tf([R.x, R.y, R.z]));

  const built = b.build({ name: "shotgun" });
  return {
    ...built,
    id: "shotgun",
    muzzle: new THREE.Vector3(0, BY, mzZ - 0.01),
    length: 0.96,
    gripAnchor: new THREE.Vector3(0, -0.06, 0.047),
    foreAnchor: new THREE.Vector3(0, -0.01, -0.265),
    sightY: 0.072,
    fwd: FWD,
    sightLine: { front: F, rear: R },
  };
}
