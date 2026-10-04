import { loadSavedProgress } from "./game/saveCompatibility";
import type { EntityDiedEvent } from "@jgengine/core/game/events";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { setGamePhase } from "./game/phase";
import { relayStore, registerRelay, relayEnemyDied, tickRelay } from "./game/relay";
import { activeCharacter, talentTree, bonus } from "./game/characters";
import { registerCommands, resumeBuild } from "./game/commands";
import { startAmbience, tickAudio } from "./game/audio/drive";
import { noteEquipped, noteGameNow, noteLevelUp, notePlayerHealth, notePlayerShield } from "./game/feel";
import { tickWeaponHandling, resetWeaponHandling } from "./game/combatFeel";
import { rememberGun, restoreGuns } from "./game/lootPersistence";
import { advanceGunDrought, shieldCapacityFor } from "./game/progression";
import { AMMO_STAT_IDS } from "./game/ammo";
import { installCombatProbe } from "./game/combatProbe";
import { tickEnemies } from "./game/entities/enemies/ai";
import { enemyById, levelXpFor } from "./game/entities/enemies/catalog";
import { lootTables } from "./game/entities/enemies/loot-tables";
import { player } from "./game/entities/players/catalog";
import {
  enterDowned,
  reserveExpired,
  reservePhase,
  markRespawned,
  rollGun,
  powerSurge,
  tickDots,
  tickReloads,
  tickShields,
  resetMagazines,
} from "./game/handroll";
import { itemUseHandlers } from "./game/items/use-handlers";
import { loadouts } from "./game/loadouts";
import { grantXp } from "./game/progression/curves";
import { MAIN_QUEST_IDS, QUEST_IDS, quests } from "./game/quests/catalog";
import { session } from "./game/session";
import {
  currentZoneStore,
  discoveredStationsStore,
  echoStore,
  ruskDownStore,
  reactorOpenStore,
  selectedSlotStore,
  progressionStore,
  pendingChassisStore,
  blackMarketStore,
} from "./game/stores";
import { TRAVEL_STATIONS, zoneAt, zoneLevelAt } from "./game/world/sites";
import { PLAYER_SPAWN, PLAYER_SPAWN_YAW, respawnClusters, setupWorld } from "./game/world/setup";

const dropRng = seededRng("scrap-gun-drops");
const RESPAWN_SWEEP_SECONDS = 25;
const DOWNED_WALK_SPEED = 1.6;
const STATION_DISCOVER_RADIUS = 8;

function livingWalkSpeed(): number {
  return Math.round(player.walkSpeed * (1 + bonus("moveSpeed")) * 10) / 10;
}

function deathAnchor(ctx: GameContext, event: EntityDiedEvent): readonly [number, number, number] {
  const dead = ctx.scene.entity.get(event.instanceId);
  if (dead !== null) return dead.position;
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  return playerEntity?.position ?? PLAYER_SPAWN;
}

function dropGunAt(ctx: GameContext, event: EntityDiedEvent, anchor: readonly [number, number, number], guaranteed = 0): void {
  const def = enemyById(event.catalogId);
  if (def === undefined) return;
  const rolled = dropRng() < def.gunDropChance;
  const progress = progressionStore.read(ctx);
  const drought = advanceGunDrought(progress.gunDrought, rolled || guaranteed > 0);
  progressionStore.write(ctx, { ...progress, gunDrought: drought.gunDrought });
  const rolls = guaranteed + (rolled || drought.guaranteed ? 1 : 0);
  if (rolls === 0) return;
  const sourceLevel = event.instanceId.startsWith("dead_air_") ? 1 : zoneLevelAt(anchor[0], anchor[2]);
  const level = Math.max(1, sourceLevel + Math.floor(dropRng() * 3) - 1);
  for (let index = 0; index < rolls; index += 1) {
    const gun = rollGun(dropRng, level, {
      luck: def.gunLuck,
      ...(guaranteed > 0 && index < guaranteed ? { rarity: "legendary" as const } : {}),
    });
    rememberGun(ctx, gun.id);
    ctx.scene.worldItem.spawn({
      itemId: gun.id,
      position: [anchor[0] + (dropRng() - 0.5) * 3, anchor[1], anchor[2] + (dropRng() - 0.5) * 3],
      rarity: gun.rarity,
      baseType: gun.family,
      source: "kill",
    });
    if (drought.guaranteed) ctx.scene.worldItem.spawn({
      itemId: `ammo_${gun.ammo}_pack`,
      position: [anchor[0] + 0.6, anchor[1], anchor[2] + 0.6],
      source: "salvage",
    });
  }
}

function grantCores(ctx: GameContext, event: EntityDiedEvent): void {
  const def = enemyById(event.catalogId);
  if (def === undefined) return;
  let amount = 0;
  if (def.id === "foundry_heart") amount = 20;
  else if (def.family === "boss") amount = 8;
  else if (def.elite) amount = 1 + Math.floor(dropRng() * 3);
  if (amount === 0) return;
  ctx.game.economy.grant(ctx.player.userId, "cores", amount);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `+${amount} CORES`, kind: "pickup" });
}

function onEntityDied(ctx: GameContext, event: EntityDiedEvent): void {
  relayEnemyDied(ctx, event);
  const userId = ctx.player.userId;
  if (event.instanceId === userId) {
    const chassis = ctx.scene.entity.get(userId);
    if (chassis !== null) {
      const stats = Object.fromEntries(Object.keys(player.stats).flatMap((statId) => {
        const stat = ctx.scene.entity.stats.get(userId, statId);
        return stat === null ? [] : [[statId, { ...stat }]];
      }));
      pendingChassisStore.write(ctx, {
        catalogId: chassis.name, position: [...chassis.position],
        rotationX: chassis.rotationX, rotationY: chassis.rotationY, rotationZ: chassis.rotationZ,
        role: chassis.role, stats,
      });
      enterDowned(ctx, ctx.time.now() * 1000);
    }
    return;
  }
  const enemy = enemyById(event.catalogId);
  if (enemy === undefined) return;
  const deathAt = deathAnchor(ctx, event);
  ctx.game.audio.play("enemy_die", deathAt);
  if (event.reason.kind === "player_kill" && event.reason.killerUserId === userId) {
    const anchor = deathAt;
    const sourceLevel = event.instanceId.startsWith("dead_air_") ? 1 : zoneLevelAt(anchor[0], anchor[2]);
    grantXp(ctx, userId, levelXpFor(enemy.xp, sourceLevel));
    grantCores(ctx, event);
    if (enemy.id === "foundry_heart") {
      reactorOpenStore.write(ctx, { atMs: ctx.time.now() * 1000 });
      dropGunAt(ctx, event, anchor, 3);
    } else {
      dropGunAt(ctx, event, anchor);
    }
    if (reservePhase(ctx) === "downed") {
      powerSurge(ctx);
      ctx.scene.entity.update(userId, { movement: { walkSpeed: livingWalkSpeed() } });
      ctx.scene.entity.floatText({ instanceId: userId, text: "POWER SURGE!", kind: "pickup" });
    }
    if (enemy.id === "captain_rusk") ruskDownStore.write(ctx, true);
  }
}

function onLevelUp(ctx: GameContext, userId: string): void {
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    ctx.scene.entity.stats.set(userId, "health", { max: health.max + 8 });
    ctx.scene.entity.stats.delta(userId, "health", health.max + 8);
  }
  const tree = talentTree();
  if (tree !== null) {
    tree.grantPoints(1);
    ctx.scene.entity.stats.set(userId, "skillPoints", { current: tree.pointsAvailable() });
  } else {
    ctx.scene.entity.stats.delta(userId, "skillPoints", 1);
  }
  noteLevelUp(ctx.time.now() * 1000);
  ctx.game.audio.play("levelup");
  ctx.scene.entity.floatText({ instanceId: userId, text: "LEVEL UP! +1 SKILL POINT", kind: "pickup" });
}

function nearestDiscoveredStation(ctx: GameContext): { x: number; z: number } {
  const discovered = discoveredStationsStore.read(ctx);
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  const from = playerEntity?.position ?? PLAYER_SPAWN;
  let best: { x: number; z: number } = { x: PLAYER_SPAWN[0], z: PLAYER_SPAWN[2] };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const station of TRAVEL_STATIONS) {
    if (!discovered.includes(station.zoneId)) continue;
    const distance = Math.hypot(from[0] - station.x, from[2] - station.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: station.x + 4, z: station.z + 4 };
    }
  }
  return best;
}

function respawnAtNewU(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const cash = ctx.game.economy.balance(userId, "cash");
  const fee = Math.floor(cash * 0.07);
  if (fee > 0) ctx.game.economy.charge(userId, "cash", fee);
  const station = nearestDiscoveredStation(ctx);
  const y = ctx.world.groundHeightAt(station.x, station.z);
  ctx.scene.entity.update(userId, {
    position: [station.x, y, station.z],
    movement: { walkSpeed: livingWalkSpeed() },
  });
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) ctx.scene.entity.stats.delta(userId, "health", health.max);
  const shield = ctx.scene.entity.stats.get(userId, "shield");
  if (shield !== null) ctx.scene.entity.stats.delta(userId, "shield", shield.max);
  markRespawned(ctx);
  ctx.scene.entity.floatText({
    instanceId: userId,
    text: fee > 0 ? `RECONSTRUCTED — $${fee} FEE` : "RECONSTRUCTED",
    kind: "warn",
  });
}

function tickReserve(ctx: GameContext, nowMs: number): void {
  const userId = ctx.player.userId;
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health === null) return;
  if (reservePhase(ctx) === "up" && health.current <= (health.min ?? 1)) {
    enterDowned(ctx, nowMs);
    ctx.scene.entity.update(userId, { movement: { walkSpeed: DOWNED_WALK_SPEED } });
  }
  if (reserveExpired(ctx, nowMs)) respawnAtNewU(ctx);
}

function restorePendingChassis(ctx: GameContext): void {
  const pending = pendingChassisStore.read(ctx);
  if (pending === null) return;
  const userId = ctx.player.userId;
  if (ctx.scene.entity.get(userId) === null) {
    // Public spawn also clears the native death latch; the game chooses the downed resurrection policy.
    ctx.scene.entity.spawn(pending.catalogId, {
      id: userId, position: pending.position, role: pending.role,
      rotationX: pending.rotationX, rotationY: pending.rotationY, rotationZ: pending.rotationZ,
      movement: { walkSpeed: DOWNED_WALK_SPEED },
    });
  }
  ctx.scene.entity.update(userId, { movement: { walkSpeed: DOWNED_WALK_SPEED } });
  for (const [statId, stat] of Object.entries(pending.stats)) ctx.scene.entity.stats.set(userId, statId, stat);
  pendingChassisStore.write(ctx, null);
}

function tickZoneAndStations(ctx: GameContext, nowMs: number): void {
  const playerEntity = ctx.scene.entity.get(ctx.player.userId);
  if (playerEntity === null) return;
  const [x, , z] = playerEntity.position;

  const zone = zoneAt(x, z);
  const currentZone = currentZoneStore.read(ctx);
  if (zone !== null && zone.id !== currentZone?.id) {
    currentZoneStore.write(ctx, { id: zone.id, name: zone.name, level: zone.level, atMs: nowMs });
  }

  const discovered = discoveredStationsStore.read(ctx);
  for (const station of TRAVEL_STATIONS) {
    if (discovered.includes(station.zoneId)) continue;
    if (Math.hypot(x - station.x, z - station.z) <= STATION_DISCOVER_RADIUS) {
      discoveredStationsStore.write(ctx, [...discovered, station.zoneId]);
      ctx.scene.entity.floatText({
        instanceId: ctx.player.userId,
        text: `FAST TRAVEL DISCOVERED: ${station.name.toUpperCase()}`,
        kind: "pickup",
      });
      break;
    }
  }
}

function onInit(ctx: GameContext): void {
  ctx.item.use.register(itemUseHandlers);
  ctx.player.loadout.register(loadouts);
  for (const table of lootTables) ctx.game.loot.register(table);
  ctx.game.quest!.register(quests);
  ctx.game.quest!.bind("entity.died");
  registerCommands(ctx);
  registerRelay(ctx, respawnAtNewU);

  ctx.game.feed.bind("entity.died");
  ctx.game.feed.bind("loot.granted");

  ctx.game.events.on("entity.died", (event) => onEntityDied(ctx, event));
  ctx.game.events.on("stat.levelUp", (event) => {
    if (event.stat === "level") onLevelUp(ctx, event.userId);
  });
  ctx.game.events.on("quest.accepted", (event) => {
    echoStore.write(ctx, { questId: event.questId, atMs: ctx.time.now() * 1000 });
  });
  ctx.game.events.on("quest.completed", (event) => {
    ctx.game.quest!.turnIn(event.userId, event.questId);
    const reward = quests.find((quest) => quest.id === event.questId)?.rewards;
    if (reward?.xp !== undefined) grantXp(ctx, event.userId, reward.xp.amount);
    ctx.scene.entity.floatText({ instanceId: event.userId, text: "MISSION COMPLETE", kind: "pickup" });
    void ctx.game.save?.checkpoint();
  });

  startAmbience(ctx);
  setupWorld(ctx);
  installCombatProbe(ctx);
  ctx.time.every(RESPAWN_SWEEP_SECONDS, () => respawnClusters(ctx));
}

function onNewPlayer(ctx: GameContext): void {
  setGamePhase(ctx, "menu");
  ctx.time.pause();
  const y = ctx.world.groundHeightAt(PLAYER_SPAWN[0], PLAYER_SPAWN[2]);
  ctx.scene.entity.spawn(player.id, {
    id: ctx.player.userId,
    position: [PLAYER_SPAWN[0], y, PLAYER_SPAWN[2]],
    rotationY: PLAYER_SPAWN_YAW,
    role: "player",
  });
  if (ctx.player.isNew) ctx.player.applyLoadout(ctx.player.userId, "starterKit");
  ctx.game.quest!.accept(ctx.player.userId, MAIN_QUEST_IDS[0]!);
  ctx.game.quest!.accept(ctx.player.userId, QUEST_IDS.bruiserSurvey);
  ctx.game.quest!.accept(ctx.player.userId, QUEST_IDS.ripperControl);
  session.reset(ctx);
  noteEquipped(ctx.player.inventory.state("hotbar").slots[0]?.itemId ?? null);
  void resumeOrStart(ctx);
}

/**
 * The fresh spawn above is a baseline; the whole-world save decides the real boot. `load()` restores
 * every persisted subsystem (entities, stats, inventory, economy, quests, the character-id/talent-rank
 * stores) over that baseline, then `resumeBuild` re-derives the module-level character/talent singletons
 * and drops straight into play. Otherwise (or when the save predates a character pick) we open character
 * select — but never override a phase the capture harness's `character.pick` may have set concurrently.
 */
async function resumeOrStart(ctx: GameContext): Promise<void> {
  resetMagazines(ctx);
  resetWeaponHandling(ctx);
  if ((await loadSavedProgress(ctx)) && resumeBuild(ctx)) {
    restoreGuns(ctx);
    restorePendingChassis(ctx);
    const rebuilt = recoverMissingSavedChassis(ctx);
    session.selectSlot(ctx, selectedSlotStore.read(ctx));
    noteEquipped(ctx.player.inventory.state("hotbar").slots[session.selectedSlot()]?.itemId ?? null);
    const relay = relayStore.read(ctx);
    const ended = relay.phase === "won" || relay.phase === "lost";
    setGamePhase(ctx, ended ? "ended" : "playing");
    if (ended) ctx.time.pause();
    else ctx.time.play();
    if (rebuilt) await ctx.game.save?.checkpoint();
    return;
  }
  if (activeCharacter() === null) setGamePhase(ctx, "menu");
}

function recoverMissingSavedChassis(ctx: GameContext): boolean {
  const userId = ctx.player.userId;
  if (ctx.scene.entity.get(userId) !== null || pendingChassisStore.read(ctx) !== null) return false;
  const station = nearestDiscoveredStation(ctx);
  ctx.scene.entity.spawn(player.id, {
    id: userId, role: "player", position: [station.x, ctx.world.groundHeightAt(station.x, station.z), station.z],
    rotationY: PLAYER_SPAWN_YAW, movement: { walkSpeed: DOWNED_WALK_SPEED },
  });
  const market = blackMarketStore.read(ctx);
  for (const [statId, spec] of Object.entries(player.stats)) {
    let max = spec.max;
    if (statId === "health") max = Math.round(max * (1 + bonus("maxHealth"))) + 25 * (market.health ?? 0);
    else if (statId === "shield") max = shieldCapacityFor(max + 25 * (market.shield ?? 0), "balanced", progressionStore.read(ctx).shieldProfile);
    else if (statId === "grenades") max += market.grenade ?? 0;
    else if (Object.values(AMMO_STAT_IDS).includes(statId)) {
      for (let rank = 0; rank < (market.ammo ?? 0); rank += 1) max = Math.round(max * 1.3);
    }
    ctx.scene.entity.stats.set(userId, statId, { max, current: spec.min ?? 0, min: spec.min ?? 0 });
  }
  enterDowned(ctx, ctx.time.now() * 1000);
  const relay = relayStore.read(ctx);
  for (const id of relay.enemies) ctx.scene.entity.despawn(id);
  relayStore.write(ctx, {
    ...relay, phase: "lost", enemies: [],
    reason: "The previous checkpoint lost your chassis stats, level/XP and reserve ammo. Your saved talents, upgrades and capacitor profile rebuilt the chassis. Items, cash, missions and equipment choices were retained. Return to reconstruct with the usual fee; reserve ammo starts empty.",
  });
  return true;
}

function onTick(ctx: GameContext, dt: number): void {
  const nowMs = ctx.time.now() * 1000;
  noteGameNow(nowMs);
  restorePendingChassis(ctx);
  if (activeCharacter() === null || gamePhase(ctx) !== "playing" || dt <= 0) return;
  tickWeaponHandling(ctx, dt);
  tickAudio(ctx, nowMs);
  tickEnemies(ctx, dt);
  restorePendingChassis(ctx);
  tickShields(ctx, nowMs, dt, 1, progressionStore.read(ctx).shieldProfile);
  tickDots(ctx, nowMs);
  restorePendingChassis(ctx);
  tickReloads(ctx, dt);
  tickReserve(ctx, nowMs);
  tickRelay(ctx, dt);
  tickZoneAndStations(ctx, nowMs);
  notePlayerHealth(nowMs, ctx.scene.entity.stats.get(ctx.player.userId, "health")?.current ?? null);
  notePlayerShield(nowMs, ctx.scene.entity.stats.get(ctx.player.userId, "shield")?.current ?? null);
}

export const loop = { onInit, onNewPlayer, onTick, resumeOrStart };
