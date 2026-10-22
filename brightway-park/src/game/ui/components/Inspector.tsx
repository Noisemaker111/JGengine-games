import { useGame, useGameStore } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";

import { buildableDef } from "../../objects/catalog";
import { session } from "../../session";
import { coasterThrill } from "../../sim/rating";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-mono font-bold text-slate-100">{value}</span>
    </div>
  );
}

export function Inspector() {
  const { commands } = useGame();
  const selectedId = useGameStore(() => session.selectedObject);
  const tracks = useGameStore(() => {
    let n = 0;
    for (const o of session.placed.values()) if (o.catalogId === "track_piece") n += 1;
    return n;
  });
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

  if (selectedId === null) return null;
  const placed = session.placed.get(selectedId);
  if (placed === undefined) return null;
  const def = buildableDef(placed.catalogId);
  const appeal = def.id === "ride_coaster" ? def.appeal + coasterThrill(tracks) : def.appeal;
  const refund = Math.round(def.cost * 0.5);

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
