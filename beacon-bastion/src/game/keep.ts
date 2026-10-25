import { setGamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldActionDecl, WorldKindDecl, WorldModel, WorldTotalDecl } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { STARTING_GOLD, STARTING_LIVES } from "./entities/base/catalog";
import { TOWER_IDS, towerDef, type TowerDef } from "./entities/towers/catalog";
import { finishRun } from "./waves/legacy";
import { BUILD_PLOTS } from "./world/path";
import { session } from "./session";

/**
 * The keep as one declaration: its purse and walls, the nine plots, every tower type with its build
 * time, upgrades and sale, and what kills, leaks and early releases do to it. The engine runs it, so
 * the HUD, the tower panel, the build bar, saves and co-op all read the same world. Creeps on the road,
 * tower aim and the wave director stay real-time game code that reads and writes these facts.
 */

export const MAX_TOWER_LEVEL = 3;
/** Share of everything a tower cost (build and upgrades) that a sale returns. */
export const SELL_SHARE = 0.7;
/** An upgrade costs this share of the build price, times the level it leaves. */
const UPGRADE_SHARE = 0.75;
/** What each upgrade adds: damage and fire rate as a share of the base, range and splash in metres. */
const PER_LEVEL = { damage: 0.5, rate: 0.15, range: 0.5, splash: 0.3 } as const;

export const upgradeAction = (kind: string) => `upgrade_${kind}`;
/** One sale for every tower type: the `tower` tag covers them all. */
export const sellAction = (_kind?: string) => "sell";

function towerKind(def: TowerDef): WorldKindDecl {
  return {
    label: def.label,
    tags: ["tower"],
    slot: "plot",
    cost: { "keep.gold": -def.cost },
    ...(def.buildSeconds !== undefined && def.buildSeconds > 0 ? { takes: def.buildSeconds } : {}),
    refund: SELL_SHARE,
    facts: { level: 1, damage: def.damage, range: def.range, rate: def.fireRateHz, splash: def.splashRadius },
  };
}

function towerActions(def: TowerDef): Record<string, WorldActionDecl> {
  return {
    [upgradeAction(def.id)]: {
      label: "Upgrade",
      on: def.id,
      whenTarget: { level: { atMost: MAX_TOWER_LEVEL - 1 } },
      refuse: "Already at the top level",
      cost: { "keep.gold": -Math.round(def.cost * UPGRADE_SHARE) },
      scaleBy: "level",
      effect: {
        level: 1,
        damage: def.damage * PER_LEVEL.damage,
        rate: def.fireRateHz * PER_LEVEL.rate,
        range: PER_LEVEL.range,
        ...(def.splashRadius > 0 ? { splash: PER_LEVEL.splash } : {}),
      },
      note: "{target} raised a level.",
    },
  };
}

const defs = TOWER_IDS.map((id) => towerDef(id, editorLayers));
const totals: Record<string, WorldTotalDecl> = {
  "keep.towers": { of: "tower" },
  "keep.firepower": { of: "tower", sum: "damage" },
};

export const keep = defineGameSpec({
  id: "beacon",
  world: {
    factions: {
      keep: {
        label: "The Keep",
        facts: {
          gold: { value: STARTING_GOLD, min: 0 },
          lives: { value: STARTING_LIVES, min: 0 },
          lives_max: STARTING_LIVES,
          /** The wave the director has open (0 before the first release). */
          wave: 0,
          wave_ready: true,
          wave_started: false,
          last_bonus: 0,
          bounty_earned: 0,
          banked: false,
          fallen: false,
          held: false,
        },
      },
    },
    slots: { plot: Object.fromEntries(BUILD_PLOTS.map((plot) => [plot.id, { position: [plot.position[0], plot.position[2]] as const }])) },
    kinds: Object.fromEntries(defs.map((def) => [def.id, towerKind(def)])),
    actions: Object.assign(
      // The kind's refund (SELL_SHARE) is a share of everything the tower cost, upgrades included.
      { sell: { label: "Sell", on: "tower", removes: true, note: "{target} sold." } },
      ...defs.map(towerActions),
    ),
    queues: { build: { lanes: BUILD_PLOTS.length } },
    ripples: {
      bounty: { world: { "keep.gold": 1, "keep.bounty_earned": 1 } },
      overlap_bonus: { world: { "keep.gold": 1 }, note: "An early release paid the keep." },
      leak: { world: { "keep.lives": -1 }, note: "Raiders broke through to the keep.", hook: "keep_breached" },
    },
    totals,
  },
  hooks: {
    keep_breached(ctx, call) {
      if (call.world.num("keep.lives") > 0 || runEnded(call.world)) return;
      call.world.set("keep.fallen", true);
      finishRun(ctx);
      setGamePhase(ctx, "ended");
      ctx.game.audio.play("defeat");
    },
  },
  onReady(ctx, tower) {
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === tower.slot);
    if (plot === undefined) return;
    ctx.scene.entity.spawn(tower.kind, { id: tower.id, position: plot.position, role: "prop" });
  },
  onRemoved(ctx, { id }) {
    ctx.scene.entity.despawn(id);
    session.towerCooldowns.delete(id);
    if (session.inspectedTowerId === id) session.inspectedTowerId = null;
  },
  onLanded(ctx, action) {
    if (action === "sell") ctx.game.audio.play("sell");
    else ctx.game.audio.play("upgrade");
  },
});

export const keepOf = (ctx: GameContext): WorldModel => keep.of(ctx);

/** A defense that already fell or held: nothing more is built, released or banked. */
export function runEnded(world: WorldModel): boolean {
  return world.fact("keep.fallen") === true || world.fact("keep.held") === true;
}

/** Ready towers standing, every type. */
export function towersStanding(world: WorldModel): number {
  return world.num("keep.towers");
}

/** Damage per shot summed over every ready tower. */
export function firepower(world: WorldModel): number {
  return world.num("keep.firepower");
}

/** One tower's live numbers, as the world holds them. */
export function towerStats(world: WorldModel, id: string) {
  return {
    level: world.num(`${id}.level`),
    damage: world.num(`${id}.damage`),
    range: world.num(`${id}.range`),
    fireRateHz: world.num(`${id}.rate`),
    splashRadius: world.num(`${id}.splash`),
  };
}

/** Gold a tower costs to build, as the declaration prices it. */
export function buildCost(kind: string): number {
  return -((keep.def.kinds?.[kind]?.cost?.["keep.gold"] as number | undefined) ?? 0);
}

/** Gold a cost would take, as a positive number (`costOf` reports spends as negatives). */
export function goldCost(world: WorldModel, action: string, target?: string): number {
  return -(world.costOf(action, target)["keep.gold"] as number | undefined ?? 0);
}

/** What selling a tower returns right now: its share of the build and every upgrade it took. */
export function sellValue(world: WorldModel, id: string, kind: string): number {
  const def = towerDef(kind, editorLayers);
  const step = Math.round(def.cost * UPGRADE_SHARE);
  let paid = def.cost;
  for (let level = 1; level < world.num(`${id}.level`); level += 1) paid += step * level;
  return Math.round(paid * SELL_SHARE);
}

/** Wipe the field back to a fresh keep, opening with the purse and walls the relic and bank allow. */
export function resetKeep(ctx: GameContext, opening: { gold: number; lives: number }): void {
  for (const tower of keep.of(ctx).instances()) ctx.scene.entity.despawn(tower.id);
  keep.store.write(ctx, undefined);
  const world = keep.of(ctx);
  world.set("keep.gold", opening.gold);
  world.set("keep.lives", opening.lives);
  world.set("keep.lives_max", opening.lives);
}

/** Put every ready tower of the stored world back on the field (after a load). */
export function spawnStandingTowers(ctx: GameContext): void {
  for (const tower of keep.of(ctx).instances()) {
    if (!tower.ready || ctx.scene.entity.get(tower.id) !== null) continue;
    const plot = BUILD_PLOTS.find((candidate) => candidate.id === tower.slot);
    if (plot !== undefined) ctx.scene.entity.spawn(tower.kind, { id: tower.id, position: plot.position, role: "prop" });
  }
}

/**
 * Dev-only: the readout a drive asserts against (the keep's facts, towers, builds, refusals) and
 * `beacon.dev.try`, which runs a command a drive expects to be refused without failing the step.
 */
export function exposeKeepReadout(ctx: GameContext, phase: () => string): void {
  if (!import.meta.env?.DEV) return;
  const refused: string[] = [];
  ctx.game.events.on("command.refused", (event) => {
    if (event.message !== undefined) refused.push(event.message);
  });
  ctx.game.commands.define<{ name: string; input?: unknown }>("beacon.dev.try", {
    apply(state, input) {
      state.game.commands.run(input.name, input.input ?? {});
      return state;
    },
  });
  (globalThis as { __beacon?: unknown }).__beacon = {
    read() {
      const world = keep.of(ctx);
      return {
        phase: phase(),
        gold: world.num("keep.gold"),
        lives: world.num("keep.lives"),
        wave: world.num("keep.wave"),
        waveReady: world.fact("keep.wave_ready") === true,
        bounty: world.num("keep.bounty_earned"),
        fallen: world.fact("keep.fallen") === true,
        held: world.fact("keep.held") === true,
        standing: towersStanding(world),
        firepower: firepower(world),
        creeps: session.creeps.size,
        inspected: session.inspectedTowerId,
        towers: Object.fromEntries(world.instances().map((tower) => [tower.id, { kind: tower.kind, slot: tower.slot, ready: tower.ready, level: world.num(`${tower.id}.level`) }])),
        orders: world.orders().map((order) => ({ label: order.label, target: order.target, progress: order.progress })),
        log: world.log().map((entry) => entry.text),
        notices: ctx.game.notices.list().map((notice) => notice.text),
        refused: [...refused],
      };
    },
  };
}
