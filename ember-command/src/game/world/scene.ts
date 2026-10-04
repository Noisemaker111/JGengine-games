import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { battleSave } from "../persistence";
import { publishHud } from "../systems";
import { editorLayers } from "../../editorLayers";
import { BUILDINGS, combatantDef, DECOR, isNode, NODES } from "../catalog";
import { grantHeroXp, heroXpFor } from "../hero";
import { registerCommands } from "../commands";
import { hudStore } from "../hudStore";
import { GOLD, LUMBER, STARTING_GOLD, STARTING_LUMBER } from "../tuning";
import { initResourceField, resetSession, session, type UnitRuntime } from "../session";
import { recordOutcome } from "../preferences";

const wiredContexts = new WeakSet<GameContext>();

const GUARD_LEASH = 16;

function markerCatalogId(marker: { catalogId?: string; meta?: unknown }): string | null {
  if (typeof marker.catalogId === "string" && marker.catalogId.length > 0) return marker.catalogId;
  const meta = marker.meta as { catalogId?: string } | undefined;
  return typeof meta?.catalogId === "string" ? meta.catalogId : null;
}

function markerPosition(marker: { position: { x: number; y?: number; z: number } }): EntityPosition {
  return [marker.position.x, marker.position.y ?? 0, marker.position.z];
}

export function playerKeepPoint(): { x: number; z: number } {
  const keep = editorLayers.markers.find((m) => markerCatalogId(m) === "keep_player");
  return keep === undefined ? { x: 0, z: 36 } : { x: keep.position.x, z: keep.position.z };
}

function onDied(ctx: GameContext, event: EntityDiedEvent): void {
  if (session.over) return;
  session.units.delete(event.instanceId);
  if (event.catalogId === "hero") {
    session.heroState.recoveryIn = 20;
    hudStore.set({ notice: "Bram has fallen. Hold the line for 20 seconds, then revive him at the keep for 100 gold. His levels are lost." });
  }
  const def = combatantDef(event.catalogId);
  if (def === null) return;
  if (def.id === "keep_enemy") {
    session.over = true;
    session.victory = true;
    hudStore.set({ phase: "won" });
    recordOutcome(true, session.elapsed);
    ctx.time.pause();
    setGamePhase(ctx, "ended");
    return;
  }
  if (def.id === "keep_player") {
    session.over = true;
    session.victory = false;
    hudStore.set({ phase: "lost" });
    recordOutcome(false, session.elapsed);
    ctx.time.pause();
    setGamePhase(ctx, "ended");
    return;
  }
  if (def.faction === "enemy" && def.kind === "unit") {
    if (def.bounty > 0) ctx.game.economy.grant(ctx.player.userId, GOLD, def.bounty);
    grantHeroXp(ctx, heroXpFor(event.catalogId)); // the hero champions the kill
  }
  // A razed Farm lowers the supply cap.
  const supply = BUILDINGS[event.catalogId]?.supply;
  if (def.faction === "player" && def.kind === "building" && supply !== undefined) {
    session.supplyCap = Math.max(0, session.supplyCap - supply);
  }
}

/** Spawn the authored roster + resource nodes, wire economy + win/lose, and register the RTS commands. */
export function setupSkirmish(ctx: GameContext): void {
  for (const entity of ctx.scene.entity.list()) ctx.scene.entity.despawn(entity.id);
  for (const resource of [GOLD, LUMBER]) {
    const amount = ctx.game.economy.balance(ctx.player.userId, resource);
    if (amount > 0) ctx.game.economy.charge(ctx.player.userId, resource, amount);
  }
  resetSession();
  session.started = false;
  const savedBattle = hudStore.get().savedBattle;
  hudStore.reset();
  hudStore.set({ phase: "ready", gold: STARTING_GOLD, lumber: STARTING_LUMBER, savedBattle });
  setGamePhase(ctx, "menu");
  ctx.time.pause();
  ctx.game.economy.grant(ctx.player.userId, GOLD, STARTING_GOLD);
  ctx.game.economy.grant(ctx.player.userId, LUMBER, STARTING_LUMBER);

  const rallyOnPlayer = playerKeepPoint();

  for (const marker of editorLayers.markers) {
    const catalogId = markerCatalogId(marker);
    if (catalogId === null) continue;
    const pos = markerPosition(marker);
    const def = combatantDef(catalogId);

    if (def !== null) {
      // Engine spawn role is presentation-only ("npc"); hostility is decided by faction in the AI.
      ctx.scene.entity.spawn(catalogId, { id: marker.id, position: pos, role: "npc" });
      const unit: UnitRuntime = {
        id: marker.id,
        catalogId,
        faction: def.faction,
        kind: def.kind,
        command: { kind: "idle" },
        leash: 0,
        attackCooldown: 0,
      };
      if (def.kind === "building" && def.faction === "player") {
        // Depot anchor for peasant hauling.
        unit.guardPoint = { x: pos[0], z: pos[2] };
      }
      if (def.kind === "unit" && def.faction === "enemy") {
        const stance = (marker.meta as { stance?: string } | undefined)?.stance;
        if (stance === "assault") {
          unit.command = { kind: "attackMove", x: rallyOnPlayer.x, z: rallyOnPlayer.z };
        } else {
          unit.guardPoint = { x: pos[0], z: pos[2] };
          unit.leash = GUARD_LEASH;
        }
      }
      session.units.set(marker.id, unit);
      continue;
    }

    if (isNode(catalogId)) {
      ctx.scene.entity.spawn(catalogId, { id: marker.id, position: pos, role: "npc", rotationY: marker.rotationY ?? 0 });
      session.nodes.set(marker.id, { id: marker.id, resource: NODES[catalogId]!.resource, x: pos[0], z: pos[2] });
      continue;
    }

    if (DECOR.has(catalogId)) {
      ctx.scene.entity.spawn(catalogId, { id: marker.id, position: pos, role: "npc", rotationY: marker.rotationY ?? 0 });
    }
  }

  initResourceField(ctx.rng);
  publishHud(ctx);
  battleSave(ctx);
  if (wiredContexts.has(ctx)) return;
  wiredContexts.add(ctx);
  registerCommands(ctx);
  ctx.game.commands.define("match.save", { apply: (state) => {
    if (session.started && !session.over) {
      void battleSave(state).save().then(() => hudStore.set({ savedBattle: true, notice: "Battle saved. Use Continue or Load battle to resume this checkpoint." })).catch(() => hudStore.set({ notice: "Saving failed. Check device storage and try again." }));
    }
    return state;
  } });
  ctx.game.commands.define("match.load", { apply: (state) => {
    void battleSave(state).load().then((loaded) => {
      if (!loaded) return;
      session.paused = true;
      state.time.pause();
      setGamePhase(state, "paused");
      publishHud(state);
      hudStore.set({ phase: "paused", savedBattle: true, notice: "Battle restored and paused. Resume when your orders are ready." });
    }).catch(() => hudStore.set({ notice: "Battle could not be loaded. Your current battle is unchanged." }));
    return state;
  } });
  ctx.game.commands.define("match.recover", { apply: (state) => {
    if (!session.started || session.paused || session.over || session.units.has("hero") || session.heroState.recoveryIn > 0 || state.game.economy.balance(state.player.userId, GOLD) < 100) return state;
    const keep = [...session.units.values()].find((u) => u.catalogId === "keep_player");
    const p = keep && state.scene.entity.get(keep.id)?.position;
    if (!p) return state;
    state.game.economy.charge(state.player.userId, GOLD, 100);
    state.scene.entity.spawn("hero", { id: "hero", position: [p[0], 0, p[2] - 7], role: "npc" });
    session.units.set("hero", { id: "hero", catalogId: "hero", faction: "player", kind: "unit", command: { kind: "idle" }, guardPoint: { x: p[0], z: p[2] - 7 }, leash: 14, attackCooldown: 0 });
    session.heroState.abilityCooldown = 0;
    publishHud(state);
    hudStore.set({ notice: "Bram returns at level 1. Protect the depot to recover your wounded army." });
    return state;
  } });
  ctx.game.commands.define("match.start", { apply: (state) => {
    if (!session.started && !session.over) {
      session.started = true;
      publishHud(state);
      hudStore.set({ phase: "playing" });
      setGamePhase(state, "playing");
      state.time.play();
    }
    return state;
  } });
  ctx.game.commands.define("match.pause", { apply: (state) => {
    if (session.started && !session.over) {
      session.paused = true;
      hudStore.set({ phase: "paused" });
      setGamePhase(state, "paused");
      state.time.pause();
    }
    return state;
  } });
  ctx.game.commands.define("match.resume", { apply: (state) => {
    if (session.started && !session.over) {
      session.paused = false;
      publishHud(state);
      hudStore.set({ phase: "playing" });
      setGamePhase(state, "playing");
      state.time.play();
    }
    return state;
  } });
  ctx.game.commands.define("match.restart", { apply: (state) => {
    setupSkirmish(state);
    state.game.commands.run("match.start", {});
    return state;
  } });
  ctx.game.commands.define("match.title", { apply: (state) => { setupSkirmish(state); return state; } });
  ctx.game.events.on("entity.died", (event) => onDied(ctx, event));
}
