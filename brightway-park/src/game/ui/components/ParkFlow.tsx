import { useRef } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { KitBanner, KitResultScreen } from "@jgengine/react/kitFlow";

import { scenarioDef, scenarioView } from "../../scenarios";
import { session } from "../../session";

/** A result screen is up: the scenario ended, the park went bankrupt, or the blue ribbon landed. */
export const resultOpen = () => session.started && (session.gameOver || (session.won && !session.winDismissed) || (session.scenario !== null && session.scenario.result !== null));
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

/** The park's moments: a banner when the gates open or close, and the end-of-run screens. */
export function ParkFlow() {
  const { commands } = useGame();
  useGameStore(() => [session.started, session.gameOver, session.won, session.winDismissed, session.open, session.day, session.scenario?.result ?? ""].join("|"));
  const scenario = scenarioView(), def = session.scenario === null ? null : scenarioDef(session.scenario.id);
  const scenarioWon = scenario?.result === "won", reward = def?.mission.rewards?.economy?.cash ?? 0;
  // The night after closing still belongs to that day: the banner must not re-fire at midnight.
  const openDay = useRef(session.day);
  if (session.open) openDay.current = session.day;
  const tally = [{ label: "Park funds", value: money(session.cash) }, { label: "Rating", value: `★ ${Math.round(session.rating)}` }, { label: "Guests in the park", value: session.guests.size }];
  return <>
    <KitBanner cue={session.started && !resultOpen() ?`${session.open}-${openDay.current}` : null} initial title={`Day ${openDay.current} · Gates ${session.open ? "open" : "closed"}`}
      subtitle={!session.open ? `Takings ${money(session.revenueToday)}` : scenario?.title ?? (session.day > 1 ? `Yesterday ${money(session.revenueYesterday - session.upkeepYesterday)} net` : "Welcome to Brightway")} />
    <KitResultScreen open={session.started && scenario?.result != null} tone={scenarioWon ? "good" : "bad"} eyebrow={scenario?.title} title={scenarioWon ? "Scenario won!" : "Scenario failed"}
      summary={scenarioWon ? `You hit the target with the park still standing${reward > 0 ? `: ${money(reward)} is in the till` : ""}.` : scenario?.reason ?? "The target slipped away."}
      stats={[{ label: "Takings", value: money(scenario?.facts.revenue ?? 0) }, { label: "Visitors", value: scenario?.facts.visitors ?? 0 }, ...tally.slice(0, 2)]}
      actions={[{ id: "replay", label: "Play it again", primary: true }, { id: "free", label: "Keep this park" }]} onAction={(id) => commands.run(id === "replay" ? "park.replay" : "park.freeplay", {})} />
    <KitResultScreen open={session.started && session.gameOver} tone="bad" eyebrow="The lights go down" title="Park bankrupt"
      summary={`Three days in debt closed the gates after ${session.day - 1} days. Next time watch the nightly bills, the loan and give guests food and drink.`}
      stats={tally.slice(0, 2)} actions={[{ id: "new", label: "Open a new park" }]} onAction={() => commands.run("park.new", {})} />
    <KitResultScreen open={session.started && session.won && !session.winDismissed && !session.gameOver} tone="good" eyebrow="Bright days ahead" title="Blue ribbon!"
      summary="Three rides, a profitable day and a happy, tidy park: Brightway is a seaside favourite. Your park is saved." stats={tally}
      actions={[{ id: "continue", label: "Keep building" }]} onAction={() => commands.run("park.continue", {})} />
  </>;
}
