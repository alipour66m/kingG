// Tactical Anti-Armor Launcher (RPG-7): olive drab / gunmetal launch tube with heat shield, flared rear venturi,
// dual pistol grips, optical PGO-7 sight housing, and a conical PG-7 HEAT warhead ("rocket" pivot).
import * as THREE from "three";
import { filletCyl, lathe, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, triggerGuard, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildRocket(): GunSpec {
  const b = new PartBuilder();
  const R = 0.068, Y = 0.11, Z0 = -0.18, Z1 = 0.48;

  // ---- main gunmetal launch tube
  b.add(filletCyl(R, Z1 - Z0, 0.005, 32), C.gunmetal, "metal", alignY(new THREE.Vector3(0, Y, (Z0 + Z1) / 2), FWD));
  // OD green / walnut heat-shield sleeve around the shouldered section
  b.add(filletCyl(R + 0.009, 0.24, 0.008, 28), C.odGreen, "matte", alignY(new THREE.Vector3(0, Y, 0.14), FWD));
  for (const z of [0.03, 0.25]) {
    b.add(ringGeo(R + 0.012, R - 0.001, 0.018, 0.003, 28), C.gunmetalDark, "metal", tf([0, Y, z], [Math.PI / 2, 0, 0]));
  }
  // flared front bell + muzzle collar
  b.add(ringGeo(R + 0.014, R - 0.008, 0.036, 0.005, 32), C.gunmetalDark, "metal", tf([0, Y, Z0 + 0.01], [Math.PI / 2, 0, 0]));
  // flared rear venturi nozzle + dark throat
  const venturi = lathe([[R * 0.85, 0], [R * 1.18, 0.06], [R * 1.24, 0.11], [R * 0.92, 0.11], [R * 0.72, 0]], 32);
  b.add(venturi, C.gunmetalDark, "metal", tf([0, Y, Z1 - 0.01], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(R * 0.7, 0.02, 0.002, 24), "#0b0d10", "matte", tf([0, Y, Z1 + 0.06], [Math.PI / 2, 0, 0]));

  // ---- side optical sight mount + backup ladder sight (aligned near VM_HOLD.rocket.ads.sight = [0, 0.2, 0.1])
  block(b, [-0.055, Y + 0.035, 0.04], [0.028, 0.05, 0.08], C.gunmetalDark, "metal", [0, 0, 0], 0.003);
  b.add(filletCyl(0.022, 0.13, 0.003, 20), C.gunmetal, "metal", tf([-0.06, Y + 0.07, 0.04], [Math.PI / 2, 0, 0]));
  block(b, [0, Y + R + 0.025, -0.14], [0.018, 0.045, 0.012], C.gunmetalDark, "metal", [0, 0, 0], 0.002);
  block(b, [0, Y + R + 0.025, 0.06], [0.02, 0.045, 0.012], C.gunmetalDark, "metal", [0, 0, 0], 0.002);

  // ---- HEAT warhead ("rocket" pivot, hidden while in flight)
  const rocket = b.sub("rocket", [0, Y, Z0 - 0.04]);
  // shaft entering tube
  rocket.add(filletCyl(0.026, 0.12, 0.003, 20), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, Y, Z0 - 0.02), FWD));
  // stepped conical PG-7V warhead
  const nz = Z0 - 0.08;
  const warhead = lathe([[0.026, 0], [0.072, 0.07], [0.074, 0.11], [0.045, 0.19], [0.016, 0.24]], 32);
  rocket.add(warhead, C.odGreen, "matte", tf([0, Y, nz], [-Math.PI / 2, 0, 0]));
  // yellow/amber explosive ordnance band + copper standoff nose fuse
  rocket.add(ringGeo(0.075, 0.068, 0.022, 0.002, 32), C.brass, "metal", tf([0, Y, nz - 0.09], [Math.PI / 2, 0, 0]));
  rocket.add(filletCyl(0.017, 0.06, 0.003, 18, 0.01, 0.017), C.copper, "metal", tf([0, Y, nz - 0.25], [-Math.PI / 2, 0, 0]));

  // ---- underside: trigger housing, rear trigger grip, front support grip
  block(b, [0, Y - R - 0.012, 0.08], [0.044, 0.046, 0.12], C.gunmetalDark, "metal", [0, 0, 0], 0.006);
  triggerGuard(b, [0, Y - R - 0.032, 0.065], 0.072, 0.046, 0.006, 0.016);
  b.add(rbox(0.036, 0.135, 0.05, 0.008, 3), C.walnut, "matte", tf([0, Y - R - 0.088, 0.122], [-0.28, 0, 0]));
  // front grip (aligned with VM_HOLD.rocket.l.at = [0, -0.095, -0.08])
  block(b, [0, Y - R - 0.01, -0.08], [0.042, 0.03, 0.065], C.gunmetalDark, "metal", [0, 0, 0], 0.005);
  b.add(rbox(0.034, 0.12, 0.042, 0.007, 3), C.polymer, "matte", tf([0, Y - R - 0.075, -0.08], [0.08, 0, 0]));

  const acc = b.sub("accent");
  for (const sx of [1, -1]) block(acc, [sx * (R + 0.01), Y, 0.14], [0.004, 0.01, 0.04], C.white, "emissive", [0, 0, 0], 0.001);

  const built = b.build({ name: "rocket" });
  return {
    ...built,
    id: "rocket",
    muzzle: new THREE.Vector3(0, Y, nz - 0.28),
    length: 1.0,
    gripAnchor: new THREE.Vector3(0, Y - R - 0.09, 0.12),
    foreAnchor: new THREE.Vector3(0, Y - R - 0.095, -0.08),
    sightY: Y + 0.09,
    fwd: FWD,
  };
}
