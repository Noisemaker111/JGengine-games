import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { editorMarkerXZ } from "@jgengine/core/editor/index";

import { editorLayers } from "../editorLayers";
import { buildableDef } from "./objects/catalog";
import { placeObject } from "./build/placement";
import { seedGuests, resetGuestAgents } from "./sim/guests";
import { resetRides } from "./sim/rides";
import { resetProgression } from "./progression";
import { resetSession, session } from "./session";

const TRACK_PATH_ID = "coaster-track";

export interface SeedPlacement {
  catalogId: string;
  x: number;
  z: number;
}

function markerCatalogId(meta: Record<string, unknown> | undefined): string {
  const id = meta?.["catalogId"];
  if (typeof id !== "string") throw new Error("brightway-park: scene marker missing meta.catalogId");
  return id;
}

/**
 * The starter-park placement order, derived from `editor.scene.json`. Rides and stalls seed first (the
 * coaster station must exist before the track pieces test connectivity), then the coaster's `route`
 * path becomes track pieces, then the remaining scenery and path markers. Coordinates live only in the
 * authored document — this reads them back in the one order the placement rules require.
 */
export function seedPlacements(): SeedPlacement[] {
  const rides: SeedPlacement[] = [];
  const rest: SeedPlacement[] = [];
  for (const marker of editorLayers.markers) {
    const catalogId = markerCatalogId(marker.meta);
    const category = buildableDef(catalogId).category;
    const target = category === "ride" || category === "stall" ? rides : rest;
    const [x, z] = editorMarkerXZ(marker);
    target.push({ catalogId, x, z });
  }
  const track = editorLayers.paths.find((path) => path.id === TRACK_PATH_ID);
  const trackPieces: SeedPlacement[] = (track?.points ?? []).map((point) => ({
    catalogId: "track_piece",
    x: point.x,
    z: point.z,
  }));
  return [...rides, ...trackPieces, ...rest];
}

export function seedStarterPark(ctx: GameContext): void {
  for (const placement of seedPlacements()) placeObject(ctx, placement.catalogId, placement.x, placement.z);
}

export interface ResetOptions {
  /** Cash the fresh park opens with; the catalog default when omitted. */
  cash?: number;
  /** Seed the authored starter park and its visitors. Default true. */
  seed?: boolean;
  guests?: number;
}

/**
 * Empty the live park and start again: every placed object and body leaves the scene, then the
 * session, the rating standing and the ride sim are rebuilt. Used by a new park, a scenario start and
 * a scenario replay, so those three cannot drift apart.
 */
export function resetPark(ctx: GameContext, options: ResetOptions = {}): void {
  for (const id of session.placed.keys()) ctx.scene.object.remove(id);
  for (const guest of session.guests.values()) ctx.scene.entity.despawn(guest.id);
  for (const staff of session.staff.values()) ctx.scene.entity.despawn(staff.id);
  ctx.scene.entity.selection.clear();
  resetSession();
  resetProgression();
  resetRides();
  resetGuestAgents();
  if (options.cash !== undefined) session.cash = options.cash;
  if (options.seed !== false) {
    seedStarterPark(ctx);
    seedGuests(ctx, options.guests ?? 24);
  }
}
