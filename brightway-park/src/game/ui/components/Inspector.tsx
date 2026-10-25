import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useGameContext } from "@jgengine/react/provider";

import { session } from "../../session";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";
import { coasterCircuit, rideView, trackPieces } from "../../rides";
import { repairAction, ridePrice, stockOf, parkObject } from "../../park";
import { refundOf } from "../../parkScene";
import { usePark } from "../usePark";
import { GuestPanel } from "./GuestPanel";
import { Row } from "./Row";

const PHASE_LABEL: Record<string, string> = {
  idle: "Ready",
  loading: "Boarding",
  riding: "On the ride",
  unloading: "Unloading",
  broken: "Broken down",
};

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
  const selectedGuest = useGameStore((c) => {
    const [id] = c.scene.entity.selection.list();
    return id !== undefined && session.guests.has(id) ? id : null;
  });
  // The ride sim's own live state: phase, line and wear.
  const ride = useGameStore(() => {
    if (selectedId === null) return null;
    const view = rideView(selectedId);
    if (view === null) return null;
    return [view.phase, view.riders, view.queue.size, view.queue.wait.seconds, view.wear, view.breakdowns, view.cycles].join("|");
  });

  if (selectedGuest !== null) return <GuestPanel id={selectedGuest} />;
  const obj = parkObject(ctx, selectedId);
  if (obj === undefined || selectedId === null) return null;
  const def = obj.def;
  const circuit = coasterCircuit(ctx);
  const tracks = trackPieces(ctx);
  const act = (action: string) => commands.run("brightway.act", { action, target: obj.id });
  const [phase, riders, queued, waitSeconds, wear, breakdowns, cycles] = ride === null ? [] : ride.split("|");
  const broken = w.fact(`${obj.id}.broken`) === true;
  const order = w.orders("crew").find((entry) => entry.target === obj.id) ?? null;
  const repair = def.ride === undefined ? null : repairAction(w, obj.kind);
  const repairCost = repair === null ? 0 : -(w.costOf(repair, obj.id)["park.cash"] ?? 0);
  const repairRefusal = repair === null ? null : w.canAct(repair, obj.id);
  const price = ridePrice(w, obj.kind);

  return (
    <HudSurface as="section" aria-label={`${def.label} details`} elevation="overlay">
      <div className="mb-2 flex items-center gap-2">
        <HudButton variant="ghost" size="icon" className="park-inspector-close" aria-label="Close inspector" cue="close" onClick={() => commands.run("build.clear", {})}>×</HudButton>
        <span className="text-2xl">{def.icon}</span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-slate-100">{def.label}</span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{def.category}</span>
        </div>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-slate-300">{def.blurb}</p>
      <div className="flex flex-col gap-1">
        <Row label="Appeal" value={broken ? "0 while down" : def.appeal.toFixed(1)} />
        <Row label="Upkeep / day" value={`$${def.upkeep}`} />
        {def.ride !== undefined ? <>
          <Row label="Intensity" value={rideThrill(def.id, circuit).toFixed(1)} />
          {["guest_a", "guest_c", "guest_d"].map((kind) => <Row key={kind} label={guestRidePreference(kind).label + " fit"} value={`${Math.round(rideFit(kind, def.id, circuit) * 100)}%`} />)}
          <div className={broken ? "park-ride-state broken" : "park-ride-state"}>
            <span>{broken ? "OFFLINE" : PHASE_LABEL[phase ?? "idle"]}</span>
            <strong>{broken ? (order === null ? "waiting for the crew" : order.active ? `crew on it · ${Math.ceil(order.remaining)}s` : "crew queued") : `${riders ?? 0} aboard`}</strong>
          </div>
          {order !== null ? <progress className="park-repair" max={1} value={order.progress} aria-label="Repair progress" /> : null}
          {broken && order === null ? (
            <HudButton variant="primary" size="sm" block className="mt-1" disabled={repairRefusal !== null} title={repairRefusal?.message} onClick={() => act(repair!)}>
              Send the crew · ${repairCost}
            </HudButton>
          ) : null}
          <Row label="In line" value={`${queued ?? 0} · ${Math.round(Number(waitSeconds ?? 0))}s wait`} />
          <Row label="Cycles since service" value={`${wear ?? 0}`} />
          <Row label="Breakdowns" value={`${breakdowns ?? 0} (${cycles ?? 0} runs)`} />
          <div className="park-ride-price"><span>Ride ticket</span><div>
            <HudButton size="icon" aria-label="Lower ride ticket" onClick={() => act(`price_down_${obj.kind}`)}>−</HudButton>
            <strong>${price}</strong>
            <HudButton size="icon" aria-label="Raise ride ticket" onClick={() => act(`price_up_${obj.kind}`)}>+</HudButton>
          </div></div>
          <HudButton variant="primary" size="sm" block className="mt-2" disabled={broken} onClick={() => act(`service_${obj.kind}`)}>Service ride · ${def.ride.breakdown.serviceCost}</HudButton>
        </> : null}
        {def.id === "ride_coaster" ? <>
          <Row label="Circuit" value={circuit.closed ? `${circuit.pieces} pieces · ${Math.round(circuit.length)} m` : `${tracks} laid · loop open`} />
          <Row label="Lap time" value={circuit.closed ? `${circuit.lapSeconds.toFixed(1)} s` : "no lap"} />
          <Row label="Corners" value={`${circuit.corners}`} />
          <Row label="Drop" value={`${circuit.drop.toFixed(1)} m`} />
          <Row label="Pace" value={`${circuit.averageSpeed.toFixed(1)} m/s`} />
          <Row label="Excitement" value={circuit.excitement.toFixed(1)} />
          <Row label="Nausea" value={circuit.nausea.toFixed(1)} />
        </> : null}
        {def.stall !== undefined ? <>
          <Row label="Stock" value={`${stockOf(w, obj)}/${def.stall.stock}`} />
          <Row label="Sold (total)" value={`${w.num(`${obj.id}.sold_total`)}`} />
        </> : null}
      </div>
      <HudButton
        variant="danger"
        size="sm"
        block
        className="mt-3"
        onClick={() => commands.run("brightway.remove", { id: obj.id })}
      >
        Demolish · refund ${refundOf(obj.kind)}
      </HudButton>
    </HudSurface>
  );
}
