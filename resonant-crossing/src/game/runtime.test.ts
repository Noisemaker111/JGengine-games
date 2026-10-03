import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { gamePhase } from "@jgengine/core/game/gamePhase";
import { game } from "../game.config";
import { loop } from "../loop";
import { duetStore } from "./stores";
import { ROOMS } from "./rooms/catalog";
import { controlledHero, resetRoom, seatPlayer, swapHero } from "./runtime";
import { parseCheckpoint } from "./persistence";

function boot() {
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "solo-probe", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  return ctx;
}
describe("observable run boundaries", () => {
  test("title gates controls; paused commands cannot mutate a puzzle; restart exits ended phase", () => {
    const ctx = boot();
    expect(gamePhase(ctx)).toBe("menu");
    const spawn = ctx.scene.entity.get("lumen")!.position;
    ctx.game.commands.run("duet.step", { dir: "east" });
    expect(ctx.scene.entity.get("lumen")!.position).toEqual(spawn);
    ctx.game.commands.run("duet.start", {});
    ctx.game.commands.run("ability", { dir: "east" });
    ctx.game.commands.run("pause", {});
    const latch = duetStore.read(ctx).latch;
    const pose = ctx.scene.entity.get("lumen")!.position;
    ctx.game.commands.run("duet.step", { dir: "east" });
    ctx.game.commands.run("ability", { dir: "west" });
    loop.onTick(ctx, 5);
    expect(duetStore.read(ctx).latch).toEqual(latch);
    expect(ctx.scene.entity.get("lumen")!.position).toEqual(pose);
    expect(gamePhase(ctx)).toBe("paused");
    ctx.game.commands.run("pause", {});
    expect(gamePhase(ctx)).toBe("playing");
    // Drive the actual exit condition on every room, including the final advance.
    for (const room of ROOMS) {
      duetStore.update(ctx, state => ({ ...state, latch: { ...state.latch, completedRelays: room.relays?.map(relay => relay.id) ?? [] } }));
      for (const id of ["lumen", "anchor"] as const) ctx.scene.entity.setPose(id, { position: [room.exit[id].x, 0, room.exit[id].z], rotationY: 0, dt: 0 });
      loop.onTick(ctx, 0.01);
      loop.onTick(ctx, 2);
    }
    expect(duetStore.read(ctx).status).toBe("complete");
    expect(gamePhase(ctx)).toBe("ended");
    ctx.game.commands.run("duet.restart", {});
    expect(gamePhase(ctx)).toBe("playing");
    expect(duetStore.read(ctx).roomIndex).toBe(0);
    ctx.game.commands.run("duet.step", { dir: "east" });
    expect(ctx.scene.entity.get("lumen")!.position[0]).toBe(ROOMS[0]!.spawn.lumen.x + 1);
  });
  test("joining a second seat leaves planted devices and room signals intact", () => {
    const ctx = boot();
    ctx.game.commands.run("duet.start", { roomIndex: 2 });
    ctx.game.commands.run("ability", { dir: "east" });
    loop.onTick(ctx, 0.01);
    const before = duetStore.read(ctx);
    seatPlayer(ctx, "joining-probe");
    expect(duetStore.read(ctx)).toEqual(before);
    expect(ctx.player.possession.active("joining-probe")).toBe("anchor");
    expect(ctx.player.possession.listOwned("solo-probe")).toContain("lumen");
    expect(ctx.player.possession.listOwned("solo-probe")).not.toContain("anchor");
    expect(duetStore.read(ctx).roomIndex).toBe(2);
  });
  test("checkpoint parser ignores corrupt, foreign-version and out-of-range saves", () => {
    expect(parseCheckpoint('{"version":1,"roomIndex":2,"complete":false}')?.roomIndex).toBe(2);
    for (const raw of [null, "broken", '{"version":2,"roomIndex":0,"complete":false}', '{"version":1,"roomIndex":99,"complete":false}', '{"version":1,"roomIndex":-1,"complete":false}']) expect(parseCheckpoint(raw)).toBeNull();
  });
  test("reset immediately restores spike signals, even when the derived signature is unchanged", () => {
    const ctx = boot();
    ctx.game.commands.run("duet.start", { roomIndex: 3 });
    loop.onTick(ctx, 0.01);
    ctx.game.commands.run("reset", {});
    expect(duetStore.read(ctx).activeSpikes).toEqual(["s_X"]);
    expect(duetStore.read(ctx).pressedPlates).toEqual([]);
  });
});


describe("hero seat admission and reconnect", () => {
  test("third player cannot steal Anchor or change puzzle state", () => {
    const ctx = boot();
    ctx.game.commands.run("duet.start", { roomIndex: 2 });
    expect(seatPlayer(ctx, "partner")).toBe(true);
    const before = duetStore.read(ctx);
    expect(seatPlayer(ctx, "third-player")).toBe(false);
    expect(controlledHero(ctx, "third-player")).toBeNull();
    expect(ctx.player.possession.listOwned("third-player")).not.toContain("anchor");
    expect(controlledHero(ctx, "partner")).toBe("anchor");
    expect(ctx.player.possession.listOwned("solo-probe")).not.toContain("anchor");
    const positions = ["lumen", "anchor"].map(id => ctx.scene.entity.get(id)!.position);
    ctx.game.commands.run("duet.step", { userId: "third-player", dir: "east" });
    ctx.game.commands.run("ability", { userId: "third-player", dir: "east" });
    ctx.game.commands.run("duet.callout", { userId: "third-player", id: "go" });
    expect(["lumen", "anchor"].map(id => ctx.scene.entity.get(id)!.position)).toEqual(positions);
    expect(duetStore.read(ctx)).toEqual(before);
  });

  test("second player restores a solo player who had been controlling Anchor", () => {
    const ctx = boot();
    expect(swapHero(ctx, "solo-probe")).toBe(true);
    expect(controlledHero(ctx, "solo-probe")).toBe("anchor");
    expect(seatPlayer(ctx, "partner")).toBe(true);
    expect(controlledHero(ctx, "solo-probe")).toBe("lumen");
    expect(controlledHero(ctx, "partner")).toBe("anchor");
    expect(swapHero(ctx, "solo-probe")).toBe(false);
  });

  test("solo reconnect and room reset retain the selected hero", () => {
    const ctx = boot();
    ctx.game.commands.run("duet.start", { roomIndex: 2 });
    expect(swapHero(ctx, "solo-probe")).toBe(true);
    const before = duetStore.read(ctx);
    expect(seatPlayer(ctx, "solo-probe")).toBe(true);
    expect(controlledHero(ctx, "solo-probe")).toBe("anchor");
    expect(duetStore.read(ctx)).toEqual(before);
    resetRoom(ctx);
    expect(controlledHero(ctx, "solo-probe")).toBe("anchor");
    expect(duetStore.read(ctx).active).toBe("anchor");
    expect(duetStore.read(ctx).roomIndex).toBe(2);
  });

  test("known partner reconnect preserves planted devices and does not take the other seat", () => {
    const ctx = boot();
    ctx.game.commands.run("duet.start", { roomIndex: 2 });
    ctx.game.commands.run("ability", { dir: "east" });
    expect(seatPlayer(ctx, "partner")).toBe(true);
    const before = duetStore.read(ctx);
    expect(seatPlayer(ctx, "partner")).toBe(true);
    expect(duetStore.read(ctx)).toEqual(before);
    expect(controlledHero(ctx, "partner")).toBe("anchor");
    expect(controlledHero(ctx, "solo-probe")).toBe("lumen");
    expect(controlledHero(ctx, "unseated")).toBeNull();
  });
});
