import { gamePhase } from "@jgengine/core/game/gamePhase";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { SceneObject } from "@jgengine/core/scene/objectStore";

import { PLOT } from "../world";
import { householdBook } from "./agents";
import { FURNITURE, FURNITURE_BY_ID, type FurnitureRole } from "./objects/catalog";
import { noteEvent } from "./session/types";
import { householdStore } from "./session/store";
import { creditAmount, PANTRY_CAP, RATION_BUNDLE, RELIEF } from "./sim/economy";
import { canChangeLifestyle, scheduleLabel, shiftIsOpen } from "./sim/schedule";
import { stationShortfall } from "./sim/goal";
import { hasRoom, releaseMember, startConversation } from "./sim/simulate";
import type { BloomCrop, HouseholdState, Lifestyle, MemberState } from "./session/types";

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
      noteEvent(state, gameCtx.game.notices, `Sold ${def.name} for ${Math.round(def.cost / 2)} credits.`, "info");
      gameCtx.game.audio.play("sell", [obj.position[0], obj.position[1], obj.position[2]]);
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

type ShiftKind = "work" | "tend";

const SHIFT_STATION: Record<ShiftKind, string> = { work: "Yield Console", tend: "Bloom Planter" };

function shiftRole(kind: ShiftKind): FurnitureRole {
  return kind === "work" ? "work" : "fun";
}

function isShiftStation(kind: ShiftKind, obj: SceneObject): boolean {
  return kind === "work" ? FURNITURE_BY_ID[obj.catalogId]?.role === "work" : obj.catalogId === "bloom_planter";
}

/** A being with nothing of its own to finish and a paid window still ahead. */
function freeForShift(state: HouseholdState, member: MemberState): boolean {
  if (member.recovering || member.shiftDay === state.day || member.workToday > 0 || member.harvestToday > 0) return false;
  return member.action.kind === "idle" || member.action.kind === "wander";
}

/** Why a bonded partner cannot take this shift yet, or null when they can. */
function joinBlocker(partner: MemberState, kind: ShiftKind, now: number): string | null {
  const wanted: Lifestyle = kind === "work" ? "yield" : "bloom";
  if (partner.lifestyle !== wanted) return `${partner.name} keeps ${wanted === "yield" ? "Bloom" : "Yield"} hours`;
  if (!shiftIsOpen(partner, now)) return `${partner.name}'s ${scheduleLabel(partner)} window is closed`;
  if (partner.needs.energy < 35 || partner.needs.hunger < 35) return `${partner.name} is too depleted for a shift`;
  return null;
}

/** Walk a being to a station, keeping an ongoing visit rather than restarting it. Returns false when nothing new started. */
function sendToStation(member: MemberState, kind: ShiftKind, obj: SceneObject, now: number): boolean {
  const role = shiftRole(kind);
  const current = member.action;
  const alreadyThere = (current.kind === "seek" || current.kind === "use") && current.goal === role && current.objId === obj.instanceId;
  if (!alreadyThere) member.action = { kind: "seek", goal: role, objId: obj.instanceId };
  member.assignedByPlayer = true;
  member.actionUntil = now + 12;
  member.concern = null;
  return !alreadyThere;
}

function nearestShiftStation(ctx: GameContext, state: HouseholdState, member: MemberState, kind: ShiftKind): SceneObject | null {
  const from = ctx.scene.entity.get(member.id)?.position ?? [0, 0, 0];
  const objects = ctx.scene.object.list().filter(obj => isShiftStation(kind, obj) && hasRoom(state, member, obj));
  objects.sort((a, b) => Math.hypot(a.position[0] - from[0], a.position[2] - from[2]) - Math.hypot(b.position[0] - from[0], b.position[2] - from[2]));
  return objects[0] ?? null;
}

function refuseSplit(ctx: GameContext, state: HouseholdState, member: MemberState, sentence: string): void {
  member.concern = sentence;
  noteEvent(state, ctx.game.notices, sentence, "deny");
  ctx.game.audio.play("denied");
}

/**
 * Order a paid station visit. A bonded pair works side by side or not at all: the free partner takes
 * the neighbouring station, else the order stops with a sentence naming the fix.
 */
function orderShift(ctx: GameContext, state: HouseholdState, member: MemberState, kind: ShiftKind, station: SceneObject): boolean {
  const now = ctx.time.now();
  const noun = SHIFT_STATION[kind];
  const partnerId = householdBook(state).bondedWith(member.id);
  const partner = partnerId === null ? undefined : state.members[partnerId];
  if (partner === undefined || !freeForShift(state, partner)) {
    if (sendToStation(member, kind, station, now) && kind === "work") noteEvent(state, ctx.game.notices, `${member.name} started a Yield shift.`, "info");
    return true;
  }
  const blocker = joinBlocker(partner, kind, now);
  if (blocker !== null) {
    refuseSplit(ctx, state, member, `${member.name} and ${partner.name} are bonded and will not take separate shifts; ${blocker}. Match their rhythms or let both rest.`);
    return false;
  }
  const before = { action: member.action, assignedByPlayer: member.assignedByPlayer, actionUntil: member.actionUntil };
  const started = sendToStation(member, kind, station, now);
  const mate = nearestShiftStation(ctx, state, partner, kind);
  if (mate === null) {
    member.action = before.action;
    member.assignedByPlayer = before.assignedByPlayer;
    member.actionUntil = before.actionUntil;
    refuseSplit(ctx, state, member, `${member.name} and ${partner.name} are bonded and will not split; furnish a second ${noun} so they can work side by side.`);
    return false;
  }
  sendToStation(partner, kind, mate, now);
  if (started && kind === "work") noteEvent(state, ctx.game.notices, `${member.name} started a Yield shift.`, "info");
  noteEvent(state, ctx.game.notices, `${member.name} and ${partner.name} stay together: two ${noun === "Bloom Planter" ? "planters" : "consoles"}, one shift.`, "info");
  return true;
}

function handlePointer(ctx: GameContext, input: PointerInput): void {
  if (gamePhase(ctx) !== "playing") return;
  const state = householdStore.read(ctx);

  if (state.buildTool !== null) {
    const def = FURNITURE_BY_ID[state.buildTool];
    if (def === undefined) return;
    if (state.credits < def.cost) {
      noteEvent(state, ctx.game.notices, `Not enough credits for ${def.name}.`, "deny");
      householdStore.write(ctx, { ...state });
      ctx.game.audio.play("denied");
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
      noteEvent(state, ctx.game.notices, "Leave room between furnishings; choose another spot.", "deny");
      householdStore.write(ctx, { ...state });
      ctx.game.audio.play("denied");
      return;
    }
    const y = ctx.world.groundHeightAt(x, z);
    ctx.scene.object.place(def.id, x, y, z, { instanceId: nextPlacementId(ctx, def.id) });
    noteEvent(state, ctx.game.notices, `Placed ${def.name}.`, "success");
    householdStore.write(ctx, { ...state, credits: creditAmount(state.credits - def.cost), buildTool: null });
    ctx.game.audio.play("place", [x, y, z]);
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
        const shift: ShiftKind | null = def.role === "work" ? "work" : obj.catalogId === "bloom_planter" ? "tend" : null;
        if (shift !== null && !orderShift(ctx, state, member, shift, obj)) {
          householdStore.write(ctx, { ...state, members: { ...state.members } });
          return;
        }
        if (shift === null) {
          const current = member.action;
          // A repeated direction keeps an ongoing activity, including its already-paid meal.
          if ((current.kind !== "seek" && current.kind !== "use") || current.goal !== def.role || current.objId !== obj.instanceId) {
            member.action = { kind: "seek", goal: def.role, objId: obj.instanceId };
          }
          member.assignedByPlayer = true;
          member.actionUntil = ctx.time.now() + 12;
          noteEvent(state, ctx.game.notices, `${member.name} sent to the ${def.name}.`, "info");
        }
        householdStore.write(ctx, { ...state, members: { ...state.members } });
        checkpoint(ctx);
        return;
      }
    }
  }

  householdStore.write(ctx, { ...state, selectedMemberId: null });
}

function registerHouseholdCommands(ctx: GameContext): void {
  ctx.game.commands.define<{ id: string; crop: BloomCrop }>("member.bloomCrop", {
    apply(gameCtx, { id, crop }) {
      if (gamePhase(gameCtx) !== "playing" || (crop !== "pantry" && crop !== "export")) return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      if (member === undefined || member.lifestyle !== "bloom") return;
      if (member.shiftProgress > 0 || member.harvestToday > 0) {
        member.concern = "Today's crop is committed; choose another crop tomorrow";
      } else {
        member.bloomCrop = crop;
        member.concern = null;
        noteEvent(state, gameCtx.game.notices, `${member.name} chose ${crop === "pantry" ? "pantry crops: 4 rations and 48 credits" : "export crops: 1 ration and 60 credits"}.`, "info");
      }
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define<{ id: string; lifestyle: Lifestyle }>("member.lifestyle", {
    apply(gameCtx, { id, lifestyle }) {
      if (gamePhase(gameCtx) !== "playing" || (lifestyle !== "yield" && lifestyle !== "bloom")) return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      if (member === undefined || member.lifestyle === lifestyle) return;
      if (!canChangeLifestyle(member)) {
        noteEvent(state, gameCtx.game.notices, `${member.name} already started today's paid shift; choose a new rhythm tomorrow.`, "deny");
        householdStore.write(gameCtx, { ...state });
        return;
      }
      member.lifestyle = lifestyle;
      releaseMember(member);
      member.concern = null;
      noteEvent(state, gameCtx.game.notices, `${member.name} chose ${lifestyle === "yield" ? "Yield career" : "Bloom keeping"}. The daily paid limit stays in place.`, "info");
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
      noteEvent(state, gameCtx.game.notices, accepted ? `${member.name} and ${partner.name} put their activities aside to trade signals.` : "Nourish and rest before inviting a companion.", accepted ? "info" : "deny");
      householdStore.write(gameCtx, { ...state, members: { ...state.members } });
      checkpoint(gameCtx);
    },
  });
  ctx.game.commands.define<{ id: string; goal: FurnitureRole | "auto" | "tend" | "play" }>("member.direct", {
    apply(gameCtx, { id, goal }) {
      if (gamePhase(gameCtx) !== "playing") return;
      const state = householdStore.read(gameCtx);
      const member = state.members[id];
      if (member === undefined) return;
      if (goal === "auto") releaseMember(member);
      else {
        if (!["hunger", "energy", "social", "fun", "work", "tend", "play"].includes(goal)) return;
        const role = goal === "tend" || goal === "play" ? "fun" : goal;
        if (goal === "tend" && member.lifestyle !== "bloom") return;
        if ((goal === "work" || goal === "tend") && (!shiftIsOpen(member, gameCtx.time.now()) || member.recovering || member.shiftDay === state.day)) {
          member.concern = member.recovering ? "Recover before taking a paid shift" : member.shiftDay === state.day ? "Today's paid shift is finished or its window closed" : "Paid shift window is closed; care and reconnect until it opens";
          householdStore.write(gameCtx, { ...state, members: { ...state.members } });
          return;
        }
        const from = gameCtx.scene.entity.get(id)?.position;
        if (from === undefined) return;
        const objects = gameCtx.scene.object.list().filter((obj) => FURNITURE_BY_ID[obj.catalogId]?.role === role && (goal !== "tend" || obj.catalogId === "bloom_planter") && (goal !== "play" || obj.catalogId !== "bloom_planter"));
        objects.sort((a, b) => Math.hypot(a.position[0] - from[0], a.position[2] - from[2]) - Math.hypot(b.position[0] - from[0], b.position[2] - from[2]));
        const obj = objects[0];
        if (obj === undefined) {
          member.concern = stationShortfall(role, goal === "tend", false);
          householdStore.write(gameCtx, { ...state, members: { ...state.members } });
          return;
        }
        member.concern = null;
        if (goal === "work" || goal === "tend") {
          if (!orderShift(gameCtx, state, member, goal, obj)) {
            householdStore.write(gameCtx, { ...state, members: { ...state.members } });
            return;
          }
        } else {
          const current = member.action;
          if ((current.kind !== "seek" && current.kind !== "use") || current.goal !== role || current.objId !== obj.instanceId) {
            member.action = { kind: "seek", goal: role, objId: obj.instanceId };
          }
          member.assignedByPlayer = true;
          member.actionUntil = gameCtx.time.now() + 12;
        }
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
      noteEvent(state, gameCtx.game.notices, "Bought six ration crystals for 36 credits.", "success");
      gameCtx.game.audio.play("purchase");
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
      noteEvent(state, gameCtx.game.notices, "Emergency ration signal accepted: four crystals, 40 credits owed. Earn or harvest to recover.", "info");
      gameCtx.game.audio.play("relief");
      householdStore.write(gameCtx, { ...state });
      checkpoint(gameCtx);
    },
  });
}
