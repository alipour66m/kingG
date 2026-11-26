// Optional high-detail PBR GLB weapon loader (public/assets/weapons/*.glb) via Assets.model.
// Falls back to the synchronous procedural builders in guns/*.ts until preloaded or in headless Node tests.
import * as THREE from "three";
import type { WeaponId } from "../../../../shared/world/map";
import type { Assets } from "../../engine/assets";
import { FWD } from "./common";
import type { GunSpec } from "./types";

interface GlbWeaponDef {
  asset: string;
  muzzle: [number, number, number];
  length: number;
  gripAnchor: [number, number, number];
  foreAnchor: [number, number, number] | null;
  sightY: number;
  sightLine: { front: [number, number, number]; rear: [number, number, number] };
  accentPos: [number, number, number];
  accentSize: [number, number, number];
}

const GLB_DEFS: Partial<Record<WeaponId, GlbWeaponDef>> = {
  pistol: {
    asset: "assets/weapons/g17.glb",
    muzzle: [0, 0.0405, -0.162],
    length: 0.254,
    gripAnchor: [0, -0.060, 0.046],
    foreAnchor: null,
    sightY: 0.058,
    sightLine: { front: [0, 0.058, -0.1525], rear: [0, 0.058, 0.060] },
    accentPos: [0.0155, 0.030, -0.075],
    accentSize: [0.002, 0.004, 0.016],
  },
  ar: {
    asset: "assets/weapons/m16a2.glb",
    muzzle: [0, 0.0677, -0.718],
    length: 1.07,
    gripAnchor: [0, -0.050, 0.031],
    foreAnchor: [0, 0.020, -0.37],
    sightY: 0.13,
    sightLine: { front: [0, 0.13, -0.525], rear: [0, 0.13, 0] },
    accentPos: [0.021, 0.048, -0.08],
    accentSize: [0.0025, 0.005, 0.024],
  },
};

const loaded = new Map<WeaponId, { root: THREE.Group; meshes: THREE.Mesh[]; pivots: Record<string, THREE.Group>; tris: number }>();
const inflight = new WeakMap<Assets, Promise<WeaponId[]>>();
const ACCENT_GEO = new THREE.BoxGeometry(1, 1, 1);

function prepareGlbRoot(id: WeaponId, src: THREE.Object3D, def: GlbWeaponDef): { root: THREE.Group; meshes: THREE.Mesh[]; pivots: Record<string, THREE.Group>; tris: number } {
  const root = new THREE.Group();
  root.name = id;
  const clone = src.clone(true);
  const meshes: THREE.Mesh[] = [];
  const pivots: Record<string, THREE.Group> = {};
  let tris = 0;

  while (clone.children.length > 0) root.add(clone.children[0]!);
  root.traverse((o) => {
    if ((o as THREE.Group).isGroup && o !== root) pivots[o.name.split("/").pop()!] = o as THREE.Group;
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    m.castShadow = true;
    m.receiveShadow = true;
    const g = m.geometry;
    if (g) {
      // Promote normalized Uint8 COLOR_0 to Float32 so mergeGeometries in held.ts/loot.ts matches procedural parts.
      const col = g.attributes.color;
      if (col && !(col.array instanceof Float32Array)) {
        const f = new Float32Array(col.count * 3);
        for (let i = 0; i < col.count; i++) {
          f[i * 3] = col.getX(i);
          f[i * 3 + 1] = col.getY(i);
          f[i * 3 + 2] = col.getZ(i);
        }
        g.setAttribute("color", new THREE.BufferAttribute(f, 3));
      }
      tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    }
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!mat) continue;
      const std = mat as THREE.MeshStandardMaterial;
      // COLOR_0 is embedded for held.ts / loot.ts vertex-color LOD baking; disable it on textured 1P/showcase PBR.
      if (std.map) std.vertexColors = false;
      std.needsUpdate = true;
    }
  });

  // Subtle rarity accent gem pair (hidden in studio product sheet, tinted per rarity in loot/held).
  const acc = new THREE.Group();
  acc.name = "accent";
  const accMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.85,
    roughness: 0.35,
    metalness: 0.1,
  });
  for (const sx of [1, -1]) {
    const gem = new THREE.Mesh(ACCENT_GEO, accMat);
    gem.scale.set(...def.accentSize);
    gem.position.set(sx * def.accentPos[0], def.accentPos[1], def.accentPos[2]);
    acc.add(gem);
    meshes.push(gem);
    tris += 12;
  }
  root.add(acc);
  pivots["accent"] = acc;
  return { root, meshes, pivots, tris: Math.round(tris) };
}

/** Preload open-licensed GLB weapons through the shared Assets cache and notify cache invalidators. */
export function preloadWeaponGlbs(assets: Assets | undefined, onUpgrade?: (ids: WeaponId[]) => void): Promise<WeaponId[]> {
  if (!assets || typeof window === "undefined") return Promise.resolve([]);
  const hit = inflight.get(assets);
  if (hit) return hit;

  const entries = Object.entries(GLB_DEFS) as Array<[WeaponId, GlbWeaponDef]>;
  const job = Promise.all(
    entries.map(async ([id, def]) => {
      try {
        const gltf = await assets.model(def.asset);
        if (!gltf?.scene) return null;
        loaded.set(id, prepareGlbRoot(id, gltf.scene, def));
        return id;
      } catch (e) {
        console.warn("[weapons] GLB weapon failed, keeping procedural fallback:", id, e);
        return null;
      }
    }),
  ).then((res) => {
    const upgraded = res.filter((x): x is WeaponId => x !== null);
    if (upgraded.length && onUpgrade) onUpgrade(upgraded);
    return upgraded;
  });

  inflight.set(assets, job);
  return job;
}

/** Build a GunSpec from an already-loaded GLB asset, or return null if not yet loaded. */
export function buildGlbGunSpec(id: WeaponId): GunSpec | null {
  const def = GLB_DEFS[id];
  const item = loaded.get(id);
  if (!def || !item) return null;
  return {
    root: item.root,
    meshes: item.meshes,
    pivots: item.pivots,
    tris: item.tris,
    id,
    muzzle: new THREE.Vector3(...def.muzzle),
    length: def.length,
    gripAnchor: new THREE.Vector3(...def.gripAnchor),
    foreAnchor: def.foreAnchor ? new THREE.Vector3(...def.foreAnchor) : null,
    sightY: def.sightY,
    fwd: FWD,
    sightLine: {
      front: new THREE.Vector3(...def.sightLine.front),
      rear: new THREE.Vector3(...def.sightLine.rear),
    },
  };
}
