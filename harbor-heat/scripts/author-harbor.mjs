// Original Harbor Heat geometry. Rebuild with: node scripts/author-harbor.mjs
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';

// The exporter uses the browser FileReader contract for binary buffers only.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }); }
};
const out = new URL('../src/art/', import.meta.url);
await mkdir(out, { recursive: true });
const mat = (color, metalness = 0, emissive) => new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.4 : 0.82, metalness, ...(emissive ? { emissive: color, emissiveIntensity: emissive } : {}) });
const ink = mat('#173f49'), cream = mat('#ffe4ae'), coral = mat('#f37f63'), teal = mat('#38b6ac'), gold = mat('#f8b64b');
function mesh(group, geometry, material, position, rotation = [0, 0, 0]) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(...position); part.rotation.set(...rotation); group.add(part); return part;
}
const box = (g, m, x, y, z, w, h, d, rotation) => mesh(g, new THREE.BoxGeometry(w, h, d), m, [x, y, z], rotation);
const cylinder = (g, m, x, y, z, rt, rb, h, rotation) => mesh(g, new THREE.CylinderGeometry(rt, rb, h, 10), m, [x, y, z], rotation);
async function exportModel(name, group) {
  const data = await new GLTFExporter().parseAsync(group, { binary: true, copyright: 'Original Harbor Heat game art, authored for jgengine-games. Repository license applies.' });
  await writeFile(new URL(name + '.glb', out), Buffer.from(data));
  console.log(`${name}: ${data.byteLength} bytes`);
}

// Leaning, ringed coconut palm. Each frond is a tapered folded leaf with a drooping tip.
const palm = new THREE.Group();
const bark = [mat('#9b7050'), mat('#b78a60')];
for (let i = 0; i < 13; i++) {
  const y = i * 0.46 + 0.23, x = 0.055 * i;
  cylinder(palm, bark[i % 2], x, y, 0, 0.17 - i * 0.003, 0.2 - i * 0.003, 0.48, [0, 0, -0.12]);
  cylinder(palm, ink, x, y - 0.2, 0, 0.204 - i * 0.003, 0.204 - i * 0.003, 0.035, [0, 0, -0.12]);
}
const greens = [mat('#216d59'), mat('#399474'), mat('#62a66b')];
for (let i = 0; i < 9; i++) {
  const frond = new THREE.Group(); frond.position.set(0.7, 5.98, 0); frond.rotation.y = i * Math.PI * 2 / 9;
  const positions = [], indices = [];
  for (let j = 0; j < 7; j++) {
    const t = j / 6, width = Math.sin(t * Math.PI) * 0.36 + 0.015;
    const y = Math.sin(t * Math.PI) * 0.48 - t * t * 0.95;
    positions.push(-width, y, t * 3.0, 0, y + 0.09, t * 3.0, width, y, t * 3.0);
    if (j < 6) for (let k = 0; k < 2; k++) { const a = j * 3 + k; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = greens[i % 3].clone(); material.side = THREE.DoubleSide;
  mesh(frond, geometry, material, [0, 0, 0]); palm.add(frond);
}
for (let i = 0; i < 3; i++) mesh(palm, new THREE.SphereGeometry(0.17, 8, 6), bark[0], [0.65 + Math.sin(i * 2) * 0.24, 5.8, Math.cos(i * 2) * 0.24]);
await exportModel('mainsail-palm', palm);

// Art deco dispatch booth: rounded canopy, ribbed trim, service window and parcel lockers.
const kiosk = new THREE.Group();
box(kiosk, ink, 0, 0.12, 0, 3.5, 0.24, 2.7);
box(kiosk, teal, 0, 1.1, 0, 3, 1.95, 2.2);
box(kiosk, cream, 0, 2.25, 0, 3.4, 0.26, 2.5);
box(kiosk, coral, 0, 2.46, 0, 3.6, 0.17, 2.7);
box(kiosk, ink, 0, 1.56, 1.12, 2.5, 0.86, 0.06);
box(kiosk, cream, 0, 1.08, 1.4, 2.8, 0.12, 0.62);
for (let i = -3; i <= 3; i++) box(kiosk, cream, i * 0.36, 0.58, 1.12, 0.045, 0.6, 0.055);
for (let i = -1; i <= 1; i++) {
  box(kiosk, gold, i * 0.75, 1.5, 1.16, 0.5, 0.45, 0.09);
  box(kiosk, cream, i * 0.75, 1.51, 1.22, 0.24, 0.09, 0.04);
}
box(kiosk, ink, 0, 2.89, 0.5, 2.7, 0.65, 0.22);
// Three slanted chevrons on the rooftop plaque form the dispatch identity.
for (let i = -1; i <= 1; i++) {
  box(kiosk, gold, i * 0.7, 2.98, 0.63, 0.5, 0.08, 0.05, [0, 0, -0.45]);
  box(kiosk, gold, i * 0.7, 2.8, 0.63, 0.5, 0.08, 0.05, [0, 0, 0.45]);
}
await exportModel('dispatch-booth', kiosk);

for (const [index, color] of [coral, teal, gold].entries()) {
  const beacon = new THREE.Group();
  cylinder(beacon, ink, 0, 0.12, 0, 0.72, 0.85, 0.24);
  box(beacon, color, 0, 0.75, 0, 1.0, 1.25, 0.9);
  box(beacon, cream, 0, 0.95, 0.46, 0.76, 0.18, 0.045);
  box(beacon, ink, 0, 0.55, 0.46, 0.56, 0.12, 0.045);
  cylinder(beacon, ink, 0, 2.2, 0, 0.06, 0.08, 2.3);
  mesh(beacon, new THREE.TorusGeometry(0.56, 0.1, 6, 16), mat(color.color, 0.1, 0.7), [0, 3.3, 0]);
  box(beacon, cream, 0, 3.3, 0, 0.48, 0.31, 0.15);
  box(beacon, color, 0, 3.3, 0.086, 0.06, 0.31, 0.01);
  await exportModel(`parcel-tower-${index + 1}`, beacon);
}
