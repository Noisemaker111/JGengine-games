import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { defineStore } from "@jgengine/core/store/defineStore";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { rememberHome } from "./entities/enemies/ai";
import { reservePhase } from "./handroll";
import { activeCharacter } from "./characters";

/** Fixed authored location; independent of capture-time spawn overrides. */
export const RELAY = { x: -505, z: 581, radius: 22, seconds: 150, uploadSeconds: 6 };
const WAVES = [["ripper_pup", "ripper_pup"], ["bruiser_brat", "bruiser_brat"], ["husk", "ripper_pup", "bruiser_brat"]] as const;
export interface RelayState {
  phase: "idle" | "defend" | "upload" | "won" | "lost";
  wave: number;
  enemies: readonly string[];
  remaining: number;
  upload: number;
  rewarded: boolean;
  reason: string;
}
export const relayStore = defineStore<RelayState>("scrap.deadAir", () => ({ phase: "idle", wave: 0, enemies: [], remaining: RELAY.seconds, upload: 0, rewarded: false, reason: "" }));

export function relayDistance(ctx: GameContext): number {
  const p = ctx.scene.entity.get(ctx.player.userId)?.position;
  return p === undefined ? Infinity : Math.hypot(p[0] - RELAY.x, p[2] - RELAY.z);
}

function spawnWave(ctx: GameContext, state: RelayState, wave: number): void {
  const enemies = WAVES[wave - 1]!.map((catalogId, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 0.7;
    const x = RELAY.x + Math.cos(angle) * 11;
    const z = RELAY.z + Math.sin(angle) * 11;
    const position: [number, number, number] = [x, ctx.world.groundHeightAt(x, z), z];
    const id = `dead_air_${wave}_${index}`;
    ctx.scene.entity.spawn(catalogId, { id, position });
    rememberHome(ctx, id, position);
    return id;
  });
  relayStore.write(ctx, { ...state, phase: "defend", wave, enemies, upload: 0 });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `DEAD AIR — AMBUSH ${wave}/3`, kind: "warn" });
}

export function relayEnemyDied(ctx: GameContext, event: EntityDiedEvent): void {
  const state = relayStore.read(ctx);
  if (state.phase !== "defend" || !state.enemies.includes(event.instanceId)) return;
  const enemies = state.enemies.filter((id) => id !== event.instanceId);
  relayStore.write(ctx, { ...state, enemies, phase: enemies.length === 0 ? "upload" : "defend" });
}

function finish(ctx: GameContext, state: RelayState, won: boolean, reason: string): void {
  for (const id of state.enemies) ctx.scene.entity.despawn(id);
  if (won && !state.rewarded) {
    ctx.game.economy.grant(ctx.player.userId, "cash", 120);
    ctx.game.economy.grant(ctx.player.userId, "cores", 3);
  }
  relayStore.write(ctx, { ...state, enemies: [], phase: won ? "won" : "lost", rewarded: state.rewarded || won, reason });
  setGamePhase(ctx, "ended");
  ctx.time.pause();
  if (typeof document !== "undefined") document.exitPointerLock?.();
  // Results are real saved state; reloading cannot award the same contract twice.
  void ctx.game.save?.checkpoint();
}

export function tickRelay(ctx: GameContext, dt: number): void {
  if (dt <= 0 || gamePhase(ctx) !== "playing") return;
  const state = relayStore.read(ctx);
  if (state.phase !== "defend" && state.phase !== "upload") return;
  if (reservePhase(ctx) !== "up") { finish(ctx, state, false, "Your chassis went down before the relay could lock."); return; }
  const remaining = Math.max(0, state.remaining - dt);
  if (remaining === 0) { finish(ctx, state, false, "The carrier window closed. Clear the ambushes and stay inside the copper ring to upload."); return; }
  const upload = state.phase === "upload" && relayDistance(ctx) <= RELAY.radius ? state.upload + dt : state.upload;
  const next = { ...state, remaining, upload };
  if (upload >= RELAY.uploadSeconds) {
    if (state.wave === WAVES.length) finish(ctx, next, true, "Coretown hears you. The salvage carrier is back on the air.");
    else spawnWave(ctx, next, state.wave + 1);
  } else relayStore.write(ctx, next);
}

export function registerRelay(ctx: GameContext, reconstruct: (ctx: GameContext) => void): void {
  ctx.game.commands.define("relay.start", { apply(state: GameContext) {
    const current = relayStore.read(state);
    if (gamePhase(state) !== "playing" || activeCharacter() === null || reservePhase(state) !== "up" || relayDistance(state) > 3.8 || ["defend", "upload"].includes(current.phase)) return;
    // Salvage cartridges supplied by the contract keep a failed attempt recoverable.
    const ammo = state.scene.entity.stats.get(state.player.userId, "ammo_pistol");
    if (ammo !== null && ammo.current < 60) state.scene.entity.stats.delta(state.player.userId, "ammo_pistol", 60 - ammo.current);
    spawnWave(state, { ...current, remaining: RELAY.seconds, upload: 0, reason: "" }, 1);
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("relay.continue", { apply(state: GameContext) {
    const current = relayStore.read(state);
    if (current.phase !== "won" && current.phase !== "lost") return;
    if (reservePhase(state) !== "up" || (state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 1) <= 1) reconstruct(state);
    relayStore.write(state, { ...current, phase: "idle", upload: 0 });
    setGamePhase(state, "playing");
    state.time.play();
    void state.game.save?.checkpoint();
  } });
}
