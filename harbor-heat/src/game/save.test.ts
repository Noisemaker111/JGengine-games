import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { memorySaveBackend, type SaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { bestRaceStore, continueStore, registerCommands, safehouseStore, startedStore } from "./commands";
import { content } from "./content";
import { normalizeAfterRestore } from "../loop";
import { grantCred } from "./progression/cred";
import { QUESTS } from "./quests/catalog";
import { loadSavedProgress } from "./saveCompatibility";
import { activeActionCodes, playControlsActive } from "@jgengine/core/game/controlGate";
import { createActionStateTracker, toActionStateBindingMap } from "@jgengine/core/input/actionBindings";
import { keybinds } from "./keybinds";
import { syncSession } from "./session";

function bootContext(backend: SaveBackend, key = "jgengine:save:harbor-heat"): GameContext {
  return createGameContext({
    definition: defineGameDefinition({
      name: "harbor-heat-save-test",
      assets: createAssetCatalog(),
      multiplayer: "off",
      persist: true,
      features: { quest: true },
    }),
    content,
    player: { userId: "p1", isNew: true },
    save: { backend, key, mode: "manual" },
  });
}

describe("harbor-heat whole-world save", () => {
  test("menu-born input retains bindings while start and pause still gate controls", () => {
    const ctx = bootContext(memorySaveBackend());
    syncSession(ctx, false);
    expect(playControlsActive(ctx)).toBe(false);
    const tracker = createActionStateTracker(toActionStateBindingMap(activeActionCodes(ctx, keybinds)));
    syncSession(ctx, true);
    expect(playControlsActive(ctx)).toBe(true);
    tracker.handleDown("KeyW");
    expect(tracker.isDown("moveForward")).toBe(true);
    syncSession(ctx, false);
    expect(playControlsActive(ctx)).toBe(false);
  });
  test("a malformed legacy record remains untouched and does not create current progress", async () => {
    const backend = memorySaveBackend();
    await backend.write("jgengine:save:vice-isle:default", "unfinished{");
    expect(await loadSavedProgress(bootContext(backend), backend)).toBe(false);
    expect(await backend.read("jgengine:save:vice-isle:default")).toBe("unfinished{");
    expect(await backend.read("jgengine:save:harbor-heat:default")).toBeNull();
  });

  test("legacy progress imports once while leaving its source record intact", async () => {
    const backend = memorySaveBackend();
    const legacy = bootContext(backend, "jgengine:save:vice-isle");
    legacy.game.store.set("vice.safehouse", true);
    legacy.game.store.set("vice.bestRace", 61.4);
    legacy.game.store.set("vice.stashes", ["stash_1"]);
    legacy.game.economy.grant("p1", "cash", 1234);
    await legacy.game.save!.save();
    const original = await backend.read("jgengine:save:vice-isle:default");

    const reboot = bootContext(backend);
    expect(await loadSavedProgress(reboot, backend)).toBe(true);
    expect(safehouseStore.read(reboot)).toBe(true);
    expect(bestRaceStore.read(reboot)).toBe(61.4);
    expect(reboot.game.store.get("harbor.stashes")).toEqual(["stash_1"]);
    expect(reboot.game.economy.balance("p1", "cash")).toBe(1234);
    expect(await backend.read("jgengine:save:vice-isle:default")).toBe(original);

    reboot.game.economy.grant("p1", "cash", 100);
    await reboot.game.save!.save();
    const nextBoot = bootContext(backend);
    expect(await loadSavedProgress(nextBoot, backend)).toBe(true);
    expect(nextBoot.game.economy.balance("p1", "cash")).toBe(1334);
    expect(await backend.read("jgengine:save:vice-isle:default")).toBe(original);
  });

  test("cash, cred, quests, safehouse, and best lap survive a reboot", async () => {
    const backend = memorySaveBackend();

    const host = bootContext(backend);
    host.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    host.game.quest!.register(QUESTS);
    host.game.quest!.grant("p1", "m1_welcome");
    host.game.quest!.progress("p1", "m1_welcome", "meet_marco", 1);
    expect(host.game.quest!.turnIn("p1", "m1_welcome")).toBeNull();
    host.game.economy.grant("p1", "cash", 1234);
    grantCred(host, 500);
    safehouseStore.write(host, true);
    bestRaceStore.write(host, 61.4);
    await host.game.save!.save();

    const reboot = bootContext(backend);
    reboot.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    reboot.game.quest!.register(QUESTS);
    expect(await reboot.game.save!.load()).toBe(true);

    expect(reboot.game.economy.balance("p1", "cash")).toBe(1234 + 200);
    expect(reboot.scene.entity.stats.get("p1", "level")?.current).toBeGreaterThanOrEqual(2);
    const journal = reboot.game.quest!.list("p1");
    expect(journal.find((q) => q.questId === "m1_welcome")?.status).toBe("completed");
    expect(journal.find((q) => q.questId === "m2_dock_sweep")?.status).toBe("active");
    expect(safehouseStore.read(reboot)).toBe(true);
    expect(bestRaceStore.read(reboot)).toBe(61.4);
  });

  test("an empty slot loads nothing", async () => {
    const fresh = bootContext(memorySaveBackend());
    expect(await fresh.game.save!.load()).toBe(false);
  });

  test("a restore drops a fresh boot at the title screen", () => {
    const ctx = bootContext(memorySaveBackend());
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    normalizeAfterRestore(ctx);
    expect(startedStore.read(ctx)).not.toBe(true);
    expect(continueStore.read(ctx)).toBe(true);
  });

  test("the run phase gates the shell touch dock: menu on the title, playing once started", () => {
    const ctx = bootContext(memorySaveBackend());
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    registerCommands(ctx);
    // A fresh title screen must report `menu` so the shell hides the on-screen touch
    // controls instead of painting the mobile dock over the main menu.
    normalizeAfterRestore(ctx);
    expect(gamePhase(ctx)).toBe("menu");
    ctx.game.commands.run("game.start", {});
    expect(gamePhase(ctx)).toBe("playing");
  });

  test("a restore keeps an already-live session live so shoot --mode play does not bounce to the menu", () => {
    const ctx = bootContext(memorySaveBackend());
    ctx.scene.entity.spawn("street_runner", { id: "p1", position: [0, 0, 0], role: "player" });
    // capture.play dispatches game.start before the async restore resolves.
    startedStore.write(ctx, true);
    normalizeAfterRestore(ctx);
    expect(startedStore.read(ctx)).toBe(true);
    expect(continueStore.read(ctx)).toBe(true);
  });
});
