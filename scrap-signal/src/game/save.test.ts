import { afterEach, describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { activeCharacter, pickCharacter, resetCharacterState, talentTree } from "./characters";
import { resumeBuild } from "./commands";
import { characterIdStore, talentRanksStore } from "./stores";
import { loadSavedProgress } from "./saveCompatibility";
import { quests } from "./quests/catalog";

afterEach(() => resetCharacterState());

function bootContext(backend: SaveBackend, key = "jgengine:save:scrap-signal"): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "scrap-signal-save-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { quest: true },
    }),
    content: {},
    player: { userId: "p1", isNew: true },
    save: { backend, key, mode: "manual" },
  });
}

describe("scrap-signal whole-world save", () => {
  test("legacy character, talents, quests, and catalogs restore without changing the old save", async () => {
    const backend = memorySaveBackend();
    const legacy = bootContext(backend, "jgengine:save:the-robots");
    legacy.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    legacy.scene.entity.spawn("skag", { id: "old-drone", position: [5, 0, 5] });
    legacy.game.store.set("characterId", "zero");
    legacy.game.store.set("talentRanks", { zero_headshot: 2 });
    legacy.game.store.set("echo", { questId: "q_skag_dog_days", atMs: 42 });
    const ripperQuest = quests.find((quest) => quest.id === "q_ripper_control")!;
    legacy.game.quest!.register([{ ...ripperQuest, id: "q_skag_dog_days" }]);
    legacy.game.quest!.accept("p1", "q_skag_dog_days");
    legacy.game.quest!.progress("p1", "q_skag_dog_days", "pups", 3);
    legacy.scene.entity.stats.set("p1", "skillPoints", { current: 1, max: 30 });
    legacy.game.economy.grant("p1", "cores", 12);
    await legacy.game.save!.save();
    const original = await backend.read("jgengine:save:the-robots:default");

    const reboot = bootContext(backend);
    reboot.game.quest!.register(quests);
    expect(await loadSavedProgress(reboot, backend)).toBe(true);
    expect(resumeBuild(reboot)).toBe(true);
    expect(activeCharacter()?.id).toBe("cipher");
    expect(talentTree()?.snapshot().ranks.cipher_optic_calibration).toBe(2);
    expect(talentTree()?.pointsAvailable()).toBe(1);
    expect(reboot.scene.entity.get("old-drone")?.name).toBe("ripper");
    expect(reboot.game.store.get("echo")).toEqual({ questId: "q_ripper_control", atMs: 42 });
    const restoredQuest = reboot.game.quest!.list("p1").find((quest) => quest.questId === "q_ripper_control");
    expect(restoredQuest?.status).toBe("active");
    expect(restoredQuest?.objectives.find((objective) => objective.id === "pups")?.progress).toBe(3);
    expect(reboot.game.economy.balance("p1", "cores")).toBe(12);
    expect(await backend.read("jgengine:save:the-robots:default")).toBe(original);

    reboot.game.economy.grant("p1", "cores", 3);
    await reboot.game.save!.save();
    const nextBoot = bootContext(backend);
    expect(await loadSavedProgress(nextBoot, backend)).toBe(true);
    expect(nextBoot.game.economy.balance("p1", "cores")).toBe(15);
    expect(await backend.read("jgengine:save:the-robots:default")).toBe(original);
  });

  test("pick + spend -> reload -> resume restores the character and talent build", async () => {
    const backend = memorySaveBackend();

    const host = bootContext(backend);
    host.scene.entity.spawn("player", { id: "p1", position: [0, 0, 0] });
    pickCharacter("gunk");
    const tree = talentTree();
    if (tree === null) throw new Error("expected an active talent tree");
    tree.grantPoints(3);
    tree.allocate("gunk_hot_chamber");
    tree.allocate("gunk_hot_chamber");
    characterIdStore.write(host, "gunk");
    talentRanksStore.write(host, tree.snapshot().ranks);
    host.scene.entity.stats.set("p1", "skillPoints", { current: tree.pointsAvailable(), max: 30 });
    host.game.economy.grant("p1", "cores", 12);
    await host.game.save!.save();

    resetCharacterState();
    expect(activeCharacter()).toBeNull();

    const reboot = bootContext(backend);
    expect(await reboot.game.save!.load()).toBe(true);
    expect(resumeBuild(reboot)).toBe(true);

    expect(activeCharacter()?.id).toBe("gunk");
    const restored = talentTree();
    if (restored === null) throw new Error("expected a restored talent tree");
    expect(restored.snapshot().ranks["gunk_hot_chamber"]).toBe(2);
    expect(restored.pointsAvailable()).toBe(1);
    expect(reboot.game.economy.balance("p1", "cores")).toBe(12);
  });

  test("an empty slot resumes to no build (character select)", async () => {
    const fresh = bootContext(memorySaveBackend());
    expect(await fresh.game.save!.load()).toBe(false);
    expect(resumeBuild(fresh)).toBe(false);
    expect(activeCharacter()).toBeNull();
  });
});
