import { useRef } from "react";
import { resolveActivePrompt } from "@jgengine/core/interaction/proximityPrompt";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { compassBearing, headingToBearing, relativeBearing } from "@jgengine/core/world/minimap";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { KitObjective } from "@jgengine/react/kitFlow";
import { KitButton } from "@jgengine/react/uiKitRoot";
import { city } from "../../city";
import { cityOf } from "../../cityRuntime";
import { frontViews } from "../../city/fronts";
import { RACE_ENTRY_FEE, SAFEHOUSE_PRICE } from "../../commands";
import { drivingStore, raceStore } from "../../handroll";
import { cargoStore } from "../../items/cargoHaul";
import { bountyPayout, bountyStore } from "../../jobs/bounties";
import { courierDeadline, courierObjectiveStore, courierStore, DELIVERY_ROUTES, DISPATCH, RUSH_BOND, THIEF } from "../../jobs/courier";
import { prompts, systemPromptLabel } from "../../prompts";
import { BOUNTY_SPOTS, RACE_ROUTES } from "../../world/districts";

type XZ = readonly [number, number];
const xz = (p: readonly number[]): XZ => [p[0]!, p[2]!];

/** The longest each job timer has shown, so its countdown has a total to warn against. */
const timerTotals = new Map<string, number>();

interface Goal {
  key: string;
  eyebrow?: string;
  title: string;
  target?: XZ;
  deadline?: { remaining: number; total: number };
  hint?: string;
  rush?: string;
}

/** The one thing to do now, most urgent first: a race, a parcel in hand, the live job, a bounty, the next job, then the booth. */
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
  const raid = frontViews(ctx).find((front) => front.status === "raid");
  if (raid !== undefined) {
    return { key: `raid:${raid.slot}`, eyebrow: "Carmine raid", title: `Defend ${raid.label}`, target: raid.position, deadline: { remaining: raid.raidSeconds, total: 60 }, hint: "Drop every raider before the clock runs out, or they wreck it and empty the safe." };
  }
  const atBooth = Math.hypot(at[0] - DISPATCH[0], at[1] - DISPATCH[1]) < 9;
  const world = cityOf(ctx);
  const live = world.missionView();
  const next = world.next();
  if (live !== null) {
    const key = `job:${live.missionId}:${live.objectiveId}`;
    const total = live.remaining === null ? 0 : Math.max(timerTotals.get(key) ?? 0, live.remaining);
    if (live.remaining !== null) timerTotals.set(key, total);
    const step = live.steps > 1 ? ` · step ${live.step} of ${live.steps}` : "";
    return { key, eyebrow: `${live.title}${step}`, title: live.count > 1 ? `${live.label} · ${live.counted}/${live.count}` : live.label, target: next?.target ?? undefined, deadline: live.remaining === null ? undefined : { remaining: live.remaining, total } };
  }
  const bounty = bountyStore.read(ctx);
  const spot = BOUNTY_SPOTS.find((s) => s.id === bounty?.spotId);
  if (bounty?.targetId != null && spot !== undefined && !atBooth) {
    return { key: `bounty:${spot.id}`, eyebrow: `Bounty · $${bountyPayout(bounty.completed)}`, title: `Take down the mark at ${spot.label}`, target: xz(spot.position) };
  }
  if (next !== null && !atBooth) {
    return { key: `next:${next.jobId}`, eyebrow: "Next job", title: next.text, target: next.target ?? undefined, hint: "Talk to them in person, or open the phone." };
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
  if (id.startsWith("talk:")) return `Talk to ${city.people?.[id.slice(5)]?.name ?? "them"}`;
  if (id.startsWith("job:")) return `Start ${city.jobs?.[id.slice(4)]?.title ?? "the job"}`;
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
    prompt: active?.prompt.invoke == null ? null : { id: active.id, label: systemPromptLabel(ctx, active.id), name: active.prompt.invoke.name, input: active.prompt.invoke.input },
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
        hint={view.hint}
        progressKey={`${view.key}:${best.current.distance}`}
        prompt={prompt === null ? undefined : { action: "interact", label: prompt.label ?? promptLabel(prompt.id), onActivate: () => commands.run(prompt.name, prompt.input) }}
      />
      {view.rush === undefined ? null : <KitButton size="sm" onClick={() => commands.run("courier.accept", { service: "rush" })}>{view.rush}</KitButton>}
    </div>
  );
}
