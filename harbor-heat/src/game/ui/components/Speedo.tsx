import { formatSpeed } from "@jgengine/core/format/speed";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameStore } from "@jgengine/react/hooks";
import { KitActionPrompt, KitPanel } from "@jgengine/react/uiKitRoot";
import { vehicleById } from "../../entities/vehicles/catalog";
import { drivingStore, handrollOf } from "../../handroll";

function speedoView(ctx: GameContext) {
  const id = drivingStore.read(ctx);
  if (id == null) return null;
  const t = handrollOf(ctx).telemetry();
  const name = ctx.scene.entity.get(id)?.name;
  const air = t.mode !== "aircraft" ? null : t.stalled ? "Stalling: lower the nose" : `${Math.round(t.altitude)} m up`;
  return { label: (name === undefined ? undefined : vehicleById(name)?.label) ?? "Vehicle", kmh: formatSpeed(t.speedMs, { unit: "kmh", decimals: 0, showUnit: false }), air, stalled: t.stalled, vtol: t.mode === "aircraft" && t.vtol };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only while driving: the car, its speed, and how to get out. */
export function Speedo() {
  const view = useGameStore(speedoView, same);
  if (view === null) return null;
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "end" }}>
      <KitPanel variant="hud" tone={view.stalled ? "bad" : "neutral"} title={view.label} style={{ minWidth: 150 }}>
        <span style={{ font: "400 calc(30px * var(--kit-text)) / 1 var(--kit-font-display)" }}>{view.kmh}</span> km/h
        {view.air === null ? null : <div>{view.air}</div>}
      </KitPanel>
      {view.vtol ? <KitActionPrompt action="flightVectorToggle" label="Switch to wings" /> : null}
      <KitActionPrompt action="exitVehicle" label="Get out" />
    </div>
  );
}
