import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useState } from "react";
import type { Waypoint } from "@jgengine/core/ui/screenMarkers";
import { grounded } from "@jgengine/core/world/grounded";
import { useQuestJournal } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { WaypointMarkers } from "@jgengine/react/waypointMarkers";
import { useWorldProjection } from "@jgengine/shell/world/WorldEntityFrames";
import { FERRALON } from "../palette";
import { QUEST_ZONE_GUIDES } from "../quests/catalog";
import { zoneById } from "./zones";

/** Points each active quest's current step at its zone: an edge arrow with distance, or a pin once in view. */
export function QuestWaypoints() {
  const ctx = useGameContext();
  const size = useThree((state) => state.size);
  const project = useWorldProjection();
  const journal = useQuestJournal();
  // Projection follows the camera, so the markers are laid out again every frame.
  const [, setFrame] = useState(0);
  useFrame(() => setFrame((n) => n + 1));

  const waypoints = journal.flatMap((entry): Waypoint[] => {
    const zoneId = entry.status === "active" ? QUEST_ZONE_GUIDES[entry.questId] : undefined;
    const zone = zoneId === undefined ? undefined : zoneById(zoneId);
    if (zone === undefined) return [];
    return [{ id: entry.questId, kind: "objective", label: zone.name, position: grounded(ctx, zone.center.x, zone.center.z) }];
  });
  if (waypoints.length === 0) return null;

  const distanceOf = (waypoint: Waypoint) => {
    const player = ctx.scene.entity.get(ctx.player.userId)?.position;
    if (player === undefined) return undefined;
    const [x, y, z] = waypoint.position;
    return Math.hypot(x - player[0], y - player[1], z - player[2]);
  };

  return (
    <Html
      fullscreen
      calculatePosition={(_object, _camera, viewport) => [viewport.width / 2, viewport.height / 2]}
      zIndexRange={[19, 0]}
      style={{ pointerEvents: "none" }}
    >
      <WaypointMarkers
        entries={waypoints}
        project={project}
        viewport={size}
        distanceOf={distanceOf}
        kindColors={{ objective: FERRALON.hudAmber }}
      />
    </Html>
  );
}
