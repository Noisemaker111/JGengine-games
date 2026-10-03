import { MinimapPanel } from "@jgengine/react/map";
import { useGameClock, useLiveMarkers } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { editorLayers } from "../../../editorLayers";
import { isMobInstance } from "../../ai/mobs";
import { NPCS } from "../../entities/npcs/catalog";
import { useZoneName } from "./Overlays";

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function ClockReadout() {
  const { calendar } = useGameClock();
  return (
    <span>
      {pad(calendar.hour)}:{pad(calendar.minute)}
    </span>
  );
}

const QUESTGIVER_IDS = new Set(
  NPCS.filter((npc) => npc.kind === "questgiver").map((npc) => `npc:${npc.id}`),
);

export function Minimap({ expanded = false }: { expanded?: boolean }) {
  const ctx = useGameContext();
  const markers = useLiveMarkers((markers, ctx) => {
    for (const entity of ctx.scene.entity.list()) {
      if (entity.id === ctx.player.userId) continue;
      if (isMobInstance(ctx, entity.id)) {
        markers.add({ kind: "enemy", position: entity.position });
      } else if (NPCS.some((npc) => entity.id === `npc:${npc.id}`)) {
        markers.add({
          kind: QUESTGIVER_IDS.has(entity.id) ? "objective" : "location",
          position: entity.position,
        });
      }
    }
    for (const item of ctx.scene.worldItem.list()) {
      const position = ctx.scene.entity.get(item.instanceId)?.position;
      if (position !== undefined) markers.add({ kind: "loot", position });
    }
  });

  const player = ctx.scene.entity.get(ctx.player.userId);
  const zoneName = useZoneName();
  if (player === null) return null;

  return (
    <div className="lantern-panel lantern-survey-map">
    <MinimapPanel
      markers={markers}
      center={[player.position[0], player.position[2]]}
      worldRadius={46}
      size={expanded ? 260 : 124}
      headerClassName="lantern-map-header"
      zoneLabelClassName="lantern-map-zone"
      clockClassName="lantern-map-clock"
      style={{ background: "transparent", border: "none", padding: 0, boxShadow: "none" }}
      facingYaw={player.rotationY}
      rotate
      zoneLabel={expanded ? zoneName ?? "Survey map" : "Survey"}
      showCompass={false}
      kindStyles={{ objective: { id: "objective", priority: 3, color: "#f1d593", glyph: "◆" }, location: { id: "location", priority: 1, glyph: "●", color: "#cad7b8" }, enemy: { id: "enemy", priority: 2, glyph: "●", color: "#ee8873" }, loot: { id: "loot", priority: 1, glyph: "◆", color: "#afbbda" } }}
      clock={<ClockReadout />}
      compassProps={{ width: 168 }}
      background={editorLayers.minimap?.background}
      mapBounds={editorLayers.minimap?.bounds}
    />
    </div>
  );
}
