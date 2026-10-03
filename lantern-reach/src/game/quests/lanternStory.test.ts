import { describe, expect, test } from "bun:test";
import {
  createGameContext,
  type GameContext,
} from "@jgengine/core/runtime/gameContext";
import {
  memorySaveBackend,
  type SaveBackend,
} from "@jgengine/core/game/saveStore";
import { buildingIndex } from "@jgengine/core/world/buildingIndex";
import { resolveStructureBuildings } from "@jgengine/core/world/environmentSummary";
import { game } from "../../game.config";
import { sceneMarkerXZ } from "../../editorLayers";
import { world } from "../../world";
import { content } from "../content";
import { DIALOGUES } from "../entities/npcs/dialogues";
import {
  LANTERN_ACCOUNTS,
  LANTERN_CLINIC,
  LANTERN_WATCH,
  ROAD_CLEAR,
} from "./lanternCatalog";
import { lanternDialogue, lanternStore } from "./lanternStory";

const USER = "lantern-test";
const backends = new WeakMap<GameContext, SaveBackend>();
function fresh(backend = memorySaveBackend()): GameContext {
  const ctx = createGameContext({
    definition: game.game,
    content,
    player: { userId: USER, isNew: true },
    save: { backend, mode: "manual" },
  });
  game.loop.onInit?.(ctx);
  game.loop.onNewPlayer?.(ctx);
  ctx.game.commands.run("class.select", { classId: "warrior" });
  backends.set(ctx, backend);
  return ctx;
}
function visit(ctx: GameContext, id: string) {
  const npc = ctx.scene.entity.get(`npc:${id}`)!;
  ctx.scene.entity.setPose(USER, {
    position: [npc.position[0] + 1, npc.position[1], npc.position[2]],
  });
  ctx.game.commands.run("dialogue.open", { npcId: id });
}
function run(ctx: GameContext, name: string, input = {}) {
  return ctx.game.commands.run(name, input).status;
}
function accounts(ctx: GameContext) {
  visit(ctx, "marshal_redbrook");
  expect(run(ctx, "lantern.begin")).toBe("applied");
  expect(run(ctx, "lantern.choose", { route: "clinic" })).toBe("rejected");
  visit(ctx, "wilkes_hand");
  expect(run(ctx, "lantern.hear", { npcId: "wilkes_hand" })).toBe("applied");
  expect(run(ctx, "lantern.hear", { npcId: "apothecary_lin" })).toBe(
    "rejected",
  );
  visit(ctx, "apothecary_lin");
  expect(run(ctx, "lantern.hear", { npcId: "apothecary_lin" })).toBe("applied");
  visit(ctx, "marshal_redbrook");
  expect(run(ctx, "lantern.report")).toBe("applied");
  expect(run(ctx, "lantern.report")).toBe("rejected");
}
async function reload(ctx: GameContext) {
  await ctx.game.save!.save();
  const loaded = fresh(backends.get(ctx)!);
  expect(await loaded.game.save!.load()).toBe(true);
  return loaded;
}
function entry(ctx: GameContext, id: string) {
  return ctx.game.quest!.list(USER).find((q) => q.questId === id)!;
}

describe("Last Light on the Road", () => {
  test("clinic promise, real inventory cost and finite reserve survive reload without replay grants", async () => {
    let ctx = fresh();
    accounts(ctx);
    expect(run(ctx, "quest.accept", { questId: LANTERN_CLINIC })).toBe(
      "rejected",
    );
    expect(run(ctx, "lantern.choose", { route: "clinic" })).toBe("applied");
    expect(run(ctx, "lantern.choose", { route: "watch" })).toBe("rejected");
    ctx = await reload(ctx);
    expect(lanternStore.read(ctx, USER).route).toBe("clinic");
    visit(ctx, "apothecary_lin");
    const before = ctx.player.inventory.count("bags", "baked_bread");
    expect(run(ctx, "lantern.deliver")).toBe("applied");
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(before - 2);
    expect(entry(ctx, LANTERN_CLINIC).status).toBe("completed");
    expect(run(ctx, "lantern.deliver")).toBe("rejected");
    const potions = ctx.player.inventory.count("bags", "minor_healing_potion");
    expect(run(ctx, "lantern.claim")).toBe("applied");
    ctx = await reload(ctx);
    visit(ctx, "apothecary_lin");
    expect(lanternStore.read(ctx, USER).claimed).toBe(1);
    expect(run(ctx, "lantern.claim")).toBe("applied");
    expect(run(ctx, "lantern.claim")).toBe("rejected");
    expect(ctx.player.inventory.count("bags", "minor_healing_potion")).toBe(
      potions + 2,
    );
    expect(ctx.game.quest!.canAccept(USER, "q_bandits")).not.toBeNull();
    const dialogue = lanternDialogue(
      ctx,
      USER,
      "apothecary_lin",
      DIALOGUES[0]!,
    );
    expect(JSON.stringify(dialogue)).toContain("Both reserved potions");
  });
  test("road promise opens distinct later bounties only after patrol and keeps clinic reaction", async () => {
    let ctx = fresh();
    accounts(ctx);
    expect(run(ctx, "lantern.choose", { route: "watch" })).toBe("applied");
    expect(ctx.game.quest!.canAccept(USER, "q_bandits")).not.toBeNull();
    ctx.game.quest!.progress(USER, LANTERN_WATCH, "wolves", 3);
    visit(ctx, "marshal_redbrook");
    expect(run(ctx, "lantern.patrolReport")).toBe("applied");
    expect(run(ctx, "lantern.patrolReport")).toBe("rejected");
    ctx = await reload(ctx);
    expect(ctx.game.unlocks!.has(USER, ROAD_CLEAR)).toBe(true);
    expect(ctx.game.quest!.canAccept(USER, "q_bandits")).toBeNull();
    expect(entry(ctx, LANTERN_ACCOUNTS).status).toBe("completed");
    expect(
      ctx.game.quest!.list(USER).some((q) => q.questId === LANTERN_CLINIC),
    ).toBe(false);
    visit(ctx, "apothecary_lin");
    expect(run(ctx, "lantern.claim")).toBe("rejected");
    expect(
      JSON.stringify(
        lanternDialogue(ctx, USER, "apothecary_lin", DIALOGUES[0]!),
      ),
    ).toContain("warming the outrider by hand");
  });
  test("missing loaves reject without completing delivery; wrong or distant residents reject", () => {
    const ctx = fresh();
    accounts(ctx);
    expect(run(ctx, "lantern.choose", { route: "clinic" })).toBe("applied");
    visit(ctx, "apothecary_lin");
    ctx.player.inventory.take("bags", "baked_bread", 5);
    expect(run(ctx, "lantern.deliver")).toBe("rejected");
    expect(entry(ctx, LANTERN_CLINIC).status).toBe("active");
    ctx.player.inventory.put("bags", "baked_bread", 2);
    ctx.scene.entity.setPose(USER, { position: [0, 0, 0] });
    expect(run(ctx, "lantern.deliver")).toBe("rejected");
    expect(ctx.player.inventory.count("bags", "baked_bread")).toBe(2);
  });
  test("a full bag preserves the reserved potion across save and retry", async () => {
    let ctx = fresh();
    accounts(ctx);
    run(ctx, "lantern.choose", { route: "clinic" });
    visit(ctx, "apothecary_lin");
    run(ctx, "lantern.deliver");
    ctx.player.inventory.replaceState("bags", {
      slots: Array.from({ length: 24 }, (_, i) => ({
        itemId: `filler_${i}`,
        count: 1,
      })),
    });
    expect(run(ctx, "lantern.claim")).toBe("applied");
    expect(lanternStore.read(ctx, USER).claimed).toBe(0);
    expect(ctx.player.inventory.count("bags", "minor_healing_potion")).toBe(0);
    ctx = await reload(ctx);
    visit(ctx, "apothecary_lin");
    ctx.player.inventory.take("bags", "filler_0", 1);
    expect(run(ctx, "lantern.claim")).toBe("applied");
    expect(lanternStore.read(ctx, USER).claimed).toBe(1);
    expect(ctx.player.inventory.count("bags", "minor_healing_potion")).toBe(1);
  });
  test("older completed wolf bounty retains earned road access on conversation", () => {
    const ctx = fresh();
    ctx.game.quest!.accept(USER, "q_wolves");
    ctx.game.quest!.progress(USER, "q_wolves", "kill_wolves", 8);
    ctx.game.quest!.turnIn(USER, "q_wolves");
    ctx.game.unlocks!.hydrate(USER, []);
    expect(ctx.game.quest!.canAccept(USER, "q_bandits")).not.toBeNull();
    visit(ctx, "marshal_redbrook");
    expect(ctx.game.quest!.canAccept(USER, "q_bandits")).toBeNull();
  });
  test("authored opening and story residents clear procedural house footprints", () => {
    const index = buildingIndex(
      resolveStructureBuildings(world.structures![0]!),
    );
    for (const id of [
      "spawn:player",
      "npc:marshal_redbrook",
      "npc:wilkes_hand",
      "npc:apothecary_lin",
      "npc:trader_wilkes",
    ]) {
      expect(index.isInside(sceneMarkerXZ(id))).toBe(false);
    }
  });
});
