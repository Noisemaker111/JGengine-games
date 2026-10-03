import { createEditorHost } from "../../field-station/node_modules/@jgengine/editor/dist/session.js";
import { routeToolCall } from "../../field-station/node_modules/@jgengine/editor/dist/agent/toolBridge.js";

const scenePath = new URL("../../field-station/src/editor.scene.json", import.meta.url);
const host = createEditorHost({ gameId: "field-station", layers: await Bun.file(scenePath).json() });
try {
  const result = routeToolCall(host.api, {
    id: "yard-height", name: "set_meta",
    arguments: { id: "base_turf", patch: { bladeHeight: 0.15 } },
  });
  console.log(JSON.stringify(result));
  if (!result.ok || !result.mutated) throw new Error("Yard-height authoring failed or did not mutate");
  const exported = routeToolCall(host.api, { id: "export", name: "export_document", arguments: {} });
  if (!exported.ok || typeof exported.result?.json !== "string") throw new Error("Editor export failed");
  await Bun.write(scenePath, exported.result.json + "\n");
} finally {
  host.dispose();
}
