import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { editorMarkerXZ } from "@jgengine/core/editor/index";

import { editorLayers } from "../../editorLayers";
import { registerBuildCommands } from "../build/commands";
import { placeObject } from "../build/placement";
import { buildableDef } from "../objects/catalog";
import { seedGuests } from "../sim/guests";
import { resetSession, session } from "../session";
import { restorePark, savePark } from "../persistence";
import { traceNative, tracePark } from "../evidence";

const TRACK_PATH_ID = "coaster-track";
const cleanups = new WeakMap<GameContext, () => void>();

export function disposeWorld(ctx: GameContext): void {
  savePark(ctx);
  cleanups.get(ctx)?.();
  cleanups.delete(ctx);
}

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

function seedStarterPark(ctx: GameContext): void {
  for (const placement of seedPlacements()) placeObject(ctx, placement.catalogId, placement.x, placement.z);
}

export function setupWorld(ctx: GameContext): void {
  resetSession();
  registerBuildCommands(ctx);
  if (!restorePark(ctx)) {
    seedStarterPark(ctx);
    seedGuests(ctx, 24);
  }
  ctx.time.pause();
  if (typeof localStorage !== "undefined") {
    try { ctx.game.store.set("park.reduced-motion",localStorage.getItem("brightway-park.reduced-motion")==="true"); } catch { /* Browser storage may be disabled. */ }
  }
  if (typeof window !== "undefined") {
    const abort = new AbortController();
    cleanups.set(ctx, () => abort.abort());
    window.addEventListener("pagehide", () => savePark(ctx), { signal: abort.signal });
    if (import.meta.env.DEV && import.meta.env.VITE_PARK_EVIDENCE === "1") {
      tracePark(ctx,"boot");
      window.addEventListener("keydown",e=>traceNative("keyboard",{code:e.code,key:e.key,target:(e.target as HTMLElement)?.tagName}),{capture:true,signal:abort.signal});
      window.addEventListener("error",e=>traceNative("runtime-error",{message:e.message,file:e.filename,line:e.lineno}),{signal:abort.signal});
      window.addEventListener("unhandledrejection",e=>traceNative("runtime-rejection",String(e.reason)),{signal:abort.signal});
    }
  }
}
