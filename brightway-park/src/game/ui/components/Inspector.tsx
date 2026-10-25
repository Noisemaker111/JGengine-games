import { Fragment, type ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { session } from "../../session";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";
import { coasterCircuit, rideView, trackPieces } from "../../rides";
import { parkObject, repairAction, ridePrice, stockOf } from "../../park";
import { refundOf } from "../../parkScene";
import { usePark } from "../usePark";
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

/**
 * One structure, as the world holds it: its facts (broken, stock sold), the crew order on it and
 * what each action would cost, with buttons that run `brightway.act` and `brightway.remove`.
 */
export function Inspector() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const w = usePark();
  const selectedId = useGameStore(() => session.selectedObject);
  // Guests are selected through the engine's shared entity selection, which the shell draws the ring from.
  const selectedGuest = useGameStore((c) => { const [id] = c.scene.entity.selection.list(); return id !== undefined && session.guests.has(id) ? id : null; });
  // The ride sim's own live state: phase, line and wear.
  const ride = useGameStore(() => {
    const view = selectedId === null ? null : rideView(selectedId);
    return view === null ? "" : [view.phase, view.riders, view.queue.size, view.queue.wait.seconds, view.wear, view.breakdowns, view.cycles].join("|");
  });
  if (selectedGuest !== null) return <GuestPanel id={selectedGuest} />;
  const obj = parkObject(ctx, selectedId);
  if (obj === undefined) return null;
  const def = obj.def;
  const circuit = coasterCircuit(ctx), tracks = trackPieces(ctx);
  const act = (action: string) => commands.run("brightway.act", { action, target: obj.id });
  const [phase, riders, queued, waitSeconds, wear, breakdowns, cycles] = ride === "" ? [] : ride.split("|");
  const broken = w.fact(`${obj.id}.broken`) === true;
  const order = w.orders("crew").find((entry) => entry.target === obj.id) ?? null;
  const repair = def.ride === undefined ? null : repairAction(w, obj.kind);
  const repairCost = repair === null ? 0 : -(w.costOf(repair, obj.id)["park.cash"] ?? 0);
  const repairRefusal = repair === null ? null : w.canAct(repair, obj.id);
  const crew = order === null ? "waiting for the crew" : order.active ? `crew on it · ${Math.ceil(order.remaining)}s` : "crew queued";
  return (
    <KitPanel variant="card" aria-label={`${def.label} details`} eyebrow={`${def.icon} ${def.category}`} title={def.label} aside={<CloseButton label="Close inspector" />}
      footer={<>
        {def.ride === undefined ? null : broken && order === null
          ? <KitButton size="sm" variant="primary" disabled={repairRefusal !== null} title={repairRefusal?.message} onClick={() => act(repair!)}>Send the crew · ${repairCost}</KitButton>
          : <KitButton size="sm" variant="primary" disabled={broken} onClick={() => act(`service_${obj.kind}`)}>Service · ${def.ride.breakdown.serviceCost}</KitButton>}
        <KitButton size="sm" tone="bad" onClick={() => commands.run("brightway.remove", { id: obj.id })}>Demolish · +${refundOf(obj.kind)}</KitButton>
      </>}>
      <p className="bw-blurb">{def.blurb}</p>
      {def.ride !== undefined ? <>
        <div className="bw-line"><b data-bad={broken ? "" : undefined}>{broken ? `Offline · ${crew}` : `${PHASE_LABEL[phase ?? "idle"]} · ${riders ?? 0} aboard`}</b>
          <span className="bw-stepper"><KitButton size="sm" aria-label="Lower ride ticket" onClick={() => act(`price_down_${obj.kind}`)}>−</KitButton><b>${ridePrice(w, obj.kind)}</b>
            <KitButton size="sm" aria-label="Raise ride ticket" onClick={() => act(`price_up_${obj.kind}`)}>+</KitButton></span></div>
        {order !== null ? <KitMeter size="sm" label="Repair" value={order.progress} max={1} readout={`${Math.round(order.progress * 100)}%`} tone="warn" /> : null}
      </> : null}
      <Rows rows={[
        ["Appeal", broken ? "0 while down" : def.appeal.toFixed(1)], ["Upkeep", `$${def.upkeep} / day`],
        ...(def.ride !== undefined ? [["In line", `${queued ?? 0} · ${Math.round(Number(waitSeconds ?? 0))}s wait`], ["Since service", `${wear ?? 0} runs`], ["Breakdowns", `${breakdowns ?? 0} in ${cycles ?? 0} runs`], ["Intensity", rideThrill(def.id, circuit).toFixed(1)],
          ...["guest_a", "guest_c", "guest_d"].map((kind) => [`${guestRidePreference(kind).label} fit`, `${Math.round(rideFit(kind, def.id, circuit) * 100)}%`])] as [string, string][] : []),
        ...(def.id === "ride_coaster" ? [["Circuit", circuit.closed ? `${circuit.pieces} pieces · ${Math.round(circuit.length)} m · ${circuit.lapSeconds.toFixed(1)} s` : `${tracks} laid · loop open`],
          ["Excitement", `${circuit.excitement.toFixed(1)} · nausea ${circuit.nausea.toFixed(1)}`], ["Drop · pace", `${circuit.drop.toFixed(1)} m · ${circuit.averageSpeed.toFixed(1)} m/s`]] as [string, string][] : []),
        ...(def.stall !== undefined ? [["Stock", `${stockOf(w, obj)}/${def.stall.stock}`], ["Sold", `${w.num(`${obj.id}.sold_total`)}`]] as [string, string][] : []),
      ]} />
    </KitPanel>
  );
}
