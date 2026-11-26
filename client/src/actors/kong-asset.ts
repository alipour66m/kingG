// Tactical Operator assets (Male & Female realistic human models built from MakeHuman CC0 base topology
// + sculpted tactical military gear + PBR albedo/normal/ao maps under public/assets/actors/operators/).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Assets } from "../engine/assets";
import { actorLook } from "./look";
import { releaseAfterUpload } from "../engine/texture-release";

export type AssetMat = "kbody" | "khead" | "kgear" | "kshoe" | "keye" | "kmin";
export type OperatorGender = "male" | "female" | "female2" | "female3";
export const OPERATOR_GENDERS: readonly OperatorGender[] = ["male", "female", "female2", "female3"];
export const OPERATOR_LABELS: Record<OperatorGender, string> = {
  male: "Male (Vanguard)",
  female: "Female (Valkyrie)",
  female2: "Female (Nomad)",
  female3: "Female (Nightfall)",
};

export interface KongAsset {
  tiers: Array<Array<{ mat: AssetMat; geo: THREE.BufferGeometry }>>;
  tris: { hi: number; lo: number; min: number };
  shadowLo: THREE.BufferGeometry;
  shadowMin: THREE.BufferGeometry;
  materials(tier: 0 | 1 | 2): Record<AssetMat, THREE.Material>;
}

/** Realistic MakeHuman CC0 Male & Female Tactical Operators are the default actor assets. */
export const USE_ASSET = true;
export const KONG_ALT = false;
export const KONG_VER: "v1" | "v2" = "v2";
export const PUBLIC_BASE: string = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const BASE = PUBLIC_BASE + "assets/actors/operators/";
export const KONG_HS = 1.0;

type V3 = [number, number, number];
export interface KongFace {
  eyeMid: V3;
  fist: V3;
  brow: { c: V3; r: V3; inner: [number, number] };
  jaw: boolean;
  paintMouth: boolean;
  lid: V3;
  hat: [number, number, number, number];
}

export const FACE: KongFace = {
  eyeMid: [0, 0.14, -0.09],
  fist: [0.0, -0.105, -0.015],
  brow: { c: [0.032, 0.162, -0.09], r: [0.025, 0.018, 0.025], inner: [0.01, 0.03] },
  jaw: false,
  paintMouth: false,
  lid: [0.68, 0.44, 0.32],
  hat: [0.20, 0.01, -0.05, 1.0],
};

function prep(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "tangent", "uv", "color"]) {
    if (src.attributes[k]) g.setAttribute(k, src.attributes[k]);
  }
  if (src.index) g.setIndex(src.index);
  const n = src.attributes.position.count;
  const bi = new Float32Array(n * 4);
  const bw = new Float32Array(n * 4);
  const A = src.attributes as Record<string, THREE.BufferAttribute>;
  for (let i = 0; i < n; i++) {
    bi[i * 4] = Math.round(A._bi01.getX(i));
    bi[i * 4 + 1] = Math.round(A._bi01.getY(i));
    bi[i * 4 + 2] = Math.round(A._bi23.getX(i));
    bi[i * 4 + 3] = Math.round(A._bi23.getY(i));
    bw[i * 4] = A._bw01.getX(i);
    bw[i * 4 + 1] = A._bw01.getY(i);
    bw[i * 4 + 2] = A._bw23.getX(i);
    bw[i * 4 + 3] = A._bw23.getY(i);
  }
  g.setAttribute("aBones", new THREE.BufferAttribute(bi, 4));
  g.setAttribute("aWeights", new THREE.BufferAttribute(bw, 4));
  return g;
}

const triCount = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
export const fullKongMaps = () => Promise.resolve();
let opsCache: Promise<Record<OperatorGender, KongAsset> | null> | null = null;

export function loadOperatorAssets(assets: Assets, renderer: THREE.WebGLRenderer): Promise<Record<OperatorGender, KongAsset> | null> {
  if (!USE_ASSET) return Promise.resolve(null);
  return (opsCache ??= (async () => {
    try {
      const tl = new THREE.TextureLoader();
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const tex = async (name: string, srgb: boolean) => {
        const url = BASE + name + ".webp";
        const t = releaseAfterUpload(
          await tl.loadAsync(url),
          async () => (await tl.loadAsync(url)).image,
        ) as THREE.Texture<HTMLImageElement | HTMLCanvasElement>;
        t.flipY = false;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = aniso;
        t.needsUpdate = true;
        return t;
      };

      const [
        maleGltf, femaleGltf, f2Gltf, f3Gltf,
        mAlb, mNrm, mAo,
        sgAlb, sgNrm, sgAo, sEyeAlb,
        fAlb, f2Alb, f3Alb, fNrm, fAo,
        gAlb, gdAlb, gnAlb, gNrm, gAo,
        eyeAlb,
      ] = await Promise.all([
        assets.model("assets/actors/operators/male.glb"),
        assets.model("assets/actors/operators/female.glb"),
        assets.model("assets/actors/operators/female2.glb"),
        assets.model("assets/actors/operators/female3.glb"),
        tex("male-skin-albedo", true), tex("male-skin-normal", false), tex("male-skin-ao", false),
        tex("soldier-gear-albedo", true), tex("soldier-gear-normal", false), tex("soldier-gear-ao", false),
        tex("soldier-eye-albedo", true),
        tex("female-skin-albedo", true), tex("female2-skin-albedo", true), tex("female3-skin-albedo", true),
        tex("female-skin-normal", false), tex("female-skin-ao", false),
        tex("gear-albedo", true), tex("gear-desert-albedo", true), tex("gear-night-albedo", true),
        tex("gear-normal", false), tex("gear-ao", false),
        tex("eye-albedo", true),
      ]);

      const buildOne = (
        gender: OperatorGender,
        scene: THREE.Object3D,
        sAlb: THREE.Texture, sNrm: THREE.Texture, sAo: THREE.Texture,
        gearAlb: THREE.Texture, gearNrm: THREE.Texture, gearAo: THREE.Texture,
        eyeMap: THREE.Texture,
      ): KongAsset => {
        const byName = new Map<string, THREE.BufferGeometry>();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) byName.set(m.name || m.parent?.name || "", prep(m.geometry));
        });
        const get = (n: string) => {
          const g = byName.get(n);
          if (!g) throw new Error(`${gender}.glb: no mesh ${n} (have ${[...byName.keys()].join(",")})`);
          return g;
        };
        const hi: Array<{ mat: AssetMat; geo: THREE.BufferGeometry }> = [
          { mat: "kbody", geo: get("hi_kong") },
          { mat: "khead", geo: get("hi_head") },
          { mat: "kgear", geo: get("hi_gear") },
          { mat: "kshoe", geo: get("hi_shoes") },
          { mat: "keye", geo: get("hi_eyes") },
        ];
        const lo = [
          { mat: "kbody" as const, geo: get("lo_kong") },
          { mat: "kgear" as const, geo: get("lo_gear") },
          { mat: "keye" as const, geo: get("lo_eyes") },
        ];
        const min = [{ mat: "kmin" as const, geo: get("min_all") }];
        const sum = (l: Array<{ geo: THREE.BufferGeometry }>) => l.reduce((s, x) => s + triCount(x.geo), 0);
        const posOnly = (gs: THREE.BufferGeometry[]) => mergeGeometries(
          gs.map((g) => {
            const o = new THREE.BufferGeometry();
            for (const k of ["position", "normal", "aBones", "aWeights"]) o.setAttribute(k, g.attributes[k]);
            o.setIndex(g.index);
            return o;
          }),
          false,
        )!;

        const mats = new Map<number, Record<AssetMat, THREE.Material>>();
        const materials = (tier: 0 | 1 | 2) => {
          let m = mats.get(tier);
          if (m) return m;
          const skin = actorLook(
            new THREE.MeshPhysicalMaterial({
              map: sAlb, normalMap: sNrm, aoMap: sAo, aoMapIntensity: 0.75,
              roughness: gender === "male" ? 0.68 : 0.50, metalness: 0,
              sheen: gender === "male" ? 0.08 : 0.16, sheenColor: new THREE.Color("#f0b59c"), sheenRoughness: 0.65,
              name: `${gender}-skin-${tier}`,
            }),
            { key: `${gender}-skin-${tier}`, spec: 0.35 },
          );
          const gear = actorLook(
            new THREE.MeshStandardMaterial({
              map: gearAlb, normalMap: gearNrm, aoMap: gearAo, aoMapIntensity: 0.85,
              roughness: 0.74, metalness: 0.04, envMapIntensity: 0.55,
              name: `${gender}-gear-${tier}`,
            }),
            { key: `${gender}-gear-${tier}`, spec: 0.32 },
          );
          const shoe = actorLook(
            new THREE.MeshStandardMaterial({
              map: gearAlb, normalMap: gearNrm, aoMap: gearAo, aoMapIntensity: 0.9,
              roughness: 0.52, metalness: 0.06, envMapIntensity: 0.6,
              name: `${gender}-shoe-${tier}`,
            }),
            { key: `${gender}-shoe-${tier}`, spec: 0.38 },
          );
          const eye = new THREE.MeshPhysicalMaterial({
            map: eyeMap, roughness: 0.08, metalness: 0, clearcoat: 1.0, clearcoatRoughness: 0.04,
            name: `${gender}-eye-${tier}`,
          });
          eye.defines = { USE_UV: "" };
          const kmin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, name: `${gender}-min` });
          m = { kbody: skin, khead: skin, kgear: gear, kshoe: shoe, keye: eye, kmin };
          mats.set(tier, m);
          return m;
        };

        return {
          tiers: [hi, lo, min],
          tris: { hi: sum(hi), lo: sum(lo), min: sum(min) },
          shadowLo: posOnly(lo.slice(0, 2).map((x) => x.geo)),
          shadowMin: posOnly([min[0].geo]),
          materials,
        };
      };

      return {
        male: buildOne("male", maleGltf.scene, mAlb, mNrm, mAo, sgAlb, sgNrm, sgAo, sEyeAlb),
        female: buildOne("female", femaleGltf.scene, fAlb, fNrm, fAo, gAlb, gNrm, gAo, eyeAlb),
        female2: buildOne("female2", f2Gltf.scene, f2Alb, fNrm, fAo, gdAlb, gNrm, gAo, eyeAlb),
        female3: buildOne("female3", f3Gltf.scene, f3Alb, fNrm, fAo, gnAlb, gNrm, gAo, eyeAlb),
      };
    } catch (e) {
      console.warn("[operators] fallback:", e);
      return null;
    }
  })());
}

/** Realistic human eye GLSL: keeps MakeHuman's photographic iris/sclera albedo while adding smooth blink shading
 *  matched to real human skin tone plus wet corneal clearcoat catchlight. */
export const EYE_GLSL = /* glsl */ `
{
  vec2 ep = ( vUv - 0.5 ) * 2.0; ep.y = -ep.y;
  float blink = clamp( vKFace.x, 0.0, 1.0 );
  float sq = clamp( vKFace.w, -0.5, 1.0 );
  float topY = mix( 0.92 - 0.14 * max( sq, 0.0 ), -0.75, blink );
  float kU = smoothstep( topY - 0.06, topY + 0.06, ep.y );
  kLid = kU;
  vec3 skin = vec3( ${FACE.lid.map((v) => v.toFixed(3)).join(", ")} );
  float lash = kU * ( 1.0 - smoothstep( topY + 0.02, topY + 0.10, ep.y ) );
  vec3 lidC = mix( skin * 0.85, vec3( 0.06, 0.04, 0.03 ), lash );
  diffuseColor.rgb = mix( diffuseColor.rgb, lidC, kLid );
  vec2 c = clamp( vKFace.yz, vec2( -0.18 ), vec2( 0.18 ) );
  kEyeCatch = ( 1.0 - smoothstep( 0.05, 0.09, length( ep - c - vec2( -0.10, 0.12 ) ) ) ) * 0.75 * ( 1.0 - kLid );
}`;
