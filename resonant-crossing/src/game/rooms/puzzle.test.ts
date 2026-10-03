import { describe, expect, test } from "bun:test";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { game } from "../../game.config";
import { loop } from "../../loop";
import { duetStore } from "../stores";
import { addCell, cellKey, DIR_ORDER, DIR_VECTORS, type Dir, type HeroId, type V2 } from "../types";
import { ROOMS } from "./catalog";
import { activeSpikeCells, isWalkable } from "./engine";
import { currentRoomState, heroCells } from "./setup";

function boot(roomIndex = 0) {
  const ctx = createGameContext({ definition: game.game, content: game.content, player: { userId: "puzzle-probe", isNew: true } });
  loop.onInit(ctx);
  loop.onNewPlayer(ctx);
  ctx.game.commands.run("duet.start", { roomIndex });
  return ctx;
}

describe("puzzle command and recovery boundaries", () => {
  test("invalid inputs and an unseated caller cannot move, plant or call out", () => {
    const ctx = boot();
    const pose = ctx.scene.entity.get("lumen")!.position;
    const latch = duetStore.read(ctx).latch;
    for (const input of [null, 7, "east", [], { dir: "diagonal" }, { dir: 3 }, { dir: "east", userId: "unseated" }]) {
      expect(() => ctx.game.commands.run("duet.step", input)).not.toThrow();
    }
    for (const input of [{ dir: 3 }, { dir: "diagonal" }, { userId: "unseated" }]) ctx.game.commands.run("ability", input);
    for (const input of [null, {}, { id: "unknown" }, { id: "hold", userId: "unseated" }]) ctx.game.commands.run("duet.callout", input);
    for (const command of ["reset", "pause", "duet.start", "duet.restart"]) ctx.game.commands.run(command, { userId: "unseated", roomIndex: 3 });
    expect(ctx.scene.entity.get("lumen")!.position).toEqual(pose);
    expect(duetStore.read(ctx).latch).toEqual(latch);
    expect(duetStore.read(ctx).callout).toBeNull();
    expect(duetStore.read(ctx).status).toBe("playing");
    expect(duetStore.read(ctx).roomIndex).toBe(0);
  });

  test("callouts identify the controlled role and remain held through pause", () => {
    const ctx = boot();
    ctx.game.commands.run("swap", {});
    ctx.game.commands.run("duet.callout", { id: "hold" });
    expect(duetStore.read(ctx).callout).toEqual({ hero: "anchor", id: "hold", sequence: 1 });
    ctx.game.commands.run("pause", {});
    ctx.game.commands.run("duet.callout", { id: "go" });
    loop.onTick(ctx, 10);
    expect(duetStore.read(ctx).callout?.id).toBe("hold");
    ctx.game.commands.run("pause", {});
    ctx.game.commands.run("duet.callout", { id: "recover" });
    expect(duetStore.read(ctx).callout).toEqual({ hero: "anchor", id: "recover", sequence: 2 });
  });

  test("live spikes recover to safe ground, retain secured relays and devices; reset clears progress", () => {
    const ctx = boot(3);
    const room = ROOMS[3]!;
    const latch = { anchorCell: room.plates[0]!.cell, prism: { cell: room.spawn.lumen, dir: "west" as const }, completedRelays: ["relay1"] };
    duetStore.update(ctx, s => ({ ...s, latch }));
    const state = currentRoomState(ctx, room);
    const spikes = activeSpikeCells(room, state);
    const hazard = room.spikes.flatMap(spike => spike.cells).find(cell => spikes.has(cellKey(cell)))!;
    expect(hazard).toBeDefined();
    const safe = room.floor.find(cell => isWalkable(room, state, cell) && !spikes.has(cellKey(cell)))!;
    ctx.scene.entity.setPose("lumen", { position: [safe.x, 0, safe.z], rotationY: 0, dt: 0 });
    loop.onTick(ctx, 0.01);
    ctx.scene.entity.setPose("lumen", { position: [hazard.x, 0, hazard.z], rotationY: 0, dt: 0 });
    loop.onTick(ctx, 0.01);
    expect(ctx.scene.entity.get("lumen")!.position).toEqual([safe.x, 0, safe.z]);
    expect(duetStore.read(ctx).latch).toEqual(latch);
    expect(duetStore.read(ctx).recoveries).toBe(1);
    expect(duetStore.read(ctx).toast).toContain("Returned to safe ground");
    ctx.game.commands.run("reset", {});
    expect(duetStore.read(ctx).latch).toEqual({ anchorCell: null, prism: null });
    expect(duetStore.read(ctx).recoveries).toBe(0);
    expect(duetStore.read(ctx).callout).toBeNull();
  });
});

describe("authored solutions through the real command loop", () => {
  for (const [roomIndex, room] of ROOMS.entries()) test(`${room.id}: role abilities, gates, stages and both exits complete`, () => {
    const ctx = boot(roomIndex);
    const control = (hero: HeroId) => {
      if (ctx.player.possession.active(ctx.player.userId) !== hero) ctx.game.commands.run("swap", {});
      expect(ctx.player.possession.active(ctx.player.userId)).toBe(hero);
    };
    const moveTo = (hero: HeroId, target: V2) => {
      control(hero);
      const state = currentRoomState(ctx, room);
      const spikes = activeSpikeCells(room, state);
      const start = heroCells(ctx)[hero];
      const queue: { cell: V2; steps: Dir[] }[] = [{ cell: start, steps: [] }];
      const seen = new Set([cellKey(start)]);
      let steps: Dir[] | undefined;
      for (let i = 0; i < queue.length; i++) {
        const path = queue[i]!;
        if (cellKey(path.cell) === cellKey(target)) { steps = path.steps; break; }
        for (const dir of DIR_ORDER) {
          const cell = addCell(path.cell, DIR_VECTORS[dir]);
          const key = cellKey(cell);
          if (seen.has(key) || !isWalkable(room, state, cell) || spikes.has(key)) continue;
          seen.add(key);
          queue.push({ cell, steps: [...path.steps, dir] });
        }
      }
      expect(steps, `${hero} must reach ${cellKey(target)}`).toBeDefined();
      for (const dir of steps!) {
        const before = heroCells(ctx)[hero];
        ctx.game.commands.run("duet.step", { dir });
        loop.onTick(ctx, 0.01);
        expect(heroCells(ctx)[hero]).toEqual(addCell(before, DIR_VECTORS[dir]));
      }
    };
    for (const op of room.solution ?? []) {
      if (op.kind === "move") {
        const [kind, id] = op.target.split(":");
        const cell = kind === "exit" ? room.exit[id as HeroId]
          : kind === "plate" ? room.plates.find(plate => plate.id === id)!.cell
          : room.receivers.find(receiver => receiver.id === id)!.cell;
        moveTo(op.hero, { x: cell.x + (op.offset?.x ?? 0), z: cell.z + (op.offset?.z ?? 0) });
      } else {
        control(op.kind === "prism" ? "lumen" : "anchor");
        ctx.game.commands.run("ability", op.kind === "prism" ? { dir: op.dir } : {});
        loop.onTick(ctx, 0.01);
      }
    }
    expect(duetStore.read(ctx).latch.completedRelays ?? []).toHaveLength(room.relays?.length ?? 0);
    expect(duetStore.read(ctx).exits).toHaveLength(2);
    expect(duetStore.read(ctx).recoveries).toBe(0);
    expect(duetStore.read(ctx).status).toBe("solved");
    loop.onTick(ctx, 2);
    expect(duetStore.read(ctx).status).toBe(roomIndex === ROOMS.length - 1 ? "complete" : "playing");
  });
});
