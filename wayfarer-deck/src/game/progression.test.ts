import { expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { game } from "../game.config";
import { onInit, onNewPlayer } from "../loop";
import { combatHandle } from "./combat";
import { content } from "./content";
import { ENEMY_ID } from "./enemy";
import { runHandle } from "./run";
import { ROAD_NODES, freshRouteState, validRouteState } from "./route";
import { SAVE_KEY, validRoadSave } from "./save";

function boot(userId = "progression-test") {
  const ctx = createGameContext({ definition: game.game, content, player: { userId, isNew: true } });
  onInit(ctx); onNewPlayer(ctx);
  return { ctx, run: runHandle.read(ctx), combat: combatHandle.read(ctx) };
}
function win(state: ReturnType<typeof boot>) {
  state.ctx.scene.entity.effect({ from: state.ctx.player.userId, to: ENEMY_ID, effect: "strike", via: { amount: 999 } });
}
function firstJunction(state: ReturnType<typeof boot>, choice = "skip") {
  state.run.start(state.ctx); win(state);
  if (choice === "skip") state.run.skipReward(state.ctx);
  else state.run.chooseReward(state.ctx, state.run.getSnapshot().rewardOptions[0]!.type);
}
function withStorage(action: (storage: Map<string, string>) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  try { action(storage); } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("every authored branch ends at the gate after exactly four battles", () => {
  const paths: string[][] = [];
  function walk(id: string, path: string[]) {
    const next = ROAD_NODES[id]!;
    if (next.next.length === 0) paths.push([...path, id]);
    else for (const child of next.next) walk(child, [...path, id]);
  }
  walk("low_road", []);
  expect(paths.length).toBe(16);
  for (const path of paths) {
    expect(path.at(-1)).toBe("final_gate");
    expect(path.filter(id => ROAD_NODES[id]!.kind === "combat").length).toBe(4);
    expect(validRouteState({ ...freshRouteState(), nodeId: "final_gate", path, battlesWon: 4 })).toBe(true);
  }
  expect(validRouteState({ ...freshRouteState(), path: ["low_road", "final_gate"], nodeId: "final_gate" })).toBe(false);
});

test("rewards offer both builds and recovery competes with a new card", () => {
  const state = boot(); state.run.start(state.ctx);
  state.ctx.scene.entity.stats.set(state.ctx.player.userId, "health", { current: 50 }); win(state);
  expect(state.run.getSnapshot().rewardOptions.map(card => card.build)).toEqual(["guard", "strength", "tempo"]);
  const packSize = state.run.getSnapshot().pack.length;
  state.run.recover(state.ctx);
  expect(state.run.getSnapshot().phase).toBe("route");
  expect(state.combat.getSnapshot().hero.hp).toBe(62);
  expect(state.run.getSnapshot().pack.length).toBe(packSize);
  expect(state.run.getSnapshot().route.coins).toBe(30);
  state.run.chooseRoute(state.ctx, "final_gate");
  expect(state.run.getSnapshot().route.nodeId).toBe("low_road");
});

test("shop charges once, checks a prune target, and heals only a wounded traveler", () => {
  const state = boot(); firstJunction(state);
  state.run.chooseRoute(state.ctx, "tollhouse");
  expect(state.run.getSnapshot().shopOffers.filter(offer => offer.card).map(offer => offer.card!.build)).toEqual(["guard", "strength", "tempo"]);
  const before = state.run.getSnapshot();
  state.run.buyRoad(state.ctx, "tonic");
  state.run.buyRoad(state.ctx, "prune", "invented#0");
  expect(state.run.getSnapshot().route.coins).toBe(before.route.coins);
  state.run.buyRoad(state.ctx, "prune", state.run.getSnapshot().pack[0]!.id);
  expect(state.run.getSnapshot().route.coins).toBe(16);
  expect(state.run.getSnapshot().pack.length).toBe(12);
  state.run.buyRoad(state.ctx, "prune", state.run.getSnapshot().pack[0]!.id);
  expect(state.run.getSnapshot().route.coins).toBe(16);
  state.ctx.scene.entity.stats.set(state.ctx.player.userId, "health", { current: 65 }); state.combat.refresh(state.ctx);
  state.run.buyRoad(state.ctx, "tonic");
  expect(state.combat.getSnapshot().hero.hp).toBe(72);
  expect(state.run.getSnapshot().route.coins).toBe(4);
  state.run.leaveRoadNode(state.ctx);
  state.run.chooseRoute(state.ctx, "borer_track");
  expect(state.combat.getSnapshot().hero.strength).toBe(0);
  expect(state.run.getSnapshot().encounterIndex).toBe(2);
  win(state);
  expect(state.run.getSnapshot().route.coins).toBe(22);
});

test("event costs cannot kill; supplies create one opening Block boon", () => {
  const state = boot(); firstJunction(state);
  state.run.chooseRoute(state.ctx, "stranded_porter");
  state.ctx.scene.entity.stats.set(state.ctx.player.userId, "health", { current: 10 }); state.combat.refresh(state.ctx);
  const before = state.run.getSnapshot();
  state.run.chooseRoadEvent(state.ctx, "salvage");
  expect(state.run.getSnapshot().route.coins).toBe(before.route.coins);
  expect(state.run.getSnapshot().phase).toBe("event");
  state.run.chooseRoadEvent(state.ctx, "share");
  expect(state.combat.getSnapshot().hero.hp).toBe(20);
  expect(state.run.getSnapshot().route.coins).toBe(18);
  expect(state.run.getSnapshot().route.boonBlock).toBe(6);
  state.run.chooseRoute(state.ctx, "cairn_pass");
  expect(state.combat.getSnapshot().hero.block).toBe(6);
  expect(state.run.getSnapshot().route.boonBlock).toBe(0);
  win(state); state.run.skipReward(state.ctx); state.run.chooseRoute(state.ctx, "dry_shelter");
  const cardId = state.run.getSnapshot().pack[0]!.id;
  const health = state.combat.getSnapshot().hero.hp;
  state.run.restRoad(state.ctx, "upgrade", cardId);
  expect(state.run.getSnapshot().pack.find(card => card.id.endsWith(cardId.slice(cardId.indexOf("#"))))!.card.upgraded).toBe(true);
  expect(state.combat.getSnapshot().hero.hp).toBe(health);
  expect(state.run.getSnapshot().phase).toBe("route");
  state.run.restRoad(state.ctx, "heal");
  expect(state.combat.getSnapshot().hero.hp).toBe(health);
  state.run.chooseRoute(state.ctx, "iron_gate");
  expect(state.combat.getSnapshot().hero.block).toBe(0);
});

test("pause gates every road mutation and both route branches survive reload", () => withStorage(storage => {
  const state = boot(); firstJunction(state, "card");
  state.run.chooseRoute(state.ctx, "stranded_porter");
  state.run.pause(state.ctx);
  const paused = state.run.getSnapshot();
  state.run.chooseRoadEvent(state.ctx, "salvage"); state.run.leaveRoadNode(state.ctx); state.run.chooseRoute(state.ctx, "cairn_pass");
  expect(state.run.getSnapshot()).toEqual(paused);
  state.run.resume(state.ctx); state.run.chooseRoadEvent(state.ctx, "salvage");
  expect(state.combat.getSnapshot().hero.hp).toBe(62);
  expect(state.run.getSnapshot().route.coins).toBe(54);
  expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
  const resumed = boot(); resumed.run.resume(resumed.ctx);
  expect(resumed.run.getSnapshot().route).toEqual(state.run.getSnapshot().route);
  resumed.run.chooseRoute(resumed.ctx, "borer_track"); win(resumed); resumed.run.skipReward(resumed.ctx);
  resumed.run.chooseRoute(resumed.ctx, "weathered_cairn"); resumed.run.chooseRoadEvent(resumed.ctx, "oath");
  expect(resumed.combat.getSnapshot().hero.hp).toBe(56);
  expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
  const checkpoint = boot(); checkpoint.run.resume(checkpoint.ctx);
  expect(checkpoint.run.getSnapshot().pack).toEqual(resumed.run.getSnapshot().pack);
  checkpoint.run.chooseRoute(checkpoint.ctx, "iron_gate"); win(checkpoint); checkpoint.run.skipReward(checkpoint.ctx);
  checkpoint.run.chooseRoute(checkpoint.ctx, "gate_fire"); checkpoint.run.restRoad(checkpoint.ctx, "heal");
  expect(checkpoint.combat.getSnapshot().hero.hp).toBe(72);
  checkpoint.run.chooseRoute(checkpoint.ctx, "final_gate"); win(checkpoint);
  expect(checkpoint.run.getSnapshot().phase).toBe("victory");
  expect(checkpoint.run.getSnapshot().route.battlesWon).toBe(4);
  expect(gamePhase(checkpoint.ctx)).toBe("ended");
  expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
  const completed = boot(); completed.run.resume(completed.ctx);
  expect(completed.run.getSnapshot().phase).toBe("victory");
  completed.run.start(completed.ctx);
  expect(completed.run.getSnapshot().route).toMatchObject(freshRouteState());
  expect(completed.combat.getSnapshot().hero.hp).toBe(72);
  expect(completed.run.getSnapshot().pack.length).toBe(13);
}));

test("reloading a shop keeps sold stock, money and purchased cards exactly once", () => withStorage(storage => {
  const state = boot(); firstJunction(state); state.run.chooseRoute(state.ctx, "tollhouse");
  const offer = state.run.getSnapshot().shopOffers.find(entry => entry.card)!;
  state.run.buyRoad(state.ctx, offer.id);
  expect(state.run.getSnapshot().route.coins).toBe(10);
  expect(state.run.getSnapshot().pack.length).toBe(14);
  expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
  const restored = boot(); restored.run.resume(restored.ctx);
  expect(restored.run.getSnapshot().phase).toBe("shop");
  expect(restored.run.getSnapshot().shopOffers.find(entry => entry.id === offer.id)!.disabledReason).toBe("Sold out");
  restored.run.buyRoad(restored.ctx, offer.id);
  expect(restored.run.getSnapshot().route.coins).toBe(10);
  expect(restored.run.getSnapshot().pack).toEqual(state.run.getSnapshot().pack);
}));

test("an original saved crossing keeps all five foes in its original order", () => withStorage(storage => {
  const state = boot(); state.run.start(state.ctx);
  const fresh = JSON.parse(storage.get(SAVE_KEY)!);
  const { route, ...withoutRoute } = fresh;
  storage.set(SAVE_KEY, JSON.stringify({ ...withoutRoute, version: 1 }));
  const restored = boot(); restored.run.resume(restored.ctx);
  expect(restored.run.getSnapshot().route.legacy).toBe(true);
  expect(restored.run.getSnapshot().encounterCount).toBe(5);
  for (let encounter = 0; encounter < 5; encounter++) {
    expect(restored.run.getSnapshot().encounterIndex).toBe(encounter);
    win(restored);
    if (encounter < 4) restored.run.skipReward(restored.ctx);
  }
  expect(restored.run.getSnapshot().phase).toBe("victory");
  expect(restored.run.getSnapshot().route.battlesWon).toBe(5);
  expect(validRoadSave(JSON.parse(storage.get(SAVE_KEY)!))).toBe(true);
}));
