import { useEffect, useState } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { KitActionPrompt, KitButton, KitPanel } from "@jgengine/react/uiKitRoot";

import { BUILDABLES, CATEGORY_ICON, CATEGORY_LABEL, CATEGORY_ORDER, type BuildCategory } from "../../objects/catalog";
import { MILESTONES } from "../../milestones";
import { session } from "../../session";
import { placementHintStore } from "../../build/placementHint";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";
import { coasterCircuit } from "../../rides";
import { usePark } from "../usePark";

/** The catalog as a strip of fair tickets: pick a category, pick a ticket, place it on the park. */
export function BuildBar({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<BuildCategory>("ride");
  const { commands } = useGame();
  const w = usePark();
  const ctx = useGameContext();
  const cash = w.num("park.cash");
  const selected = useGameStore(() => session.selectedTool);
  const refusal = useStore(placementHintStore);
  useEffect(() => { if (selected && BUILDABLES[selected]) setCategory(BUILDABLES[selected]!.category); }, [selected]);
  const blueprint = selected === null ? undefined : BUILDABLES[selected];
  const circuit = coasterCircuit(ctx);
  const detail = blueprint === undefined ? "Pick a ticket, then a green spot on the park. Click anything built to inspect it."
    : refusal ?? (blueprint.ride !== undefined ? `$${blueprint.upkeep} a day · Intensity ${rideThrill(blueprint.id, circuit).toFixed(1)} · ${["guest_a", "guest_c", "guest_d"].map((k) => `${guestRidePreference(k).label} ${Math.round(rideFit(k, blueprint.id, circuit) * 100)}%`).join(" · ")}`
      : blueprint.category === "track" ? (circuit.closed ? `${Math.round(circuit.length)} m lap · excitement ${circuit.excitement.toFixed(1)}` : "Lay track until the loop comes back to the station")
      : `${blueprint.label} · $${blueprint.upkeep} a day upkeep`);
  return (
    <div className="bw-build">
      {blueprint !== undefined ? <KitActionPrompt action="clearTool" label={`Done placing ${blueprint.label}`} tone="neutral" onActivate={() => commands.run("clearTool", {})} /> : null}
      <KitPanel as="nav" aria-label="Build palette" footer={<span className="bw-hint" data-bad={refusal !== null && blueprint !== undefined ? "" : undefined}>{detail}</span>}>
        <div className="bw-tabs" role="toolbar" aria-label="Blueprint categories">
          {CATEGORY_ORDER.map((c) => <KitButton key={c} size="sm" variant="ghost" pressed={category === c} icon={CATEGORY_ICON[c]} aria-label={CATEGORY_LABEL[c]} onClick={() => setCategory(c)}><span className="bw-wide">{CATEGORY_LABEL[c]}</span></KitButton>)}
          <KitButton size="sm" variant="ghost" cue="close" aria-label="Close build palette" onClick={onClose}>✕</KitButton>
        </div>
        <div className="bw-tickets" role="group" aria-label="Blueprints">
          {Object.values(BUILDABLES).filter((d) => d.category === category).map((def) => {
            // Locked is the world's word: the kind's `when` reads the park's best rating.
            const locked = w.canPlace(def.id)?.reason === "locked";
            return <KitButton key={def.id} disabled={locked} pressed={selected === def.id} variant={selected === def.id ? "primary" : "secondary"} icon={locked ? "🔒" : def.icon} title={def.blurb} onClick={() => commands.run("build.select", { id: def.id })}
              glyph={locked ? `★${MILESTONES.find((x) => x.unlock === def.requires)?.rating ?? "?"}` : <span data-bad={cash < def.cost ? "" : undefined}>${def.cost}</span>}>{def.label}</KitButton>;
          })}
        </div>
      </KitPanel>
    </div>
  );
}
