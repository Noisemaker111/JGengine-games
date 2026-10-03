import { pileRng, shuffleWithRng } from "@jgengine/core/cards/cardPile";
import { createShopStock } from "@jgengine/core/economy/shopStock";
import { charge, grant, balance, type WalletState } from "@jgengine/core/economy/wallet";
import { setGamePhase, type GamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { defineStore } from "@jgengine/core/store/defineStore";
import { BUILD_FOUNDATIONS, CARD_CATALOG, cardOf, cardTypeOf, upgradeCardType, type CardData } from "./cards";
import { createCombatStore, type CombatSnapshot, type CombatStore } from "./combat";
import { ENCOUNTERS } from "./enemy";
import { readRoadSave, writeRoadSave } from "./save";
import { COMBAT_NODE_IDS, ROAD_CURRENCY, ROAD_NODES, SHOP_PRICES, freshRouteState, type RouteNode, type RouteState } from "./route";

export type RunPhase = "combat" | "reward" | "route" | "shop" | "rest" | "event" | "victory" | "defeat";
export interface RoadOffer { id: string; name: string; text: string; cost: number; card?: CardData; disabledReason: string | null }
export interface RoadEventChoice { id: string; label: string; text: string; disabledReason: string | null }
export interface PackCard { id: string; card: CardData; canUpgrade: boolean }
export interface RunSnapshot {
  screen: "menu" | "paused" | null;
  canContinue: boolean;
  saveStatus: "ready" | "saved" | "unavailable" | "damaged";
  phase: RunPhase;
  encounterIndex: number;
  encounterCount: number;
  rewardOptions: readonly CardData[];
  combat: CombatSnapshot;
  route: RouteState & { node: RouteNode; choices: readonly RouteNode[] };
  shopOffers: readonly RoadOffer[];
  pack: readonly PackCard[];
  eventChoices: readonly RoadEventChoice[];
}
export interface RunStore {
  prepare(ctx: GameContext): void;
  pause(ctx: GameContext): void;
  resume(ctx: GameContext): void;
  recover(ctx: GameContext): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RunSnapshot;
  start(ctx: GameContext): void;
  canPlay(cardId: string): string | null;
  playCard(ctx: GameContext, cardId: string): void;
  endTurn(ctx: GameContext): void;
  canChooseReward(cardType: string): boolean;
  chooseReward(ctx: GameContext, cardType: string): void;
  skipReward(ctx: GameContext): void;
  chooseRoute(ctx: GameContext, nodeId: string): void;
  buyRoad(ctx: GameContext, offerId: string, cardId?: string): void;
  restRoad(ctx: GameContext, action: "heal" | "upgrade", cardId?: string): void;
  chooseRoadEvent(ctx: GameContext, choiceId: string): void;
  leaveRoadNode(ctx: GameContext): void;
}
function enginePhaseFor(phase: RunPhase): GamePhase { return phase === "victory" || phase === "defeat" ? "ended" : "playing"; }

export function createRunStore(combat: CombatStore): RunStore {
  const listeners = new Set<() => void>();
  const shop = createShopStock();
  let phase: RunPhase = "combat";
  let screen: RunSnapshot["screen"] = null;
  let canContinue = false;
  let saveStatus: RunSnapshot["saveStatus"] = "ready";
  let preparing = false;
  let mutating = false;
  let encounterIndex = 0;
  let route = freshRouteState();
  let ctxRef: GameContext | null = null;
  let lastEnginePhase: GamePhase | null = null;
  let rewardSeed = 0;
  let rewardOptions: CardData[] = [];
  let snapshot: RunSnapshot;
  function node(): RouteNode { return ROAD_NODES[route.nodeId]!; }
  function wallet(): WalletState { return { balances: { [ROAD_CURRENCY]: route.coins } }; }
  function giveCoins(amount: number): void { if (amount > 0) route.coins = balance(grant(wallet(), ROAD_CURRENCY, amount), ROAD_CURRENCY); }
  function spendCoins(amount: number): boolean {
    const paid = charge(wallet(), ROAD_CURRENCY, amount);
    if (paid.status !== "ok") return false;
    route.coins = balance(paid.state, ROAD_CURRENCY);
    return true;
  }
  function journal(line: string): void { route.journal.unshift(line); route.journal = route.journal.slice(0, 24); }
  function rollCards(): CardData[] {
    rewardSeed++;
    if (rewardSeed === 1 && !route.legacy) return (["guard", "strength", "tempo"] as const).map(build => CARD_CATALOG[BUILD_FOUNDATIONS[build]]!);
    const rng = pileRng(rewardSeed);
    return (["guard", "strength", "tempo"] as const).map(build => shuffleWithRng(Object.values(CARD_CATALOG).filter(card => !card.upgraded && !["trail_cut", "pack_guard"].includes(card.type) && card.build === build), rng)[0]!);
  }
  function pack(): PackCard[] {
    const captured = combat.capture();
    return captured === null ? [] : Object.values(captured.zones).flat().map(id => ({ id, card: cardOf(id), canUpgrade: upgradeCardType(cardTypeOf(id)) !== null }));
  }
  function eventChoices(): RoadEventChoice[] {
    const hp = combat.getSnapshot().hero.hp;
    if (node().id === "stranded_porter") return [
      { id: "salvage", label: "Recover the crate", text: "Lose 10 HP. Gain 24 road coins. The porter pays you for the climb.", disabledReason: hp <= 10 ? "Need more than 10 HP" : null },
      { id: "share", label: "Share your supplies", text: "Spend 12 coins. Recover up to 10 HP and begin your next battle with 6 Block.", disabledReason: route.coins < 12 ? "Need 12 coins" : null },
      { id: "leave", label: "Keep walking", text: "Keep your health and coins. Leave the crate behind.", disabledReason: null },
    ];
    if (node().id === "weathered_cairn") return [
      { id: "oath", label: "Take the fire oath", text: "Lose 6 HP. Add Campfire Oath to your deck: build Strength for the fights ahead.", disabledReason: hp <= 6 ? "Need more than 6 HP" : null },
      { id: "shelter", label: "Rest in the lee", text: "Recover up to 8 HP. Leave the oath beneath the stones.", disabledReason: hp >= combat.getSnapshot().hero.maxHp ? "Already at full health" : null },
      { id: "leave", label: "Keep walking", text: "Keep your pack and health as they are.", disabledReason: null },
    ];
    return [];
  }
  function shopOffers(): RoadOffer[] {
    return shop.list().map(entry => {
      const card = entry.kind === "card" ? CARD_CATALOG[entry.id.slice(5)] : undefined;
      const disabledReason = entry.qty === 0 ? "Sold out" : route.coins < entry.price.amount ? `Need ${entry.price.amount} coins` : entry.id === "tonic" && combat.getSnapshot().hero.hp >= combat.getSnapshot().hero.maxHp ? "Already at full health" : entry.id === "prune" && pack().length <= 8 ? "Keep at least 8 cards" : null;
      return { id: entry.id, name: card?.name ?? (entry.id === "tonic" ? "Road tonic" : "Lighten your pack"), text: card?.text ?? (entry.id === "tonic" ? "Recover up to 14 HP. One tonic per trader." : "Remove one chosen card. Keep at least 8 cards."), cost: entry.price.amount, ...(card ? { card } : {}), disabledReason };
    });
  }
  function settleCombat(): void {
    if (preparing || phase !== "combat") return;
    if (combat.getSnapshot().phase === "won") {
      route.battlesWon++;
      giveCoins(node().bounty ?? 0);
      journal(`${ENCOUNTERS[encounterIndex]!.name} cleared${node().bounty ? ` · gained ${node().bounty} coins` : ""}.`);
      phase = encounterIndex === 4 ? "victory" : "reward";
      rewardOptions = phase === "reward" ? rollCards() : [];
    } else if (combat.getSnapshot().phase === "lost") {
      phase = "defeat";
      journal(`The crossing ended at ${ENCOUNTERS[encounterIndex]!.name}. Begin again with a fresh pack and full health.`);
    }
  }
  function sync(): void {
    settleCombat();
    route.shop = shop.snapshot();
    const captured = combat.capture();
    if (!preparing && screen !== "menu" && captured !== null) {
      if (ctxRef?.player.userId !== "ui-preview") saveStatus = writeRoadSave({ version: 2, phase, encounterIndex, rewardSeed, rewards: rewardOptions.map(card => card.type), combat: captured, route: structuredClone(route) }) ? "saved" : "unavailable";
      canContinue = true;
    }
    snapshot = { screen, canContinue, saveStatus, phase, encounterIndex, encounterCount: route.legacy ? 5 : 4, rewardOptions: [...rewardOptions], combat: combat.getSnapshot(), route: { ...structuredClone(route), node: node(), choices: phase === "route" ? node().next.map(id => ROAD_NODES[id]!) : [] }, shopOffers: shopOffers(), pack: pack(), eventChoices: eventChoices() };
    if (ctxRef !== null) {
      const desired = screen ?? enginePhaseFor(phase);
      if (desired !== lastEnginePhase) { lastEnginePhase = desired; setGamePhase(ctxRef, desired); }
    }
    for (const listener of listeners) listener();
  }
  function change(ctx: GameContext, action: () => void): void {
    ctxRef = ctx;
    mutating = true;
    try { action(); } finally { mutating = false; sync(); }
  }
  function active(expected: RunPhase): boolean { return screen === null && phase === expected; }
  function heal(ctx: GameContext, amount: number): number {
    const hero = combat.getSnapshot().hero;
    const restored = Math.min(amount, hero.maxHp - hero.hp);
    ctx.scene.entity.stats.delta(ctx.player.userId, "health", restored);
    combat.refresh(ctx);
    return restored;
  }
  function beginFight(ctx: GameContext): void {
    encounterIndex = node().encounterIndex!;
    phase = "combat";
    combat.start(ctx, ENCOUNTERS[encounterIndex]!);
    if (route.boonBlock > 0) {
      ctx.scene.entity.stats.delta(ctx.player.userId, "block", route.boonBlock);
      journal(`The porter's supplies grant ${route.boonBlock} opening Block.`);
      route.boonBlock = 0;
      combat.refresh(ctx);
    }
  }
  function afterReward(ctx: GameContext): void {
    rewardOptions = [];
    if (route.legacy) {
      route.nodeId = COMBAT_NODE_IDS[encounterIndex + 1]!;
      route.path.push(route.nodeId);
      beginFight(ctx);
    } else phase = "route";
  }
  function leaveNode(): void { phase = "route"; }
  combat.subscribe(() => { if (!mutating && !preparing) sync(); });
  sync();
  return {
    prepare(ctx) {
      ctxRef = ctx;
      preparing = true;
      const loaded = ctx.player.userId === "ui-preview" ? { save: null, damaged: false, unavailable: false } : readRoadSave();
      screen = "menu";
      if (loaded.save) {
        const saved = loaded.save;
        phase = saved.phase; encounterIndex = saved.encounterIndex; rewardSeed = saved.rewardSeed;
        rewardOptions = saved.rewards.map(type => CARD_CATALOG[type]!);
        route = structuredClone(saved.route); shop.restore(route.shop);
        combat.restore(ctx, saved.combat);
        canContinue = true; saveStatus = "saved";
      } else {
        phase = "combat"; encounterIndex = 0; rewardSeed = 0; rewardOptions = [];
        route = freshRouteState(); shop.restore(route.shop);
        canContinue = false;
        combat.start(ctx, ENCOUNTERS[0]!, { freshDeck: true });
        saveStatus = loaded.unavailable ? "unavailable" : loaded.damaged ? "damaged" : "ready";
      }
      preparing = false; sync();
    },
    pause(ctx) { if (screen !== null || ["victory", "defeat"].includes(phase)) return; change(ctx, () => { screen = "paused"; }); },
    resume(ctx) { if (!canContinue) return; change(ctx, () => { screen = null; }); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot() { return snapshot; },
    start(ctx) {
      change(ctx, () => {
        screen = null; encounterIndex = 0; phase = "combat"; rewardSeed = 0; rewardOptions = [];
        route = freshRouteState(); shop.restore(route.shop);
        combat.start(ctx, ENCOUNTERS[0]!, { freshDeck: true });
      });
    },
    canPlay(cardId) { return active("combat") ? combat.canPlay(cardId) : "run is not active"; },
    playCard(ctx, cardId) { if (this.canPlay(cardId) !== null) return; change(ctx, () => combat.playCard(ctx, cardId)); },
    endTurn(ctx) { if (!active("combat")) return; change(ctx, () => combat.endTurn(ctx)); },
    canChooseReward(cardType) { return active("reward") && rewardOptions.some(card => card.type === cardType); },
    chooseReward(ctx, cardType) {
      if (!this.canChooseReward(cardType)) return;
      change(ctx, () => { combat.addReward(ctx, cardType); journal(`${CARD_CATALOG[cardType]!.name} joins your pack.`); afterReward(ctx); });
    },
    recover(ctx) {
      if (!active("reward") || combat.getSnapshot().hero.hp >= combat.getSnapshot().hero.maxHp) return;
      change(ctx, () => { journal(`Passed up a card to recover ${heal(ctx, 12)} HP.`); afterReward(ctx); });
    },
    skipReward(ctx) { if (!active("reward")) return; change(ctx, () => { journal("Kept the pack unchanged and travelled on."); afterReward(ctx); }); },
    chooseRoute(ctx, nodeId) {
      if (!active("route") || !node().next.includes(nodeId)) return;
      change(ctx, () => {
        route.nodeId = nodeId; route.path.push(nodeId); route.serviceUsed = false; route.eventChoice = null;
        journal(`Took the road to ${node().title}.`);
        if (node().kind === "combat") beginFight(ctx);
        else {
          phase = node().kind;
          if (phase === "shop") shop.restore({ entries: [
            ...rollCards().map(card => ({ id: `card:${card.type}`, kind: "card", price: { currency: ROAD_CURRENCY, amount: SHOP_PRICES.card }, qty: 1 })),
            { id: "tonic", kind: "heal", price: { currency: ROAD_CURRENCY, amount: SHOP_PRICES.tonic }, qty: 1 },
            { id: "prune", kind: "prune", price: { currency: ROAD_CURRENCY, amount: SHOP_PRICES.prune }, qty: 1 },
          ] });
        }
      });
    },
    buyRoad(ctx, offerId, cardId) {
      if (!active("shop") || !shopOffers().some(offer => offer.id === offerId && offer.disabledReason === null)) return;
      if (offerId === "prune" && (!cardId || !pack().some(card => card.id === cardId))) return;
      change(ctx, () => {
        const result = shop.buy(offerId, wallet());
        if (!result.ok) return;
        route.coins = balance(result.wallet, ROAD_CURRENCY);
        if (result.entry.kind === "card") { combat.addReward(ctx, offerId.slice(5)); journal(`Bought ${CARD_CATALOG[offerId.slice(5)]!.name} for 20 coins.`); }
        else if (offerId === "tonic") journal(`Spent 12 coins on a tonic: recovered ${heal(ctx, 14)} HP.`);
        else { combat.removeCard(ctx, cardId!); journal(`Spent 14 coins to leave ${cardOf(cardId!).name} behind.`); }
      });
    },
    restRoad(ctx, action, cardId) {
      if (!active("rest") || route.serviceUsed) return;
      if (action === "heal" ? combat.getSnapshot().hero.hp >= combat.getSnapshot().hero.maxHp : action !== "upgrade" || !cardId || !pack().some(card => card.id === cardId && card.canUpgrade)) return;
      change(ctx, () => {
        if (action === "heal") journal(`Rested at ${node().title}: recovered ${heal(ctx, 18)} HP; left practice for another day.`);
        else { combat.upgradeCard(ctx, cardId!); journal(`Practised ${cardOf(cardId!).name}; passed up the shelter's healing.`); }
        route.serviceUsed = true; leaveNode();
      });
    },
    chooseRoadEvent(ctx, choiceId) {
      if (!active("event") || route.eventChoice !== null || !eventChoices().some(choice => choice.id === choiceId && choice.disabledReason === null)) return;
      change(ctx, () => {
        if (choiceId === "salvage") { ctx.scene.entity.stats.delta(ctx.player.userId, "health", -10); combat.refresh(ctx); giveCoins(24); journal("Recovered the porter's crate: lost 10 HP, gained 24 coins."); }
        else if (choiceId === "share") { if (!spendCoins(12)) return; route.boonBlock = 6; journal(`Shared supplies: spent 12 coins, recovered ${heal(ctx, 10)} HP, secured 6 opening Block.`); }
        else if (choiceId === "oath") { ctx.scene.entity.stats.delta(ctx.player.userId, "health", -6); combat.refresh(ctx); combat.addReward(ctx, "campfire_oath"); journal("Took the cairn's fire oath: lost 6 HP, gained Campfire Oath."); }
        else if (choiceId === "shelter") journal(`Rested in the cairn's lee: recovered ${heal(ctx, 8)} HP.`);
        else journal(`Passed ${node().title} without spending supplies.`);
        route.eventChoice = choiceId; leaveNode();
      });
    },
    leaveRoadNode(ctx) {
      if (screen !== null || !["shop", "rest", "event"].includes(phase)) return;
      change(ctx, () => { if (phase === "event") route.eventChoice = "leave"; journal(`Left ${node().title}.`); leaveNode(); });
    },
  };
}
export const runHandle = defineStore<RunStore>("wayfarer.run", () => createRunStore(createCombatStore()));
