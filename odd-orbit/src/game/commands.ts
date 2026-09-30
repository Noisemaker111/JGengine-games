import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { saveHousehold } from "./session/persistence";

import { PLOT } from "../world";
import { FURNITURE, FURNITURE_BY_ID } from "./objects/catalog";
import { householdStore } from "./session/store";
import { pushEvent } from "./session/types";

export interface PointerInput {
  point: { x: number; y: number; z: number };
  entity: string | null;
  object: string | null;
}

let placeSeq = 0;

function clampToPlot(value: number, min: number, max: number): number {
  return value < min + 2 ? min + 2 : value > max - 2 ? max - 2 : value;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define("orbit.begin", {
    apply(gameCtx) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, orbit: { phase: "active", elapsed: 0, earned: 0, built: 0, comfort: 0 } });
      gameCtx.time.play();
    },
  });
  ctx.game.commands.define("orbit.sandbox", {
    apply(gameCtx) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, orbit: { ...(state.orbit ?? { elapsed: 0, earned: 0, built: 0, comfort: 0 }), phase: "sandbox" } });
      gameCtx.time.play();
    },
  });
  ctx.game.commands.define("household.save", { apply: saveHousehold });
  ctx.game.commands.define<{ goal: string }>("member.direct", {
    apply(gameCtx, { goal }) {
      const state = householdStore.read(gameCtx);
      const member = state.selectedMemberId === null ? undefined : state.members[state.selectedMemberId];
      if (!member) return;
      if (goal === "auto") {
        member.action = { kind: "idle" };
        member.assignedByPlayer = false;
      } else {
        const entity = gameCtx.scene.entity.get(member.id);
        if (!entity) return;
        const candidates = gameCtx.scene.object.list().filter(obj => FURNITURE_BY_ID[obj.catalogId]?.role === goal);
        candidates.sort((a, b) => Math.hypot(a.position[0] - entity.position[0], a.position[2] - entity.position[2]) - Math.hypot(b.position[0] - entity.position[0], b.position[2] - entity.position[2]));
        const obj = candidates[0];
        if (!obj) { pushEvent(state, "Build a furnishing for that need first.", gameCtx.time.now()); }
        else { member.action = { kind: "seek", goal: FURNITURE_BY_ID[obj.catalogId]!.role, objId: obj.instanceId }; member.assignedByPlayer = true; }
      }
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
    },
  });

  ctx.game.commands.define<PointerInput>("world.pointer", {
    apply(gameCtx, input) {
      handlePointer(gameCtx, input);
    },
  });

  ctx.game.commands.define<{ toolId: string | null }>("build.tool", {
    apply(gameCtx, input) {
      const state = householdStore.read(gameCtx);
      if (input.toolId !== null && FURNITURE_BY_ID[input.toolId] === undefined) return;
      const next = state.buildTool === input.toolId ? null : input.toolId;
      householdStore.write(gameCtx, { ...state, buildTool: next, selectedMemberId: next === null ? state.selectedMemberId : null });
    },
  });

  ctx.game.commands.define<{ id: string | null }>("member.select", {
    apply(gameCtx, input) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, selectedMemberId: input.id, buildTool: null });
    },
  });

  ctx.game.commands.define("build.cancel", {
    apply(gameCtx) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, buildTool: null, selectedMemberId: null });
    },
  });

  ctx.game.commands.define("buildCancel", {
    apply(gameCtx) {
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, buildTool: null, selectedMemberId: null });
    },
  });

  FURNITURE.forEach((def, index) => {
    ctx.game.commands.define(`buildTool${index + 1}`, {
      apply(gameCtx) {
        const state = householdStore.read(gameCtx);
        const next = state.buildTool === def.id ? null : def.id;
        householdStore.write(gameCtx, { ...state, buildTool: next, selectedMemberId: null });
      },
    });
  });

  ctx.game.commands.define<{ id: string }>("object.sell", {
    apply(gameCtx, input) {
      const obj = gameCtx.scene.object.get(input.id);
      if (obj === null) return;
      const def = FURNITURE_BY_ID[obj.catalogId];
      if (def === undefined) return;
      gameCtx.scene.object.remove(input.id);
      const state = householdStore.read(gameCtx);
      pushEvent(state, `Sold ${def.name} for ${Math.round(def.cost / 2)} credits.`, gameCtx.time.now(), "info");
      householdStore.write(gameCtx, { ...state, credits: state.credits + Math.round(def.cost / 2) });
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(gameCtx) {
      if (["welcome", "won", "recovery"].includes(householdStore.read(gameCtx).orbit?.phase ?? "")) return;
      gameCtx.time.toggle();
    },
  });

  ctx.game.commands.define("speedCycle", {
    apply(gameCtx) {
      if (["welcome", "won", "recovery"].includes(householdStore.read(gameCtx).orbit?.phase ?? "")) return;
      gameCtx.time.cycleSpeed();
    },
  });

  ctx.game.commands.define<{ mult: number }>("time.speed", {
    apply(gameCtx, input) {
      if (["welcome", "won", "recovery"].includes(householdStore.read(gameCtx).orbit?.phase ?? "")) return;
      if ([1, 2, 4].includes(input.mult)) gameCtx.time.setSpeed(input.mult);
    },
  });
}

function handlePointer(ctx: GameContext, input: PointerInput): void {
  const state = householdStore.read(ctx);
  if (["welcome", "won", "recovery"].includes(state.orbit?.phase ?? "")) return;

  if (state.buildTool !== null) {
    const def = FURNITURE_BY_ID[state.buildTool];
    if (def === undefined) return;
    if (state.credits < def.cost) {
      pushEvent(state, `Not enough credits for ${def.name}.`, ctx.time.now(), "info");
      householdStore.write(ctx, { ...state });
      return;
    }
    if (!Number.isFinite(input.point.x) || !Number.isFinite(input.point.z)) return;
    const x = Math.round(clampToPlot(input.point.x, PLOT.minX, PLOT.maxX));
    const z = Math.round(clampToPlot(input.point.z, PLOT.minZ, PLOT.maxZ));
    const blocked = ctx.scene.object.list().some(obj => {
      const other = FURNITURE_BY_ID[obj.catalogId];
      if (!other) return false;
      return Math.abs(obj.position[0] - x) < (other.footprint.w + def.footprint.w) / 2 + 0.4 && Math.abs(obj.position[2] - z) < (other.footprint.d + def.footprint.d) / 2 + 0.4;
    });
    if (blocked) {
      pushEvent(state, "Leave space between furnishings. Pick another spot.", ctx.time.now());
      householdStore.write(ctx, { ...state });
      return;
    }
    const y = ctx.world.groundHeightAt(x, z);
    do { placeSeq += 1; } while (ctx.scene.object.get(`placed:${def.id}:${placeSeq}`) !== null);
    ctx.scene.object.place(def.id, x, y, z, { instanceId: `placed:${def.id}:${placeSeq}` });
    if (state.orbit?.phase === "active") state.orbit.built += 1;
    pushEvent(state, `Placed ${def.name}.`, ctx.time.now(), "good");
    householdStore.write(ctx, { ...state, credits: state.credits - def.cost, buildTool: null });
    return;
  }

  if (input.entity !== null && state.members[input.entity] !== undefined) {
    householdStore.write(ctx, { ...state, selectedMemberId: input.entity });
    return;
  }

  if (input.object !== null) {
    const obj = ctx.scene.object.get(input.object);
    const def = obj === null ? undefined : FURNITURE_BY_ID[obj.catalogId];
    if (obj !== null && def !== undefined && state.selectedMemberId !== null) {
      const member = state.members[state.selectedMemberId];
      if (member !== undefined) {
        member.action = { kind: "seek", goal: def.role, objId: obj.instanceId };
        member.assignedByPlayer = true;
        pushEvent(state, `${member.name} sent to the ${def.name}.`, ctx.time.now(), "info");
        householdStore.write(ctx, { ...state, members: { ...state.members } });
        return;
      }
    }
  }

  householdStore.write(ctx, { ...state, selectedMemberId: null });
}
