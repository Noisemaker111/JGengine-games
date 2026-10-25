import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

import { useGameContext } from "@jgengine/react/provider";

import { parkObject } from "../../park";
import { session } from "../../session";
import { liveAgent } from "../../agents";
import { guestRidePreference } from "../../sim/rideExperience";
import { Row } from "./Row";

/** What a guest is doing, read from its own phase/target - the "thought" the window shows. */
function activity(name: string | null, phase: string): string {
  if (phase === "leaving") return "Leaving the park";
  if (phase === "riding") return name === null ? "On a ride" : `Riding the ${name}`;
  if (phase === "queued") return name === null ? "In line" : `Waiting in line for the ${name}`;
  if (phase === "busy") return name === null ? "Enjoying the midway" : `On the ${name}`;
  if (name !== null) return `Heading for the ${name}`;
  return "Looking for something to do";
}

/** The guest window: the mood the shared agent loop holds, its needs, and what it is doing. */
export function GuestPanel({ id }: { id: string }) {
  const { commands } = useGame();
  const ctx = useGameContext();
  const view = useGameStore(() => {
    const guest = session.guests.get(id);
    if (guest === undefined) return null;
    const agent = liveAgent(id);
    const mood = agent?.mood();
    const fullness = (need: string) => Math.round((agent?.needs.fraction(need) ?? 0) * 100);
    return [
      guest.kind,
      mood?.label ?? "",
      Math.round(mood?.score ?? 0),
      Math.round(guest.money),
      fullness("hunger"),
      fullness("thirst"),
      guest.visits,
      guest.phase,
      guest.targetId ?? "",
    ].join("|");
  });
  if (view === null) return null;
  const [kind, moodLabel, moodScore, money, fullness, thirst, visits, phase, targetId] = view.split("|");
  const preference = guestRidePreference(kind!);
  return (
    <HudSurface as="section" aria-label="Guest details" elevation="overlay">
      <div className="mb-2 flex items-center gap-2">
        <HudButton variant="ghost" size="icon" className="park-inspector-close" aria-label="Close guest window" cue="close" onClick={()=>commands.run("build.clear", {})}>x</HudButton>
        <span className="text-2xl">🎟️</span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-slate-100">{preference.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Guest - {kind}</span>
        </div>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-300">{activity(parkObject(ctx, targetId === "" ? null : targetId!)?.def.label ?? null, phase!)}</p>
      <div className="flex flex-col gap-1">
        <Row label="Mood" value={`${moodLabel} ${moodScore}%`} />
        <Row label="Money" value={`$${Math.round(Number(money))}`} />
        <Row label="Hungry" value={`${100 - Number(fullness)}%`} />
        <Row label="Thirsty" value={`${100 - Number(thirst)}%`} />
        <Row label="Stops made" value={`${visits}`} />
      </div>
    </HudSurface>
  );
}
