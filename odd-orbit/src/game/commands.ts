import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { PLOT } from "../world";
import { FURNITURE, FURNITURE_BY_ID, type FurnitureRole } from "./objects/catalog";
import { householdStore } from "./session/store";
import { creditAmount, PANTRY_CAP, RATION_BUNDLE, RELIEF } from "./sim/economy";
import { canChangeLifestyle } from "./sim/schedule";
import { releaseMember, startConversation } from "./sim/simulate";
import type { Lifestyle } from "./session/types";
import { pushEvent } from "./session/types";

export interface PointerInput {
  point: { x: number; y: number; z: number };
  entity: string | null;
  object: string | null;
}

function checkpoint(ctx: GameContext): void {
  ctx.game.commands.run("orbit.checkpoint", {});
}

function nextPlacementId(ctx: GameContext, catalogId: string): string {
  let sequence = 0;
  for (const obj of ctx.scene.object.list()) {
    if (!obj.instanceId.startsWith("placed:")) continue;
    const suffix = Number(obj.instanceId.slice(obj.instanceId.lastIndexOf(":") + 1));
    if (Number.isSafeInteger(suffix) && suffix >= 0) sequence = Math.max(sequence, suffix);
  }
  return `placed:${catalogId}:${sequence + 1}`;
}

function clampToPlot(value: number, min: number, max: number): number {
  return value < min + 2 ? min + 2 : value > max - 2 ? max - 2 : value;
}

export function registerCommands(ctx: GameContext): void {
  ctx.game.commands.define<PointerInput>("world.pointer", {
    apply(gameCtx, input) {
      if (gamePhase(gameCtx) !== "playing") return;
      handlePointer(gameCtx, input);
    },
  });

  ctx.game.commands.define<{ toolId: string | null }>("build.tool", {
    apply(gameCtx, input) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      if (input.toolId !== null && FURNITURE_BY_ID[input.toolId] === undefined) return;
      const next = state.buildTool === input.toolId ? null : input.toolId;
      householdStore.write(gameCtx, { ...state, buildTool: next, selectedMemberId: next === null ? state.selectedMemberId : null });
    },
  });

  ctx.game.commands.define<{ id: string | null }>("member.select", {
    apply(gameCtx, input) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      if (input.id !== null && state.members[input.id] === undefined) return;
      householdStore.write(gameCtx, { ...state, selectedMemberId: input.id, buildTool: null });
    },
  });

  ctx.game.commands.define("build.cancel", {
    apply(gameCtx) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, buildTool: null, selectedMemberId: null });
    },
  });

  ctx.game.commands.define("buildCancel", {
    apply(gameCtx) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      householdStore.write(gameCtx, { ...state, buildTool: null, selectedMemberId: null });
    },
  });

  registerHouseholdCommands(ctx);

  FURNITURE.forEach((def, index) => {
    ctx.game.commands.define(`buildTool${index + 1}`, {
      apply(gameCtx) {
        if (gamePhase(gameCtx) !== "playing") return;
        const state = householdStore.read(gameCtx);
        const next = state.buildTool === def.id ? null : def.id;
        householdStore.write(gameCtx, { ...state, buildTool: next, selectedMemberId: null });
      },
    });
  });

  ctx.game.commands.define<{ id: string }>("object.sell", {
    apply(gameCtx, input) {
      if (gamePhase(gameCtx) !== "playing") return;
      const obj = gameCtx.scene.object.get(input.id);
      if (obj === null) return;
      const def = FURNITURE_BY_ID[obj.catalogId];
      if (def === undefined) return;
      if (!gameCtx.scene.object.remove(input.id)) return;
      const state = householdStore.read(gameCtx);
      pushEvent(state, `Sold ${def.name} for ${Math.round(def.cost / 2)} credits.`, gameCtx.time.now(), "info");
      for (const member of Object.values(state.members)) {
        if ((member.action.kind === "use" || member.action.kind === "seek") && member.action.objId === input.id) releaseMember(member);
      }
      householdStore.write(gameCtx, { ...state, credits: creditAmount(state.credits + Math.round(def.cost / 2)), members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });

  ctx.game.commands.define("pauseToggle", {
    apply(gameCtx) {
      if (gamePhase(gameCtx) !== "playing") return;
      gameCtx.time.toggle();
      checkpoint(gameCtx);
    },
  });

  ctx.game.commands.define("speedCycle", {
    apply(gameCtx) {
      if (gamePhase(gameCtx) !== "playing") return;
      gameCtx.time.cycleSpeed();
      checkpoint(gameCtx);
    },
  });

  ctx.game.commands.define<{ mult: number }>("time.speed", {
    apply(gameCtx, input) {
      if (gamePhase(gameCtx) !== "playing") return;
      if (![1, 2, 4].includes(input.mult)) return;
      gameCtx.time.setSpeed(input.mult);
      checkpoint(gameCtx);
    },
  });
}

function handlePointer(ctx: GameContext, input: PointerInput): void {
  if (gamePhase(ctx) !== "playing") return;
  const state = householdStore.read(ctx);

  if (state.buildTool !== null) {
    const def = FURNITURE_BY_ID[state.buildTool];
    if (def === undefined) return;
    if (state.credits < def.cost) {
      pushEvent(state, `Not enough credits for ${def.name}.`, ctx.time.now(), "info");
      householdStore.write(ctx, { ...state });
      return;
    }
    if (!Number.isFinite(input.point.x) || !Number.isFinite(input.point.z)) return;
    if (ctx.scene.object.list().length >= 256) return;
    const x = Math.round(clampToPlot(input.point.x, PLOT.minX, PLOT.maxX));
    const z = Math.round(clampToPlot(input.point.z, PLOT.minZ, PLOT.maxZ));
    const blocked = ctx.scene.object.list().some((obj) => {
      const other = FURNITURE_BY_ID[obj.catalogId];
      if (other === undefined) return false;
      const rotated = Math.abs(Math.sin(obj.rotationY ?? 0)) > 0.5;
      const w = rotated ? other.footprint.d : other.footprint.w;
      const d = rotated ? other.footprint.w : other.footprint.d;
      return Math.abs(obj.position[0] - x) < (w + def.footprint.w) / 2 + 0.4 && Math.abs(obj.position[2] - z) < (d + def.footprint.d) / 2 + 0.4;
    });
    if (blocked) {
      pushEvent(state, "Leave room between furnishings; choose another spot.", ctx.time.now());
      householdStore.write(ctx, { ...state });
      return;
    }
    const y = ctx.world.groundHeightAt(x, z);
    ctx.scene.object.place(def.id, x, y, z, { instanceId: nextPlacementId(ctx, def.id) });
    pushEvent(state, `Placed ${def.name}.`, ctx.time.now(), "good");
    householdStore.write(ctx, { ...state, credits: creditAmount(state.credits - def.cost), buildTool: null });
    checkpoint(ctx);
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
        member.actionUntil = ctx.time.now() + 12;
        pushEvent(state, `${member.name} sent to the ${def.name}.`, ctx.time.now(), "info");
        householdStore.write(ctx, { ...state, members: { ...state.members } });
        checkpoint(ctx);
        return;
      }
    }
  }

  householdStore.write(ctx, { ...state, selectedMemberId: null });
}

function registerHouseholdCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ id: string; lifestyle: Lifestyle }>("member.lifestyle", {
    apply(gameCtx, { id, lifestyle }) {
      if (gamePhase(gameCtx) !== "playing" || (lifestyle !== "yield" && lifestyle !== "bloom")) return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      if (member === undefined || member.lifestyle === lifestyle) return;
      if (!canChangeLifestyle(member)) {
        pushEvent(state, `${member.name} already started today's paid shift; choose a new rhythm tomorrow.`, gameCtx.time.now());
        householdStore.write(gameCtx, { ...state });
        return;
      }
      member.lifestyle = lifestyle;
      releaseMember(member);
      member.concern = null;
      pushEvent(state, `${member.name} chose ${lifestyle === "yield" ? "Yield career" : "Bloom keeping"}. The daily paid limit stays in place.`, gameCtx.time.now());
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define<{ id: string }>("member.release", {
    apply(gameCtx, { id }) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      if (member === undefined) return;
      releaseMember(member);
      member.concern = null;
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define<{ id: string; withId: string }>("member.socialize", {
    apply(gameCtx, { id, withId }) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      const partner = state.members[withId];
      if (member === undefined || partner === undefined) return;
      const accepted = startConversation(state, member, partner, gameCtx.time.now());
      pushEvent(state, accepted ? `${member.name} and ${partner.name} put their activities aside to trade signals.` : "Nourish and rest before inviting a companion.", gameCtx.time.now());
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define<{ id: string; goal: FurnitureRole | "auto" }>("member.direct", {
    apply(gameCtx, { id, goal }) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      if (member === undefined) return;
      if (goal === "auto") releaseMember(member);
      else {
        const from = gameCtx.scene.entity.get(id)?.position;
        if (from === undefined) return;
        const objects = gameCtx.scene.object.list().filter((obj) => FURNITURE_BY_ID[obj.catalogId]?.role === goal);
        objects.sort((a, b) => Math.hypot(a.position[0] - from[0], a.position[2] - from[2]) - Math.hypot(b.position[0] - from[0], b.position[2] - from[2]));
        const obj = objects[0];
        if (obj === undefined) return;
        member.action = { kind: "seek", goal, objId: obj.instanceId };
        member.assignedByPlayer = true;
        member.actionUntil = gameCtx.time.now() + 12;
      }
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define("household.rations", {
    apply(gameCtx) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      if (state.credits < RATION_BUNDLE.cost || state.pantry + RATION_BUNDLE.quantity > PANTRY_CAP) return;
      state.credits = creditAmount(state.credits - RATION_BUNDLE.cost);
      state.pantry += RATION_BUNDLE.quantity;
      pushEvent(state, "Bought six ration crystals for 36 credits.", gameCtx.time.now(), "good");
      householdStore.write(gameCtx, { ...state });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define("household.relief", {
    apply(gameCtx) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      if (state.reliefDay === state.day || state.pantry >= RELIEF.quantity || state.credits >= RATION_BUNDLE.cost) return;
      state.pantry = Math.min(PANTRY_CAP, state.pantry + RELIEF.quantity);
      state.debt = creditAmount(state.debt + RELIEF.debt);
      state.reliefDay = state.day;
      pushEvent(state, "Emergency ration signal accepted: four crystals, 40 credits owed. Earn or harvest to recover.", gameCtx.time.now());
      householdStore.write(gameCtx, { ...state });
      checkpoint(gameCtx);
    },
  });
}
