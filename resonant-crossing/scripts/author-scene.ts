import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createEditorHost, type EditorBridgeRequest } from "@jgengine/editor/session";
import { roomsFromDocument } from "../src/game/rooms/catalog";
import { decodeEditorDocument } from "@jgengine/core/editor/index";

const scenePath = fileURLToPath(new URL("../src/editor.scene.json", import.meta.url));
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const operationsPath = process.argv[2];
if (!operationsPath) throw new Error("Usage: bun scripts/author-scene.ts <rpc-operations.json> [--save]");
const decoded = decodeEditorDocument(JSON.parse(readFileSync(scenePath, "utf8")));
if (!decoded.ok) throw new Error(JSON.stringify(decoded.errors));
const operations = JSON.parse(readFileSync(operationsPath, "utf8")) as EditorBridgeRequest[];
const host = createEditorHost({ gameId: "resonant-crossing", layers: decoded.document });
const start = performance.now();
try {
  for (const operation of operations) {
    const response = host.api.handle(operation);
    if (!response.ok) throw new Error(`${operation.method}: ${response.error}`);
  }
  const document = host.session.getState().document;
  roomsFromDocument(document);
  const roundtrip = decodeEditorDocument(JSON.parse(host.session.exportJson(true)));
  if (!roundtrip.ok || canonical(roundtrip.document) !== canonical(document))
    throw new Error("Scene export changed the authored document");
  if (process.argv.includes("--save")) writeFileSync(scenePath, `${host.session.exportJson(true)}\n`);
  console.log(JSON.stringify({ operations: operations.length, elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    saved: process.argv.includes("--save"), grids: document.grids?.length, paths: document.paths.length,
    zones: document.volumes.length, markers: document.markers.length, roundtrip: "identical" }));
} finally { host.dispose(); }
