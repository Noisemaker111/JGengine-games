import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import type { CardBuild, CardData } from "./cards";
import { createCombatStore, scaleDamage, type CombatSnapshot } from "./combat";
import { content } from "./content";
import { createRunStore } from "./run";

function crossing() {
  const ctx = createGameContext({ definition: defineGameDefinition({ name: "wayfarer-build-crossing", multiplayer: null, persist: false }), content, player: { userId: "ui-preview", isNew: true } });
  const combat = createCombatStore();
  const run = createRunStore(combat);
  ctx.game.events.on("entity.died", event => combat.onEntityDied(ctx, event.instanceId));
  run.prepare(ctx); run.start(ctx);
  return { ctx, combat, run };
}

function value(card: CardData, s: CombatSnapshot, build: CardBuild): number {
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
  return (damage + protection * (build === "guard" ? 1.5 : 1.2) + weakPrevention * 1.4 + cleanse + setup + (e.draw ?? 0) * 1.5 + (e.energy ?? 0) * 2) / Math.max(1, card.cost);
}

function crossBuild(build: "guard" | "strength", events = false) {
  const { ctx, combat, run } = crossing();
  const decisions: string[] = [];
  const played: string[] = [];
  const battleHealth: number[] = [];
  let observedRound = 0;
  let convertedBlock = 0;
  let strengthHits = 0;
  let eventBlockUsed = 0;
  let oathCardId: string | null = null;
  let eventStrengthHits = 0;
  let eventOathPlayedThisBattle = false;
  let battleNode = "";
  for (let action = 0; action < 180; action++) {
    const s = run.getSnapshot();
    if (s.phase === "victory" || s.phase === "defeat") break;
    if (s.phase === "combat") {
      if (battleNode !== s.route.nodeId) { battleNode = s.route.nodeId; eventOathPlayedThisBattle = false; }
      if (observedRound !== s.combat.round) { observedRound = s.combat.round; battleHealth.push(s.combat.hero.hp); }
      const choices = s.combat.hand.filter(entry => run.canPlay(entry.id) === null).sort((a, b) => value(b.card, s.combat, build) - value(a.card, s.combat, build));
      if (choices.length) {
        const chosen = choices[0]!;
        if (chosen.card.effects.blockDamage) {
          convertedBlock += s.combat.hero.block;
          if (events && s.route.nodeId === "borer_track" && s.combat.round === 1) eventBlockUsed += Math.min(6, s.combat.hero.block);
        }
        if (chosen.id === oathCardId) eventOathPlayedThisBattle = true;
        if (eventOathPlayedThisBattle && (chosen.card.effects.hits ?? 1) > 1) eventStrengthHits += chosen.card.effects.hits!;
        if ((chosen.card.effects.hits ?? 1) > 1 && s.combat.hero.strength > 0) strengthHits += chosen.card.effects.hits!;
        played.push(chosen.card.type); run.playCard(ctx, chosen.id);
        if (chosen.id === oathCardId) expect(combat.getSnapshot().hero.strength).toBe(s.combat.hero.strength + 2);
      }
      else {
        if (events && s.route.nodeId === "borer_track" && s.combat.round === 1 && s.combat.hero.block >= 6 && s.combat.intent?.kind === "attack") {
          const incoming = s.combat.intent.value * (s.combat.intent.hits ?? 1);
          eventBlockUsed += Math.min(6, Math.max(0, incoming - (s.combat.hero.block - 6)));
        }
        run.endTurn(ctx);
      }
    } else if (s.phase === "reward") {
      const reward = s.rewardOptions.find(card => card.build === build)!;
      decisions.push(`reward:${reward.type}`); run.chooseReward(ctx, reward.type);
    } else if (s.phase === "route") {
      const preferred = [events ? "stranded_porter" : "tollhouse", events || build === "guard" ? "borer_track" : "cairn_pass", events ? "weathered_cairn" : "dry_shelter", "gate_trader", "final_gate", "iron_gate"];
      const next = s.route.choices.find(node => preferred.includes(node.id))!;
      decisions.push(`route:${next.id}`); run.chooseRoute(ctx, next.id);
      if (events && next.id === "borer_track") {
        expect(combat.getSnapshot().hero.block).toBe(6);
        expect(run.getSnapshot().route.boonBlock).toBe(0);
      }
      if (events && next.id === "iron_gate") expect(combat.getSnapshot().hero.block).toBe(0);
    } else if (s.phase === "shop") {
      const purchase = s.shopOffers.find(offer => offer.card?.build === build && offer.disabledReason === null);
      const tonic = s.shopOffers.find(offer => offer.id === "tonic" && offer.disabledReason === null);
      const prune = s.shopOffers.find(offer => offer.id === "prune" && offer.disabledReason === null);
      if (purchase) { decisions.push(`buy:${purchase.card!.type}`); run.buyRoad(ctx, purchase.id); }
      else if (tonic) { decisions.push("buy:tonic"); run.buyRoad(ctx, tonic.id); }
      else if (prune) {
        const unwanted = s.pack.find(entry => entry.card.type === "trail_cut")!;
        decisions.push("prune:trail_cut"); run.buyRoad(ctx, prune.id, unwanted.id);
      } else run.leaveRoadNode(ctx);
    } else if (s.phase === "rest") {
      const candidate = s.pack.find(entry => entry.canUpgrade && entry.card.type === (build === "strength" ? "campfire_oath" : "weather_the_road"))!;
      if (!s.route.serviceUsed) {
        const upgrade = s.combat.hero.hp >= 54;
        decisions.push(upgrade ? `upgrade:${candidate.card.type}` : "rest:heal");
        run.restRoad(ctx, upgrade ? "upgrade" : "heal", candidate.id);
      } else run.leaveRoadNode(ctx);
    } else if (events && s.phase === "event") {
      const coins = s.route.coins;
      const hp = s.combat.hero.hp;
      const packIds = new Set(s.pack.map(entry => entry.id));
      const choice = s.route.nodeId === "stranded_porter" ? "share" : "oath";
      decisions.push(`event:${choice}`); run.chooseRoadEvent(ctx, choice);
      const after = run.getSnapshot();
      expect(after.phase).toBe("route");
      expect(after.route.eventChoice).toBe(choice);
      if (choice === "share") {
        expect(after.route.coins).toBe(coins - 12);
        expect(after.combat.hero.hp).toBe(Math.min(after.combat.hero.maxHp, hp + 10));
        expect(after.route.boonBlock).toBe(6);
        expect(after.pack).toHaveLength(s.pack.length);
      } else {
        expect(after.route.coins).toBe(coins);
        expect(after.combat.hero.hp).toBe(hp - 6);
        expect(after.pack).toHaveLength(s.pack.length + 1);
        oathCardId = after.pack.find(entry => !packIds.has(entry.id))!.id;
        expect(after.pack.find(entry => entry.id === oathCardId)!.card.type).toBe("campfire_oath");
      }
    } else throw new Error(`Unexpected phase ${s.phase}`);
  }
  if (run.getSnapshot().phase !== "victory") throw new Error(`${build}: ${JSON.stringify({ phase: run.getSnapshot().phase, hp: combat.getSnapshot().hero.hp, decisions, played, battleHealth, pack: run.getSnapshot().pack.map(entry => entry.card.type) })}`);
  return { combat, run, decisions, played, convertedBlock, strengthHits, eventBlockUsed, eventStrengthHits };
}

for (const build of ["guard", "strength"] as const) test(`${build} completes a real starter crossing through earned rewards and finite road services`, () => {
  const { combat, run, decisions, played, convertedBlock, strengthHits } = crossBuild(build);
  expect(run.getSnapshot().phase).toBe("victory");
  expect(run.getSnapshot().route.battlesWon).toBe(4);
  expect(run.getSnapshot().route.coins).toBeGreaterThanOrEqual(0);
  expect(combat.getSnapshot().hero.hp).toBeGreaterThan(0);
  expect(decisions.filter(decision => decision.startsWith("reward:"))).toHaveLength(3);
  expect(decisions.filter(decision => decision.startsWith("buy:") && decision !== "buy:tonic")).toHaveLength(2);
  expect(build === "guard" ? convertedBlock : strengthHits).toBeGreaterThan(0);
  expect(played.some(type => type === (build === "guard" ? "switchback_reversal" : "paired_cuts") || type === (build === "guard" ? "return_cut" : "scree_volley"))).toBe(true);
});


test("sharing supplies and taking the cairn oath support a complete earned Strength crossing", () => {
  const { combat, run, decisions, eventBlockUsed, eventStrengthHits } = crossBuild("strength", true);
  expect(run.getSnapshot().phase).toBe("victory");
  expect(run.getSnapshot().route.path).toEqual(["low_road", "stranded_porter", "borer_track", "weathered_cairn", "iron_gate", "gate_trader", "final_gate"]);
  expect(run.getSnapshot().route.battlesWon).toBe(4);
  expect(run.getSnapshot().route.coins).toBeGreaterThanOrEqual(0);
  expect(combat.getSnapshot().hero.hp).toBeGreaterThan(0);
  expect(decisions.filter(decision => decision.startsWith("event:"))).toEqual(["event:share", "event:oath"]);
  expect(decisions.filter(decision => decision.startsWith("reward:"))).toHaveLength(3);
  expect(decisions.some(decision => decision.startsWith("buy:"))).toBe(true);
  expect(eventBlockUsed).toBeGreaterThan(0);
  expect(eventStrengthHits).toBeGreaterThan(0);
});
