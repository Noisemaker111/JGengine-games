import { createEditorHost } from "../../field-station/node_modules/@jgengine/editor/dist/session.js";
import { routeToolCall } from "../../field-station/node_modules/@jgengine/editor/dist/agent/toolBridge.js";

const scenePath = new URL("../../field-station/src/editor.scene.json", import.meta.url);
const scene = await Bun.file(scenePath).json();
const host = createEditorHost({ gameId: "field-station", layers: scene });
const calls = [
  { name: "dispatch", arguments: { command: { type: "setEnvironment", environment: {
    preset: "day", timeOfDay: false,
    horizonColor: "#e5d8b8", zenithColor: "#719db6",
    sunIntensity: 1.15, ambientIntensity: 0.65,
    fog: { near: 500, far: 2500, color: "#c3d3cf" },
    source: { kind: "gradient", sky: "#9abdd1", ground: "#596345", sun: "#fff0cc", intensity: 0.8 },
  } } } },
  { name: "set_meta", arguments: { id: "base_turf", patch: {
    density: 48, bladeHeight: 0.3, colorBase: "#526d39", colorTip: "#b0bc72", colorVariation: 0.4,
  } } },
  { name: "set_meta", arguments: { id: "meadow_1", patch: {
    density: 92, bladeHeight: 0.65, colorBase: "#466c3c", colorTip: "#b6bd70", colorVariation: 0.5,
  } } },
  { name: "set_meta", arguments: { id: "pond_1", patch: {
    color: "#204f61", shallowColor: "#628f85", reflectivity: 0.45,
  } } },
  { name: "add_marker", arguments: { id: "survey_station", kind: "survey_point", x: 0, y: 0, z: 10, color: "#e5d8b8", label: "Field notebook station", meta: { role: "station", triggerRadius: 3 } } },
  { name: "add_marker", arguments: { id: "survey_meadow", kind: "survey_point", x: 26, y: 0, z: 12, color: "#b6bd70", label: "Meadow observation", meta: { role: "sample", sample: "meadow", triggerRadius: 3 } } },
  { name: "add_marker", arguments: { id: "survey_water", kind: "survey_point", x: -8.5, y: 0, z: 8, color: "#628f85", label: "Pond observation", meta: { role: "sample", sample: "water", triggerRadius: 3 } } },
  { name: "add_marker", arguments: { id: "survey_hazard", kind: "survey_point", x: 14, y: 0, z: 12, color: "#e58b44", label: "Scorched ground observation", meta: { role: "sample", sample: "hazard", triggerRadius: 2 } } },
];
for (const [index, call] of calls.entries()) {
  const result = routeToolCall(host.api, { id: String(index), ...call });
  console.log(JSON.stringify(result));
  if (!result.ok || !result.mutated) throw new Error(`RPC ${call.name} failed or did not mutate`);
}
const exported = routeToolCall(host.api, { id: "export", name: "export_document", arguments: {} });
if (!exported.ok || typeof exported.result?.json !== "string") throw new Error("Editor export failed");
await Bun.write(scenePath, exported.result.json + "\n");
host.dispose();
