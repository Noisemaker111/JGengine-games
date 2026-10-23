import { useEffect, useState } from "react";
import { MinimapChrome, useMarkers, type MinimapChromeMarker } from "@jgengine/react/map";
import { useLiveMarkers } from "@jgengine/react/hooks";
import { projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";

import { enemyDrawn, fogLevel, fogSnapshot, FOG_ALPHA, type FogCellsSnapshot } from "../../fog";
import { session } from "../../session";

const SIZE = 168;
const RADIUS = 48; // battlefield is 96×96 centred on the origin, so ±48 fills the frame

// North-up, origin-centred view. `projectToMinimap([x,z], VIEW)` reproduces the old
// `toMap` mapping exactly: ((v + 48) / 96) * 168 === 84 + 1.75·v.
const VIEW: MinimapView = { center: [0, 0], worldRadius: RADIUS, size: SIZE };

interface Blip {
  color: string;
  radius: number;
  stroke: boolean;
}

/** Dot palette per marker kind — same faction colours and blip sizes as the old radar. */
const BLIP: Record<string, Blip> = {
  playerHero: { color: "#ffd24a", radius: 3.4, stroke: false },
  playerBuilding: { color: "#5b9bff", radius: 4, stroke: true },
  playerUnit: { color: "#5b9bff", radius: 2.4, stroke: false },
  enemyHero: { color: "#f0603f", radius: 3.4, stroke: false },
  enemyBuilding: { color: "#f0603f", radius: 4, stroke: true },
  enemyUnit: { color: "#f0603f", radius: 2.4, stroke: false },
  goldmine: { color: "#e8c14a", radius: 2.6, stroke: false },
};

/** The fog grids, re-read on the fog tick (5 Hz) so the map never shows a stale sightline. */
function useFogSnapshot(): FogCellsSnapshot | null {
  const [snapshot, setSnapshot] = useState<FogCellsSnapshot | null>(() => fogSnapshot(session.fog));
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = fogSnapshot(session.fog);
      setSnapshot((prev) => (prev !== null && prev.visible === next.visible && prev.explored === next.explored ? prev : next));
    }, 200);
    return () => window.clearInterval(timer);
  }, []);
  return snapshot;
}

/** One SVG path per fog state: solid over ground never seen, dimmed over ground explored but out of
 * sight now. Cells seen this tick are left alone so the terrain (and the blips on it) reads clearly. */
function fogPaths(snapshot: FogCellsSnapshot): { unseen: string; explored: string } {
  const cells = snapshot.explored;
  const seen = snapshot.visible.revealed;
  const pxPerWorld = SIZE / 2 / RADIUS;
  const cellPx = cells.cellSize * pxPerWorld;
  const unseen: string[] = [];
  const explored: string[] = [];
  for (let row = 0; row < cells.rows; row += 1) {
    for (let col = 0; col < cells.cols; col += 1) {
      const index = row * cells.cols + col;
      if (seen[index] === true) continue;
      const at = projectToMinimap(
        [cells.minX + (col + 0.5) * cells.cellSize, cells.minZ + (row + 0.5) * cells.cellSize],
        VIEW,
      );
      const x = (at.x - cellPx / 2).toFixed(1);
      const y = (at.y - cellPx / 2).toFixed(1);
      const d = `M${x} ${y}h${cellPx.toFixed(1)}v${cellPx.toFixed(1)}h-${cellPx.toFixed(1)}z`;
      (cells.revealed[index] === true ? explored : unseen).push(d);
    }
  }
  return { unseen: unseen.join(""), explored: explored.join("") };
}

/** A live top-down radar built on the shared minimap primitives: own forces blue, hero gold,
 * Marauders red, gold seams amber. `useLiveMarkers` rescans scene poses each HUD tick;
 * faction/kind come from the session roster, then `MinimapChrome` plots the dots over the
 * game's own square battlefield frame. Fog of war: unseen ground is black, explored-but-unseen
 * ground is dimmed, and a Marauder unit outside Vanguard sight has no blip at all. */
export function Minimap() {
  const fog = useFogSnapshot();

  const markers = useLiveMarkers((set, ctx) => {
    for (const e of ctx.scene.entity.list()) {
      const unit = session.units.get(e.id);
      if (unit !== undefined) {
        const x = e.position[0];
        const z = e.position[2];
        // Enemy units stay off the map until a friendly eye reaches them.
        if (unit.faction === "enemy" && unit.kind === "unit" && !enemyDrawn(session.fog, x, z)) continue;
        const side = unit.faction === "player" ? "player" : "enemy";
        const role = unit.kind === "building" ? "Building" : unit.catalogId === "hero" ? "Hero" : "Unit";
        set.add({ id: e.id, kind: `${side}${role}`, position: e.position });
      } else if (e.name === "goldmine") {
        // Terrain the army has never reached is hidden entirely, seams included.
        if (fogLevel(session.fog, e.position[0], e.position[2]) === "unseen") continue;
        set.add({ id: e.id, kind: "goldmine", position: e.position });
      }
    }
  });

  const dots: MinimapChromeMarker[] = useMarkers(markers).map((m) => {
    const blip = BLIP[m.kind] ?? { color: "#5b9bff", radius: 2.4, stroke: false };
    return {
      id: m.id,
      position: m.position,
      color: blip.color,
      radius: blip.radius,
      ...(blip.stroke ? { strokeColor: "#0b1220", strokeWidth: 0.6 } : {}),
    };
  });

  const fogPaint = fog === null ? null : fogPaths(fog);

  return (
    <div className="rounded-lg border border-slate-500/40 bg-slate-900/80 p-1 shadow-lg backdrop-blur-sm">
      <svg width={SIZE} height={SIZE} className="block rounded" role="img" aria-label="Battlefield minimap">
        <rect x={0} y={0} width={SIZE} height={SIZE} fill="#25401f" rx={4} />
        <rect x={0} y={0} width={SIZE} height={SIZE / 2} fill="#3a2020" opacity={0.35} />
        {fogPaint !== null ? (
          <>
            <path d={fogPaint.unseen} fill="#0a0d12" opacity={FOG_ALPHA.unseen} />
            <path d={fogPaint.explored} fill="#0a0d12" opacity={FOG_ALPHA.explored} />
          </>
        ) : null}
        <MinimapChrome view={VIEW} markers={dots} />
      </svg>
    </div>
  );
}
