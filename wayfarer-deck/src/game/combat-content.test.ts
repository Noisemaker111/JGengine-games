import { describe, expect, test } from "bun:test";
import { pileRng, shuffleWithRng } from "@jgengine/core/cards/cardPile";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { buildStartingDeck, cardOf, cardTypeOf, type CardData } from "./cards";
import { createCombatStore, scaleDamage, type CombatSnapshot } from "./combat";
import { content } from "./content";
import { ENCOUNTERS, ENEMY_ID, intentForEncounter, type EnemyDef } from "./enemy";

function battle(enemy = ENCOUNTERS[0]!) {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "wayfarer-content-test", multiplayer: null, persist: false }), content, player: { userId: "hero-content", isNew: true } });
  const combat = createCombatStore();
  ctx.game.events.on("entity.died", event => combat.onEntityDied(ctx, event.instanceId));
  combat.start(ctx, enemy, { freshDeck: true });
  return { ctx, combat };
}

function handOf(types: string[]) {
  const b = battle();
  const save = b.combat.capture()!;
  save.zones = { deck: [], hand: types.map((type, i) => `${type}#test${i}`), discard: [], exhaust: [] };
  b.combat.restore(b.ctx, save);
  const play = (type: string) => b.combat.playCard(b.ctx, b.combat.getSnapshot().hand.find(entry => entry.card.type === type)!.id);
  return { ...b, play };
}

describe("mountain card decisions", () => {
  test("guard conversion rewards order and spends protection", () => {
    const prepared = handOf(["weather_the_road", "switchback_reversal"]);
    prepared.play("weather_the_road"); prepared.play("switchback_reversal");
    expect(prepared.combat.getSnapshot().enemy.hp).toBe(36);
    expect(prepared.combat.getSnapshot().hero.block).toBe(0);
    prepared.combat.endTurn(prepared.ctx);
    expect(prepared.combat.getSnapshot().hero.hp).toBe(63);

    const reversed = handOf(["weather_the_road", "switchback_reversal"]);
    reversed.play("switchback_reversal"); reversed.play("weather_the_road");
    expect(reversed.combat.getSnapshot().enemy.hp).toBe(44);
    reversed.combat.endTurn(reversed.ctx);
    expect(reversed.combat.getSnapshot().hero.hp).toBe(71);
  });

  test("Strength multiplies repeated hits and the oath is finite per battle", () => {
    const { ctx, combat, play } = handOf(["campfire_oath", "paired_cuts", "paired_cuts"]);
    play("campfire_oath"); play("paired_cuts"); play("paired_cuts");
    expect(combat.getSnapshot().enemy.hp).toBe(24);
    expect(combat.getSnapshot().hero.strength).toBe(2);
    expect(combat.capture()!.zones.exhaust).toEqual(["campfire_oath#test0"]);
    combat.endTurn(ctx);
    expect(combat.getSnapshot().hand.some(entry => entry.card.type === "campfire_oath")).toBe(false);
  });

  test("footing cleanses the Sentry's pressure before an attack", () => {
    const { ctx, combat, play } = handOf(["ridge_footing", "trail_cut"]);
    ctx.scene.entity.stats.set(ctx.player.userId, "weak", { current: 2 });
    ctx.scene.entity.stats.set(ctx.player.userId, "vulnerable", { current: 2 });
    play("ridge_footing"); play("trail_cut");
    expect(combat.getSnapshot().hero.weak).toBe(0);
    expect(combat.getSnapshot().hero.vulnerable).toBe(0);
    expect(combat.getSnapshot().enemy.hp).toBe(42);
    combat.endTurn(ctx);
    expect(combat.getSnapshot().hero.hp).toBe(70);
  });

  test("a killing hit ends a volley without striking a despawned foe", () => {
    const { ctx, combat, play } = handOf(["scree_volley"]);
    ctx.scene.entity.stats.set(ENEMY_ID, "health", { current: 5 });
    let strikes = 0;
    ctx.game.events.on("entity.died", event => { if (event.instanceId === ENEMY_ID) strikes++; });
    play("scree_volley");
    expect(combat.getSnapshot().phase).toBe("won");
    expect(combat.getSnapshot().enemy.hp).toBe(0);
    expect(strikes).toBe(1);
  });

  test("training/pruning only commit between battles and keep card identity", () => {
    const { ctx, combat } = battle();
    const id = Object.values(combat.capture()!.zones).flat().find(id => cardTypeOf(id) === "pack_guard")!;
    expect(combat.upgradeCard(ctx, id)).toBe(false);
    expect(combat.removeCard(ctx, id)).toBe(false);
    ctx.scene.entity.effect({ from: ctx.player.userId, to: ENEMY_ID, effect: "strike", via: { amount: 999 } });
    expect(combat.upgradeCard(ctx, id)).toBe(true);
    const upgraded = id.replace("pack_guard", "pack_guard+");
    expect(Object.values(combat.capture()!.zones).flat()).toContain(upgraded);
    expect(cardOf(upgraded).effects.block).toBe(8);
    expect(combat.upgradeCard(ctx, upgraded)).toBe(false);
    expect(combat.removeCard(ctx, upgraded)).toBe(true);
    expect(combat.removeCard(ctx, upgraded)).toBe(false);
    combat.start(ctx, ENCOUNTERS[1]!);
    expect(combat.getSnapshot().cards).toHaveLength(12);
    expect(combat.getSnapshot().hero.strength).toBe(0);
  });

  test("ignoring threats causes defeat and a fresh crossing restores the starter pack", () => {
    const { ctx, combat } = battle(ENCOUNTERS[3]!);
    for (let turn = 0; turn < 12 && combat.getSnapshot().phase === "player"; turn++) combat.endTurn(ctx);
    expect(combat.getSnapshot().phase).toBe("lost");
    expect(combat.getSnapshot().hero.hp).toBe(0);
    expect(combat.getSnapshot().log[0]).toBe("You fall in battle. Defeat.");
    combat.start(ctx, ENCOUNTERS[0]!, { freshDeck: true });
    expect(combat.getSnapshot().phase).toBe("player");
    expect(combat.getSnapshot().hero.hp).toBe(72);
    expect(combat.getSnapshot().cards).toHaveLength(13);
    expect(combat.getSnapshot().hero.weak).toBe(0);
    expect(combat.getSnapshot().hero.vulnerable).toBe(0);
  });

  test("spent oath returns next encounter while its Strength clears", () => {
    const { ctx, combat, play } = handOf(["campfire_oath", "paired_cuts"]);
    play("campfire_oath");
    ctx.scene.entity.effect({ from: ctx.player.userId, to: ENEMY_ID, effect: "strike", via: { amount: 999 } });
    combat.start(ctx, ENCOUNTERS[1]!);
    expect(combat.getSnapshot().hero.strength).toBe(0);
    expect(combat.getSnapshot().exhaustCount).toBe(0);
    expect(combat.getSnapshot().hand.some(entry => entry.card.type === "campfire_oath")).toBe(true);
  });

  test("late foe cycles escalate while every threat stays deterministic", () => {
    for (const enemy of ENCOUNTERS) {
      const buff = enemy.pattern.findIndex(step => step.kind === "buff");
      expect(buff).toBeGreaterThanOrEqual(0);
      const strength = enemy.pattern[buff]!.base;
      const attack = enemy.pattern.findIndex(step => step.kind === "attack");
      const early = intentForEncounter(enemy, attack, 0);
      const late = intentForEncounter(enemy, attack + enemy.pattern.length, strength);
      expect(late.value).toBe(early.value + strength);
      expect(late.hits).toBe(early.hits);
    }
  });
});

function score(card: CardData, s: CombatSnapshot): number {
  const e = card.effects;
  const incoming = s.intent?.kind === "attack" ? s.intent.value * (s.intent.hits ?? 1) : 0;
  const block = s.hero.block + (e.block ?? 0);
  const hit = scaleDamage((e.damage ?? 0) + s.hero.strength + (e.blockDamage ? block : 0), e.cleanse ? 0 : s.hero.weak, s.enemy.vulnerable);
  const damage = e.damage === undefined ? 0 : hit * (e.hits ?? 1);
  if (damage >= s.enemy.hp + s.enemy.block) return 1000 + damage;
  const protection = e.consumeBlock ? -Math.min(incoming, s.hero.block) : Math.min(Math.max(0, incoming - s.hero.block), e.block ?? 0);
  const weakPrevention = e.weak && s.enemy.weak === 0 ? incoming * 0.25 : 0;
  const cleanse = e.cleanse && s.hero.vulnerable ? incoming / 3 : 0;
  const setup = (e.strength ?? 0) * (s.enemy.hp > 24 ? 6 : 1) + (e.vulnerable ?? 0) * (s.enemy.vulnerable ? 0.5 : 2);
  return (damage + protection * 1.3 + weakPrevention * 1.4 + cleanse + setup + (e.draw ?? 0) * 1.5 + (e.energy ?? 0) * 2) / Math.max(1, card.cost);
}

function crossWithBuild(enemy: EnemyDef, types: string[], seed = 1) {
  types = shuffleWithRng(types, pileRng(seed));
  const { ctx, combat } = battle(enemy);
  const save = combat.capture()!;
  save.zones = { deck: types.slice(5).map((type, i) => `${type}#deck${i}`), hand: types.slice(0, 5).map((type, i) => `${type}#hand${i}`), discard: [], exhaust: [] };
  combat.restore(ctx, save);
  for (let round = 0; round < 20 && combat.getSnapshot().phase === "player"; round++) {
    for (let action = 0; action < 12 && combat.getSnapshot().phase === "player"; action++) {
      const s = combat.getSnapshot();
      const choices = s.hand.filter(entry => combat.canPlay(entry.id) === null).sort((a, b) => score(b.card, s) - score(a.card, s));
      if (choices.length === 0) break;
      combat.playCard(ctx, choices[0]!.id);
    }
    combat.endTurn(ctx);
  }
  return combat.getSnapshot();
}

describe("two bounded build lines", () => {
  const starter = buildStartingDeck().map(cardTypeOf);
  const strength = starter.filter((_, i) => ![0, 1, 4, 5].includes(i)).concat(["paired_cuts", "paired_cuts", "scree_volley", "cairn_mark"]).map(type => type === "campfire_oath" ? "campfire_oath+" : type);
  const guard = starter.filter(type => type !== "campfire_oath" && type !== "doorbreaker").filter((_, i) => ![0, 1].includes(i)).concat(["switchback_reversal", "return_cut", "return_cut", "ridge_footing"]).map(type => type === "weather_the_road" ? "weather_the_road+" : type);
  for (const [name, build] of [["Strength and repeated hits", strength], ["guard and counter", guard]] as const) {
    for (const enemy of ENCOUNTERS) test(`${name} can survive ${enemy.name} with a 13-card pack and one upgrade`, () => {
      expect(build).toHaveLength(13);
      for (let seed = 1; seed <= 6; seed++) {
        const result = crossWithBuild(enemy, [...build], seed);
        expect(result.phase).toBe("won");
        expect(result.hero.hp).toBeGreaterThan(0);
        expect(result.round).toBeLessThanOrEqual(16);
      }
    });
  }
});
