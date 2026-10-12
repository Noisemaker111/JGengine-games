import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { GARAGE, physics, world } from "../world";
import { initialize, keybinds, seatPlayer, viewStore } from "./controls";
import { openSave, SAVE_KEY, validHome } from "./save";
import { depart, newDive, newHome, recoverInterrupted, settle, takeLoot } from "./state";

function bankRifle() {
  const departure = depart(newHome());
  return settle(departure, takeLoot(newDive(1), "fitter", "service-rifle")!, "extracted", "First armed return");
}

test("travel light keeps a recovered rifle safe; armed departure spends capacity and risks its exact instance", () => {
  const home = bankRifle(), rifle = home.stash[0]!;
  const light = depart(home);
  expect(light.stash).toEqual(home.stash);
  expect(newDive(2, light).cache).toEqual([]);
  expect(newDive(2, light).hand).toBe("sidearm");
  const armed = depart(home, rifle.uid), dive = newDive(2, armed, rifle);
  expect(armed.stash).toEqual([]);
  expect(dive.hand).toBe("service-rifle");
  expect(dive.cache[0]).toMatchObject({ uid: "1:fitter", kind: "service-rifle", x: 0, y: 0 });
  const returned = settle(armed, dive, "extracted", "Rifle returned");
  expect(returned.stash).toEqual(home.stash);
  expect(validHome(returned)).toBe(true);
  expect(settle(armed, dive, "lost", "Fitter").stash).toEqual([]);
  expect(recoverInterrupted(armed).stash).toEqual([]);
  expect(() => depart(home, "missing")).toThrow("no longer banked");
});

test("real preparation command does not withdraw until saved departure and reload cannot duplicate the rifle", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const home = bankRifle();
  let bytes = JSON.stringify(home), rejectWrites = false;
  const storage = { getItem: (key: string) => key === SAVE_KEY ? bytes : null, setItem: (_: string, next: string) => { if (rejectWrites) throw new Error("disk full"); bytes = next; } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  try {
    const ctx = createGameContext({ definition: defineGameDefinition({ name: "Prepared departure", world, physics, input: keybinds, persist: false, lifecycle: "always-live" }), player: { userId: "diver", isNew: true }, content: {} });
    initialize(ctx); seatPlayer(ctx);
    ctx.game.commands.run("deepward.prepareRifle", { uid: "1:fitter" });
    expect(viewStore.read(ctx).rifleUid).toBeNull();
    viewStore.update(ctx, view => ({ ...view, panel: "stash" }));
    ctx.game.commands.run("deepward.prepareRifle", { uid: "1:fitter" });
    expect(viewStore.read(ctx).rifleUid).toBe("1:fitter");
    expect(JSON.parse(bytes).stash).toEqual(home.stash);
    ctx.game.commands.run("deepward.close", {});
    ctx.scene.entity.setPose(ctx.player.userId, { position: GARAGE, dt: 0 });
    rejectWrites = true;
    ctx.game.commands.run("deepward.depart", {});
    expect(viewStore.read(ctx).mode).toBe("home");
    expect(JSON.parse(bytes).stash).toEqual(home.stash);
    rejectWrites = false;
    ctx.game.commands.run("deepward.depart", {});
    expect(viewStore.read(ctx).dive!.hand).toBe("service-rifle");
    expect(JSON.parse(bytes).stash).toEqual([]);
    expect(viewStore.read(ctx).rifleUid).toBeNull();
    const resumed = recoverInterrupted(openSave(storage).home);
    expect(resumed.deaths).toBe(1);
    expect(resumed.stash).toEqual([]);
    expect(validHome(resumed)).toBe(true);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
