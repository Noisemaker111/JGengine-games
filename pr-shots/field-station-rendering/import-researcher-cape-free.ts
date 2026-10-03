import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the published assets pull output: models/kaykit-adventurers/Rogue.glb");
const source = readFileSync(sourcePath);
const sourceSha256 = createHash("sha256").update(source).digest("hex");
if (sourceSha256 !== "e825437cd4d2ee9c1960b517a74a69101e33eb409ae7fa8cedc7134a998fbb7d") {
  throw new Error(`Source changed: review license, meshes and animations before replacing ${sourceSha256}`);
}

const jsonLength = source.readUInt32LE(12);
const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const accessories = new Set(["Knife", "Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Throwable", "Rogue_Cape"]);
const clips = ["Idle", "Walking_A", "Running_A", "Jump_Idle", "Jump_Start", "Jump_Land", "Hit_A", "Death_A"];
for (const node of document.nodes) {
  if (accessories.has(node.name)) delete node.mesh;
}
document.animations = document.animations.filter((animation: { name: string }) => clips.includes(animation.name));
if (document.animations.length !== clips.length) throw new Error("Source no longer contains the reviewed movement clips");

const sourceMinY = -0.000026527046429691836;
const sourceHeight = 2.186978340148926 - sourceMinY;
const authorScale = 1.8 / sourceHeight;
for (const index of document.scenes[document.scene ?? 0].nodes) {
  const node = document.nodes[index];
  node.scale = (node.scale ?? [1, 1, 1]).map((component: number) => component * authorScale);
  node.translation = node.translation ?? [0, 0, 0];
  node.translation[1] -= sourceMinY * authorScale;
}
document.asset.extras = { source: "KayKit Adventurers / Rogue", author: "Kay Lousberg", license: "CC0-1.0", adaptation: "Field Station: unarmed, cape removed to expose workwear and boots, 1.8m, eight movement/reaction clips" };

const json = Buffer.from(JSON.stringify(document));
const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
json.copy(paddedJson);
const binaryChunk = source.subarray(20 + jsonLength);
const header = Buffer.alloc(20);
header.write("glTF");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + paddedJson.length + binaryChunk.length, 8);
header.writeUInt32LE(paddedJson.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);

const scratch = mkdtempSync(join(tmpdir(), "field-station-researcher-"));
try {
  const draft = join(scratch, "researcher.glb");
  writeFileSync(draft, Buffer.concat([header, paddedJson, binaryChunk]));
  execFileSync("bunx", ["@gltf-transform/cli@4.3.0", "prune", draft, new URL("../public/models/explorer.glb", import.meta.url).pathname], { stdio: "inherit" });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
