import type { LifecycleConfig } from "@jgengine/core/game/defineGame";
import { setGamePhase } from "@jgengine/core/game/gamePhase";
import { defineStore, type GameContext } from "@jgengine/shell/gameKit";
import { announce, resetAuthoredTriggers } from "./triggers";

export const STATIONS = [
  { id: "water", number: "01", name: "Shoreline", subject: "Water clarity", x: -9, z: 6, color: "#70d8df", note: "Suspended sediment is low. The lake is recovering." },
  { id: "wind", number: "02", name: "Prairie mast", subject: "Wind & habitat", x: 22, z: 3, color: "#c8de83", note: "A steady southwesterly carries seeds across the prairie." },
  { id: "soil", number: "03", name: "Thermal vent", subject: "Soil temperature", x: 14, z: 12, color: "#ffa66e", note: "Residual heat is escaping through the fractured soil." },
] as const;
export const BASE = { x: 6, z: 6 };
export const SAMPLE_SECONDS = 2.5;
export const SAVE_KEY = "field-station.expedition.v1";

export interface Expedition {
  phase: "menu" | "playing" | "paused" | "won" | "lost";
  collected: string[];
  sampling: string | null;
  progress: number;
  elapsed: number;
  nearest: string | null;
  distance: number;
  position: [number, number];
  hasSave: boolean;
  saveStatus: string;
}
export const freshExpedition = (): Expedition => ({ phase: "menu", collected: [], sampling: null, progress: 0, elapsed: 0, nearest: null, distance: 0, position: [BASE.x, BASE.z], hasSave: false, saveStatus: "" });
export const expedition = defineStore<Expedition>("field-station.expedition", freshExpedition);

interface Checkpoint { version: 1; collected: string[]; elapsed: number; position: [number, number, number]; health: number; completed: boolean }
export function decodeCheckpoint(raw: string | null): Checkpoint | null {
  if (raw === null) return null;
  try {
    const s = JSON.parse(raw);
    if (s.version !== 1 || !Array.isArray(s.collected) || !s.collected.every((id: unknown) => STATIONS.some(station => station.id === id)) || new Set(s.collected).size !== s.collected.length) return null;
    if (!Array.isArray(s.position) || s.position.length !== 3 || !s.position.every((n: unknown) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 5000)) return null;
    if (typeof s.elapsed !== "number" || !Number.isFinite(s.elapsed) || s.elapsed < 0 || typeof s.health !== "number" || !Number.isFinite(s.health) || s.health <= 0 || s.health > 100 || typeof s.completed !== "boolean") return null;
    if (s.completed && s.collected.length !== STATIONS.length) return null;
    return s;
  } catch { return null; }
}
function readCheckpoint(): Checkpoint | null {
  try { return typeof localStorage === "undefined" ? null : decodeCheckpoint(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
export function checkpoint(ctx: GameContext): void {
  const s = expedition.read(ctx);
  const actor = ctx.scene.entity.get(ctx.player.userId);
  const health = ctx.scene.entity.stats.get(ctx.player.userId, "health");
  if (actor === null || health === null || !["playing", "paused", "won"].includes(s.phase) || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, collected: s.collected, elapsed: s.elapsed, position: [...actor.position], health: health.current, completed: s.phase === "won" } satisfies Checkpoint));
    if (!s.hasSave || s.saveStatus !== "Field log saved on this device") expedition.write(ctx, { ...s, hasSave: true, saveStatus: "Field log saved on this device" });
  } catch { expedition.write(ctx, { ...s, saveStatus: "Storage unavailable — keep this tab open" }); }
}
function freeze(ctx: GameContext, frozen: boolean): void {
  const id = ctx.player.userId;
  const entity = ctx.scene.entity.get(id);
  if (entity !== null) ctx.scene.entity.update(id, { movement: { ...entity.movement, frozen } });
}
function changePhase(ctx: GameContext, phase: Expedition["phase"]): void {
  expedition.update(ctx, s => ({ ...s, phase, sampling: null, progress: 0 }));
  freeze(ctx, phase !== "playing");
  setGamePhase(ctx, phase === "won" || phase === "lost" ? "ended" : phase);
}
function startRun(ctx: GameContext): Expedition {
  const id = ctx.player.userId;
  ctx.scene.entity.resetToSpawn(id);
  ctx.scene.entity.stats.set(id, "health", { current: 100 });
  resetAuthoredTriggers();
  freeze(ctx, false);
  announce("Three readings. One living landscape. Follow the numbered instruments.", "info");
  return { ...freshExpedition(), phase: "playing", hasSave: readCheckpoint() !== null };
}
export const expeditionLifecycle: LifecycleConfig<Expedition> = {
  store: expedition,
  start: (_state, ctx) => startRun(ctx),
  restart: (_state, ctx) => startRun(ctx),
  phaseOf: s => s.phase === "won" || s.phase === "lost" ? "ended" : s.phase,
};
export function initExpedition(ctx: GameContext): void {
  resetAuthoredTriggers();
  expedition.write(ctx, { ...freshExpedition(), hasSave: readCheckpoint() !== null });
  ctx.game.commands.define("survey.pause", { apply: c => {
    if (expedition.read(c).phase === "playing") { changePhase(c, "paused"); checkpoint(c); }
  } });
  ctx.game.commands.define("survey.resume", { apply: c => { if (expedition.read(c).phase === "paused") changePhase(c, "playing"); } });
  ctx.game.commands.define("survey.menu", { apply: c => { checkpoint(c); changePhase(c, "menu"); } });
  ctx.game.commands.define("survey.continue", { apply: c => {
    const saved = readCheckpoint();
    if (saved === null) { expedition.update(c, s => ({ ...s, hasSave: false, saveStatus: "No readable field log found" })); return; }
    const id = c.player.userId;
    const actor = c.scene.entity.get(id);
    if (actor === null) return;
    resetAuthoredTriggers();
    c.scene.entity.update(id, { position: saved.position, movement: { ...actor.movement, frozen: saved.completed } });
    c.scene.entity.stats.set(id, "health", { current: saved.health });
    expedition.write(c, { ...freshExpedition(), phase: saved.completed ? "won" : "playing", collected: saved.collected, elapsed: saved.elapsed, hasSave: true, position: [saved.position[0], saved.position[2]], saveStatus: "Field log restored" });
    setGamePhase(c, saved.completed ? "ended" : "playing");
    announce("Field log restored. Pick up where you left off.", "good");
  } });
}
export function initializeSurveyor(ctx: GameContext): void {
  freeze(ctx, expedition.read(ctx).phase !== "playing");
}
export function surveyFailed(ctx: GameContext): void {
  changePhase(ctx, "lost");
  announce("Exposure exceeded the safe limit. Your last field log is still available.", "warn");
}
export function tickExpedition(ctx: GameContext, dt: number): void {
  const s = expedition.read(ctx);
  if (s.phase !== "playing") return;
  const actor = ctx.scene.entity.get(ctx.player.userId);
  if (actor === null) return;
  const [x, , z] = actor.position;
  const remaining = STATIONS.filter(station => !s.collected.includes(station.id));
  const distances = remaining.map(station => ({ station, distance: Math.hypot(x - station.x, z - station.z) })).sort((a, b) => a.distance - b.distance);
  const closest = distances[0];
  const distance = closest?.distance ?? Math.hypot(x - BASE.x, z - BASE.z);
  const nearest = closest !== undefined && distance <= 2.8 ? closest.station.id : remaining.length === 0 && distance <= 3 ? "base" : null;
  const sampling = nearest !== null && ctx.input.isDown("interact") ? nearest : null;
  const progress = sampling !== null ? (sampling === s.sampling ? s.progress : 0) + dt : 0;
  const next: Expedition = { ...s, elapsed: s.elapsed + dt, position: [x, z], distance, nearest, sampling, progress };
  if (sampling !== null && progress >= SAMPLE_SECONDS) {
    next.progress = 0;
    next.sampling = null;
    if (sampling === "base") {
      expedition.write(ctx, next);
      changePhase(ctx, "won");
      checkpoint(ctx);
      announce("Survey complete. All three readings archived at the field station.", "good");
      return;
    }
    next.collected = [...s.collected, sampling];
    next.nearest = null;
    const station = STATIONS.find(station => station.id === sampling)!;
    announce(station.note, "good");
    expedition.write(ctx, next);
    checkpoint(ctx);
    return;
  }
  expedition.write(ctx, next);
}
