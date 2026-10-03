import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { ClockSnapshot } from "@jgengine/core/time/simClock";

import { WORLD_SEED } from "../../world";
import { setupWorld } from "../sim/setup";
import { readOrbitSave, restoreOrbitSave, writeOrbitSave } from "./save";
import { householdStore } from "./store";
import { createHousehold } from "./types";

export interface OrbitSession {
  screen: "menu" | "paused" | null;
  canContinue: boolean;
  saveStatus: "ready" | "saved" | "unavailable" | "damaged";
  initialClock: ClockSnapshot | null;
  lastSavedAt: number;
}

export const orbitSession = defineStore<OrbitSession>("odd-orbit.session", () => ({
  screen: "menu", canContinue: false, saveStatus: "ready", initialClock: null, lastSavedAt: 0,
}));

export function checkpointOrbit(ctx: GameContext): void {
  const session = orbitSession.read(ctx);
  if (!session.canContinue || ctx.player.userId === "ui-preview") return;
  const saved = writeOrbitSave(ctx);
  orbitSession.write(ctx, { ...session, saveStatus: saved ? "saved" : "unavailable", lastSavedAt: ctx.time.now() });
}

export function prepareOrbit(ctx: GameContext): void {
  const initialClock = ctx.time.snapshot();
  const loaded = ctx.player.userId === "ui-preview" ? { save: null, damaged: false, unavailable: false } : readOrbitSave();
  if (loaded.save !== null) restoreOrbitSave(ctx, loaded.save);
  ctx.time.pause();
  orbitSession.write(ctx, {
    screen: "menu", canContinue: loaded.save !== null,
    saveStatus: loaded.unavailable ? "unavailable" : loaded.damaged ? "damaged" : loaded.save !== null ? "saved" : "ready",
    initialClock, lastSavedAt: ctx.time.now(),
  });
  setGamePhase(ctx, "menu");
}

export function startOrbit(ctx: GameContext): void {
  const session = orbitSession.read(ctx);
  ctx.hydrate({ objects: [], entities: [] });
  householdStore.write(ctx, createHousehold(WORLD_SEED));
  if (session.initialClock !== null) ctx.time.hydrate(session.initialClock);
  setupWorld(ctx);
  ctx.time.play();
  orbitSession.write(ctx, { ...session, screen: null, canContinue: true });
  setGamePhase(ctx, "playing");
  checkpointOrbit(ctx);
}

export function resumeOrbit(ctx: GameContext): void {
  const session = orbitSession.read(ctx);
  if (!session.canContinue) return;
  orbitSession.write(ctx, { ...session, screen: null });
  ctx.time.play();
  setGamePhase(ctx, "playing");
  checkpointOrbit(ctx);
}

export function pauseOrbit(ctx: GameContext): void {
  const session = orbitSession.read(ctx);
  if (session.screen !== null) return;
  checkpointOrbit(ctx);
  ctx.time.pause();
  orbitSession.update(ctx, current => ({ ...current, screen: "paused" }));
  setGamePhase(ctx, "paused");
}

export function registerOrbitLifecycle(ctx: GameContext): void {
  for (const [name, action] of [
    ["orbit.new", startOrbit], ["orbit.continue", resumeOrbit], ["orbit.resume", resumeOrbit],
    ["orbit.pause", pauseOrbit], ["orbit.checkpoint", checkpointOrbit],
  ] as const) {
    ctx.game.commands.define<Record<string, never>>(name, { apply: state => { action(state); return state; } });
  }
}
