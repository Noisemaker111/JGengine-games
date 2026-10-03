/** Offline editor-prefab bake, bounded fallback for jgengine#1937. No runtime geometry. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { pathToFileURL } from "node:url";

const check = process.argv.includes("--check");
const game = new URL("../", import.meta.url);
const manifestFile = new URL("scripts/model-provenance.json", game);
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const scene = JSON.parse(await readFile(new URL("src/editor.scene.json", game), "utf8"));
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
// Tool dependencies stay outside the checkout. Pin all three GLTFTransform packages to
// the same version, including the functions package's otherwise ranged core dependency.
const tools = pathJoin(tmpdir(), "lantern-reach-gltf-transform-4.2.1");
await mkdir(tools, { recursive: true });
await writeFile(pathJoin(tools, "package.json"), JSON.stringify({ private: true, dependencies: {
  "@gltf-transform/core": "4.2.1", "@gltf-transform/functions": "4.2.1", "@gltf-transform/extensions": "4.2.1",
}, overrides: { "@gltf-transform/core": "4.2.1", "@gltf-transform/extensions": "4.2.1" } }, null, 2));
if (!await Bun.file(pathJoin(tools, "node_modules/@gltf-transform/core/dist/index.modern.js")).exists()) {
  await writeFile(pathJoin(tools, "package-lock.json"), await readFile(new URL("settlement-tools.package-lock.json", import.meta.url)));
  const install = Bun.spawn(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"], { cwd: tools, stdout: "inherit", stderr: "inherit" });
  const status = await install.exited;
  if (status !== 0) throw new Error("Offline authoring tool installation failed");
}
const { NodeIO, Document } = await import(pathToFileURL(pathJoin(tools, "node_modules/@gltf-transform/core/dist/index.modern.js")).href);
const { mergeDocuments, dedup, join, flatten, weld, getBounds, unpartition } = await import(pathToFileURL(pathJoin(tools, "node_modules/@gltf-transform/functions/dist/functions.modern.js")).href);
const io = new NodeIO();
// Encode directly: generic SDK packing strips image directories. These GLBs must
// retain the manifest's full shared-map URLs, rather than duplicate large textures.
function encodeGlb(json: any, binary: Uint8Array): Buffer {
  delete json.buffers[0].uri;
  const text = Buffer.from(JSON.stringify(json));
  const jsonSize = Math.ceil(text.length / 4) * 4;
  const binSize = Math.ceil(binary.length / 4) * 4;
  const glb = Buffer.alloc(12 + 8 + jsonSize + 8 + binSize);
  glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonSize, 12); glb.writeUInt32LE(0x4e4f534a, 16);
  glb.fill(0x20, 20, 20 + jsonSize); text.copy(glb, 20);
  glb.writeUInt32LE(binSize, 20 + jsonSize); glb.writeUInt32LE(0x004e4942, 24 + jsonSize);
  Buffer.from(binary).copy(glb, 28 + jsonSize);
  return glb;
}
const authored = manifest.models.filter((asset: any) => asset.authoredFile);
for (const asset of authored) {
  const prefab = scene.prefabs.find((entry: any) => entry.id === asset.sourcePrefabId);
  if (!prefab) throw new Error(`Missing editor prefab ${asset.sourcePrefabId}`);
  const document = new Document();
  const target = document.createScene(prefab.name);
  document.getRoot().setDefaultScene(target);
  for (const part of prefab.fragment.markers) {
    const model = manifest.models.find((entry: any) => entry.dims && `lantern:${entry.path.split("/").at(-1).slice(0, -4)}` === part.catalogId);
    if (!model || model.authoredFile) throw new Error(`Expected original source asset for ${part.id}`);
    const file = new URL(`public/models/lantern-reach/${model.path}`, game);
    const bytes = await readFile(file);
    if (bytes.length !== model.bytes || hash(bytes) !== model.sha256) throw new Error(`Provision or verify ${model.path} before export`);
    const source = await io.read(file.pathname);
    const map = mergeDocuments(document, source);
    const rotation = part.rotationY ?? 0;
    const pivot = document.createNode(part.id).setTranslation([part.position.x, part.position.y + (part.meta?.verticalOffset ?? 0), part.position.z]).setRotation([0, Math.sin(rotation / 2), 0, Math.cos(rotation / 2)]);
    for (const sourceScene of source.getRoot().listScenes()) {
      for (const node of sourceScene.listChildren()) pivot.addChild(map.get(node));
      map.get(sourceScene).dispose();
    }
    target.addChild(pivot);
  }
  await document.transform(dedup(), flatten(), join({ keepNamed: false }), weld(), unpartition());
  for (const texture of document.getRoot().listTextures()) {
    const name = texture.getURI().split("/").at(-1);
    const map = manifest.models.find((entry: any) => entry.path === `scenery/${name}`);
    if (!map) throw new Error(`Unpinned material image ${name}`);
    const bytes = await readFile(new URL(`public/models/lantern-reach/${map.path}`, game));
    if (bytes.length !== map.bytes || hash(bytes) !== map.sha256) throw new Error(`Unverified material image ${name}`);
    texture.setURI(`/models/lantern-reach/${map.path}`);
  }
  const output = await io.writeJSON(document);
  const bytes = encodeGlb(output.json, output.resources[output.json.buffers[0].uri]);
  const bounds = getBounds(target);
  const metadata = { bytes: bytes.length, sha256: hash(bytes), sourcePrefabSha256: hash(JSON.stringify(prefab.fragment)),
    draws: document.getRoot().listMeshes().reduce((n: number, mesh: any) => n + mesh.listPrimitives().length, 0),
    dims: { footprint: { w: bounds.max[0] - bounds.min[0], d: bounds.max[2] - bounds.min[2] }, center: { x: (bounds.max[0] + bounds.min[0]) / 2, z: (bounds.max[2] + bounds.min[2]) / 2 }, minY: bounds.min[1], maxY: bounds.max[1] },
  };
  const artifact = new URL(asset.authoredFile, manifestFile);
  if (check) {
    const committed = await readFile(artifact);
    if (hash(committed) !== metadata.sha256 || Object.entries(metadata).some(([key, value]) => JSON.stringify(asset[key]) !== JSON.stringify(value))) throw new Error(`Stale export ${asset.path}: rerun without --check`);
  } else {
    await writeFile(artifact, bytes);
    Object.assign(asset, metadata);
  }
  console.log(`${check ? "Verified" : "Exported"} ${asset.path}: ${metadata.draws} material groups, ${metadata.bytes} bytes`);
}
if (!check) await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
