import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_STAT_IDS, type AmmoPool } from "./ammo";
import { gearById, AMMO_PRICES } from "./items/gear/catalog";
import { setGamePhase } from "./phase";
import { activeCharacter, characterById, pickCharacter, talentTree, bonus } from "./characters";
import { noteEquipped } from "./feel";
import { gunById, rollGun, toggleReload, cancelReload, reservePhase } from "./handroll";
import { switchWeapon } from "./combatFeel";
import { rememberGun } from "./lootPersistence";
import { CONTRACT_GUNS, shieldProfileById, shieldCapacityFor } from "./progression";
import { relayDistance, relayStore } from "./relay";
import { player } from "./entities/players/catalog";
import { session } from "./session";
import {
  blackMarketOpenStore,
  blackMarketStore,
  characterIdStore,
  discoveredStationsStore,
  echoStore,
  lastPickupStore,
  openedChestsStore,
  skillsOpenStore,
  talentRanksStore,
  travelOpenStore,
  vendorOpenStore,
  progressionStore,
} from "./stores";
import { TRAVEL_STATIONS } from "./world/sites";
import { zoneLevelAt } from "./world/zones";

export const BLACK_MARKET_UPGRADES = [
  { id: "ammo", name: "Ammo SDU", blurb: "+30% max ammo, every pool" },
  { id: "health", name: "Health SDU", blurb: "+25 max health" },
  { id: "shield", name: "Shield SDU", blurb: "+25 max shield" },
  { id: "grenade", name: "Grenade SDU", blurb: "+1 grenade capacity" },
] as const;

export type BlackMarketCounts = Record<string, number>;

export function upgradeCost(count: number): number {
  return 4 + count * 4;
}

const PICKUP_RADIUS = 2.8;
const chestRng = seededRng("scrap-red-chests");

interface AimPayload {
  aim?: { yaw: number; pitch: number };
}

export function selectedGunId(ctx: GameContext): string | null {
  const slots = ctx.player.inventory.state("hotbar").slots;
  const stack = slots[session.selectedSlot()];
  return stack?.itemId ?? null;
}

function playerLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
}

function pickupWorldItem(ctx: GameContext): void {
  const userId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(userId);
  if (playerEntity === null) return;
  const nearestId = ctx.scene.worldItem.nearestInRadius(playerEntity.position, PICKUP_RADIUS);
  if (nearestId === null) return;
  const record = ctx.scene.worldItem.get(nearestId);
  if (record === null) return;

  const gun = gunById(record.itemId);
  if (gun !== undefined) {
    const slot = session.selectedSlot();
    const slots = ctx.player.inventory.state("hotbar").slots;
    const current = slots[slot] ?? null;
    ctx.scene.worldItem.consume(record.instanceId);
    if (current !== null) {
      ctx.player.inventory.take("hotbar", current.itemId, current.count);
      const held = gunById(current.itemId);
      ctx.scene.worldItem.spawn({
        itemId: current.itemId,
        position: [playerEntity.position[0], playerEntity.position[1], playerEntity.position[2]],
        rarity: held?.rarity,
        baseType: held?.family,
        source: "swap",
      });
    }
    ctx.player.inventory.put("hotbar", gun.id, 1, { slot });
    noteEquipped(gun.id);
    lastPickupStore.write(ctx, { gunId: gun.id, atMs: ctx.time.now() * 1000 });
    ctx.scene.entity.floatText({ instanceId: userId, text: gun.name.toUpperCase(), kind: "pickup" });
    ctx.game.feed.push("loot.pickup", { itemId: gun.id, rarity: gun.rarity });
    return;
  }

  const gear = gearById(record.itemId);
  if (gear === undefined) return;
  if (gear.kind === "ammo" && gear.ammo !== undefined && gear.ammoAmount !== undefined) {
    const statId = AMMO_STAT_IDS[gear.ammo];
    const pool = ctx.scene.entity.stats.get(userId, statId);
    if (pool !== null && pool.current >= pool.max) {
      ctx.scene.entity.floatText({ instanceId: userId, text: "AMMO FULL", kind: "warn" });
      return;
    }
    ctx.scene.worldItem.consume(record.instanceId);
    ctx.scene.entity.stats.delta(userId, statId, gear.ammoAmount * record.count);
    ctx.scene.entity.floatText({ instanceId: userId, text: `+${gear.ammoAmount * record.count} ${gear.name.toUpperCase()}`, kind: "pickup" });
    return;
  }
  const result = ctx.player.inventory.put("backpack", gear.id, record.count);
  if (result.status !== "ok") {
    ctx.scene.entity.floatText({ instanceId: userId, text: "PACK FULL", kind: "warn" });
    return;
  }
  ctx.scene.worldItem.consume(record.instanceId);
  ctx.scene.entity.floatText({ instanceId: userId, text: gear.name.toUpperCase(), kind: "pickup" });
}

function claimChest(ctx: GameContext, instanceId: string): boolean {
  const opened = openedChestsStore.read(ctx);
  if (opened.includes(instanceId)) {
    ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "CHEST EMPTY", kind: "warn" });
    return false;
  }
  openedChestsStore.write(ctx, [...opened, instanceId]);
  return true;
}

function openRedChest(ctx: GameContext, instanceId: string): void {
  if (!claimChest(ctx, instanceId)) return;
  const object = ctx.scene.object.get(instanceId);
  const at = object?.position ?? ctx.scene.entity.get(ctx.player.userId)?.position ?? [0, 0, 0];
  const chestLevel = Math.max(playerLevel(ctx), zoneLevelAt(at[0], at[2]));
  for (let roll = 0; roll < 2; roll += 1) {
    const gun = rollGun(chestRng, chestLevel, { luck: 4 });
    rememberGun(ctx, gun.id);
    ctx.scene.worldItem.spawn({
      itemId: gun.id,
      position: [at[0] + 0.8 + roll * 0.8, at[1], at[2] + 0.9],
      rarity: gun.rarity,
      baseType: gun.family,
      source: "chest",
    });
  }
}

function openAmmoChest(ctx: GameContext, instanceId: string): void {
  if (!claimChest(ctx, instanceId)) return;
  const object = ctx.scene.object.get(instanceId);
  const at = object?.position ?? [0, 0, 0];
  const selected = gunById(selectedGunId(ctx) ?? "");
  const pools: readonly AmmoPool[] = ["pistol", selected?.ammo === "pistol" ? "rifle" : selected?.ammo ?? "rifle"];
  for (let index = 0; index < 2; index += 1) {
    const pool = pools[index]!;
    ctx.scene.worldItem.spawn({
      itemId: `ammo_${pool}_pack`,
      position: [at[0] + 0.6 + index * 0.7, at[1], at[2] + 0.8],
      source: "chest",
    });
  }
  ctx.scene.entity.stats.delta(ctx.player.userId, "grenades", 1);
  ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: "+1 GRENADE", kind: "pickup" });
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<AimPayload>("fire", {
    apply(state: GameContext, input) {
      if (reservePhase(state) === "dead") return;
      const itemId = selectedGunId(state);
      if (itemId === null) return;
      state.item.use.use({ from: state.player.userId, itemId, inventoryId: "hotbar", aim: input.aim });
    },
  });

  ctx.game.commands.define("reload", {
    apply(state: GameContext) {
      const itemId = selectedGunId(state);
      if (itemId === null) return;
      const gun = gunById(itemId);
      if (gun === undefined) return;
      toggleReload(state, gun);
    },
  });

  for (const slot of [0, 1, 2, 3]) {
    ctx.game.commands.define(`selectSlot${slot + 1}`, {
      apply(state: GameContext) {
        const previous = gunById(selectedGunId(state) ?? "");
        if (previous !== undefined) cancelReload(state, previous);
        session.selectSlot(state, slot);
        noteEquipped(selectedGunId(state));
        switchWeapon(state, gunById(selectedGunId(state) ?? "") ?? null);
      },
    });
  }

  ctx.game.commands.define<AimPayload>("throwGrenade", {
    apply(state: GameContext, input) {
      state.item.use.use({ from: state.player.userId, itemId: "frag_grenade", inventoryId: "backpack", aim: input.aim });
    },
  });

  ctx.game.commands.define("useHealthVial", {
    apply(state: GameContext) {
      const itemId =
        state.player.inventory.count("backpack", "insta_health_big") > 0 ? "insta_health_big" : "insta_health";
      state.item.use.use({ from: state.player.userId, itemId, inventoryId: "backpack" });
    },
  });

  ctx.game.commands.define("pickup", {
    apply(state: GameContext) {
      pickupWorldItem(state);
    },
  });

  ctx.game.commands.define<{ instanceId?: string }>("chest.openRed", {
    apply(state: GameContext, input) {
      if (input.instanceId !== undefined) openRedChest(state, input.instanceId);
    },
  });

  ctx.game.commands.define<{ instanceId?: string }>("chest.openAmmo", {
    apply(state: GameContext, input) {
      if (input.instanceId !== undefined) openAmmoChest(state, input.instanceId);
    },
  });

  ctx.game.commands.define<{ vendor?: string }>("vendor.open", {
    apply(state: GameContext, input) {
      if (input.vendor !== undefined) vendorOpenStore.write(state, input.vendor);
    },
  });

  ctx.game.commands.define("vendor.close", {
    apply(state: GameContext) {
      vendorOpenStore.clear(state);
    },
  });

  ctx.game.commands.define<{ itemId?: string }>("vendor.buyGear", {
    apply(state: GameContext, input) {
      if (input.itemId === undefined) return;
      const rejection = state.game.trade!.buy(input.itemId, 1, { shop: "shop_ferralon", inventoryId: "backpack" });
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: "NOT ENOUGH CASH", kind: "warn" });
      }
    },
  });

  ctx.game.commands.define<{ pool?: AmmoPool }>("vendor.buyAmmo", {
    apply(state: GameContext, input) {
      if (input.pool === undefined) return;
      const price = AMMO_PRICES[input.pool];
      const userId = state.player.userId;
      const statId = AMMO_STAT_IDS[input.pool];
      const stat = state.scene.entity.stats.get(userId, statId);
      if (stat !== null && stat.current >= stat.max) {
        state.scene.entity.floatText({ instanceId: userId, text: "AMMO FULL", kind: "warn" });
        return;
      }
      const rejection = state.game.economy.charge(userId, "cash", price.cash);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      state.scene.entity.stats.delta(userId, statId, price.amount);
    },
  });

  ctx.game.commands.define<{ vendor?: string }>("vendor.gunOfTheDay", {
    apply(state: GameContext, input) {
      const userId = state.player.userId;
      const rejection = state.game.economy.charge(userId, "cash", 300);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH CASH", kind: "warn" });
        return;
      }
      const gun = rollGun(chestRng, playerLevel(state), { luck: 6 });
      rememberGun(state, gun.id);
      const playerEntity = state.scene.entity.get(userId);
      const at = playerEntity?.position ?? [0, 0, 0];
      state.scene.worldItem.spawn({
        itemId: gun.id,
        position: [at[0] + 1.2, at[1], at[2] + 1.2],
        rarity: gun.rarity,
        baseType: gun.family,
        source: input.vendor ?? "vendor",
      });
    },
  });

  ctx.game.commands.define("npc.gauge", {
    apply(state: GameContext) {
      echoStore.write(state, { questId: "q_bruiser_survey", atMs: state.time.now() * 1000 });
    },
  });

  ctx.game.commands.define("blackmarket.open", {
    apply(state: GameContext) {
      blackMarketOpenStore.write(state, true);
    },
  });

  ctx.game.commands.define("blackmarket.close", {
    apply(state: GameContext) {
      blackMarketOpenStore.clear(state);
    },
  });

  ctx.game.commands.define("travel.open", {
    apply(state: GameContext) {
      travelOpenStore.write(state, true);
    },
  });

  ctx.game.commands.define("travel.close", {
    apply(state: GameContext) {
      travelOpenStore.clear(state);
    },
  });

  ctx.game.commands.define<{ zoneId?: string }>("travel.go", {
    apply(state: GameContext, input) {
      if (reservePhase(state) === "downed") return;
      const station = TRAVEL_STATIONS.find((candidate) => candidate.zoneId === input.zoneId);
      if (station === undefined) return;
      const discovered = discoveredStationsStore.read(state);
      if (!discovered.includes(station.zoneId)) return;
      const y = state.world.groundHeightAt(station.x + 3, station.z + 3);
      state.scene.entity.update(state.player.userId, { position: [station.x + 3, y, station.z + 3] });
      travelOpenStore.clear(state);
      state.scene.entity.floatText({ instanceId: state.player.userId, text: station.name.toUpperCase(), kind: "pickup" });
    },
  });

  ctx.game.commands.define<{ upgrade?: string }>("blackmarket.buy", {
    apply(state: GameContext, input) {
      const upgrade = BLACK_MARKET_UPGRADES.find((candidate) => candidate.id === input.upgrade);
      if (upgrade === undefined) return;
      const userId = state.player.userId;
      const counts = { ...blackMarketStore.read(state) };
      const owned = counts[upgrade.id] ?? 0;
      const cost = upgradeCost(owned);
      const rejection = state.game.economy.charge(userId, "cores", cost);
      if (rejection !== null) {
        state.scene.entity.floatText({ instanceId: userId, text: "NOT ENOUGH CORES", kind: "warn" });
        return;
      }
      counts[upgrade.id] = owned + 1;
      blackMarketStore.write(state, counts);
      if (upgrade.id === "ammo") {
        for (const statId of Object.values(AMMO_STAT_IDS)) {
          const stat = state.scene.entity.stats.get(userId, statId);
          if (stat !== null) state.scene.entity.stats.set(userId, statId, { max: Math.round(stat.max * 1.3) });
        }
      } else if (upgrade.id === "health" || upgrade.id === "shield") {
        const statId = upgrade.id;
        const stat = state.scene.entity.stats.get(userId, statId);
        if (stat !== null) {
          state.scene.entity.stats.set(userId, statId, { max: stat.max + 25 });
          state.scene.entity.stats.delta(userId, statId, 25);
        }
      } else if (upgrade.id === "grenade") {
        const stat = state.scene.entity.stats.get(userId, "grenades");
        if (stat !== null) {
          state.scene.entity.stats.set(userId, "grenades", { max: stat.max + 1 });
          state.scene.entity.stats.delta(userId, "grenades", 1);
        }
      }
      state.scene.entity.floatText({ instanceId: userId, text: `${upgrade.name.toUpperCase()} ACQUIRED`, kind: "pickup" });
    },
  });

  ctx.game.commands.define("ui.openSkills", {
    apply(state: GameContext) {
      const open = skillsOpenStore.read(state);
      if (open) skillsOpenStore.clear(state);
      else skillsOpenStore.write(state, true);
    },
  });

  ctx.game.commands.define<{ gunId?: string }>("progression.claimGun", {
    apply(state: GameContext, input) {
      const progress = progressionStore.read(state);
      const relay = relayStore.read(state);
      if (!relay.rewarded || progress.contractGun !== null) return;
      if (relay.phase !== "won" && (relayDistance(state) > 3.8 || relay.phase === "defend" || relay.phase === "upload")) return;
      const gun = CONTRACT_GUNS.find((entry) => entry.id === input.gunId);
      if (gun === undefined) return;
      const slots = state.player.inventory.state("hotbar").slots;
      const slot = slots.findIndex((entry) => entry === null);
      const position = state.scene.entity.get(state.player.userId)?.position;
      if (position === undefined) return;
      if (slot >= 0) {
        if (state.player.inventory.put("hotbar", gun.id, 1, { slot }).status !== "ok") return;
      } else {
        state.scene.worldItem.spawn({ itemId: gun.id, position, rarity: gun.rarity, baseType: gun.family, source: "contract" });
      }
      rememberGun(state, gun.id);
      progressionStore.write(state, { ...progress, contractGun: gun.id });
      state.scene.entity.stats.delta(state.player.userId, AMMO_STAT_IDS[gun.ammo], gun.ammo === "shotgun" ? 8 : 20);
      state.scene.entity.floatText({ instanceId: state.player.userId, text: `${gun.name.toUpperCase()} SECURED`, kind: "pickup" });
      void state.game.save?.checkpoint();
    },
  });

  ctx.game.commands.define<{ profileId?: string }>("progression.shield", {
    apply(state: GameContext, input) {
      const relay = relayStore.read(state);
      if (relayDistance(state) > 3.8 || relay.phase === "defend" || relay.phase === "upload" || reservePhase(state) !== "up") return;
      const profile = shieldProfileById(input.profileId ?? "");
      if (profile === undefined) return;
      const progress = progressionStore.read(state);
      if (profile.id === progress.shieldProfile) return;
      const shield = state.scene.entity.stats.get(state.player.userId, "shield");
      if (shield === null || shield.max <= 0) return;
      const max = shieldCapacityFor(shield.max, progress.shieldProfile, profile.id);
      const current = max * shield.current / shield.max;
      state.scene.entity.stats.set(state.player.userId, "shield", { max, current });
      progressionStore.write(state, { ...progress, shieldProfile: profile.id });
      state.scene.entity.floatText({ instanceId: state.player.userId, text: `${profile.name.toUpperCase()} SHIELD`, kind: "pickup" });
      void state.game.save?.checkpoint();
    },
  });

  ctx.game.commands.define<{ characterId?: string }>("character.pick", {
    apply(state: GameContext, input) {
      if (activeCharacter() !== null) return;
      const def = characterById(input.characterId ?? "");
      if (def === undefined) return;
      pickCharacter(def.id);
      characterIdStore.write(state, def.id);
      applyPassiveEffects(state);
      setGamePhase(state, "playing");
      state.time.play();
      state.scene.entity.floatText({
        instanceId: state.player.userId,
        text: `${def.name.toUpperCase()} — ${def.className.toUpperCase()}`,
        kind: "pickup",
      });
    },
  });

  ctx.game.commands.define<{ nodeId?: string }>("talent.spend", {
    apply(state: GameContext, input) {
      const tree = talentTree();
      if (tree === null || input.nodeId === undefined) return;
      const before = 1 + bonus("maxHealth");
      const result = tree.allocate(input.nodeId);
      if (!result.ok) {
        state.scene.entity.floatText({ instanceId: state.player.userId, text: result.reason.toUpperCase(), kind: "warn" });
        return;
      }
      talentRanksStore.write(state, tree.snapshot().ranks);
      state.scene.entity.stats.set(state.player.userId, "skillPoints", { current: tree.pointsAvailable() });
      applyPassiveEffects(state, before);
    },
  });
}

/**
 * Re-derive the module-level `activeCharacter`/`talentTree` singletons from the restored stores after a
 * whole-world `ctx.game.save.load()` — they live outside the world snapshot, unlike the character id,
 * talent ranks and `skillPoints` stat the load already restored. Returns whether a saved build was found.
 */
export function resumeBuild(ctx: GameContext): boolean {
  const characterId = characterIdStore.read(ctx);
  if (characterId === null) return false;
  const def = pickCharacter(characterId);
  const tree = talentTree();
  if (def === null || tree === null) return false;
  const available = ctx.scene.entity.stats.get(ctx.player.userId, "skillPoints")?.current ?? 0;
  tree.hydrate({ points: available, ranks: talentRanksStore.read(ctx) });
  return true;
}

function applyPassiveEffects(ctx: GameContext, previousHealthMult = 1): void {
  const userId = ctx.player.userId;
  const healthMult = 1 + bonus("maxHealth");
  if (healthMult !== previousHealthMult) {
    const health = ctx.scene.entity.stats.get(userId, "health");
    if (health !== null) {
      const max = Math.round((health.max / previousHealthMult) * healthMult);
      ctx.scene.entity.stats.set(userId, "health", { max });
      ctx.scene.entity.stats.delta(userId, "health", Math.max(0, max - health.max));
    }
  }
  ctx.scene.entity.update(userId, {
    movement: { walkSpeed: Math.round(player.walkSpeed * (1 + bonus("moveSpeed")) * 10) / 10 },
  });
}
