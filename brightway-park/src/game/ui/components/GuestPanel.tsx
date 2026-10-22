import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

import { buildableDef } from "../../objects/catalog";
import { session } from "../../session";
import { guestRidePreference } from "../../sim/rideExperience";
import { Row } from "./Row";

/** What a guest is doing, read from its own phase/target — the "thought" the window shows. */
function activity(targetId: string | null, phase: string): string {
  const obj = targetId === null ? undefined : session.placed.get(targetId);
  const name = obj === undefined ? null : buildableDef(obj.catalogId).label;
  if (phase === "leaving") return "Leaving the park";
  if (phase === "busy") return name === null ? "Enjoying the midway" : `On the ${name}`;
  if (name !== null) return `Heading for the ${name}`;
  return "Looking for something to do";
}

/** The guest window: what one visitor thinks, needs and carries, opened by clicking them in the park. */
export function GuestPanel({ id }: { id: string }) {
  const { commands } = useGame();
  const view = useGameStore(() => {
    const guest = session.guests.get(id);
    if (guest === undefined) return null;
    return [guest.kind, guest.happy, guest.money, guest.hunger, guest.thirst, guest.visits, guest.phase, guest.targetId ?? ""].join("|");
  });
  if (view === null) return null;
  const [kind, happy, money, hunger, thirst, visits, phase, targetId] = view.split("|");
  const preference = guestRidePreference(kind!);
  return (
    <HudSurface as="section" aria-label="Guest details" elevation="overlay">
      <div className="mb-2 flex items-center gap-2">
        <HudButton variant="ghost" size="icon" className="park-inspector-close" aria-label="Close guest window" cue="close" onClick={()=>commands.run("build.clear", {})}>×</HudButton>
        <span className="text-2xl">🙂</span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-slate-100">{preference.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Guest · {kind}</span>
        </div>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-300">{activity(targetId === "" ? null : targetId!, phase!)}</p>
      <div className="flex flex-col gap-1">
        <Row label="Happiness" value={`${Math.round(Number(happy))}%`} />
        <Row label="Money" value={`$${Math.round(Number(money))}`} />
        <Row label="Hunger" value={`${Math.round(Number(hunger))}%`} />
        <Row label="Thirst" value={`${Math.round(Number(thirst))}%`} />
        <Row label="Stops made" value={`${visits}`} />
      </div>
    </HudSurface>
  );
}
