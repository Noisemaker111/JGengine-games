#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadArchive, extractGlbs } from "@jgengine/assets/download";
import { extractMaterialMaps } from "@jgengine/assets/materials";
import { sourceById } from "@jgengine/assets/sources/index";
import { ASSET_SOURCE_IDS } from "../src/game/assets.ts";

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(gameRoot, "assets.lock.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const args = process.argv.slice(2);
const verifyOnly = args.includes("--verify");
let cacheRoot;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--verify") continue;
  if (args[i] === "--cache" && args[i + 1] && !args[i + 1].startsWith("--")) {
    cacheRoot = resolve(args[++i]);
    continue;
  }
  throw new Error("Usage: bun scrap-signal/scripts/provision-assets.mjs [--verify] [--cache <archive-directory>]");
}

const installedPackage = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.resolve("@jgengine/assets"))), "../package.json"), "utf8"));
if (manifest.schemaVersion !== 1 || manifest.game !== "scrap-signal" || manifest.extractor.package !== installedPackage.name || manifest.extractor.version !== installedPackage.version) {
  throw new Error(`Asset manifest requires ${manifest.extractor.package}@${manifest.extractor.version}; installed ${installedPackage.name}@${installedPackage.version}. Use the committed frozen lockfile.`);
}
const ids = manifest.sources.map((source) => source.id);
if (new Set(ids).size !== ids.length || [...ids].sort().join("\n") !== [...ASSET_SOURCE_IDS].sort().join("\n")) {
  throw new Error("Asset manifest must cover exactly Scrap Signal's credited ASSET_SOURCE_IDS.");
}

let filesChecked = 0;
for (const source of manifest.sources) {
  const credited = sourceById.get(source.id);
  if (!credited || credited.author !== source.author || credited.license !== source.license || credited.homepage !== source.homepage) {
    throw new Error(`Manifest provenance disagrees with the published catalog: ${source.id}`);
  }
  const category = source.kind === "material" ? "materials" : "models";
  const target = join(gameRoot, "public", category, source.id);
  const names = source.files.map((file) => file.file);
  if (new Set(names).size !== names.length || names.some((file) => !file || file.includes("/") || file.includes("\\") || file === "." || file === "..")) {
    throw new Error(`Manifest contains unsafe or duplicate filenames: ${source.id}`);
  }
  const invalid = source.files.filter((file) => {
    const path = join(target, file.file);
    if (!existsSync(path)) return true;
    const bytes = readFileSync(path);
    return bytes.length !== file.bytes || hash(bytes) !== file.sha256;
  });
  if (invalid.length > 0) {
    if (verifyOnly) throw new Error(`${source.id}: missing or changed file(s): ${invalid.map((file) => file.file).join(", ")}. Run the provisioning command.`);
    const cachedArchive = cacheRoot && join(cacheRoot, `${source.id}.zip`);
    console.log(`${source.id}: ${cachedArchive && existsSync(cachedArchive) ? "reading pinned archive cache" : `downloading ${source.archive.url}`}`);
    const archive = cachedArchive && existsSync(cachedArchive) ? readFileSync(cachedArchive) : await downloadArchive(source.archive.url);
    if (archive.length !== source.archive.bytes || hash(archive) !== source.archive.sha256) {
      throw new Error(`${source.id}: archive SHA-256/size mismatch; refusing changed source bytes. Expected ${source.archive.sha256}.`);
    }
    const extracted = source.kind === "material" ? extractMaterialMaps(archive) : (() => {
      const pack = extractGlbs(archive);
      return [...pack.models, ...pack.images];
    })();
    const byName = new Map(extracted.map((file) => [file.file, file.bytes]));
    if (byName.size !== extracted.length || byName.size !== source.files.length) throw new Error(`${source.id}: extracted file set differs from manifest.`);
    for (const file of source.files) {
      const bytes = byName.get(file.file);
      if (!bytes || bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error(`${source.id}/${file.file}: extracted SHA-256/size mismatch.`);
    }
    // Check the entire archive and extraction before writing any served bytes.
    mkdirSync(dirname(target), { recursive: true });
    const staging = mkdtempSync(join(dirname(target), `.${source.id}-`));
    try {
      for (const [name, bytes] of byName) writeFileSync(join(staging, name), bytes);
      mkdirSync(target, { recursive: true });
      for (const name of names) renameSync(join(staging, name), join(target, name));
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    if (cachedArchive && !existsSync(cachedArchive)) {
      mkdirSync(cacheRoot, { recursive: true });
      writeFileSync(cachedArchive, archive);
    }
  }
  filesChecked += source.files.length;
  console.log(`${source.id}: ${source.files.length} pinned files verified (${source.author}, ${source.license})`);
}
console.log(`Scrap Signal: ${manifest.sources.length} credited packs / ${filesChecked} files ready in scrap-signal/public.`);
