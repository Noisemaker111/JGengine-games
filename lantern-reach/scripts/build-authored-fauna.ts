import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

type Vec3 = [number, number, number];
type Color = [number, number, number];
type Json = Record<string, unknown>;

const NAVY: Color = [0.085, 0.15, 0.21];
const WING: Color = [0.13, 0.21, 0.27];
const FEATHER: Color = [0.24, 0.31, 0.35];
const BELLY: Color = [0.76, 0.72, 0.58];
const THROAT: Color = [0.64, 0.27, 0.15];
const DARK: Color = [0.035, 0.042, 0.05];

class Mesh {
  positions: number[] = [];
  normals: number[] = [];
  colors: number[] = [];

  face(a: Vec3, b: Vec3, c: Vec3, color: Color): void {
    const u = b.map((v, i) => v - a[i]!) as Vec3;
    const v = c.map((n, i) => n - a[i]!) as Vec3;
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    if (length < 1e-10) return;
    for (const point of [a, b, c]) {
      this.positions.push(...point);
      this.normals.push(n[0] / length, n[1] / length, n[2] / length);
      this.colors.push(...color);
    }
  }

  ellipsoid(center: Vec3, radius: Vec3, colorAt: (point: Vec3) => Color, rings = 6, segments = 10): void {
    const point = (row: number, col: number): Vec3 => {
      const latitude = -Math.PI / 2 + Math.PI * row / rings;
      const longitude = Math.PI * 2 * col / segments;
      return [center[0] + radius[0] * Math.cos(latitude) * Math.cos(longitude), center[1] + radius[1] * Math.sin(latitude), center[2] + radius[2] * Math.cos(latitude) * Math.sin(longitude)];
    };
    for (let row = 0; row < rings; row++) for (let col = 0; col < segments; col++) {
      const a = point(row, col), b = point(row, col + 1), c = point(row + 1, col + 1), d = point(row + 1, col);
      const color = colorAt(point(row + 0.5, col + 0.5));
      this.face(a, c, b, color);
      this.face(a, d, c, color);
    }
  }

  sheet(outline: Vec3[], thickness: number, top: Color, bottom: Color): void {
    const upper = outline.map(([x, y, z]) => [x, y + thickness / 2, z] as Vec3);
    const lower = outline.map(([x, y, z]) => [x, y - thickness / 2, z] as Vec3);
    const area = outline.reduce((sum, point, i) => sum + point[0] * outline[(i + 1) % outline.length]![2] - outline[(i + 1) % outline.length]![0] * point[2], 0);
    if (area > 0) { upper.reverse(); lower.reverse(); }
    for (let i = 1; i < outline.length - 1; i++) {
      this.face(upper[0]!, upper[i]!, upper[i + 1]!, top);
      this.face(lower[0]!, lower[i + 1]!, lower[i]!, bottom);
    }
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      this.face(upper[i]!, lower[i]!, lower[next]!, top);
      this.face(upper[i]!, lower[next]!, upper[next]!, top);
    }
  }
}

class Glb {
  json: Json = { asset: { version: "2.0", generator: "Lantern Reach original fauna and arrow authoring" }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [], meshes: [], materials: [{ name: "Authored pigment", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.08, roughnessFactor: 0.82 } }],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [] };
  chunks: Uint8Array[] = [];
  length = 0;

  accessor(values: number[], type: "SCALAR" | "VEC3" | "VEC4", target?: number): number {
    const width = type === "SCALAR" ? 1 : type === "VEC3" ? 3 : 4;
    const floats = new Float32Array(values);
    const bytes = new Uint8Array(floats.buffer);
    const views = this.json.bufferViews as Json[];
    const view = views.push({ buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength, ...(target === undefined ? {} : { target }) }) - 1;
    this.chunks.push(bytes); this.length += bytes.byteLength;
    const min = Array(width).fill(Infinity) as number[], max = Array(width).fill(-Infinity) as number[];
    values.forEach((v, i) => { min[i % width] = Math.min(min[i % width]!, v); max[i % width] = Math.max(max[i % width]!, v); });
    return (this.json.accessors as Json[]).push({ bufferView: view, componentType: 5126, count: values.length / width, type, min, max }) - 1;
  }

  mesh(name: string, value: Mesh): number {
    return (this.json.meshes as Json[]).push({ name, primitives: [{ attributes: { POSITION: this.accessor(value.positions, "VEC3", 34962), NORMAL: this.accessor(value.normals, "VEC3", 34962), COLOR_0: this.accessor(value.colors, "VEC3", 34962) }, material: 0, mode: 4 }] }) - 1;
  }

  node(name: string, mesh?: number, translation?: Vec3): number {
    return (this.json.nodes as Json[]).push({ name, ...(mesh === undefined ? {} : { mesh }), ...(translation === undefined ? {} : { translation }) }) - 1;
  }

  flap(name: string, nodes: [number, number], duration: number, amplitudes: number[]): void {
    const times = amplitudes.map((_, i) => duration * i / (amplitudes.length - 1));
    const input = this.accessor(times, "SCALAR");
    const rotations = (sign: number) => amplitudes.flatMap((angle) => [0, 0, Math.sin(angle * sign / 2), Math.cos(angle * sign / 2)]);
    const samplers = nodes.map((_, i) => ({ input, output: this.accessor(rotations(i === 0 ? -1 : 1), "VEC4"), interpolation: "LINEAR" }));
    const animations = (this.json.animations ??= []) as Json[];
    animations.push({ name, samplers, channels: nodes.map((node, sampler) => ({ sampler, target: { node, path: "rotation" } })) });
  }

  bytes(): Uint8Array {
    (this.json.buffers as Json[])[0]!.byteLength = this.length;
    const encoded = new TextEncoder().encode(JSON.stringify(this.json));
    const jsonLength = Math.ceil(encoded.length / 4) * 4;
    const output = new Uint8Array(12 + 8 + jsonLength + 8 + this.length);
    const data = new DataView(output.buffer);
    data.setUint32(0, 0x46546c67, true); data.setUint32(4, 2, true); data.setUint32(8, output.byteLength, true);
    data.setUint32(12, jsonLength, true); data.setUint32(16, 0x4e4f534a, true);
    output.fill(0x20, 20, 20 + jsonLength); output.set(encoded, 20);
    const binStart = 20 + jsonLength;
    data.setUint32(binStart, this.length, true); data.setUint32(binStart + 4, 0x004e4942, true);
    let offset = binStart + 8;
    for (const chunk of this.chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }
}

function swallow(): Glb {
  const glb = new Glb();
  const root = glb.node("Swallow");
  const body = new Mesh();
  body.ellipsoid([0, 0, 0.025], [0.12, 0.105, 0.265], (point) => point[1] < -0.025 ? BELLY : NAVY);
  body.ellipsoid([0, 0.063, -0.235], [0.09, 0.085, 0.125], (point) => point[1] < 0.055 && point[2] < -0.26 ? THROAT : NAVY);
  body.ellipsoid([-0.074, 0.082, -0.29], [0.017, 0.017, 0.017], () => DARK, 4, 6);
  body.ellipsoid([0.074, 0.082, -0.29], [0.017, 0.017, 0.017], () => DARK, 4, 6);
  body.sheet([[-0.042, 0.064, -0.335], [0.042, 0.064, -0.335], [0, 0.064, -0.413]], 0.015, DARK, DARK);
  body.sheet([[-0.055, 0.003, 0.205], [-0.19, 0.003, 0.59], [-0.019, 0.003, 0.435]], 0.014, NAVY, FEATHER);
  body.sheet([[0.055, 0.003, 0.205], [0.019, 0.003, 0.435], [0.19, 0.003, 0.59]], 0.014, NAVY, FEATHER);
  const bodyNode = glb.node("Pigmented body", glb.mesh("Swallow body and forked tail", body));
  const wings = [-1, 1].map((sign) => {
    const wing = new Mesh();
    wing.sheet([[0, 0, -0.12], [sign * 0.19, 0.015, -0.195], [sign * 0.61, -0.015, 0.035], [sign * 0.49, -0.015, 0.13], [sign * 0.37, 0, 0.147], [sign * 0.24, 0, 0.21], [sign * 0.07, 0, 0.18], [0, 0, 0.14]], 0.013, WING, FEATHER);
    return glb.node(sign < 0 ? "Wing_L" : "Wing_R", glb.mesh(sign < 0 ? "Left swept wing" : "Right swept wing", wing), [sign * 0.105, 0.025, -0.018]);
  }) as [number, number];
  (glb.json.nodes as Json[])[root]!.children = [bodyNode, ...wings];
  glb.flap("Idle", wings, 2.4, [0.035, -0.015, 0.035]);
  glb.flap("Flight", wings, 0.56, [-0.52, 0.54, -0.2, -0.52]);
  return glb;
}

function arrow(): Glb {
  const glb = new Glb();
  const arrow = new Mesh();
  const wood: Color = [0.37, 0.23, 0.12], steel: Color = [0.62, 0.67, 0.71], feather: Color = [0.74, 0.64, 0.4];
  const ring = (y: number, angle: number, radius = 0.008): Vec3 => [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * 2 * i / 8, b = Math.PI * 2 * (i + 1) / 8;
    arrow.face(ring(-0.9, a), ring(-0.13, a), ring(-0.13, b), wood);
    arrow.face(ring(-0.9, a), ring(-0.13, b), ring(-0.9, b), wood);
  }
  const nose: Vec3 = [0, 0, 0], base: Vec3 = [0, -0.17, 0];
  const head: Vec3[] = [[-0.036, -0.112, 0], [0, -0.112, 0.012], [0.036, -0.112, 0], [0, -0.112, -0.012]];
  for (let i = 0; i < 4; i++) { arrow.face(nose, head[i]!, head[(i + 1) % 4]!, steel); arrow.face(base, head[(i + 1) % 4]!, head[i]!, steel); }
  for (let featherIndex = 0; featherIndex < 3; featherIndex++) {
    const angle = featherIndex * Math.PI * 2 / 3;
    const p = (radius: number, y: number, thickness: number): Vec3 => [Math.cos(angle) * radius - Math.sin(angle) * thickness, y, Math.sin(angle) * radius + Math.cos(angle) * thickness];
    const outline = [[0.008, -0.89], [0.052, -0.856], [0.038, -0.7], [0.008, -0.676]];
    const front = outline.map(([r, y]) => p(r!, y!, 0.002));
    const back = outline.map(([r, y]) => p(r!, y!, -0.002));
    arrow.face(front[0]!, front[1]!, front[2]!, feather); arrow.face(front[0]!, front[2]!, front[3]!, feather);
    arrow.face(back[0]!, back[2]!, back[1]!, feather); arrow.face(back[0]!, back[3]!, back[2]!, feather);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; arrow.face(front[i]!, back[i]!, back[j]!, feather); arrow.face(front[i]!, back[j]!, front[j]!, feather); }
  }
  glb.node("Arrow nose +Y", glb.mesh("Wood shaft, steel head and three feathers", arrow));
  return glb;
}

const started = performance.now();
const destination = fileURLToPath(new URL("../public/models/", import.meta.url));
await mkdir(destination, { recursive: true });
for (const [name, glb] of [["authored-swallow", swallow()], ["authored-arrow", arrow()]] as const) {
  const bytes = glb.bytes();
  await writeFile(`${destination}/${name}.glb`, bytes);
  console.log(JSON.stringify({ file: `${name}.glb`, bytes: bytes.byteLength, meshes: (glb.json.meshes as Json[]).length, vertices: (glb.json.accessors as Json[]).filter((v) => v.type === "VEC3" && (glb.json.bufferViews as Json[])[v.bufferView as number]?.target === 34962).reduce((sum, v) => sum + (v.count as number), 0) / 3,
    clips: glb.json.animations === undefined ? [] : (glb.json.animations as Json[]).map((clip) => clip.name) }));
}
console.log(`Authored assets built in ${(performance.now() - started).toFixed(2)} ms`);
