import { useGameStore, usePlayer } from "@jgengine/react/hooks";
import { HudFrame } from "@jgengine/react/hudFrame";
import { MinimapChrome, type MinimapChromeMarker } from "@jgengine/react/map";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { headingToBearing, projectToMinimap, type MinimapView } from "@jgengine/core/world/minimap";
import type { WorldBlip } from "@jgengine/core/worldModel/worldModel";
import { cityOf } from "../../cityRuntime";
import {
  BOUNTY_SPOTS,
  DISTRICTS,
  RACE_ROUTES,
  ROADS,
  SAFEHOUSE_POS,
  SHORE_X,
  STASH_SPOTS,
  districtAt,
} from "../../world/districts";
import { safehouseStore } from "../../commands";
import { bountyStore } from "../../jobs/bounties";
import { stashStore } from "../../jobs/stashes";
import { raceStore, wantedStore } from "../../handroll";
import { courierStore, DELIVERY_ROUTES, DISPATCH } from "../../jobs/courier";

const SIZE = 176;
const RADIUS = 130;

/** Map-ink per district, so the panel reads as Harbor Heat rather than as lines on a slab. */
const DISTRICT_TINTS: Record<string, string> = {
  mainsail_boulevard: "#dcc79b",
  downtown: "#a8a496",
  port_carmine: "#918e84",
  palm_heights: "#b9ad7e",
};

/** Sea and beach bands, in world XZ — the same coastline the terrain's shore falloff carves. */
const SEA_CORNERS: readonly (readonly [number, number])[] = [
  [SHORE_X - 22, -600],
  [-900, -600],
  [-900, 600],
  [SHORE_X - 22, 600],
];
const BEACH_CORNERS: readonly (readonly [number, number])[] = [
  [SHORE_X + 24, -600],
  [SHORE_X - 24, -600],
  [SHORE_X - 24, 600],
  [SHORE_X + 24, 600],
];

function polygonPoints(corners: readonly (readonly [number, number])[], view: MinimapView): string {
  return corners
    .map((corner) => {
      const point = projectToMinimap(corner, view);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");
}

interface MapSnapshot {
  player: readonly [number, number, number];
  heading: number;
  cops: readonly (readonly [number, number])[];
  blips: readonly WorldBlip[];
  /** Scared places: where the city is still reacting to something. */
  scared: readonly { x: number; z: number; radius: number; fear: number }[];
  stars: number;
  raceCheckpoint: number | null;
  raceRouteId: string | null;
  bountySpotId: string | null;
  safehouseOwned: boolean;
  stashesCollected: readonly string[];
  courierTarget: readonly [number, number];
  /** HHPD's last-sighting circle: where the witnesses lost you. */
  search: { center: readonly [number, number]; radius: number } | null;
}

function readMap(ctx: GameContext): MapSnapshot | null {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return null;
  const cops = ctx.scene.entity
    .list()
    .filter((e) => e.name.startsWith("cop_"))
    .map((e) => [e.position[0], e.position[2]] as const);
  const world = cityOf(ctx);
  const scared = (Object.keys(world.def.places ?? {}))
    .map((id) => ({ id, at: world.position(id), fear: world.num(`${id}.fear`), radius: world.def.places?.[id]?.radius ?? 30 }))
    .filter((place) => place.at !== null && place.fear >= 10)
    .map((place) => ({ x: place.at![0], z: place.at![1], radius: place.radius, fear: place.fear }));
  const wanted = wantedStore.read(ctx);
  const race = raceStore.read(ctx);
  const bounty = bountyStore.read(ctx);
  const courier = courierStore.read(ctx);
  return {
    player: player.position,
    heading: player.rotationY,
    cops,
    blips: world.blips(),
    scared,
    stars: wanted?.stars ?? 0,
    raceCheckpoint: race !== undefined && race.active ? race.checkpoint : null,
    raceRouteId: race !== undefined && race.active ? race.routeId : null,
    bountySpotId: bounty?.targetId !== null && bounty?.targetId !== undefined ? (bounty.spotId ?? null) : null,
    safehouseOwned: safehouseStore.read(ctx) === true,
    stashesCollected: stashStore.read(ctx) ?? [],
    courierTarget: courier.phase === "running" ? DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!.position : DISPATCH,
    search: wanted?.search ?? null,
  };
}

const BLIP_STYLE: Record<WorldBlip["kind"], { color: string; radius: number }> = {
  objective: { color: "#ffb020", radius: 5.5 },
  job: { color: "#ffe066", radius: 5 },
  person: { color: "#f4e8c8", radius: 4 },
  place: { color: "#c23b3b", radius: 4 },
  thing: { color: "#4fa5e8", radius: 4 },
};

export function CityMinimap() {
  usePlayer();
  const snapshot = useGameStore(readMap);
  if (snapshot === null) return null;
  const view: MinimapView = {
    center: [snapshot.player[0], snapshot.player[2]],
    worldRadius: RADIUS,
    size: SIZE,
    rotate: headingToBearing(snapshot.heading),
  };
  const raceRoute = snapshot.raceRouteId !== null ? RACE_ROUTES.find((r) => r.id === snapshot.raceRouteId) : undefined;
  const target =
    snapshot.raceCheckpoint !== null && raceRoute !== undefined
      ? raceRoute.checkpoints[Math.min(snapshot.raceCheckpoint, raceRoute.checkpoints.length - 1)]
      : undefined;
  const district = districtAt(snapshot.player[0], snapshot.player[2]);
  const markers: MinimapChromeMarker[] = snapshot.cops.map((cop, i) => ({
    id: `cop-${i}`,
    position: cop,
    color: "#4f7de8",
    radius: 4,
    strokeColor: "#000",
    strokeWidth: 1,
  }));
  markers.push({ id: "courier", position: snapshot.courierTarget, color: "#38d6c4", radius: 6, strokeColor: "#113b47", strokeWidth: 2 });
  if (target !== undefined) {
    markers.push({ id: "target", position: target, color: "#ffb020", radius: 5.5, strokeColor: "#000", strokeWidth: 1.5 });
  }
  for (const blip of snapshot.blips) {
    const style = BLIP_STYLE[blip.kind];
    markers.push({ id: `${blip.kind}-${blip.id}`, position: [blip.x, blip.z], color: style.color, radius: style.radius, strokeColor: "#000", strokeWidth: 1.5 });
  }
  const bountySpot = snapshot.bountySpotId !== null ? BOUNTY_SPOTS.find((s) => s.id === snapshot.bountySpotId) : undefined;
  if (bountySpot !== undefined) {
    markers.push({
      id: "bounty",
      position: [bountySpot.position[0], bountySpot.position[2]],
      color: "#6d2f8f",
      radius: 5,
      strokeColor: "#000",
      strokeWidth: 1.5,
    });
  }
  const collectedStashes = new Set(snapshot.stashesCollected);
  for (const stash of STASH_SPOTS) {
    if (collectedStashes.has(stash.id)) continue;
    markers.push({
      id: `stash-${stash.id}`,
      position: [stash.position[0], stash.position[2]],
      color: "#38d6c4",
      radius: 3,
      strokeColor: "#0b2a2a",
      strokeWidth: 1,
    });
  }
  if (snapshot.safehouseOwned) {
    markers.push({
      id: "safehouse",
      position: [SAFEHOUSE_POS[0], SAFEHOUSE_POS[2]],
      color: "#3fbf5a",
      radius: 4.5,
      strokeColor: "#000",
      strokeWidth: 1,
    });
  }
  markers.push({
    id: "player",
    position: [snapshot.player[0], snapshot.player[2]],
    heading: headingToBearing(snapshot.heading),
    color: "#f2599b",
    radius: 9,
    strokeColor: "#000",
    strokeWidth: 1.5,
    clampToEdge: false,
  });

  return (
    <div className="flex flex-col items-start gap-1">
      <HudFrame
        variation="retro"
        shape="square"
        className="relative overflow-hidden"
        style={{ width: SIZE, height: SIZE, background: "#0e2431" }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <rect width={SIZE} height={SIZE} fill="#c9bf9f" />
          <polygon points={polygonPoints(SEA_CORNERS, view)} fill="#12889f" />
          <polygon points={polygonPoints(BEACH_CORNERS, view)} fill="#e6d3a4" />
          {DISTRICTS.map((district) => {
            const center = projectToMinimap(district.center, view);
            return (
              <circle
                key={district.id}
                cx={center.x}
                cy={center.y}
                r={(district.radius * SIZE) / (RADIUS * 2)}
                fill={DISTRICT_TINTS[district.id] ?? "#8f8f86"}
                fillOpacity={0.85}
              />
            );
          })}
          {ROADS.map((seg, i) => {
            const a = projectToMinimap(seg.from, view);
            const b = projectToMinimap(seg.to, view);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dfe6ee" strokeWidth={4} strokeOpacity={0.75} strokeLinecap="round" />;
          })}
          {snapshot.scared.map((place, i) => {
            const center = projectToMinimap([place.x, place.z], view);
            return (
              <circle
                key={`fear-${i}`}
                cx={center.x}
                cy={center.y}
                r={(Math.min(place.radius, 60) * SIZE) / (RADIUS * 2)}
                fill="#e23b3b"
                fillOpacity={Math.min(0.45, place.fear / 160)}
              />
            );
          })}
          {snapshot.search !== null
            ? (() => {
                const center = projectToMinimap(snapshot.search.center, view);
                return (
                  <g>
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r={(snapshot.search.radius * SIZE) / (RADIUS * 2)}
                      fill="#f2599b"
                      fillOpacity={0.12}
                      stroke="#f2599b"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                    <circle cx={center.x} cy={center.y} r={2.5} fill="#f2599b" />
                  </g>
                );
              })()
            : null}
          <MinimapChrome view={view} markers={markers} />
        </svg>
        <div className="absolute right-1 top-0.5 text-[10px] font-black text-white/70">N</div>
      </HudFrame>
      <div className="-skew-x-6 border-2 border-black bg-[#f2599b] px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-black">
        {district?.label ?? "Harbor Heat"}
      </div>
    </div>
  );
}
