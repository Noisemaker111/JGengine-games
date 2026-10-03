import { describe, expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { createGameContext } from "@jgengine/core/runtime/gameContext";

import { content } from "./content";
import { tickConstruction } from "./build/construction";
import { session } from "./session";
import { BUILD_PLOTS } from "./world/path";
import { setupWorld } from "./world/setup";

function factory() {
  const backend = memorySaveBackend();
  return () => {
    const ctx = createGameContext({
      definition: defineGameDefinition({
        name: "Bastion reload regression",
        multiplayer: "off",
      }),
      content,
      player: { userId: "commander", isNew: true },
      save: { backend, mode: "manual", key: "bastion-reload", version: 2 },
    });
    setupWorld(ctx);
    return ctx;
  };
}

describe("Bastion fresh-context reload", () => {
  test("a reserved planning build survives reload and completes once without charging twice", async () => {
    const boot = factory();
    const original = boot();
    original.game.commands.run("buildTower1", {});
    original.game.commands.run("tower.build", {
      point: BUILD_PLOTS[0]!.position,
    });
    const occupant = session.plotOccupant.get(BUILD_PLOTS[0]!.id);
    expect(session.towers.size).toBe(0);
    expect(original.game.economy.balance("commander", "gold")).toBe(100);
    await original.game.save!.save();

    const resumed = boot();
    expect(await resumed.game.save!.load()).toBe(true);
    expect(session.planning).toBe(true);
    expect(session.paused).toBe(true);
    expect(session.plotOccupant.get(BUILD_PLOTS[0]!.id)).toBe(occupant);
    resumed.game.commands.run("togglePause", {});
    tickConstruction(resumed, 0.1);
    tickConstruction(resumed, 0.1);
    expect(session.towers.size).toBe(1);
    expect(resumed.scene.entity.get(occupant!)).not.toBeNull();
    expect(resumed.game.economy.balance("commander", "gold")).toBe(100);
  });

  test("defeat reload retains the result and restart restores a playable keep and economy", async () => {
    const boot = factory();
    const original = boot();
    original.scene.entity.effect({
      from: "test",
      to: "keep",
      effect: "leak",
      via: { amount: 20 },
    });
    expect(session.gameOver).toBe(true);
    await original.game.save!.save();
    const resumed = boot();
    expect(await resumed.game.save!.load()).toBe(true);
    expect(session.gameOver).toBe(true);
    expect(session.victory).toBe(false);
    resumed.game.commands.run("restartRun", {});
    expect(session.gameOver).toBe(false);
    expect(session.planning).toBe(true);
    expect(session.paused).toBe(false);
    expect(resumed.scene.entity.stats.get("keep", "lives")?.current).toBe(20);
    expect(resumed.game.economy.balance("commander", "gold")).toBe(150);
    expect(resumed.game.commands.run("beginWave", {}).status).toBe("applied");
  });
});
