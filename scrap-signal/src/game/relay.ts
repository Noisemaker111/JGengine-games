import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { defineStore } from "@jgengine/core/store/defineStore";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { rememberHome } from "./entities/enemies/ai";
import { reservePhase } from "./handroll";
import { activeCharacter } from "./characters";
import { RELAY } from "./relaySite";
import {
  DEAD_AIR_HOLD_SECONDS,
  DEAD_AIR_OFFER_RADIUS,
  deadAirBoard,
  isDeadAirRunning,
  nearRelay,
  onDeadAirSettled,
  reportDeadAirEvent,
  resetDeadAir,
  startDeadAir,
  tickDeadAir,
  type DeadAirSettlement,
} from "./missions/deadAir";

/**
 * The Dead Air encounter: authored waves around a contract whose objectives, countdown and fail states
 * live in the mission runtime. This file owns the ring, the staging and the result card.
 */
export { RELAY };
const WAVES = [["ripper_pup", "ripper_pup", "bruiser_brat"], ["husk", "ripper_pup", "bruiser_brat"], ["husk", "husk", "bruiser_brat"]] as const;
/** Remaining hold seconds at which waves two and three arrive. */
const WAVE_AT_REMAINING = [40, 20] as const;

export interface RelayState {
  phase: "idle" | "active" | "won" | "lost";
  wave: number;
  enemies: readonly string[];
  /** Hold seconds still to run when the contract settled. */
  remaining: number;
  rewarded: boolean;
  reason: string;
}

export const relayStore = defineStore<RelayState>("scrap.deadAir", () => ({
  phase: "idle",
  wave: 0,
  enemies: [],
  remaining: DEAD_AIR_HOLD_SECONDS,
  rewarded: false,
  reason: "",
}));

export function relayDistance(ctx: GameContext): number {
  const p = ctx.scene.entity.get(ctx.player.userId)?.position;
  return p === undefined ? Infinity : Math.hypot(p[0] - RELAY.x, p[2] - RELAY.z);
}

function spawnWave(ctx: GameContext, wave: number): void {
  const state = relayStore.read(ctx);
  if (state.wave >= wave) return;
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
  relayStore.write(ctx, { ...state, wave, enemies: [...state.enemies, ...enemies] });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `DEAD AIR - AMBUSH ${wave}/3`, kind: "warn" });
}

/** A ring kill credits the mission only when the player was inside the copper ring. */
export function relayEnemyDied(ctx: GameContext, event: EntityDiedEvent): void {
  const state = relayStore.read(ctx);
  if (state.enemies.includes(event.instanceId)) {
    relayStore.write(ctx, { ...state, enemies: state.enemies.filter((id) => id !== event.instanceId) });
  }
  if (event.reason.kind !== "player_kill" || event.reason.killerUserId !== ctx.player.userId) return;
  if (!isDeadAirRunning(ctx)) return;
  const p = ctx.scene.entity.get(ctx.player.userId)?.position;
  const inside = p !== undefined && Math.hypot(p[0] - RELAY.x, p[2] - RELAY.z) <= RELAY.radius;
  reportDeadAirEvent(ctx, {
    kind: "kill",
    target: event.catalogId,
    by: "reclaimer",
    tags: inside ? ["in-ring"] : ["outside-ring"],
  });
}

/** Stage the waves the live objective calls for. */
function stageWaves(ctx: GameContext): void {
  const board = deadAirBoard.read(ctx);
  const state = relayStore.read(ctx);
  if (!board.active) return;
  if (board.view?.objectiveId === "clear" && state.enemies.length === 0 && state.wave < 1) spawnWave(ctx, 1);
  if (board.view?.objectiveId !== "hold" || state.enemies.length > 0) return;
  const remaining = board.view.remaining ?? DEAD_AIR_HOLD_SECONDS;
  for (const [index, at] of WAVE_AT_REMAINING.entries()) {
    if (remaining <= at && state.wave <= index + 1) spawnWave(ctx, index + 2);
  }
}

/** The contract settled: pay on the first win, show the field report, and stop play. */
function settle(ctx: GameContext, settlement: DeadAirSettlement): void {
  const relay = relayStore.read(ctx);
  if (settlement.won && !relay.rewarded) {
    ctx.game.economy.grant(ctx.player.userId, "cash", 120);
    ctx.game.economy.grant(ctx.player.userId, "cores", 3);
  }
  relayStore.write(ctx, {
    ...relay,
    phase: settlement.won ? "won" : "lost",
    enemies: [],
    remaining: settlement.remaining,
    rewarded: relay.rewarded || settlement.won,
    reason: settlement.reason,
  });
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: settlement.won ? "CARRIER RESTORED" : "SIGNAL LOST", kind: settlement.won ? "pickup" : "warn" });
  setGamePhase(ctx, "ended");
  ctx.time.pause();
  if (typeof document !== "undefined") document.exitPointerLock?.();
  void ctx.game.save?.checkpoint();
}

export function tickRelay(ctx: GameContext, dt: number): void {
  if (dt <= 0 || gamePhase(ctx) !== "playing") return;
  const state = relayStore.read(ctx);
  if (state.phase !== "active") return;
  tickDeadAir(ctx, dt, reservePhase(ctx) === "up");
  const board = deadAirBoard.read(ctx);
  if (board.active) {
    relayStore.write(ctx, { ...relayStore.read(ctx), remaining: board.view?.remaining ?? DEAD_AIR_HOLD_SECONDS });
    stageWaves(ctx);
  }
}

/** Offer the contract once the player is near the ring; the console prompt starts it early. */
export function offerDeadAir(ctx: GameContext): void {
  const state = relayStore.read(ctx);
  if (state.phase === "active" || state.phase === "won") return;
  if (isDeadAirRunning(ctx) || !nearRelay(ctx)) return;
  activate(ctx);
}

function activate(ctx: GameContext): void {
  relayStore.write(ctx, { ...relayStore.read(ctx), phase: "active", wave: 0, enemies: [], reason: "", remaining: DEAD_AIR_HOLD_SECONDS });
  startDeadAir(ctx);
}

export function registerRelay(ctx: GameContext, reconstruct: (ctx: GameContext) => void): void {
  onDeadAirSettled(ctx, (settlement) => settle(ctx, settlement));
  ctx.game.commands.define("relay.start", { apply(state) {
    const current = relayStore.read(state);
    if (gamePhase(state) !== "playing" || activeCharacter() === null || reservePhase(state) !== "up") return;
    if (current.phase === "active" || current.phase === "won") return;
    if (relayDistance(state) > DEAD_AIR_OFFER_RADIUS) return;
    const ammo = state.scene.entity.stats.get(state.player.userId, "ammo_pistol");
    if (ammo !== null && ammo.current < 60) state.scene.entity.stats.delta(state.player.userId, "ammo_pistol", 60 - ammo.current);
    activate(state);
    void state.game.save?.checkpoint();
  } });
  ctx.game.commands.define("relay.continue", { apply(state) {
    const current = relayStore.read(state);
    if (current.phase !== "won" && current.phase !== "lost") return;
    if (reservePhase(state) !== "up" || (state.scene.entity.stats.get(state.player.userId, "health")?.current ?? 1) <= 1) reconstruct(state);
    relayStore.write(state, { ...current, phase: "idle", enemies: [], wave: 0, remaining: DEAD_AIR_HOLD_SECONDS });
    resetDeadAir(state);
    setGamePhase(state, "playing");
    state.time.play();
    void state.game.save?.checkpoint();
  } });
}
