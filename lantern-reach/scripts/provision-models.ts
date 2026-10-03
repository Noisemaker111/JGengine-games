import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import provenance from "./model-provenance.json";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--from")) {
  throw new Error("Usage: bun scripts/provision-models.ts [--from <historical model directory>]");
}
const sourceDir = args[1];
const targetDir = fileURLToPath(new URL("../public/models/lantern-reach/", import.meta.url));
let copied = 0;
let bytes = 0;
for (const model of provenance.models) {
  const target = join(targetDir, model.path);
  const valid = (data: Uint8Array): boolean => data.byteLength === model.bytes &&
    createHash("sha256").update(data).digest("hex") === model.sha256;
  const existing = await readFile(target).catch(() => null);
  if (existing !== null && valid(existing)) {
    bytes += existing.byteLength;
    continue;
  }
  let data: Uint8Array;
  if ("authoredFile" in model) data = await readFile(new URL(model.authoredFile, import.meta.url));
  else if (sourceDir !== undefined) data = await readFile(join(sourceDir, model.path));
  else {
    const response = await fetch(provenance.sourceBase + ("sourcePath" in model ? model.sourcePath : model.path));
    if (!response.ok) throw new Error(`${model.path}: HTTP ${response.status}`);
    data = new Uint8Array(await response.arrayBuffer());
  }
  if (!valid(data)) throw new Error(`${model.path}: source bytes do not match the reviewed SHA-256/size.`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
  copied++;
  bytes += data.byteLength;
}
console.log(`${provenance.models.length} verified model/map files, ${bytes} bytes; ${copied} provisioned into ${targetDir}`);
