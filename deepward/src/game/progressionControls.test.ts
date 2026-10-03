import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { GARAGE, physics, world } from "../world";
import { captureProbe, initialize, keybinds, seatPlayer, tick, viewStore } from "./controls";
import { SAVE_KEY } from "./save";
import { depart, newDive, newHome, settle, takeLoot } from "./state";

test("real command/context boundary applies refits on departure and acknowledges loss across a fresh context", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const bank = depart(newHome());
  let bytes = JSON.stringify(settle(bank, takeLoot(takeLoot(newDive(1), "wire", "wire")!, "polymer", "polymer")!, "extracted", "Rail"));
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => key === SAVE_KEY ? bytes : null, setItem: (_: string, value: string) => { bytes = value; } } });
  const create = () => {
    const ctx = createGameContext({ definition: defineGameDefinition({ name: "Marrow boundary", world, physics, input: keybinds, persist: false, lifecycle: "always-live" }), player: { userId: "diver", isNew: true }, content: { entityById: id => id === "diver" ? { stats: { health: { max: 100 }, oxygen: { max: 110 }, ammo: { max: 6 } } } : id === "fitter" ? { stats: { health: { max: 80 } } } : null } });
    initialize(ctx); seatPlayer(ctx); return ctx;
  };
  try {
    const ctx = create();
    ctx.game.commands.run("deepward.refit", { id: "tank" });
    expect(viewStore.read(ctx).home.refits).toEqual([]); // Station UI gate.
    viewStore.update(ctx, v => ({ ...v, panel: "stash" }));
    ctx.game.commands.run("deepward.refit", { id: "tank" });
    expect(viewStore.read(ctx).home.refits).toEqual(["tank"]);
    expect(JSON.parse(bytes).stash).toEqual([]);
    const probe = captureProbe(ctx);
    expect(probe.tankRefit).toBe(1);
    probe.tankRefit = 0;
    expect(captureProbe(ctx).tankRefit).toBe(1);
    ctx.game.commands.run("deepward.refit", { id: "tank" });
    expect(viewStore.read(ctx).error).toContain("already installed");
    ctx.game.commands.run("deepward.close", {});
    ctx.scene.entity.setPose(ctx.player.userId, { position: GARAGE, dt: 0 });
    ctx.game.commands.run("deepward.depart", {});
    expect(viewStore.read(ctx).dive!.oxygen).toBe(145);
    expect(captureProbe(ctx).inDive).toBe(1);
    expect(captureProbe(ctx).tankSeconds).toBe(145);
    expect(ctx.scene.entity.stats.get(ctx.player.userId, "oxygen")?.max).toBe(145);
    viewStore.update(ctx, v => ({ ...v, dive: { ...v.dive!, health: 0 } }));
    tick(ctx, 0.05);
    expect(viewStore.read(ctx).mode).toBe("reprinting");
    expect(viewStore.read(ctx).dive).not.toBeNull(); // Failed view remains until acknowledgement.
    expect(JSON.parse(bytes).deaths).toBe(1);
    ctx.game.commands.run("deepward.depart", {});
    expect(viewStore.read(ctx).mode).toBe("reprinting");
    const reloaded = create();
    expect(viewStore.read(reloaded).mode).toBe("reprinting");
    expect(viewStore.read(reloaded).home.deaths).toBe(1);
    reloaded.game.commands.run("deepward.acknowledgeReprint", {});
    expect(viewStore.read(reloaded).mode).toBe("home");
    expect(viewStore.read(reloaded).home.refits).toEqual(["tank"]);
    const revision = JSON.parse(bytes).revision;
    reloaded.game.commands.run("deepward.acknowledgeReprint", {});
    expect(JSON.parse(bytes).revision).toBe(revision);
    expect(viewStore.read(create()).mode).toBe("home");
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
