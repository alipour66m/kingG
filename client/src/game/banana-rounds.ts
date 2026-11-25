// Door-gun (M134 Minigun) high-velocity tracer rounds streaking out of the barrels.
// Cosmetic only (the round itself is hitscan, shared/sim/heli.ts): each one flies from the barrels to where its round
// stopped at SPEED m/s and vanishes there. One instanced mesh, a fixed pool, zero allocations per frame.
import * as THREE from "three";
import type { Scope } from "../engine/res/scope";

const MAX = 64;
/** m/s: high-velocity tracer speed */
const SPEED = 260;
/** tracer streak length (m) */
const LEN = 0.55;

/** pointed ballistic tracer round along +Z: copper jacket nose + bright tracer tail */
function tracerGeometry(): THREE.BufferGeometry {
  const seg = 6, rad = 6;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const TIP = new THREE.Color(0xc87a38).convertSRGBToLinear();
  const CORE = new THREE.Color(0xffb84a).convertSRGBToLinear();
  const TAIL = new THREE.Color(0xfff0a8).convertSRGBToLinear();
  const prof = [
    [0.0, 0.002],
    [0.18, 0.011],
    [0.45, 0.012],
    [0.72, 0.010],
    [0.88, 0.007],
    [0.96, 0.004],
    [1.0, 0.001],
  ];
  for (let i = 0; i <= seg; i++) {
    const [u, r] = prof[i];
    const z = (0.5 - u) * LEN;
    const c = u < 0.25 ? TIP : u < 0.7 ? CORE : TAIL;
    for (let j = 0; j < rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = a + rad, d = b + rad;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class BananaRounds {
  readonly mesh: THREE.InstancedMesh;
  private from = new Float32Array(MAX * 3); private dir = new Float32Array(MAX * 3);
  private dist = new Float32Array(MAX); private t = new Float32Array(MAX); private live = new Uint8Array(MAX);
  private next = 0;
  private readonly M = new THREE.Matrix4(); private readonly Q = new THREE.Quaternion();
  private readonly P = new THREE.Vector3(); private readonly S = new THREE.Vector3(1, 1, 1); private readonly Z = new THREE.Vector3(0, 0, 1); private readonly D = new THREE.Vector3();
  constructor(scene: THREE.Scene, res: Scope) {
    const mat = res.material(new THREE.MeshBasicMaterial({ name: "tracer-round", vertexColors: true, toneMapped: false }));
    this.mesh = res.own("geo.actor", new THREE.InstancedMesh(res.geometry("geo.actor", tracerGeometry()), mat, MAX), () => this.mesh.instanceMatrix.array.byteLength);
    this.mesh.name = "tracer-rounds"; this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    res.defer(() => this.mesh.removeFromParent());
  }
  /** a tracer round from the barrels (a) toward where the round stopped (b) */
  spawn(a: THREE.Vector3, b: THREE.Vector3) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz);
    if (d < 1.5) return;
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.from[i * 3] = a.x; this.from[i * 3 + 1] = a.y; this.from[i * 3 + 2] = a.z;
    this.dir[i * 3] = dx / d; this.dir[i * 3 + 1] = dy / d; this.dir[i * 3 + 2] = dz / d;
    this.dist[i] = Math.min(d, 320); this.t[i] = 0; this.live[i] = 1;
  }
  update(dt: number) {
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      if (!this.live[i]) continue;
      this.t[i] += dt * SPEED;
      if (this.t[i] >= this.dist[i]) { this.live[i] = 0; continue; }
      const s = this.t[i];
      this.P.set(this.from[i * 3] + this.dir[i * 3] * s, this.from[i * 3 + 1] + this.dir[i * 3 + 1] * s, this.from[i * 3 + 2] + this.dir[i * 3 + 2] * s);
      this.D.set(this.dir[i * 3], this.dir[i * 3 + 1], this.dir[i * 3 + 2]);
      this.Q.setFromUnitVectors(this.Z, this.D);
      const g = Math.min(1, 0.4 + s / 2.0); this.S.set(1, 1, g);
      this.M.compose(this.P, this.Q, this.S);
      this.mesh.setMatrixAt(n++, this.M);
    }
    this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
