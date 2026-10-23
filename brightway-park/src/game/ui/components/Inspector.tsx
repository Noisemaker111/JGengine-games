import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

import { buildableDef } from "../../objects/catalog";
import { session } from "../../session";
import { coasterThrill } from "../../sim/rating";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";
import { ridePrice, rideView, trackPieces } from "../../sim/rides";
import { GuestPanel } from "./GuestPanel";
import { Row } from "./Row";

const PHASE_LABEL: Record<string, string> = {
  idle: "Ready",
  loading: "Boarding",
  riding: "On the ride",
  unloading: "Unloading",
  broken: "Broken down",
};

export function Inspector() {
  const { commands } = useGame();
  const selectedId = useGameStore(() => session.selectedObject);
  // Guests are selected through the engine's shared entity selection, which the shell draws the ring from.
  const selectedGuest = useGameStore((ctx) => {
    const [id] = ctx.scene.entity.selection.list();
    return id !== undefined && session.guests.has(id) ? id : null;
  });
  const tracks = useGameStore(() => trackPieces());
  const stock = useGameStore(() => {
    if (selectedId === null) return null;
    const o = session.placed.get(selectedId);
    return o === undefined ? null : o.stock;
  });
  const sold = useGameStore(() => {
    if (selectedId === null) return 0;
    const o = session.placed.get(selectedId);
    return o === undefined ? 0 : o.soldTotal;
  });
  // The ride sim's own live state: phase, line and wear, read fresh whenever the park revises.
  const ride = useGameStore(() => {
    if (selectedId === null) return null;
    const view = rideView(selectedId);
    if (view === null) return null;
    return [view.phase, view.phaseSeconds, view.riders, view.queue.size, view.queue.wait.seconds, view.wear, view.breakdowns, view.cycles, ridePrice(session.placed.get(selectedId)?.catalogId ?? "")].join("|");
  });

  if (selectedGuest !== null) return <GuestPanel id={selectedGuest} />;
  if (selectedId === null) return null;
  const placed = session.placed.get(selectedId);
  if (placed === undefined) return null;
  const def = buildableDef(placed.catalogId);
  const appeal = def.id === "ride_coaster" ? def.appeal + coasterThrill(tracks) : def.appeal;
  const refund = Math.round(def.cost * 0.5);
  const [phase, phaseSeconds, riders, queued, waitSeconds, wear, breakdowns, cycles, price] = ride === null ? [] : ride.split("|");
  const broken = phase === "broken";

  return (
    <HudSurface as="section" aria-label={`${def.label} details`} elevation="overlay">
      <div className="mb-2 flex items-center gap-2">
        <HudButton variant="ghost" size="icon" className="park-inspector-close" aria-label="Close inspector" cue="close" onClick={()=>commands.run("build.clear", {})}>×</HudButton>
        <span className="text-2xl">{def.icon}</span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-slate-100">{def.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{def.category}</span>
        </div>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-300">{def.blurb}</p>
      <div className="flex flex-col gap-1">
        <Row label="Appeal" value={appeal.toFixed(1)} />
        <Row label="Upkeep / day" value={`$${def.upkeep}`} />
        {def.ride !== undefined ? <>
          <Row label="Intensity" value={rideThrill(def.id, tracks).toFixed(1)} />
          {["guest_a", "guest_c", "guest_d"].map(kind => <Row key={kind} label={guestRidePreference(kind).label + " fit"} value={`${Math.round(rideFit(kind, def.id, tracks) * 100)}%`} />)}
          <div className={broken ? "park-ride-state broken" : "park-ride-state"}>
            <span>{broken ? "OFFLINE" : PHASE_LABEL[phase ?? "idle"]}</span>
            <strong>{broken ? `${Math.ceil(Number(phaseSeconds))}s to repair` : `${riders} aboard`}</strong>
          </div>
          <Row label="In line" value={`${queued} · ${Math.round(Number(waitSeconds))}s wait`} />
          <Row label="Cycles since service" value={`${wear}`} />
          <Row label="Breakdowns" value={`${breakdowns} (${cycles} runs)`} />
          <div className="park-ride-price"><span>Ride ticket</span><div>
            <HudButton size="icon" aria-label="Lower ride ticket" onClick={()=>commands.run("ride.price",{id:def.id,delta:-1})}>−</HudButton>
            <strong>${price}</strong>
            <HudButton size="icon" aria-label="Raise ride ticket" onClick={()=>commands.run("ride.price",{id:def.id,delta:1})}>+</HudButton>
          </div></div>
          <HudButton variant="primary" size="sm" block className="mt-2" onClick={()=>commands.run("ride.service",{id:selectedId})}>Service ride · ${def.ride.breakdown.serviceCost}</HudButton>
        </> : null}
        {def.id === "ride_coaster" ? <Row label="Track pieces" value={`${tracks}`} /> : null}
        {def.stall !== undefined && stock !== null ? (
          <Row label="Stock" value={`${stock}/${def.stall.stock}`} />
        ) : null}
        {def.stall !== undefined ? <Row label="Sold (total)" value={`${sold}`} /> : null}
      </div>
      <HudButton
        variant="danger"
        size="sm"
        block
        className="mt-3"
        onClick={() => commands.run("build.demolish", { id: selectedId })}
      >
        Demolish · refund ${refund}
      </HudButton>
    </HudSurface>
  );
}
