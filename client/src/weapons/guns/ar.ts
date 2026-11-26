// Delta-Force-inspired Tactical Assault Rifle (HK416 / M4A1 Mod 5.56mm): anodized gunmetal upper/lower receivers,
// monolithic M-LOK rail handguard, PEQ-15 tactical laser module, fluted barrel + suppressor/flash hider, sleek 30-rd
// curved PMAG ("mag" pivot), adjustable SOPMOD crane stock, EOTech holographic optic + low-profile flip front post.
import * as THREE from "three";
import { filletCyl, rbox, ringGeo, tf, alignY } from "../lib/geo";
import { PartBuilder } from "../lib/builder";
import { C } from "../lib/mats";
import { block, sightDot, triggerGuard, FWD } from "./common";
import type { GunSpec } from "./types";

export function buildAr(): GunSpec {
  const b = new PartBuilder();

  // ---- anodized upper & lower receiver + beveled magwell + deflector
  block(b, [0, 0.048, -0.04], [0.042, 0.048, 0.26], C.gunmetal, "metal", [0, 0, 0], 0.006);
  block(b, [0, 0.012, -0.04], [0.040, 0.034, 0.24], C.gunmetalDark, "metal", [0, 0, 0], 0.005);
  // full-length top Picatinny rail across receiver + handguard
  block(b, [0, 0.076, -0.19], [0.022, 0.009, 0.56], C.gunmetalDark, "matte", [0, 0, 0], 0.002);
  for (let z = -0.45; z <= 0.07; z += 0.02) block(b, [0, 0.081, z], [0.023, 0.003, 0.008], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  // ejection port + brass deflector + charging handle
  block(b, [0.021, 0.052, -0.05], [0.005, 0.016, 0.062], C.steelDark, "metal", [0, 0, 0], 0.001);
  block(b, [0.023, 0.046, 0.025], [0.011, 0.014, 0.022], C.gunmetalLight, "metal", [0, 0.25, 0], 0.003);
  block(b, [0, 0.066, 0.095], [0.032, 0.011, 0.022], C.gunmetalDark, "metal", [0, 0, 0], 0.002);

  // ---- slim M-LOK tactical free-float handguard + ventilated cooling slots (z = -0.175..-0.475)
  block(b, [0, 0.046, -0.325], [0.040, 0.048, 0.30], C.gunmetalDark, "metal", [0, 0, 0], 0.007);
  for (const sx of [1, -1]) {
    for (let i = 0; i < 6; i++) block(b, [sx * 0.0205, 0.046, -0.205 - i * 0.042], [0.003, 0.012, 0.022], C.steelDark, "matte", [0, 0, 0], 0.001);
  }
  // AN/PEQ-15 tactical laser/IR unit mounted on front top rail
  block(b, [0, 0.090, -0.34], [0.036, 0.018, 0.072], C.tan, "matte", [0, 0, 0], 0.003);
  block(b, [0.010, 0.091, -0.376], [0.010, 0.010, 0.008], "#0c0e11", "matte", [0, 0, 0], 0.001);
  // angled tactical fore-stop (aligned with foreAnchor around z = -0.43)
  block(b, [0, 0.014, -0.43], [0.026, 0.020, 0.050], C.polymer, "matte", [0.25, 0, 0], 0.004);

  // ---- fluted barrel + gas block + tactical 3-prong flash hider / suppressor collar
  const BY = 0.048, mzZ = -0.66;
  b.add(filletCyl(0.0105, 0.20, 0.002, 20), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, BY, -0.56), FWD));
  b.add(filletCyl(0.0145, 0.054, 0.002, 20), C.gunmetal, "metal", alignY(new THREE.Vector3(0, BY, mzZ + 0.022), FWD));
  b.add(ringGeo(0.015, 0.009, 0.012, 0.002, 20), C.gunmetalDark, "matte", alignY(new THREE.Vector3(0, BY, mzZ + 0.003), FWD));
  b.add(filletCyl(0.006, 0.008, 0.001, 12), "#0b0d10", "matte", alignY(new THREE.Vector3(0, BY, mzZ - 0.003), FWD));

  // ---- ergonomic Magpul pistol grip + trigger guard
  triggerGuard(b, [0, -0.008, -0.025], 0.062, 0.040, 0.006, 0.015);
  b.add(rbox(0.032, 0.118, 0.044, 0.007, 3), C.polymer, "matte", tf([0, -0.058, 0.032], [-0.34, 0, 0]));
  b.add(rbox(0.034, 0.012, 0.048, 0.003, 2), C.gunmetalDark, "matte", tf([0, -0.114, 0.052], [-0.34, 0, 0]));

  // ---- flared magazine well + clean realistic 30-rd PMAG ("mag" pivot)
  block(b, [0, -0.018, -0.138], [0.042, 0.044, 0.072], C.gunmetalDark, "metal", [0, 0, 0], 0.004);
  const mag = b.sub("mag", [0, -0.028, -0.138]);
  // Clean single-piece angled PMAG (zero zigzag seams) + brass witness window + baseplate
  mag.add(rbox(0.026, 0.145, 0.062, 0.004, 2), C.polymer, "matte", tf([0, -0.095, -0.146], [-0.14, 0, 0]));
  mag.add(rbox(0.027, 0.048, 0.014, 0.001, 1), C.brass, "metal", tf([0, -0.098, -0.140], [-0.14, 0, 0]));
  mag.add(rbox(0.030, 0.014, 0.068, 0.003, 2), C.tan, "matte", tf([0, -0.168, -0.156], [-0.14, 0, 0]));

  // ---- buffer tube + adjustable SOPMOD crane stock
  b.add(filletCyl(0.019, 0.22, 0.003, 20), C.gunmetalDark, "metal", alignY(new THREE.Vector3(0, 0.048, 0.20), FWD));
  block(b, [0, 0.038, 0.26], [0.046, 0.064, 0.17], C.polymer, "matte", [0, 0, 0], 0.008);
  block(b, [0, 0.012, 0.30], [0.032, 0.115, 0.10], C.gunmetalDark, "matte", [0.12, 0, 0], 0.006);
  block(b, [0, 0.016, 0.354], [0.040, 0.130, 0.020], C.polymer, "matte", [0, 0, 0], 0.005);

  // ---- EOTech EXPS3 holographic optic + compact flip-up iron post (aligned with ADS sightY = 0.13)
  const opticZ = -0.05;
  block(b, [0, 0.092, opticZ], [0.036, 0.016, 0.072], C.gunmetalDark, "metal", [0, 0, 0], 0.003);
  block(b, [0, 0.152, opticZ], [0.038, 0.007, 0.052], C.gunmetal, "metal", [0, 0, 0], 0.002);
  for (const sx of [1, -1]) block(b, [sx * 0.017, 0.125, opticZ], [0.005, 0.048, 0.052], C.gunmetal, "metal", [0, 0, 0], 0.001);
  sightDot(b, new THREE.Vector3(0, 0.13, opticZ), 0.0022, "#ff3b30");

  // Compact flip-up front sight post on top rail (no giant floating ring!)
  const F = new THREE.Vector3(0, 0.13, -0.44);
  block(b, [0, 0.095, -0.44], [0.016, 0.028, 0.022], C.gunmetalDark, "metal", [0, 0, 0], 0.002);
  for (const sx of [1, -1]) block(b, [sx * 0.006, 0.116, -0.44], [0.003, 0.024, 0.014], C.gunmetal, "metal", [0, 0, 0], 0.001);
  sightDot(b, new THREE.Vector3(0, 0.122, -0.44), 0.0020, "#55ff77");
  const R = new THREE.Vector3(0, 0.13, 0.0);

  // ---- M-LOK slot rows under the handguard, gas block, barrel flutes
  for (let i = 0; i < 7; i++) block(b, [0, 0.0216, -0.215 - i * 0.036], [0.014, 0.002, 0.02], C.steelDark, "matte", [0, 0, 0], 0.0005);
  block(b, [0, 0.050, -0.51], [0.024, 0.024, 0.03], C.gunmetal, "metal", [0, 0, 0], 0.003);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    block(b, [Math.cos(a) * 0.0103, BY + Math.sin(a) * 0.0103, -0.585], [0.0024, 0.0024, 0.13], C.gunmetalDark, "matte", [0, 0, a], 0.0004);
  }
  // 3-prong flash hider slots
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 6 + k * (Math.PI * 2 / 3);
    block(b, [Math.cos(a) * 0.0146, BY + Math.sin(a) * 0.0146, mzZ + 0.012], [0.0035, 0.0035, 0.026], "#0b0d10", "matte", [0, 0, a], 0.0004);
  }
  b.add(new THREE.SphereGeometry(0.0022, 10, 8), "#ff2a2a", "emissive", tf([0.010, 0.091, -0.3785]));

  // ---- lower receiver controls: forward assist, selector, mag release, bolt catch
  block(b, [0.026, 0.040, 0.04], [0.008, 0.010, 0.012], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  block(b, [-0.0215, 0.016, 0.006], [0.004, 0.010, 0.024], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  block(b, [0.0225, 0.002, -0.10], [0.006, 0.012, 0.012], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  block(b, [-0.0215, 0.026, -0.07], [0.004, 0.008, 0.016], C.gunmetalLight, "metal", [0, 0, 0], 0.001);
  block(b, [0.0215, 0.098, opticZ], [0.006, 0.006, 0.02], C.gunmetalLight, "metal", [0, 0, 0], 0.001);

  // ---- stock: ribbed rubber buttpad + sling QD
  for (let i = 0; i < 6; i++) block(b, [0, -0.04 + i * 0.02, 0.3665], [0.034, 0.004, 0.004], "#101214", "matte", [0, 0, 0], 0.0008);
  b.add(new THREE.TorusGeometry(0.007, 0.0017, 8, 18), C.steelDark, "metal", tf([0.024, 0.04, 0.2], [0, Math.PI / 2, 0]));

  // ---- PMAG: ribbed sides following the curve
  for (let i = 0; i < 7; i++) {
    const dy = -0.055 + i * 0.0183;
    for (const sx of [1, -1]) mag.add(rbox(0.0016, 0.004, 0.05, 0.0006, 1), C.gunmetalDark, "matte", tf([sx * 0.0135, -0.095 + dy * Math.cos(0.14), -0.146 - dy * Math.sin(0.14)], [-0.14, 0, 0]));
  }

  // rarity accent
  const acc = b.sub("accent");
  for (const sx of [1, -1]) block(acc, [sx * 0.022, 0.046, -0.08], [0.003, 0.007, 0.032], C.white, "emissive", [0, 0, 0], 0.001);

  const built = b.build({ name: "ar" });
  return {
    ...built,
    id: "ar",
    muzzle: new THREE.Vector3(0, BY, mzZ - 0.01),
    length: 1.03,
    gripAnchor: new THREE.Vector3(0, -0.06, 0.032),
    foreAnchor: new THREE.Vector3(0, 0.02, -0.43),
    sightY: 0.13,
    fwd: FWD,
    sightLine: { front: F, rear: R },
  };
}
