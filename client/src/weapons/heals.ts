// Tactical Medical & Boost consumables (origin = bottom centre, +Z front):
//   leaf-bundle   -> BANDAGE (sterile gauze roll + tan compression wrap + red cross badge)
//   smoothie      -> FIRST AID KIT (compact olive IFAK pouch with zipper & red cross patch)
//   golden-banana -> MED KIT (hard-shell military trauma case with latches, handle & red cross)
//   red-banana    -> ENERGY DRINK (sleek matte black/cobalt aluminum can with cyan/amber lightning stripe & tab)
import type * as THREE from "three";
import type { ConsumableId } from "../../../shared/world/map";
import { PartBuilder, type Built } from "./lib/builder";
import { filletCyl, rbox, ringGeo, tf } from "./lib/geo";
import { bananaBomb, crateWallPack } from "./loot-lane";

export const HEAL_ORDER: ConsumableId[] = ["leaf-bundle", "smoothie", "golden-banana", "red-banana"];
const cache = new Map<string, Built>();

function bandage(): Built {
  const b = new PartBuilder();
  // rolled elastic tan/olive compression bandage + sterile white inner roll
  b.add(filletCyl(0.068, 0.125, 0.008, 24), "#d8cfb8", "matte", tf([0, 0.072, 0], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(0.072, 0.07, 0.004, 24), "#9f9072", "matte", tf([0, 0.072, 0], [Math.PI / 2, 0, 0]));
  b.add(filletCyl(0.022, 0.13, 0.002, 16), "#5a5244", "matte", tf([0, 0.072, 0], [Math.PI / 2, 0, 0]));
  // red cross tape strip on top
  b.add(rbox(0.08, 0.012, 0.08, 0.003), "#efe8d6", "matte", tf([0, 0.142, 0]));
  b.add(rbox(0.044, 0.006, 0.015, 0.001), "#c82d24", "matte", tf([0, 0.148, 0]));
  b.add(rbox(0.015, 0.006, 0.044, 0.001), "#c82d24", "matte", tf([0, 0.148, 0]));
  return b.build({ name: "leaf-bundle" });
}

function firstAidKit(): Built {
  const b = new PartBuilder();
  // compact olive-drab IFAK pouch
  b.add(rbox(0.22, 0.16, 0.12, 0.02, 3), "#4a5638", "matte", tf([0, 0.085, 0]));
  // zipper seam + MOLLE straps
  b.add(rbox(0.226, 0.014, 0.126, 0.004, 2), "#202428", "matte", tf([0, 0.115, 0]));
  for (const x of [-0.07, 0.07]) b.add(rbox(0.026, 0.14, 0.13, 0.004, 2), "#343d28", "matte", tf([x, 0.085, 0]));
  // top nylon carry loop
  b.add(rbox(0.09, 0.022, 0.028, 0.006, 2), "#262b22", "matte", tf([0, 0.172, 0]));
  // front medical patch (ivory square + red cross)
  b.add(rbox(0.085, 0.085, 0.014, 0.004, 2), "#e8e2d0", "matte", tf([0, 0.085, 0.062]));
  b.add(rbox(0.052, 0.018, 0.008, 0.002, 1), "#c82d24", "matte", tf([0, 0.085, 0.07]));
  b.add(rbox(0.018, 0.052, 0.008, 0.002, 1), "#c82d24", "matte", tf([0, 0.085, 0.07]));
  return b.build({ name: "smoothie" });
}

function medKit(): Built {
  const b = new PartBuilder();
  // heavy-duty hard-shell military field surgical case
  b.add(rbox(0.32, 0.16, 0.24, 0.016, 3), "#2d3430", "matte", tf([0, 0.084, 0]));
  // reinforcement ribs + latches
  b.add(rbox(0.33, 0.028, 0.25, 0.006, 2), "#1e2220", "metal", tf([0, 0.11, 0]));
  for (const x of [-0.1, 0.1]) b.add(rbox(0.036, 0.055, 0.024, 0.004, 2), "#c8a248", "metal", tf([x, 0.105, 0.125]));
  // front carry handle
  b.add(rbox(0.12, 0.024, 0.042, 0.006, 2), "#1a1d20", "metal", tf([0, 0.085, 0.136]));
  // crisp top medical cross emblem on white/gold plate
  b.add(rbox(0.14, 0.012, 0.14, 0.005, 2), "#ece7da", "matte", tf([0, 0.166, 0]));
  b.add(rbox(0.092, 0.008, 0.028, 0.002, 1), "#d62d24", "matte", tf([0, 0.172, 0]));
  b.add(rbox(0.028, 0.008, 0.092, 0.002, 1), "#d62d24", "matte", tf([0, 0.172, 0]));
  return b.build({ name: "golden-banana" });
}

function energyDrink(): Built {
  const b = new PartBuilder();
  // sleek 250ml tactical aluminum can
  b.add(filletCyl(0.052, 0.22, 0.005, 24), "#181d26", "metal", tf([0, 0.115, 0]));
  // tapered top shoulder & bottom rim (brushed aluminum)
  b.add(filletCyl(0.046, 0.024, 0.003, 24, 0.042, 0.051), "#b8c0c8", "chrome", tf([0, 0.23, 0]));
  b.add(filletCyl(0.048, 0.016, 0.002, 24, 0.051, 0.044), "#b8c0c8", "chrome", tf([0, 0.008, 0]));
  // pull-tab
  b.add(rbox(0.016, 0.005, 0.034, 0.002, 1), "#d4dce4", "chrome", tf([0, 0.244, 0.006]));
  // glowing cyan/amber tactical accent bands
  b.add(ringGeo(0.0532, 0.051, 0.044, 0.001, 24), "#22b8ff", "emissive", tf([0, 0.145, 0], [Math.PI / 2, 0, 0]));
  b.add(ringGeo(0.0532, 0.051, 0.014, 0.001, 24), "#ffaa22", "emissive", tf([0, 0.105, 0], [Math.PI / 2, 0, 0]));
  return b.build({ name: "red-banana" });
}

/** gear-01 studio fallback */
export function buildCoconut(): Built {
  return medKit();
}

export function buildHeal(id: ConsumableId): Built {
  let hit = cache.get(id);
  if (!hit) {
    hit = id === "smoothie" ? firstAidKit()
      : id === "leaf-bundle" ? bandage()
      : id === "red-banana" ? energyDrink()
      : id === "banana-bomb" ? bananaBomb()
      : id === "crate-wall" ? crateWallPack()
      : medKit();
    hit.root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const x = o as THREE.Mesh; x.castShadow = x.castShadow !== false; x.receiveShadow = true;
    });
    cache.set(id, hit);
  }
  const root = hit.root.clone(true) as THREE.Group;
  return { ...hit, root };
}
