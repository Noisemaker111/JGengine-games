import { Fragment, type ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { KitButton, KitPanel } from "@jgengine/react/uiKitRoot";

import { buildableDef } from "../../objects/catalog";
import { session } from "../../session";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";
import { coasterCircuit, ridePrice, rideView, trackPieces } from "../../rides";
import { GuestPanel } from "./GuestPanel";

const PHASE_LABEL: Record<string, string> = { idle: "Ready", loading: "Boarding", riding: "On the ride", unloading: "Unloading", broken: "Broken down" };

/** Label/value lines, shared by the inspector, the guest window and the park books. */
export function Rows({ rows }: { rows: readonly (readonly [ReactNode, ReactNode])[] }) {
  return <dl className="bw-rows">{rows.map(([label, value], i) => <Fragment key={i}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>;
}

/** The close mark every inspected window carries. */
export function CloseButton({ label }: { label: string }) {
  const { commands } = useGame();
  return <KitButton variant="ghost" size="sm" cue="close" aria-label={label} onClick={() => commands.run("build.clear", {})}>✕</KitButton>;
}

export function Inspector() {
  const { commands } = useGame();
  const selectedId = useGameStore(() => session.selectedObject);
  // Guests are selected through the engine's shared entity selection, which the shell draws the ring from.
  const selectedGuest = useGameStore((ctx) => { const [id] = ctx.scene.entity.selection.list(); return id !== undefined && session.guests.has(id) ? id : null; });
  const tracks = useGameStore(() => trackPieces());
  const circuit = coasterCircuit();
  const live = useGameStore(() => {
    const o = selectedId === null ? undefined : session.placed.get(selectedId);
    const view = selectedId === null ? null : rideView(selectedId);
    return o === undefined ? "" : [o.stock, o.soldTotal, ...(view === null ? [] : [view.phase, view.phaseSeconds, view.riders, view.queue.size, view.queue.wait.seconds, view.wear, view.breakdowns, view.cycles, ridePrice(o.catalogId)])].join("|");
  });
  if (selectedGuest !== null) return <GuestPanel id={selectedGuest} />;
  const placed = selectedId === null ? undefined : session.placed.get(selectedId);
  if (selectedId === null || placed === undefined) return null;
  const def = buildableDef(placed.catalogId);
  const [stock, sold, phase, phaseSeconds, riders, queued, waitSeconds, wear, breakdowns, cycles, price] = live.split("|");
  const broken = phase === "broken";
  return (
    <KitPanel variant="card" aria-label={`${def.label} details`} eyebrow={`${def.icon} ${def.category}`} title={def.label} aside={<CloseButton label="Close inspector" />}
      footer={<>
        {def.ride !== undefined ? <KitButton size="sm" variant="primary" onClick={() => commands.run("ride.service", { id: selectedId })}>Service · ${def.ride.breakdown.serviceCost}</KitButton> : null}
        <KitButton size="sm" tone="bad" onClick={() => commands.run("build.demolish", { id: selectedId })}>Demolish · +${Math.round(def.cost * 0.5)}</KitButton>
      </>}>
      <p className="bw-blurb">{def.blurb}</p>
      {def.ride !== undefined ? <>
        <div className="bw-line"><b data-bad={broken ? "" : undefined}>{broken ? `Offline · ${Math.ceil(Number(phaseSeconds))}s to repair` : `${PHASE_LABEL[phase ?? "idle"]} · ${riders} aboard`}</b>
          <span className="bw-stepper"><KitButton size="sm" aria-label="Lower ride ticket" onClick={() => commands.run("ride.price", { id: def.id, delta: -1 })}>−</KitButton><b>${price}</b>
            <KitButton size="sm" aria-label="Raise ride ticket" onClick={() => commands.run("ride.price", { id: def.id, delta: 1 })}>+</KitButton></span></div>
      </> : null}
      <Rows rows={[
        ["Appeal", def.appeal.toFixed(1)], ["Upkeep", `$${def.upkeep} / day`],
        ...(def.ride !== undefined ? [["In line", `${queued} · ${Math.round(Number(waitSeconds))}s wait`], ["Since service", `${wear} runs`], ["Breakdowns", `${breakdowns} in ${cycles} runs`], ["Intensity", rideThrill(def.id, circuit).toFixed(1)],
          ...["guest_a", "guest_c", "guest_d"].map((kind) => [`${guestRidePreference(kind).label} fit`, `${Math.round(rideFit(kind, def.id, circuit) * 100)}%`])] as [string, string][] : []),
        ...(def.id === "ride_coaster" ? [["Circuit", circuit.closed ? `${circuit.pieces} pieces · ${Math.round(circuit.length)} m · ${circuit.lapSeconds.toFixed(1)} s` : `${tracks} laid · loop open`],
          ["Excitement", `${circuit.excitement.toFixed(1)} · nausea ${circuit.nausea.toFixed(1)}`], ["Drop · pace", `${circuit.drop.toFixed(1)} m · ${circuit.averageSpeed.toFixed(1)} m/s`]] as [string, string][] : []),
        ...(def.stall !== undefined ? [["Stock", `${stock}/${def.stall.stock}`], ["Sold", sold]] as [string, string][] : []),
      ]} />
    </KitPanel>
  );
}
