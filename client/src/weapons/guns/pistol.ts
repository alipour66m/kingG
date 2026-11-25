// Tactical sidearm (P92 9mm / Desert Eagle .45 ACP): dark gunmetal slide pivot, polymer frame, picatinny under-rail,
// flared magwell, 3-dot tactical tritium sights, and ergonomic textured grip. Gun space: -Z muzzle, +Y up, +X right.
import * as THREE from "three";
import { filletCyl, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, rearNotch, sightDot, triggerGuard, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildPistol(): GunSpec {
  const b = new PartBuilder();

  // ---- slide pivot (animated back on shot / rack on reload)
  const slide = b.sub("slide", [0, 0.052, 0]);
  // main gunmetal slide body
  block(slide, [0, 0.052, -0.065], [0.036, 0.034, 0.245], C.gunmetal, "metal", [0, 0, 0], 0.004);
  // chamfered top rib along slide
  block(slide, [0, 0.068, -0.065], [0.024, 0.008, 0.242], C.gunmetalLight, "metal", [0, 0, 0], 0.002);
  // rear & front slide serrations
  for (let i = 0; i < 6; i++) {
    for (const sx of [1, -1]) {
      block(slide, [sx * 0.0182, 0.052, 0.025 + i * 0.007], [0.002, 0.022, 0.003], C.gunmetalDark, "matte", [0, 0, 0], 0.0005);
      block(slide, [sx * 0.0182, 0.052, -0.14 - i * 0.007], [0.002, 0.02, 0.003], C.gunmetalDark, "matte", [0, 0, 0], 0.0005);
    }
  }
  // ejection port + chrome barrel hood
  block(slide, [0.004, 0.064, -0.045], [0.022, 0.014, 0.048], C.steel, "chrome", [0, 0, 0], 0.002);
  block(slide, [0.016, 0.056, -0.045], [0.006, 0.014, 0.046], C.gunmetalDark, "matte", [0, 0, 0], 0.001);
  // protruding barrel + recessed dark bore
  const barrelZ = -0.196;
  slide.add(filletCyl(0.0085, 0.024, 0.0015, 20), C.steelDark, "metal", alignY(new THREE.Vector3(0, 0.052, barrelZ + 0.006), FWD));
  slide.add(filletCyl(0.0052, 0.008, 0.0005, 16), "#0b0d10", "matte", alignY(new THREE.Vector3(0, 0.052, barrelZ - 0.005), FWD));

  // 3-dot tactical iron sights (aligned with VM_HOLD.pistol.ads.sight = [0, 0.075, 0.05])
  const F = new THREE.Vector3(0, 0.078, -0.172);
  block(slide, [0, 0.073, -0.172], [0.005, 0.012, 0.014], C.gunmetalDark, "matte", [0, 0, 0], 0.001);
  sightDot(slide, new THREE.Vector3(0, F.y - 0.002, -0.165), 0.0024, "#55ff77");
  const R = new THREE.Vector3(0, 0.076, 0.048);
  rearNotch(slide, R, 0.007, 0.007, 0.068, 0.012, C.gunmetalDark);

  // ---- polymer lower frame + under-barrel picatinny rail
  block(b, [0, 0.026, -0.068], [0.035, 0.022, 0.22], C.polymer, "matte", [0, 0, 0], 0.004);
  block(b, [0, 0.014, -0.145], [0.026, 0.01, 0.075], C.gunmetalDark, "matte", [0, 0, 0], 0.002);
  for (let i = 0; i < 4; i++) block(b, [0, 0.0085, -0.118 - i * 0.015], [0.028, 0.003, 0.006], C.gunmetal, "matte", [0, 0, 0], 0.001);
  // slide lock + takedown lever + beaver tail
  for (const sx of [1, -1]) {
    block(b, [sx * 0.019, 0.032, -0.02], [0.004, 0.007, 0.024], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  }
  block(b, [0, 0.03, 0.056], [0.028, 0.016, 0.038], C.polymer, "matte", [0.18, 0, 0], 0.005);

  // ---- trigger guard + trigger
  triggerGuard(b, [0, 0.018, -0.025], 0.068, 0.042, 0.006, 0.016);

  // ---- ergonomic polymer grip (raked back at ~18°, aligned with gripAnchor [0, -0.05, 0.04])
  const gripPitch = -0.3;
  b.add(rbox(0.034, 0.135, 0.056, 0.008, 3), C.polymer, "matte", tf([0, -0.052, 0.042], [gripPitch, 0, 0]));
  // textured side grip panels
  for (const sx of [1, -1]) {
    b.add(rbox(0.004, 0.1, 0.04, 0.002, 2), C.gunmetalDark, "matte", tf([sx * 0.0165, -0.052, 0.042], [gripPitch, 0, 0]));
  }
  // magazine baseplate + lanyard loop
  b.add(rbox(0.038, 0.018, 0.062, 0.004, 2), C.gunmetal, "metal", tf([0, -0.122, 0.064], [gripPitch, 0, 0]));
  // hammer spur
  b.add(rbox(0.008, 0.018, 0.016, 0.002, 2), C.steelDark, "metal", tf([0, 0.048, 0.062], [-0.45, 0, 0]));
  // recoil guide rod under barrel
  b.add(ringGeo(0.0065, 0.003, 0.01, 0.001, 16), C.steel, "metal", tf([0, 0.03, -0.186], [Math.PI / 2, 0, 0]));

  // rarity accent gem on frame side
  const acc = b.sub("accent");
  for (const sx of [1, -1]) block(acc, [sx * 0.0185, 0.028, -0.075], [0.003, 0.006, 0.022], C.white, "emissive", [0, 0, 0], 0.001);

  const built = b.build({ name: "pistol" });
  return {
    ...built,
    id: "pistol",
    muzzle: new THREE.Vector3(0, 0.052, barrelZ - 0.01),
    length: 0.28,
    gripAnchor: new THREE.Vector3(0, -0.05, 0.042),
    foreAnchor: null,
    sightY: F.y,
    fwd: FWD,
    sightLine: { front: F, rear: R },
  };
}
