// Terrain splat layers (pure data — no DOM / asset imports, so node tools can use the splat rules too).
// Order here == layer index in the shader and data.ts. Textures: public/assets/terrain/tex3/<id>/{diff,nor,arm}.webp.
export interface Layer {
  id: string;
  /** metres per texture repeat */
  tile: number;
  /** albedo multiplier (applied in the shader, linear) */
  tint: [number, number, number];
  /** extra saturation (0 = none) */
  sat: number;
  /** roughness multiplier */
  rough: number;
  /** normal strength 0..1 (mix from the geometric normal) */
  nrm: number;
  /** triplanar on slopes (rock faces) */
  tri: boolean;
  /** how much of the arm-map AO is pre-multiplied into the albedo (0 = none): low for sand + paths so they stay bright */
  ao: number;
}

export const LAYERS: Layer[] = [
  { id: "sand",   tile: 3.4, tint: [0.80, 0.78, 0.70], sat: -0.22, rough: 1.0, nrm: 0.5,  tri: false, ao: 0.2 },
  // Erangel-style muted olive steppe grass
  { id: "grass",  tile: 3.2, tint: [0.50, 0.54, 0.26], sat: -0.40, rough: 1.0, nrm: 0.72, tri: false, ao: 0.45 },
  { id: "jungle", tile: 3.8, tint: [0.62, 0.66, 0.52], sat: -0.30, rough: 1.0, nrm: 0.8,  tri: false, ao: 0.5 },
  // Compacted military dirt/gravel trails
  { id: "path",   tile: 3.4, tint: [0.68, 0.82, 0.86], sat: -0.28, rough: 1.0, nrm: 0.65, tri: false, ao: 0.25 },
  // Weathered shale & limestone cliffs
  { id: "cliff",  tile: 9.0, tint: [0.76, 0.76, 0.74], sat: -0.38, rough: 1.0, nrm: 0.9,  tri: true,  ao: 0.45 },
  // Cold granite rock outcrops
  { id: "rock",   tile: 6.0, tint: [0.80, 0.80, 0.80], sat: -0.15, rough: 1.0, nrm: 0.95, tri: true,  ao: 0.7 },
  { id: "cinder", tile: 3.6, tint: [0.30, 0.32, 0.36], sat: -0.1,  rough: 0.55, nrm: 0.85, tri: false, ao: 0.45 },
  { id: "farm",   tile: 29.6, tint: [0.70, 0.74, 0.48], sat: -0.22, rough: 1.0, nrm: 0.85, tri: false, ao: 0.4 },
  { id: "lava",   tile: 9.0, tint: [0.7, 0.7, 0.7],    sat: -0.2,  rough: 1.0, nrm: 0.9,  tri: false, ao: 0.4 },
  { id: "mud",    tile: 4.5, tint: [0.78, 0.76, 0.72], sat: -0.18, rough: 1.0, nrm: 0.6,  tri: false, ao: 0.35 },
  { id: "reef",   tile: 9.0, tint: [0.36, 0.42, 0.40], sat: -0.15, rough: 1.0, nrm: 0.5,  tri: false, ao: 0.4 },
  { id: "basalt", tile: 5.5, tint: [0.85, 0.85, 0.86], sat: -0.15, rough: 1.0, nrm: 0.9,  tri: true,  ao: 0.45 },
];
export const LAYER_COUNT = LAYERS.length;
export const layerIndex = (id: string) => { const i = LAYERS.findIndex((l) => l.id === id); if (i < 0) throw new Error("terrain layer " + id); return i; };
