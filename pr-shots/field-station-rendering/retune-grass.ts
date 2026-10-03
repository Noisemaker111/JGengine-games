import { createEditorHost } from "../../field-station/node_modules/@jgengine/editor/dist/session.js";
import { routeToolCall } from "../../field-station/node_modules/@jgengine/editor/dist/agent/toolBridge.js";
const scenePath = new URL("../../field-station/src/editor.scene.json", import.meta.url);
const host = createEditorHost({ gameId: "field-station", layers: await Bun.file(scenePath).json() });
for (const [id, density] of [["base_turf", 18], ["meadow_1", 42]] as const) {
  const result = routeToolCall(host.api, { id, name: "set_meta", arguments: { id, patch: { density } } });
  console.log(JSON.stringify(result));
  if (!result.ok || !result.mutated) throw new Error(`Density authoring failed: ${id}`);
}
const result = routeToolCall(host.api, { id: "export", name: "export_document", arguments: {} });
if (!result.ok || typeof result.result?.json !== "string") throw new Error("Editor export failed");
await Bun.write(scenePath, result.result.json + "\n");
host.dispose();
