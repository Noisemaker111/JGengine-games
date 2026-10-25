import { useRef } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { compassBearing, headingToBearing, relativeBearing } from "@jgengine/core/world/minimap";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { KitObjective, type KitObjectiveStep } from "@jgengine/react/kitFlow";
import { KitButton } from "@jgengine/react/uiKitRoot";
import { RACE_ENTRY_FEE, SAFEHOUSE_PRICE } from "../../commands";
import { drivingStore, raceStore } from "../../handroll";
import { cargoStore } from "../../items/cargoHaul";
import { bountyPayout, bountyStore } from "../../jobs/bounties";
import { courierDeadline, courierObjectiveStore, courierStore, DELIVERY_ROUTES, DISPATCH, RUSH_BOND, THIEF } from "../../jobs/courier";
import { prompts } from "../../prompts";
import { MISSION_HINTS, QUESTS } from "../../quests/catalog";
import { BOUNTY_SPOTS, BRIEFCASE_POS, CICADA_STAGE_POS, DOCK_FIGHT_CENTER, GARAGE_POS, KINGPIN_POS, MARCO_POS, RACE_ROUTES } from "../../world/districts";

type XZ = readonly [number, number];
const xz = (p: readonly number[]): XZ => [p[0]!, p[2]!];

/** Where each story mission sends the player; the minimap pins the same spots. */
export const QUEST_TARGETS: Record<string, XZ> = {
  m1_welcome: xz(MARCO_POS),
  m2_dock_sweep: xz(DOCK_FIGHT_CENTER),
  m3_the_ledger: xz(BRIEFCASE_POS),
  m5_ocean_loop: xz(GARAGE_POS),
  m6_hot_wheels: xz(CICADA_STAGE_POS),
  m7_carmine_convoy: xz(DOCK_FIGHT_CENTER),
  m8_kingpin: xz(KINGPIN_POS),
};

interface Goal {
  key: string;
  eyebrow?: string;
  title: string;
  target?: XZ;
  steps?: KitObjectiveStep[];
  deadline?: { remaining: number; total: number };
  hint?: string;
  rush?: string;
}

const words = (id: string) => id.replaceAll("_", " ");

/** The one thing to do now, most urgent first: a race, a parcel in hand, the story, a bounty, then the booth. */
function goalOf(ctx: GameContext, at: XZ): Goal {
  const race = raceStore.read(ctx);
  const circuit = race?.active === true ? RACE_ROUTES.find((r) => r.id === race.routeId) : undefined;
  if (race !== undefined && circuit !== undefined) {
    return { key: `race:${circuit.id}`, eyebrow: `${race.label} · ${race.position === 1 ? "leading" : "second"}`, title: `Gate ${Math.min(race.checkpoint + 1, race.total)} of ${race.total}`, target: circuit.checkpoints[Math.min(race.checkpoint, circuit.checkpoints.length - 1)], hint: "Drive through each gate in order." };
  }
  const courier = courierStore.read(ctx);
  if (courier.phase === "running") {
    const route = DELIVERY_ROUTES[courier.route % DELIVERY_ROUTES.length]!;
    const step = courierObjectiveStore.read(ctx);
    if (step?.step === 2) {
      const runner = ctx.scene.entity.get(THIEF);
      return { key: "runner", eyebrow: "Parcel snatched", title: "Catch the runner", target: runner === null ? undefined : xz(runner.position), deadline: step.remaining === null ? undefined : { remaining: step.remaining, total: 60 }, hint: "Get within 3 m. Keep them alive or the parcel burns." };
    }
    const rush = courier.service === "rush";
    const crates = cargoStore.read(ctx).carried;
    const load = rush ? `Fragile parcel · ${Math.round(courier.condition ?? 100)}% intact` : crates > 0 ? `Parcel + ${crates} crates` : "Parcel aboard";
    return { key: `parcel:${courier.route}`, eyebrow: load, title: `Deliver to ${route.recipient}`, target: route.position, deadline: { remaining: courier.remaining, total: courierDeadline(route.seconds, rush) }, hint: rush ? "Stay under 35 km/h and avoid hits: damage spoils the cargo." : `${route.hint} Stop beside it to hand over.` };
  }
  const atBooth = Math.hypot(at[0] - DISPATCH[0], at[1] - DISPATCH[1]) < 9;
  const quest = ctx.game.quest?.list(ctx.player.userId).find((q) => q.status === "active");
  if (quest !== undefined && courier.delivered > 0 && !atBooth) {
    const counted = quest.objectives.length > 1 || quest.objectives.some((o) => o.count > 1);
    return { key: `quest:${quest.questId}`, eyebrow: QUESTS.find((q) => q.id === quest.questId)?.title, title: MISSION_HINTS[quest.questId] ?? words(quest.questId), target: QUEST_TARGETS[quest.questId], steps: counted ? quest.objectives.map((o) => ({ id: o.id, label: `${words(o.id)} ${o.progress}/${o.count}`, done: o.complete })) : undefined };
  }
  const bounty = bountyStore.read(ctx);
  const spot = BOUNTY_SPOTS.find((s) => s.id === bounty?.spotId);
  if (bounty?.targetId != null && spot !== undefined && !atBooth) {
    return { key: `bounty:${spot.id}`, eyebrow: `Bounty · $${bountyPayout(bounty.completed)}`, title: `Take down the mark at ${spot.label}`, target: xz(spot.position) };
  }
  const offer = DELIVERY_ROUTES[courier.delivered % DELIVERY_ROUTES.length]!;
  return {
    key: "dispatch",
    eyebrow: `${offer.label} · $${offer.payout}`,
    title: atBooth ? "Take a parcel" : "Go to the dispatch booth",
    target: atBooth ? undefined : DISPATCH,
    hint: atBooth ? undefined : "The teal booth stands on the shore path. Follow the arrow.",
    rush: atBooth && courier.delivered > 0 ? `Fragile rush · ${courierDeadline(offer.seconds, true)} s · $${RUSH_BOND} bond` : undefined,
  };
}

function promptLabel(id: string): string {
  if (id.startsWith("enter:")) return "Get in";
  if (id.startsWith("race:")) return `Race ${RACE_ROUTES.find((r) => `race:${r.id}` === id)?.label ?? "the streets"} · $${RACE_ENTRY_FEE}`;
  const labels: Record<string, string> = { "shop:ammunation": "Browse Ammu-Isle", "garage:dealer": "Browse Sunset Motors", "safehouse:buy": `Buy Palmview Bungalow · $${SAFEHOUSE_PRICE.toLocaleString()}`, "safehouse:rest": "Rest at the bungalow", "courier:accept": "Take standard parcel", "courier:deliver": "Hand over the parcel" };
  return labels[id] ?? "Talk";
}

/** The goal plus where it is from here: rounded so the card redraws a few times a second, not every frame. */
function objectiveView(ctx: GameContext) {
  const player = ctx.scene.entity.get(ctx.player.userId);
  const body = ctx.scene.entity.get(drivingStore.read(ctx) ?? ctx.player.userId) ?? player;
  if (body === null || player === null) return null;
  const at = xz(body.position);
  const goal = goalOf(ctx, at);
  const active = resolveActivePrompt({ x: player.position[0], z: player.position[2] }, prompts(ctx));
  const target = goal.target;
  return {
    ...goal,
    distance: target === undefined ? undefined : Math.round(Math.hypot(target[0] - at[0], target[1] - at[1])),
    bearing: target === undefined ? undefined : Math.round(relativeBearing(compassBearing(at, target), headingToBearing(body.rotationY)) * 20) / 20,
    deadline: goal.deadline === undefined ? undefined : { remaining: Math.ceil(goal.deadline.remaining * 4) / 4, total: goal.deadline.total },
    prompt: active?.prompt.invoke == null ? null : { id: active.id, name: active.prompt.invoke.name, input: active.prompt.invoke.input },
  };
}

const sameView = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One card that always says what to do next, which way it is, and the key that does it. */
export function Objective() {
  const { commands } = useGame();
  const view = useGameStore(objectiveView, sameView);
  // The idle hint waits on real progress: getting closer, not just moving.
  const best = useRef({ key: "", distance: Infinity });
  if (view === null) return null;
  if (best.current.key !== view.key) best.current = { key: view.key, distance: Infinity };
  if (view.distance !== undefined && view.distance < best.current.distance - 3) best.current.distance = view.distance;
  const prompt = view.prompt;
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
      <KitObjective
        eyebrow={view.eyebrow}
        title={view.title}
        distance={view.distance}
        bearing={view.bearing}
        deadline={view.deadline}
        steps={view.steps}
        hint={view.hint}
        progressKey={`${view.key}:${best.current.distance}`}
        prompt={prompt === null ? undefined : { action: "interact", label: promptLabel(prompt.id), onActivate: () => commands.run(prompt.name, prompt.input) }}
      />
      {view.rush === undefined ? null : <KitButton size="sm" onClick={() => commands.run("courier.accept", { service: "rush" })}>{view.rush}</KitButton>}
    </div>
  );
}
