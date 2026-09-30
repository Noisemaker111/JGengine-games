import { environment } from "@jgengine/core/world/features";
import type { EditorDocument, EditorMarker, EditorVolume } from "@jgengine/core/editor/types";
import authored from "./editor.scene.json";

export type Point = readonly [number, number, number];
export type Place = "home" | "vault";
export interface Room { id: string; name: string; x: number; z: number; w: number; d: number; place: Place }

// This document is the verbatim export of the official editor RPC session.
// Stable IDs link gameplay to it; no second set of placement coordinates exists here.
export const editorLayers = authored as unknown as EditorDocument;
if (editorLayers.version !== 1) throw new Error("Deepward scene has an unsupported editor version");
const ids = [...editorLayers.markers, ...editorLayers.volumes].map(entry => entry.id);
if (new Set(ids).size !== ids.length) throw new Error("Deepward scene has duplicate stable IDs");
if (!editorLayers.terrain) throw new Error("Deepward scene is missing its authored terrain");
export const WORLD_BOUNDS = editorLayers.terrain.bounds;
if (!Object.values(WORLD_BOUNDS).every(Number.isFinite) || WORLD_BOUNDS.minX >= WORLD_BOUNDS.maxX || WORLD_BOUNDS.minZ >= WORLD_BOUNDS.maxZ) throw new Error("Deepward scene has invalid terrain bounds");
export const DECOR = editorLayers.markers.filter(entry => entry.kind === "deepward-decor");
export function decorPoint(id: string): [number, number, number] { return [...point(marker(id))]; }
function marker(id: string): EditorMarker {
  const entry = editorLayers.markers.find(item => item.id === id);
  if (!entry || !Object.values(entry.position).every(Number.isFinite)) throw new Error(`Deepward scene missing valid marker: ${id}`);
  return entry;
}
function point(entry: EditorMarker): Point { return [entry.position.x, entry.position.y, entry.position.z]; }
function footprint(entry: EditorVolume) {
  const half = entry.halfExtents;
  if (entry.shape !== "box" || !half || !Object.values(half).every(value => Number.isFinite(value) && value > 0) || !Object.values(entry.center).every(Number.isFinite)) throw new Error(`Deepward requires an authored box: ${entry.id}`);
  return { id: entry.id, x: entry.center.x, z: entry.center.z, w: half.x * 2, d: half.z * 2 };
}
export const ROOMS: readonly Room[] = editorLayers.volumes.filter(entry => entry.kind === "deepward-room").map(entry => {
  const place = entry.meta?.place;
  if (place !== "home" && place !== "vault") throw new Error(`Deepward room missing place: ${entry.id}`);
  return { ...footprint(entry), name: entry.label ?? entry.id, place };
});
if (ROOMS.length === 0) throw new Error("Deepward has no authored rooms");
export const HOME_SPAWN = point(marker("spawn-marrow"));
export const VAULT_SPAWN = point(marker("spawn-bellwether"));
export const GARAGE = point(marker("rail-garage"));
export const STASH = point(marker("stash-marrow"));
export const EXIT = point(marker("rail-extraction"));
function reach(id: string): number {
  const value = marker(id).meta?.reach;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`Deepward anchor lacks an interaction reach: ${id}`);
  return value;
}
export const GARAGE_REACH = reach("rail-garage");
export const STASH_REACH = reach("stash-marrow");
export const EXIT_REACH = reach("rail-extraction");
export const RETURN_SPINE = ROOMS.find(room => room.id === "room-return-spine");
if (!RETURN_SPINE) throw new Error("Deepward scene is missing the return spine");
const receiving = ROOMS.find(room => room.id === "room-rail-receiving");
if (!receiving) throw new Error("Deepward scene is missing rail receiving");
export const RECEIVING_BACK_Z = receiving.z - receiving.d / 2;
const printMarker = marker("spawn-bellwether-fitter");
if (typeof printMarker.meta?.entityId !== "string") throw new Error("Deepward printer spawn lacks its entity ID");
export const PRINT_ID = printMarker.meta.entityId;
export const PRINT_SPAWN = point(printMarker);
const steamVolume = editorLayers.volumes.find(entry => entry.id === "hazard-steam-printhouse");
if (!steamVolume) throw new Error("Deepward scene is missing steam volume");
export const STEAM = footprint(steamVolume);
type SalvageKind = "wire" | "polymer" | "cells" | "ink";
export const SALVAGE = editorLayers.markers.filter(entry => entry.kind === "deepward-loot").map(entry => {
  const id = entry.meta?.sourceId, kind = entry.meta?.itemId;
  if (typeof id !== "string" || (kind !== "wire" && kind !== "polymer" && kind !== "cells" && kind !== "ink")) throw new Error(`Deepward loot has unknown acquisition identity: ${entry.id}`);
  return { id, kind: kind as SalvageKind, at: point(entry), label: entry.label ?? entry.id };
});
if (new Set(SALVAGE.map(entry => entry.id)).size !== SALVAGE.length) throw new Error("Deepward loot source IDs must be unique");
export const PROPS = editorLayers.volumes.filter(entry => entry.kind === "deepward-machine").map(footprint);

export function distance(a: Point, b: Point): number { return Math.hypot(a[0] - b[0], a[2] - b[2]); }
export function inside(x: number, z: number, r: { x: number; z: number; w: number; d: number }): boolean {
  return Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2;
}
export function floorAt(x: number, z: number, place: Place): boolean {
  return ROOMS.some(r => r.place === place && inside(x, z, r));
}
export function walkable(x: number, z: number, place: Place, radius = 0.28): boolean {
  if (![[radius, radius], [-radius, radius], [radius, -radius], [-radius, -radius]].every(([dx, dz]) => floorAt(x + dx!, z + dz!, place))) return false;
  return place === "home" || !PROPS.some(r => inside(x, z, { ...r, w: r.w + radius * 2, d: r.d + radius * 2 }));
}
/** Segment checks cover interior walls and machinery, also used for firing and looting. */
export function lineOfSight(a: Point, b: Point): boolean {
  const steps = Math.ceil(distance(a, b) / 0.18);
  for (let n = 1; n < steps; n++) {
    const t = n / steps;
    if (!walkable(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, "vault", 0)) return false;
  }
  return true;
}
export function roomAt(p: Point, place: Place): string {
  return [...ROOMS].reverse().find(r => r.place === place && inside(p[0], p[2], r))?.name ?? "Rail threshold";
}
/** Boundary tiles are generated from the authored footprints, never from a second collision map. */
export function wallTiles(place: Place): { x: number; z: number }[] {
  const walls: { x: number; z: number }[] = [];
  for (let x = WORLD_BOUNDS.minX + 0.5; x < WORLD_BOUNDS.maxX; x++) for (let z = WORLD_BOUNDS.minZ + 0.5; z < WORLD_BOUNDS.maxZ; z++) {
    if (floorAt(x, z, place)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => floorAt(x + dx!, z + dz!, place))) walls.push({ x, z });
  }
  return walls;
}
export const world = environment({ sculpt: editorLayers.terrain });
export const physics = { gravity: -30 };
