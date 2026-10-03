import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { clamp, type NeedId } from "../needs/needs";
import { householdStore } from "../session/store";
import { PANTRY_CAP } from "./economy";
import { pushEvent, type HouseholdState } from "../session/types";

export const LIFE_EVENT_SECONDS = 38;

interface LifeEventDef {
  text: (name: string) => string;
  apply: (state: HouseholdState, memberId: string) => void;
  tone: "info" | "good";
}

const EVENT_DEFS: LifeEventDef[] = [
  {
    text: (n) => `${n} had a spark of inspiration — fun soared.`,
    apply: (s, id) => bump(s, id, "fun", 26),
    tone: "good",
  },
  {
    text: (n) => `${n} found a cache of ration crystals.`,
    apply: (s) => { s.pantry = Math.min(PANTRY_CAP, s.pantry + 2); },
    tone: "good",
  },
  {
    text: (n) => `A drifting comet lit the sky — the whole household felt lighter.`,
    apply: (s) => {
      for (const mid of s.order) bump(s, mid, "fun", 12);
    },
    tone: "good",
  },
  {
    text: (n) => `${n} woke from a strange dream, oddly restless.`,
    apply: (s, id) => bump(s, id, "energy", -14),
    tone: "info",
  },
  {
    text: (n) => `${n} sent out a signal and got a friendly reply.`,
    apply: (s, id) => bump(s, id, "social", 20),
    tone: "good",
  },
  {
    text: () => `A merchant signal offers six ration crystals for 36 credits. The pantry exchange is open.`,
    apply: () => {},
    tone: "good",
  },
];

function bump(state: HouseholdState, memberId: string, need: NeedId, delta: number): void {
  const member = state.members[memberId];
  if (member === undefined) return;
  member.needs[need] = clamp(member.needs[need] + delta);
}

export function registerLifeEvents(ctx: GameContext): void {
  const state = householdStore.read(ctx);
  if (state.nextLifeEventAt > 0) return;
  householdStore.write(ctx, { ...state, nextLifeEventAt: ctx.time.now() + LIFE_EVENT_SECONDS });
}

export function advanceLifeEvents(state: HouseholdState, now: number): void {
  if (state.order.length === 0 || now < state.nextLifeEventAt) return;
  const at = state.nextLifeEventAt;
  state.nextLifeEventAt += (Math.floor((now - at) / LIFE_EVENT_SECONDS) + 1) * LIFE_EVENT_SECONDS;
  const seed = (Math.floor(at * 1000) ^ state.eventSeq) >>> 0;
  const def = EVENT_DEFS[seed % EVENT_DEFS.length]!;
  const memberId = state.order[seed % state.order.length]!;
  const name = state.members[memberId]?.name ?? "Someone";
  def.apply(state, memberId);
  pushEvent(state, def.text(name), now, def.tone);
}
