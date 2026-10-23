import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { RelationshipBook } from "@jgengine/core/agents/relationships";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { householdBook, memberAgent, syncBook, syncMember } from "../agents";

import { DAY_LENGTH } from "../../world";
import { FURNITURE_BY_ID, WORK_EARN_PER_SECOND, type FurnitureRole } from "../objects/catalog";
import { clamp, lowestNeed, type NeedId } from "../needs/needs";
import { householdStore } from "../session/store";
import { noteEvent, pairKey, type HouseholdState, type MemberState } from "../session/types";
import { chooseDesire, isIdleish, SOCIAL_RANGE, SOCIAL_SECONDS, USE_FULL, type RoleAvailability } from "./ai";
import { advanceLifeEvents } from "./events";
import { creditAmount, PANTRY_CAP, settleHouseholdDay } from "./economy";
import { FLEX_AFTER_SHIFTS, householdPhase, SHIFT_SECONDS, shiftIsOpen, shiftWindow } from "./schedule";
import { bloomHarvest } from "./bloom";
import { stationShortfall } from "./goal";

function positionOf(ctx: GameContext, id: string): [number, number, number] | null {
  const entity = ctx.scene.entity.get(id);
  return entity === null ? null : [...entity.position];
}

function availabilityFrom(objects: readonly SceneObject[]): RoleAvailability {
  const avail: RoleAvailability = { hunger: false, energy: false, social: false, fun: false, work: false };
  for (const obj of objects) {
    const def = FURNITURE_BY_ID[obj.catalogId];
    if (def !== undefined) avail[def.role] = true;
  }
  return avail;
}

function usersOf(state: HouseholdState, objId: string): MemberState[] {
  return state.order.map((id) => state.members[id]!).filter((m) => m !== undefined && (m.action.kind === "use" || m.action.kind === "seek") && m.action.objId === objId);
}

export function hasRoom(state: HouseholdState, member: MemberState, obj: SceneObject): boolean {
  const def = FURNITURE_BY_ID[obj.catalogId];
  if (def === undefined) return false;
  const users = usersOf(state, obj.instanceId);
  const index = users.findIndex((m) => m.id === member.id);
  return index >= 0 ? index < def.capacity : users.length < def.capacity;
}

/** True while the member is walking to a station whose places are all taken — they will stand and wait. */
export function waitingForStation(state: HouseholdState, member: MemberState, objects: readonly SceneObject[]): boolean {
  const { action } = member;
  if (action.kind !== "seek") return false;
  const obj = objects.find((candidate) => candidate.instanceId === action.objId);
  return obj !== undefined && !hasRoom(state, member, obj);
}

function nearestForRole(ctx: GameContext, state: HouseholdState, member: MemberState, objects: readonly SceneObject[], role: FurnitureRole, catalogId?: string): SceneObject | null {
  const from = positionOf(ctx, member.id) ?? [0, 0, 0];
  let best: SceneObject | null = null;
  let bestD = Infinity;
  for (const obj of objects) {
    const def = FURNITURE_BY_ID[obj.catalogId];
    if (def === undefined || def.role !== role || (catalogId !== undefined && obj.catalogId !== catalogId) || !hasRoom(state, member, obj)) continue;
    const d = (obj.position[0] - from[0]) ** 2 + (obj.position[2] - from[2]) ** 2;
    if (d < bestD) { bestD = d; best = obj; }
  }
  return best;
}

function moveMember(ctx: GameContext, id: string, target: [number, number, number], speed: number, dt: number): number {
  const from = positionOf(ctx, id);
  if (from === null) return Infinity;
  const dx = target[0] - from[0];
  const dz = target[2] - from[2];
  const dist = Math.hypot(dx, dz);
  const next = ctx.scene.entity.moveToward(id, target, { speed, dt, stopDistance: 0 });
  if (next !== null) ctx.scene.entity.setPose(id, {
    position: [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]], rotationY: Math.atan2(dx, dz), dt,
  });
  return dist;
}

function hashId(id: string): number {
  let a = 0;
  for (let i = 0; i < id.length; i++) a = (a * 31 + id.charCodeAt(i)) >>> 0;
  return a;
}

export function releaseMember(member: MemberState): void {
  member.action = { kind: "idle" };
  member.assignedByPlayer = false;
  member.actionUntil = 0;
}

function concern(ctx: GameContext, state: HouseholdState, member: MemberState, text: string): void {
  if (member.concern !== text) noteEvent(state, ctx.game.notices, `${member.name}: ${text}.`, "warn");
  member.concern = text;
}

function finishShift(ctx: GameContext, state: HouseholdState, member: MemberState, now: number): void {
  if (member.shiftDay === state.day) return;
  member.shiftDay = state.day;
  member.completedShifts += 1;
  noteEvent(state, ctx.game.notices, `${member.name} finished a ${member.lifestyle === "yield" ? "Yield" : "Bloom"} shift.`, "success");
  const at = positionOf(ctx, member.id);
  if (at !== null) ctx.game.audio.play("shift", at);
  if (member.completedShifts === FLEX_AFTER_SHIFTS) noteEvent(state, ctx.game.notices, `${member.name} earned flex hours: paid shifts can now run 08–18.`, "success");
}

function closeMissedShift(ctx: GameContext, state: HouseholdState, member: MemberState, now: number): void {
  const hour = ((now % DAY_LENGTH) / DAY_LENGTH) * 24;
  if (member.shiftDay >= state.day || hour < shiftWindow(member).end) return;
  const finished = member.lifestyle === "yield" ? member.workToday >= SHIFT_SECONDS : member.harvestToday > 0;
  member.shiftDay = state.day;
  if (finished) return;
  member.missedShifts += 1;
  member.stress = clamp(member.stress + 12);
  concern(ctx, state, member, member.lifestyle === "yield" ? "Yield window closed; unfinished work earned only partial pay" : "Bloom window closed; no harvest today");
}

const MAX_FRAME_SIM_SECONDS = 10;
const MAX_STEP_SECONDS = 0.25;

export function simulateHousehold(ctx: GameContext, dt: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const now = ctx.time.now();
  const simulated = Math.min(dt, MAX_FRAME_SIM_SECONDS);
  if (dt > simulated) {
    const state = householdStore.read(ctx);
    const unattended = dt - simulated;
    const missedDays = Math.max(0, Math.floor((now - simulated) / DAY_LENGTH) - state.day - 1);
    for (const id of state.order) {
      const member = state.members[id];
      if (member === undefined) continue;
      memberAgent(member, ctx.rng).update({ dt: unattended, now: now - simulated });
    syncMember(member, ctx.rng);
      member.missedShifts += missedDays;
      if (member.needs.hunger < 18 || member.needs.energy < 18) member.stress = clamp(member.stress + unattended);
      releaseMember(member);
    }
    householdStore.write(ctx, { ...state, members: { ...state.members } });
  }
  const steps = Math.ceil(simulated / MAX_STEP_SECONDS);
  const step = simulated / steps;
  for (let i = 1; i <= steps; i++) stepHousehold(ctx, step, now - simulated + step * i);
  if (dt > simulated) {
    const state = householdStore.read(ctx);
    noteEvent(state, ctx.game.notices, "An unattended interval passed: needs continued to decay and paid shifts were missed. Habitat bills remain due.", "info");
    householdStore.write(ctx, { ...state });
  }
}

function stepHousehold(ctx: GameContext, dt: number, now: number): void {
  const state = householdStore.read(ctx);
  if (state.order.length === 0) return;
  const objects = ctx.scene.object.list();
  if (Math.floor(now / DAY_LENGTH) > state.day) {
    for (const id of state.order) closeMissedShift(ctx, state, state.members[id]!, state.day * DAY_LENGTH + DAY_LENGTH - 0.001);
  }
  const dayBefore = state.day;
  settleHouseholdDay(state, objects, now, ctx.game.notices);
  if (state.day !== dayBefore) ctx.game.audio.play("bill");
  const availability = availabilityFrom(objects);
  for (const id of state.order) {
    const member = state.members[id];
    if (member === undefined) continue;
    memberAgent(member, ctx.rng).update({ dt, now });
    syncMember(member, ctx.rng);
    const urgent = member.needs.hunger < 18 || member.needs.energy < 18;
    member.stress = clamp(member.stress + (urgent ? 1.2 : -0.035) * dt);
    if (!member.recovering && member.stress >= 80) {
      member.recovering = true;
      releaseMember(member);
      concern(ctx, state, member, "Overwhelmed — paid work stops until rest, food and company help");
    }
    if (member.recovering && member.stress < 35 && member.needs.hunger >= 50 && member.needs.energy >= 50) {
      member.recovering = false;
      member.concern = null;
      noteEvent(state, ctx.game.notices, `${member.name} recovered and can take paid shifts again.`, "success");
    }
    closeMissedShift(ctx, state, member, now);
  }
  const book = householdBook(state);
  for (const id of state.order) {
    const member = state.members[id];
    if (member !== undefined) stepMember(ctx, state, member, objects, availability, now, dt, book);
  }
  stepSocialPairs(ctx, state, now, dt, book);
  advanceLifeEvents(state, now, ctx.game.notices);
  for (const id of state.order) {
    for (const other of book.partnersOf(id)) {
      if (id >= other) continue;
      if (book.opinion(id, other) > 0) book.socialise(id, other, { opinion: -(2 / DAY_LENGTH) * dt });
    }
  }
  syncBook(state, book);
  for (const id of state.order) {
    const member = state.members[id];
    if (member !== undefined) syncMember(member, ctx.rng);
  }
  householdStore.write(ctx, { ...state, members: { ...state.members } });
}

function stepMember(ctx: GameContext, state: HouseholdState, member: MemberState, objects: readonly SceneObject[], availability: RoleAvailability, now: number, dt: number, book: RelationshipBook): void {
  const agent = memberAgent(member, ctx.rng);
  const speed = (2.1 * (0.7 + member.bodyPlan.limbCount * 0.06)) / member.bodyPlan.size * (member.recovering ? 0.65 : 1);
  const action = member.action;
  const critical = lowestNeed(member.needs);
  if ((action.kind === "use" || action.kind === "seek") && action.goal !== critical.need && critical.value < 25 && availability[critical.need]
    && (action.goal === "work" || action.goal === "social" || action.goal === "fun" || member.needs[action.goal] >= 55)) {
    releaseMember(member);
    concern(ctx, state, member, `Interrupted for ${critical.need === "energy" ? "rest" : critical.need}`);
    return;
  }
  if (action.kind === "social") {
    const partner = state.members[action.withId];
    const mine = positionOf(ctx, member.id);
    const theirs = positionOf(ctx, action.withId);
    if (partner === undefined || mine === null || theirs === null || partner.action.kind !== "social" || partner.action.withId !== member.id) { releaseMember(member); return; }
    if (member.needs.hunger < 20 || member.needs.energy < 20) { releaseMember(member); return; }
    if (Math.hypot(mine[0] - theirs[0], mine[2] - theirs[2]) > SOCIAL_RANGE) moveMember(ctx, member.id, theirs, speed, dt);
    else ctx.scene.entity.setPose(member.id, { position: mine, rotationY: Math.atan2(theirs[0] - mine[0], theirs[2] - mine[2]) });
    if (now >= member.actionUntil) { releaseMember(member); releaseMember(partner); }
    return;
  }
  if (action.kind === "use" || action.kind === "seek") {
    const obj = objects.find((candidate) => candidate.instanceId === action.objId);
    const def = obj === undefined ? undefined : FURNITURE_BY_ID[obj.catalogId];
    if (obj === undefined || def === undefined || def.role !== action.goal) { releaseMember(member); return; }
    const isTending = obj.catalogId === "bloom_planter" && member.harvestToday === 0;
    if (action.goal === "work" || isTending) {
      const open = shiftIsOpen(member, now) && (action.goal !== "work" || member.lifestyle === "yield");
      if (!open || member.recovering || (action.goal === "work" && member.workToday >= SHIFT_SECONDS)) {
        if (action.goal === "work") { releaseMember(member); return; }
      }
      if (action.goal === "work" && (member.needs.energy < 35 || member.needs.hunger < 35 || member.needs.fun < 22 || member.needs.social < 22)) {
        concern(ctx, state, member, "Too depleted for paid work; nourish, rest and reconnect");
        releaseMember(member);
        return;
      }
    }
    if (!hasRoom(state, member, obj)) {
      concern(ctx, state, member, `Waiting for ${def.name}; its ${def.capacity} ${def.capacity === 1 ? "place is" : "places are"} occupied`);
      if (now >= member.actionUntil) releaseMember(member);
      return;
    }
    if (action.kind === "seek") {
      const dist = moveMember(ctx, member.id, [...obj.position], speed, dt);
      if (dist <= def.useRadius) {
        member.action = { kind: "use", goal: action.goal, objId: action.objId };
        member.concern = null;
        if (action.goal === "hunger") {
          if (state.pantry <= 0) { concern(ctx, state, member, "Pantry empty — buy rations, tend Blooms or request relief"); releaseMember(member); return; }
          state.pantry -= 1;
        }
      }
      return;
    }
    if (action.goal === "work") {
      const before = creditAmount(member.workToday * WORK_EARN_PER_SECOND);
      const worked = Math.min(dt, SHIFT_SECONDS - member.workToday);
      member.workToday += worked;
      if (member.workToday > SHIFT_SECONDS - 1e-8) member.workToday = SHIFT_SECONDS;
      const earned = creditAmount(member.workToday * WORK_EARN_PER_SECOND) - before;
      state.credits = creditAmount(state.credits + earned);
      state.dayIncome = creditAmount(state.dayIncome + earned);
      agent.needs.refill("energy", -0.55 * worked);
      agent.needs.refill("hunger", -0.2 * worked);
      member.stress = clamp(member.stress + worked);
      if (member.workToday >= SHIFT_SECONDS) { finishShift(ctx, state, member, now); releaseMember(member); }
      return;
    }
    const goal = action.goal;
    const soloRing = goal === "social";
    const cap = soloRing ? 55 : 100;
    const next = Math.min(cap, clamp(member.needs[goal] + def.satisfyPerSecond * dt));
    member.needs[goal] = next;
    agent.needs.refill(goal, next - agent.needs.value(goal));
    if (goal === "energy") member.stress = clamp(member.stress - 2.2 * dt);
    if (goal === "fun") member.stress = clamp(member.stress - (isTending ? 0.6 : 1.25) * dt);
    if (isTending && member.lifestyle === "bloom" && shiftIsOpen(member, now) && !member.recovering) {
      member.shiftProgress = Math.min(SHIFT_SECONDS, member.shiftProgress + dt);
      if (member.shiftProgress > SHIFT_SECONDS - 1e-8) member.shiftProgress = SHIFT_SECONDS;
      agent.needs.refill("energy", -0.2 * dt);
      if (member.shiftProgress >= SHIFT_SECONDS) {
        const book = householdBook(state);
        const friend = state.order.some((id) => {
          const other = state.members[id];
          if (other === undefined || other.id === member.id || !book.prefersCompanyOf(member.id, other.id)) return false;
          const position = positionOf(ctx, other.id);
          return position !== null && Math.hypot(position[0] - obj.position[0], position[2] - obj.position[2]) <= def.useRadius
            && ((other.action.kind === "use" && other.action.objId === obj.instanceId) || other.harvestToday > 0);
        });
        const { rations: harvest, credits: income } = bloomHarvest(member.bloomCrop ?? "pantry", friend);
        member.harvestToday = harvest;
        state.pantry = Math.min(PANTRY_CAP, state.pantry + harvest);
        state.dayHarvest += harvest;
        state.credits = creditAmount(state.credits + income);
        state.dayIncome = creditAmount(state.dayIncome + income);
        noteEvent(state, ctx.game.notices, `${member.name} harvested ${member.bloomCrop === "export" ? "an export" : "a pantry"} crop: ${harvest} rations and earned ${income} credits${friend ? " with a friend's help" : ""}.`, "success");
        ctx.game.audio.play("harvest", [obj.position[0], obj.position[1], obj.position[2]]);
        finishShift(ctx, state, member, now);
        releaseMember(member);
      }
      return;
    }
    if (member.needs[goal] >= (soloRing ? 55 : USE_FULL) && !(member.recovering && (goal === "energy" || goal === "fun") && member.stress >= 35)) { releaseMember(member); }
    return;
  }

  let desire = chooseDesire(member, { ...availability, social: availability.social && member.needs.social < 50 }, member.lifestyle === "yield" && shiftIsOpen(member, now) && member.workToday < SHIFT_SECONDS && !member.recovering, findIdleCompanion(ctx, state, member) !== null, false);
  if (member.recovering && member.needs.energy > 60 && member.needs.hunger > 50 && availability.fun) desire = { kind: "need", goal: "fun" };
  const basicReady = member.needs.hunger > 45 && member.needs.energy > 45 && member.needs.social > 25 && member.needs.fun > 25;
  const bloomTime = member.lifestyle === "bloom" && shiftIsOpen(member, now) && member.harvestToday === 0 && !member.recovering && basicReady;
  if (bloomTime && critical.value >= 35) desire = { kind: "need", goal: "fun" };
  if (householdPhase(now) === "bond" && member.needs.social < 90 && basicReady && findIdleCompanion(ctx, state, member) !== null) desire = { kind: "socialize" };
  if (householdPhase(now) === "torpor" && member.needs.energy < 80 && availability.energy && member.needs.hunger > 35) desire = { kind: "need", goal: "energy" };
  if (member.recovering && !availability.energy && member.needs.energy < 60) {
    agent.needs.refill("energy", 1.5 * dt);
    member.stress = clamp(member.stress - 0.65 * dt);
    concern(ctx, state, member, "Resting outside; a Torpor Pod would recover faster");
    return;
  }
  if (desire.kind === "need" || desire.kind === "work") {
    const role = desire.kind === "work" ? "work" : desire.goal;
    if (role === "hunger" && state.pantry === 0) {
      concern(ctx, state, member, "Pantry empty — buy rations, tend Blooms or request relief");
      return;
    }
    const obj = nearestForRole(ctx, state, member, objects, role, bloomTime && role === "fun" ? "bloom_planter" : undefined);
    if (obj !== null) {
      member.action = { kind: "seek", goal: role, objId: obj.instanceId };
      member.actionUntil = now + 12;
      member.concern = null;
    } else {
      const planter = bloomTime && role === "fun";
      const furnished = objects.some(candidate => FURNITURE_BY_ID[candidate.catalogId]?.role === role && (!planter || candidate.catalogId === "bloom_planter"));
      concern(ctx, state, member, stationShortfall(role, planter, furnished));
    }
  } else if (desire.kind === "socialize") {
    const companion = findIdleCompanion(ctx, state, member);
    if (companion !== null) startConversation(state, member, companion, now, false);
  } else {
    if (action.kind !== "wander" || now >= member.actionUntil) {
      const company = companySpot(ctx, state, book, member);
      if (company !== null) {
        member.action = { kind: "wander", x: company.x, z: company.z, company: company.company };
        member.actionUntil = now + 8;
      } else {
        const angle = (hashId(member.id) % 360) * Math.PI / 180 + member.actionUntil;
        const r = 6 + (hashId(member.id) % 9);
        member.action = { kind: "wander", x: Math.cos(angle) * r, z: Math.sin(angle) * r };
        member.actionUntil = now + 4 + (hashId(member.id) % 4);
      }
    }
    if (member.action.kind === "wander") moveMember(ctx, member.id, [member.action.x, 0, member.action.z], speed * 0.6, dt);
  }
}

/**
 * A spot beside the being this one prefers, so a friend chooses a friend over a random stroll.
 * Only a friend who is free is followed: nobody trails a being who is on a paid station or under the
 * player's direction. A friend resting, playing or talking is exactly who off-hours are for.
 */
function companySpot(ctx: GameContext, state: HouseholdState, book: RelationshipBook, member: MemberState): { x: number; z: number; company: string } | null {
  const mine = positionOf(ctx, member.id);
  if (mine === null) return null;
  let spot: { x: number; z: number; company: string } | null = null;
  let bestOpinion = -Infinity;
  for (const id of state.order) {
    if (id === member.id || !book.prefersCompanyOf(member.id, id)) continue;
    const other = state.members[id];
    if (other === undefined || other.assignedByPlayer) continue;
    const onPaidStation = (other.action.kind === "seek" || other.action.kind === "use") && other.action.goal === "work";
    if (onPaidStation) continue;
    const opinion = book.opinion(member.id, id);
    if (opinion <= bestOpinion) continue;
    const theirs = positionOf(ctx, id);
    if (theirs === null) continue;
    const dx = mine[0] - theirs[0];
    const dz = mine[2] - theirs[2];
    const apart = Math.hypot(dx, dz) || 1;
    spot = { x: theirs[0] + (dx / apart) * 1.7, z: theirs[2] + (dz / apart) * 1.7, company: id };
    bestOpinion = opinion;
  }
  return spot;
}

function findIdleCompanion(ctx: GameContext, state: HouseholdState, member: MemberState): MemberState | null {
  const mine = positionOf(ctx, member.id);
  if (mine === null) return null;
  let companion: MemberState | null = null;
  let best = -Infinity;
  for (const id of state.order) {
    if (id === member.id) continue;
    const other = state.members[id];
    if (other === undefined || !isIdleish(other) || other.assignedByPlayer || other.needs.hunger < 25 || other.needs.energy < 25) continue;
    const theirs = positionOf(ctx, id);
    if (theirs === null) continue;
    const distance = Math.hypot(mine[0] - theirs[0], mine[2] - theirs[2]);
    const score = householdBook(state).opinion(member.id, other.id) - distance;
    if (score > best) { best = score; companion = other; }
  }
  return companion;
}

export function startConversation(state: HouseholdState, member: MemberState, partner: MemberState, now: number, directed = true): boolean {
  if (member.id === partner.id || member.needs.hunger < 20 || member.needs.energy < 20 || partner.needs.hunger < 20 || partner.needs.energy < 20) return false;
  member.action = { kind: "social", withId: partner.id };
  partner.action = { kind: "social", withId: member.id };
  member.actionUntil = partner.actionUntil = now + SOCIAL_SECONDS + (directed ? 5 : 0);
  member.assignedByPlayer = partner.assignedByPlayer = directed;
  member.concern = partner.concern = null;
  return true;
}

function stepSocialPairs(ctx: GameContext, state: HouseholdState, now: number, dt: number, book: ReturnType<typeof householdBook>): void {
  for (const id of state.order) {
    const a = state.members[id];
    if (a === undefined || a.action.kind !== "social" || a.id >= a.action.withId) continue;
    const b = state.members[a.action.withId];
    if (b === undefined || b.action.kind !== "social" || b.action.withId !== a.id) continue;
    const mine = positionOf(ctx, a.id);
    const theirs = positionOf(ctx, b.id);
    if (mine === null || theirs === null || Math.hypot(mine[0] - theirs[0], mine[2] - theirs[2]) > SOCIAL_RANGE) continue;
    const tense = a.stress >= 65 && b.stress >= 65;
    for (const m of [a, b]) {
      memberAgent(m, ctx.rng).needs.refill("social", (tense ? 3 : 9) * dt);
      memberAgent(m, ctx.rng).needs.refill("fun", (tense ? -2 : 3) * dt);
      m.stress = clamp(m.stress - (tense ? 0.1 : 2) * dt);
    }
    const outcome = book.socialise(a.id, b.id, { familiarity: 0.02 * dt, opinion: (tense ? -3 : 4) * dt });
    if (tense && a.concern !== "Signals clashed; rest before reconnecting") {
      concern(ctx, state, a, "Signals clashed; rest before reconnecting");
      b.concern = "Signals clashed; rest before reconnecting";
    }
    for (const milestone of outcome.crossed) {
      ctx.game.audio.play("bond");
      noteEvent(state, ctx.game.notices, `${a.name} & ${b.name} ${milestone.id === "friends" ? "became friends; tending Blooms together now yields more" : milestone.id === "bonded" ? "formed a lifelong bond" : "grew closer"}.`, "success");
    }
  }
}

export function activeGoalLabel(member: MemberState, companyName?: string): string {
  if (member.recovering) return "Recovering from overload";
  const action = member.action;
  switch (action.kind) {
    case "idle": return member.concern ?? "Idling";
    case "wander": return companyName === undefined ? "Strolling the habitat" : `Keeping ${companyName} company`;
    case "seek": return action.goal === "work" ? "Heading to Yield shift" : `Seeking ${goalWord(action.goal)}`;
    case "use": return action.goal === "work" ? `Yield shift ${Math.floor(member.workToday)}/${SHIFT_SECONDS}s` : goalWord(action.goal);
    case "social": return member.concern === "Signals clashed; rest before reconnecting" ? "Signals clashing" : "Trading signals together";
  }
}

function goalWord(goal: NeedId): string {
  return ({ hunger: "Nourishing", energy: "Resting", social: "Bonding", fun: "Playing / tending" } as const)[goal];
}





