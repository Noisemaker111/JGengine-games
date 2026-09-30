import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { game } from "../game.config";
import { onInit, onNewPlayer } from "../loop";
import { combatHandle } from "./combat";
import { runHandle } from "./run";
import { content } from "./content";
import { ENEMY_ID } from "./enemy";
import { SAVE_KEY, validRoadSave } from "./save";

function boot(userId = "road-test") {
  const ctx = createGameContext({ definition: game.game, content, player: { userId, isNew: true } });
  onInit(ctx); onNewPlayer(ctx);
  return { ctx, run: runHandle.read(ctx), combat: combatHandle.read(ctx) };
}
test("menu and pause gate combat commands", () => {
  const {ctx, run} = boot();
  expect(gamePhase(ctx)).toBe("menu");
  const menu = run.getSnapshot().combat;
  ctx.game.commands.run("endTurn", {});
  expect(run.getSnapshot().combat).toEqual(menu);
  run.start(ctx); run.pause(ctx);
  const paused = run.getSnapshot().combat;
  ctx.game.commands.run("playCard", {cardId: paused.hand[0]!.id});
  ctx.game.commands.run("endTurn", {});
  expect(run.getSnapshot().combat).toEqual(paused);
  expect(gamePhase(ctx)).toBe("paused");
  run.resume(ctx); run.endTurn(ctx);
  expect(run.getSnapshot().combat.round).toBe(2);
});
test("one Vulnerable stack affects the attack before expiring", () => {
  const {ctx, run, combat} = boot(); run.start(ctx);
  ctx.scene.entity.stats.set(ctx.player.userId, "vulnerable", {current: 1});
  run.endTurn(ctx);
  expect(combat.getSnapshot().hero.hp).toBe(59);
  expect(combat.getSnapshot().hero.vulnerable).toBe(0);
});
test("rest preserves the pack, heals 12 and clears battle Strength", () => {
  const {ctx, run, combat} = boot(); run.start(ctx);
  ctx.scene.entity.stats.set(ctx.player.userId, "health", {current: 50});
  ctx.scene.entity.stats.set(ctx.player.userId, "strength", {current: 6});
  ctx.scene.entity.effect({from: ctx.player.userId, to: ENEMY_ID, effect: "strike", via: {amount: 999}});
  run.recover(ctx);
  expect(run.getSnapshot().encounterIndex).toBe(1);
  expect(combat.getSnapshot().hero.hp).toBe(62);
  expect(combat.getSnapshot().hero.strength).toBe(0);
  const c = combat.getSnapshot();
  expect(c.hand.length + c.deckCount + c.discardCount + c.exhaustCount).toBe(13);
});
test("saved run reload retains piles, turn, energy and subsequent outcomes", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string,string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key,value)} });
  try {
    const first = boot(); first.run.start(first.ctx);
    first.run.playCard(first.ctx, first.combat.getSnapshot().hand[0]!.id);
    first.run.endTurn(first.ctx);
    const saved = JSON.parse(storage.get(SAVE_KEY)!);
    expect(validRoadSave(saved)).toBe(true);
    const second = boot();
    expect(second.run.getSnapshot().screen).toBe("menu");
    expect(second.run.getSnapshot().canContinue).toBe(true);
    expect(second.combat.getSnapshot()).toEqual(first.combat.getSnapshot());
    second.run.resume(second.ctx);
    first.run.endTurn(first.ctx); second.run.endTurn(second.ctx);
    expect(second.combat.getSnapshot()).toEqual(first.combat.getSnapshot());
    second.ctx.scene.entity.stats.set(ENEMY_ID, "health", {current: 1});
    const finisher = second.combat.getSnapshot().hand.find(entry => entry.card.effects.damage && entry.card.cost <= second.combat.getSnapshot().energy.current)!;
    second.run.playCard(second.ctx, finisher.id);
    const reward = JSON.parse(storage.get(SAVE_KEY)!);
    expect(validRoadSave(reward)).toBe(true);
    const third = boot();
    expect(third.run.getSnapshot().phase).toBe("reward");
    expect(third.run.getSnapshot().rewardOptions).toEqual(second.run.getSnapshot().rewardOptions);
    third.run.resume(third.ctx);
    third.run.chooseReward(third.ctx, third.run.getSnapshot().rewardOptions[0]!.type);
    expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
    const beforePreview = storage.get(SAVE_KEY);
    const preview = boot("ui-preview");
    expect(preview.run.getSnapshot().canContinue).toBe(false);
    preview.run.start(preview.ctx); preview.run.endTurn(preview.ctx);
    expect(storage.get(SAVE_KEY)).toBe(beforePreview);
    third.run.start(third.ctx);
    for (let turn = 0; turn < 20 && third.run.getSnapshot().phase === "combat"; turn++) third.run.endTurn(third.ctx);
    expect(third.run.getSnapshot().phase).toBe("defeat");
    expect(third.combat.getSnapshot().hero.hp).toBe(0);
    expect(third.combat.getSnapshot().hero.maxHp).toBe(72);
    expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
    const lost = boot();
    expect(lost.run.getSnapshot().phase).toBe("defeat");
    lost.run.resume(lost.ctx);
    expect(gamePhase(lost.ctx)).toBe("ended");
    const bad = structuredClone(saved); bad.combat.turn.pools.hero.energy = -1;
    expect(validRoadSave(bad)).toBe(false);
    storage.set(SAVE_KEY, "broken save");
    const damaged = boot();
    expect(damaged.run.getSnapshot().saveStatus).toBe("damaged");
    expect(storage.get(SAVE_KEY)).toBe("broken save");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
