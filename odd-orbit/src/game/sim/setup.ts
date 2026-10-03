import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { generateBodyPlan } from "../creatures/bodyPlan";
import { makeNamer } from "../creatures/names";
import { ALIEN_KIND, JOBS } from "../entities/aliens/catalog";
import { emptyNeeds } from "../needs/needs";
import { householdStore } from "../session/store";
import { createHousehold, pairKey, type HouseholdState, type MemberState } from "../session/types";
import { LIFE_EVENT_SECONDS } from "./events";
import { createHouseholdEconomy } from "./economy";
import { SCENE_PLACEMENTS } from "../../editorLayers";

const MEMBER_COUNT = 4;
const SPAWN_RING = 3.5;

export function setupWorld(ctx: GameContext): void {
  const current = householdStore.read(ctx);
  if (current.order.length > 0) return;
  const state = createHousehold(current.seed);
  state.day = ctx.time.calendar().day;
  state.nextLifeEventAt = ctx.time.now() + LIFE_EVENT_SECONDS;
  state.economy = createHouseholdEconomy(ctx.time.now());

  for (const placement of SCENE_PLACEMENTS) {
    const y = ctx.world.groundHeightAt(placement.x, placement.z);
    ctx.scene.object.place(placement.object, placement.x, y, placement.z, {
      instanceId: placement.instanceId,
      ...(placement.rotation === 0 ? {} : { rotation: placement.rotation }),
      onExisting: "keep",
    });
  }

  const namer = makeNamer(state.seed);
  for (let i = 0; i < MEMBER_COUNT; i++) {
    const id = `alien:${i}`;
    const bodyPlan = generateBodyPlan(`${state.seed}:${i}`);
    const angle = (i / MEMBER_COUNT) * Math.PI * 2;
    const x = Math.cos(angle) * SPAWN_RING;
    const z = Math.sin(angle) * SPAWN_RING;
    const y = ctx.world.groundHeightAt(x, z);
    ctx.scene.entity.spawn(ALIEN_KIND, {
      id,
      position: [x, y, z],
      role: "npc",
      rotationY: angle,
      meta: { bodyPlan },
      onExisting: "replace",
    });
    const member: MemberState = {
      id,
      name: namer(),
      bodyPlan,
      job: JOBS[i % JOBS.length],
      needs: emptyNeeds(),
      action: { kind: "idle" },
      assignedByPlayer: false,
      actionUntil: 0,
      lifestyle: i % 2 === 0 ? "yield" : "bloom",
      stress: 0,
      recovering: false,
      workToday: 0,
      harvestToday: 0,
      shiftProgress: 0,
      shiftDay: -1,
      completedShifts: 0,
      missedShifts: 0,
      concern: null,
    };
    state.members[id] = member;
    state.order.push(id);
  }

  seedRelationships(state);
  householdStore.write(ctx, state);
}

function seedRelationships(state: HouseholdState): void {
  for (let i = 0; i < state.order.length; i++) {
    for (let j = i + 1; j < state.order.length; j++) {
      const key = pairKey(state.order[i]!, state.order[j]!);
      state.relationships[key] = 8;
    }
  }
}
