import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { setGamePhase } from "@jgengine/core/game/gamePhase";

import { ROOMS } from "./rooms/catalog";
import { advanceRoom, controlledHero, resetRoom, startRun, swapHero } from "./runtime";
import { CALLOUTS, type CalloutId, duetStore, raiseToast, withAnchor, withPrism } from "./stores";
import { type Dir, DIR_VECTORS, DIR_ORDER, addCell, sameCell, type V2, yawToDir } from "./types";
import { currentRoomState } from "./rooms/setup";
import { isWalkable } from "./rooms/engine";

function heroCell(ctx: GameContext, id: string): V2 | null {
  const entity = ctx.scene.entity.get(id);
  if (entity === null) return null;
  return { x: Math.round(entity.position[0]), z: Math.round(entity.position[2]) };
}

function heroFacing(ctx: GameContext, id: string): Dir {
  const entity = ctx.scene.entity.get(id);
  return entity === null ? "east" : yawToDir(entity.rotationY);
}

/** The active hero uses its distinct ability, latching a device onto the room. */
export function useAbility(ctx: GameContext, userId: string, dirOverride?: Dir): void {
  if (duetStore.read(ctx).status !== "playing") return;
  if (dirOverride !== undefined && !DIR_ORDER.includes(dirOverride)) return;
  const hero = controlledHero(ctx, userId);
  if (hero === null) return;
  const cell = heroCell(ctx, hero);
  if (cell === null) return;
  if (hero === "lumen") {
    const dir = dirOverride ?? heroFacing(ctx, "lumen");
    duetStore.update(ctx, (state) => ({ ...state, latch: withPrism(state.latch, { cell, dir }) }));
    raiseToast(ctx, `Prism planted, beaming ${dir}.`);
  } else {
    duetStore.update(ctx, (state) => {
      const lifted = state.latch.anchorCell !== null && sameCell(state.latch.anchorCell, cell);
      return { ...state, latch: withAnchor(state.latch, lifted ? null : cell) };
    });
    const lifted = duetStore.read(ctx).latch.anchorCell === null;
    raiseToast(ctx, lifted ? "Weight lifted." : "Weight dropped.");
  }
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("duet.motion", {
    apply(state, input) {
      duetStore.update(state, s => ({ ...s, reducedMotion: commandInput(input).reduced === true }));
    },
  });
  ctx.game.commands.define("duet.start", {
    apply(state, input) {
      if (controlledHero(state, commandUser(state, input)) === null) return;
      const index = commandInput(input).roomIndex;
      startRun(state, typeof index === "number" ? index : undefined);
    },
  });
  ctx.game.commands.define("pause", {
    apply(state, input) {
      if (controlledHero(state, commandUser(state, input)) === null) return;
      const status = duetStore.read(state).status;
      if (status !== "playing" && status !== "paused") return;
      duetStore.update(state, s => ({ ...s, status: status === "paused" ? "playing" : "paused" }));
      setGamePhase(state, status === "paused" ? "playing" : "paused");
    },
  });
  ctx.game.commands.define("duet.step", {
    apply(state, input) {
      if (duetStore.read(state).status !== "playing") return;
      const dir = commandInput(input).dir;
      if (typeof dir !== "string" || !DIR_ORDER.includes(dir as Dir)) return;
      const hero = controlledHero(state, commandUser(state, input));
      if (hero === null) return;
      const cell = heroCell(state, hero);
      const room = ROOMS[duetStore.read(state).roomIndex];
      if (cell === null || room === undefined) return;
      const next = addCell(cell, DIR_VECTORS[dir as Dir]);
      const target = isWalkable(room, currentRoomState(state, room), next) ? next : cell;
      const vector = DIR_VECTORS[dir as Dir];
      state.scene.entity.setPose(hero, { position: [target.x, 0, target.z], rotationY: Math.atan2(vector.x, vector.z), dt: 0 });
    },
  });
  for (const dir of DIR_ORDER) ctx.game.commands.define(`duet.${dir}`, {
    apply(state, input) {
      state.game.commands.run("duet.step", { dir, userId: commandUser(state, input) });
    },
  });
  ctx.game.commands.define("swap", {
    apply(state, input) {
      if (duetStore.read(state).status !== "playing") return;
      const userId = commandUser(state, input);
      if (controlledHero(state, userId) === null) return;
      if (!swapHero(state, userId)) raiseToast(state, "You only control one hero here.");
    },
  });

  ctx.game.commands.define("ability", {
    apply(state, input) {
      const dir = commandInput(input).dir;
      if (dir !== undefined && (typeof dir !== "string" || !DIR_ORDER.includes(dir as Dir))) return;
      useAbility(state, commandUser(state, input), dir as Dir | undefined);
    },
  });

  ctx.game.commands.define("duet.callout", {
    apply(state, input) {
      if (duetStore.read(state).status !== "playing") return;
      const hero = controlledHero(state, commandUser(state, input));
      const id = commandInput(input).id;
      if (hero === null || typeof id !== "string" || !Object.hasOwn(CALLOUTS, id)) return;
      duetStore.update(state, s => ({ ...s, callout: { hero, id: id as CalloutId, sequence: (s.callout?.sequence ?? 0) + 1 } }));
      raiseToast(state, `${hero === "lumen" ? "Lumen" : "Anchor"}: ${CALLOUTS[id as CalloutId]}`);
    },
  });

  ctx.game.commands.define("reset", {
    apply(state, input) {
      if (controlledHero(state, commandUser(state, input)) === null) return;
      if (!["playing", "paused"].includes(duetStore.read(state).status)) return;
      resetRoom(state);
      raiseToast(state, "Room reset.");
    },
  });

  ctx.game.commands.define("duet.restart", {
    apply(state, input) {
      if (controlledHero(state, commandUser(state, input)) === null) return;
      startRun(state);
    },
  });

  ctx.game.commands.define("debug.solve", {
    apply(state) {
      advanceRoom(state);
    },
  });

  ctx.game.commands.define("debug.win", {
    apply(state) {
      const room = ROOMS[duetStore.read(state).roomIndex];
      if (room === undefined) return;
      state.scene.entity.setPose("lumen", { position: [room.exit.lumen.x, 0, room.exit.lumen.z], rotationY: 0, dt: 0 });
      state.scene.entity.setPose("anchor", {
        position: [room.exit.anchor.x, 0, room.exit.anchor.z],
        rotationY: 0,
        dt: 0,
      });
    },
  });

  ctx.game.commands.define("debug.complete", {
    apply(state) {
      duetStore.update(state, (s) => ({ ...s, status: "complete" }));
    },
  });
}

function commandUser(ctx: GameContext, input: unknown): string {
  const actor = ctx.game.commands.actor();
  if (actor !== null) return actor;
  const fromInput = commandInput(input).userId;
  return typeof fromInput === "string" ? fromInput : ctx.player.userId;
}

function commandInput(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}
