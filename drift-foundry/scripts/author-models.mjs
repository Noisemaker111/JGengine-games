// Original Drift Foundry geometry. Regenerate with node scripts/author-models.mjs.
// Flat-shaded steel, exposed running gear and a welded asymmetrical salvage silhouette.
import { BoxGeometry, CylinderGeometry, TorusGeometry, Vector3, Quaternion, Matrix4, Color } from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../src/game/art/', import.meta.url));
mkdirSync(output, { recursive: true });
const palette = ['#16282e', '#cc5936', '#edc565', '#758d96', '#eee0c4', '#20242a', '#5de0ce', '#ff4934'];
function author(name, build) {
  const groups = palette.map(() => ({ positions: [], normals: [] }));
  const add = (geo, color, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    geo.rotateX(rotation[0]); geo.rotateY(rotation[1]); geo.rotateZ(rotation[2]); geo.translate(...position);
    const triangles = geo.index ? geo.toNonIndexed() : geo;
    groups[color].positions.push(...triangles.attributes.position.array);
    groups[color].normals.push(...triangles.attributes.normal.array);
    geo.dispose(); if (triangles !== geo) triangles.dispose();
  };
  const box = (size, pos, color, rot) => add(new BoxGeometry(...size), color, pos, rot);
  const cylinder = (r, h, pos, color, rot = [0, 0, 0], top = r) => add(new CylinderGeometry(top, r, h, 12, 1), color, pos, rot);
  const tube = (a, b, r, color) => {
    const from = new Vector3(...a), to = new Vector3(...b), delta = to.clone().sub(from);
    const geo = new CylinderGeometry(r, r, delta.length(), 8);
    geo.applyMatrix4(new Matrix4().compose(from.add(to).multiplyScalar(.5), new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()), new Vector3(1, 1, 1)));
    add(geo, color);
  };
  const ring = (r, thickness, pos, color, rot) => add(new TorusGeometry(r, thickness, 6, 18), color, pos, rot);
  build({ box, cylinder, tube, ring });
  const buffers = [], views = [], accessors = [], primitives = [];
  let offset = 0;
  function attribute(values, bounds) {
    const bytes = Buffer.from(new Float32Array(values).buffer);
    const view = views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target: 34962 }) - 1;
    offset += bytes.length; buffers.push(bytes);
    const accessor = { bufferView: view, componentType: 5126, count: values.length / 3, type: 'VEC3' };
    if (bounds) {
      accessor.min = [Infinity, Infinity, Infinity]; accessor.max = [-Infinity, -Infinity, -Infinity];
      values.forEach((v, i) => { accessor.min[i % 3] = Math.min(accessor.min[i % 3], v); accessor.max[i % 3] = Math.max(accessor.max[i % 3], v); });
    }
    return accessors.push(accessor) - 1;
  }
  groups.forEach((group, material) => {
    if (group.positions.length) primitives.push({ attributes: { POSITION: attribute(group.positions, true), NORMAL: attribute(group.normals) }, material });
  });
  const materials = palette.map((hex, i) => {
    const c = new Color(hex);
    return { name: hex, pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: i === 5 ? .05 : .45, roughnessFactor: .62 }, ...(i > 5 ? { emissiveFactor: [c.r, c.g, c.b] } : {}) };
  });
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0', generator: 'Drift Foundry original geometry', copyright: 'JGengine Games contributors' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }], meshes: [{ primitives }], materials, buffers: [{ byteLength: offset }], bufferViews: views, accessors }));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bin = Buffer.concat(buffers);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + bin.length, 8);
  jh.writeUInt32LE(padded.length); jh.writeUInt32LE(0x4e4f534a, 4); bh.writeUInt32LE(bin.length); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(`${output}${name}.glb`, Buffer.concat([header, jh, padded, bh, bin]));
  console.log(`${name}: ${bin.length} geometry bytes, ${primitives.length} material groups`);
}

author('row-six-buggy', ({ box, cylinder, tube, ring }) => {
  box([1.55, .22, 2.8], [0, .48, 0], 0);
  box([1.35, .24, 1.0], [0, .74, .94], 1, [-.13, 0, 0]);
  box([.18, .025, 1.05], [-.36, .89, .94], 2, [-.13, 0, 0]);
  box([.18, .025, 1.05], [.36, .89, .94], 2, [-.13, 0, 0]);
  for (const x of [-.95, .95]) for (const z of [-1.03, 1.02]) {
    cylinder(.47, .34, [x, .48, z], 5, [0, 0, Math.PI / 2]);
    cylinder(.27, .36, [x, .48, z], 3, [0, 0, Math.PI / 2]);
    cylinder(.12, .38, [x, .48, z], 2, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; box([.36, .09, .18], [x, .48 + Math.cos(a) * .45, z + Math.sin(a) * .45], 0, [a, 0, 0]); }
    tube([x * .55, .5, z], [x, .48, z], .08, 3);
    tube([x * .7, .92, z], [x, .48, z], .05, 2);
  }
  for (const x of [-.66, .66]) {
    tube([x, .6, -.95], [x, 1.6, -.6], .065, 3);
    tube([x, 1.6, -.6], [x, 1.6, .25], .065, 3);
    tube([x, 1.6, .25], [x, .65, .6], .065, 3);
    tube([x, .7, -.8], [x, 1.4, .2], .04, 2);
    box([.06, .46, .9], [x, .83, -.1], 1);
    box([.18, .12, .1], [x, .71, -1.45], 7);
    box([.23, .13, .1], [x, .72, 1.51], 4);
  }
  tube([-.66, 1.6, -.6], [.66, 1.6, -.6], .065, 3);
  tube([-.66, 1.6, .25], [.66, 1.6, .25], .065, 3);
  tube([-.66, .75, -.95], [.66, 1.6, -.6], .045, 2);
  box([.65, .13, .6], [0, .73, -.2], 5);
  box([.65, .65, .12], [0, 1.02, -.52], 5, [-.15, 0, 0]);
  ring(.2, .035, [0, 1.06, .26], 0, [-.5, 0, 0]);
  box([.95, .34, .6], [0, .76, -1.02], 3);
  for (const x of [-.3, 0, .3]) cylinder(.09, .3, [x, 1.04, -1.06], 0);
  cylinder(.08, .7, [.5, 1.12, -1.1], 0, [0, 0, -.15]);
  tube([-.8, .45, 1.53], [.8, .45, 1.53], .08, 3);
  cylinder(.055, .9, [-.58, 1.85, -.64], 0);
  box([.34, .25, .04], [-.42, 2.13, -.64], 2);
});

for (const [name, color] of [['engine', 1], ['front', 2], ['wheels', 6], ['frame', 3]]) author(`pickup-${name}`, ({ box, tube, cylinder, ring }) => {
  cylinder(1.05, .16, [0, .08, 0], 0); ring(.94, .06, [0, .2, 0], color, [Math.PI / 2, 0, 0]);
  for (const x of [-.7, .7]) tube([x, .12, 0], [x, 1.8, 0], .055, color);
  tube([-.7, 1.8, 0], [.7, 1.8, 0], .055, color);
  if (name === 'engine') {
    box([.8, .55, .6], [0, .95, 0], 3);
    for (const x of [-.27, 0, .27]) cylinder(.11, .36, [x, 1.35, 0], color);
  } else if (name === 'wheels') {
    ring(.42, .13, [0, 1, 0], 5); ring(.23, .07, [0, 1, .07], color);
    for (let i = 0; i < 5; i++) ring(.2, .03, [.8, .45 + i * .18, .15], color, [Math.PI / 2, 0, 0]);
  } else if (name === 'front') {
    box([1.1, .55, .12], [0, 1, 0], color, [-.25, 0, 0]);
    for (const x of [-.35, 0, .35]) box([.13, .05, .16], [x, .72, .13], 0);
  } else {
    for (const x of [-.4, .4]) tube([x, .6, 0], [x, 1.4, 0], .08, color);
    tube([-.4, 1.4, 0], [.4, 1.4, 0], .08, color); tube([-.4, .6, 0], [.4, 1.4, 0], .05, 2);
  }
});

author('jump-barrier', ({ box, cylinder }) => {
  box([7.9, .52, .65], [0, .26, 0], 0);
  for (let x = -3.6; x <= 3.6; x += .8) box([.38, .54, .025], [x, .27, -.34], 2, [0, 0, -.4]);
  for (const x of [-3.8, 3.8]) { cylinder(.12, 1.8, [x, .9, 0], 3); box([.2, .18, .2], [x, 1.8, 0], 6); }
});

author('jump-cue', ({ box }) => {
  for (const z of [-3, 0, 3]) for (const side of [-1, 1]) box([2.6, .035, .28], [side * .9, .025, z], 6, [0, side * -.55, 0]);
});
