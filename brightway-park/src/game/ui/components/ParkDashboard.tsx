import { useGame, useGameStore } from "@jgengine/react/hooks";
import { KitObjective } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";
import type { KitTone } from "@jgengine/react/uiKit";

import { guestCap } from "../../catalog";
import { loanSummary } from "../../loan";
import { rideBoard } from "../../rides";
import { scenarioDef, scenarioView } from "../../scenarios";
import { session } from "../../session";
import { currentMetrics } from "../../sim/economy";
import { nextMilestone, nextStepText } from "../nextStep";
import { Rows } from "./Inspector";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const tone = (value: number, good: number, warn: number): KitTone => (value >= good ? "good" : value >= warn ? "warn" : "bad");
const watch = () => [session.cash, session.rating, session.guests.size, session.happinessAvg, session.litter, session.ticketPrice, session.day, session.open, session.revenueToday, session.revenueYesterday, session.upkeepYesterday, session.placed.size, session.loan?.outstanding ?? 0, session.scenario?.result ?? "", session.scenarioVisitors, session.scenarioRevenue, session.won].join("|");

/** The park at a glance: funds, crowd and rating up front; mood and tidiness as meters that warn. */
export function ParkStatus() {
  useGameStore(watch);
  const clock = useGameStore((ctx) => { const c = ctx.time.calendar(); return `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`; });
  const rides = rideBoard(), clean = 100 - session.litter;
  return (
    <KitPanel className="bw-status" eyebrow={`Day ${session.day} · ${clock} · ${session.open ? "Gates open" : "After hours"}`} title={money(session.cash)} tone={session.cash < 0 ? "bad" : undefined} aside={`★ ${Math.round(session.rating)}`}>
      <div className="bw-line"><span>{session.guests.size} / {guestCap(session.rating)} guests</span>{rides.broken > 0 ? <b data-bad="">{rides.broken} ride down</b> : null}</div>
      <KitMeter size="sm" label="Mood" value={session.happinessAvg} max={100} readout={`${Math.round(session.happinessAvg)}%`} tone={tone(session.happinessAvg, 50, 35)} />
      <KitMeter size="sm" label="Clean" value={clean} max={100} readout={`${Math.round(clean)}%`} tone={tone(clean, 60, 40)} />
    </KitPanel>
  );
}

/** The one card that says what to do next: the first unmet goal, the checklist, and a hint when stuck. */
export function ParkGoal() {
  useGameStore(watch);
  const m = currentMetrics(), net = session.revenueYesterday - session.upkeepYesterday, scenario = scenarioView();
  if (scenario !== null && session.scenario !== null) {
    const when = scenarioDef(session.scenario.id)?.mission.objectives[0]?.branches?.find((b) => b.to === "done")?.when;
    const target = Array.isArray(when) ? when[0] : when;
    const goal = target?.atLeast ?? 0, fact = target?.fact ?? "revenue";
    const have = fact === "revenue" ? money(scenario.facts.revenue) : fact === "visitors" ? `${scenario.facts.visitors}` : `★ ${Math.round(scenario.facts.rating)}`;
    return <KitObjective className="bw-goal" eyebrow={`Scenario · ${scenario.title}`} title={scenario.goal}
      steps={[{ id: "target", label: `${have} of ${fact === "revenue" ? money(goal) : goal}`, done: scenario.result === "won" }, { id: "till", label: `Till ${money(scenario.facts.cash)}`, done: scenario.facts.cash > 0 }]}
      deadline={scenario.remaining !== null && scenario.duration !== null ? { remaining: scenario.remaining, total: scenario.duration } : undefined}
      hint="Cheaper tickets and more rides pull a bigger crowd." progressKey={`${Math.round(scenario.facts.visitors / 5)}`} />;
  }
  const steps = [
    { id: "rides", label: `Three rides · ${Math.min(m.rides, 3)}/3`, done: m.rides >= 3, next: "Build a third ride" },
    { id: "rating", label: `Rating · ${Math.round(session.rating)}/220`, done: session.rating >= 220, next: "Raise the rating to 220" },
    { id: "profit", label: session.day > 1 ? `Last day ${net < 0 ? "lost" : "made"} ${money(Math.abs(net))}` : "Finish a profitable day", done: session.day > 1 && net >= 0, next: "Finish a day in profit" },
    { id: "happy", label: "Happy 50%+ · clean 60%+", done: session.happinessAvg >= 50 && session.litter <= 40, next: "Cheer guests up and tidy the paths" },
  ];
  const next = steps.find((s) => !s.done);
  const hint = session.litter > 25 ? "Litter is piling up: hire a janitor from Staff." : m.stalls < 3 ? "Hungry guests turn grumpy: add food and drink from Shops." : m.rides < 3 ? "Open Rides in the build palette and place one on an empty plot." : nextStepText(session.rating) ?? "Mix gentle rides and thrills: families and thrill seekers want different days out.";
  return <KitObjective className="bw-goal" eyebrow={session.won ? "Blue ribbon park" : "Your first blue ribbon"} title={session.won ? "Keep the good days rolling" : next?.next ?? "Hold it until midnight"}
    steps={session.won ? undefined : steps} hint={hint} progressKey={steps.filter((s) => s.done).length} />;
}

/** The ledger, the gate price, the loan and the next unlock: open when the player asks for them. */
export function ParkBooks({ onClose }: { onClose: () => void }) {
  const { commands } = useGame();
  useGameStore(watch);
  const m = currentMetrics(), next = nextMilestone(session.rating), rides = rideBoard();
  const loan = session.loan === null ? null : loanSummary(session.loan);
  return (
    <KitPanel variant="card" eyebrow="The office" title="Park books" aside={<KitButton variant="ghost" size="sm" cue="close" aria-label="Close park books" onClick={onClose}>✕</KitButton>}
      footer={loan === null
        ? <KitButton size="sm" onClick={() => commands.run("park.loan", {})}>Take a $6,000 loan · 3%/day</KitButton>
        : <KitButton size="sm" onClick={() => commands.run("park.repay", {})}>Pay {money(loan.payment)} off the loan</KitButton>}>
      <div className="bw-line"><span>Entry ticket</span><span className="bw-stepper">
        <KitButton size="sm" aria-label="Lower ticket price" onClick={() => commands.run("park.ticket", { delta: -1 })}>−</KitButton><b>${session.ticketPrice}</b>
        <KitButton size="sm" aria-label="Raise ticket price" onClick={() => commands.run("park.ticket", { delta: 1 })}>+</KitButton></span></div>
      <Rows rows={[["Today’s sales", money(session.revenueToday)], ["Rides & shops upkeep", `${money(m.facilitiesUpkeep)} / day`], ["Staff wages", `${money(m.wages)} / day`],
        ...(rides.rides > 0 ? [["Ride lines", `${rides.queued} waiting`] as [string, string]] : []), ...(loan !== null ? [["Loan owed", `${money(loan.owed)} · ${loan.daysLeft} days`] as [string, string]] : [])]} />
      {next !== null ? <KitMeter size="sm" label={`Next: ${next.label}`} value={session.rating} max={next.rating} readout={`★ ${Math.round(session.rating)} / ${next.rating}`} /> : null}
    </KitPanel>
  );
}
