import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useViewportMetrics } from "@jgengine/react/gameViewport";
import { buildableDef } from "../../objects/catalog";
import { session } from "../../session";
import { coasterThrill } from "../../sim/rating";
import {
  hasPathAccess,
  localComfort,
  operational,
  objectCapacity,
  objectPrice,
  objectServiceSeconds,
  objectUpkeep,
  upgradeCost,
  repairCost,
  stockTarget,
  restockQuote,
  connectedTracks,
} from "../../sim/operations";
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="park-operation-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function Inspector() {
  const { commands } = useGame();
  const viewport = useViewportMetrics().visual;
  const compact = viewport.right - viewport.left <= 650 || viewport.bottom - viewport.top <= 620;
  const selectedId = useGameStore(() => session.selectedObject);
  useGameStore(() => {
    const o = selectedId ? session.placed.get(selectedId) : null;
    return [
      o?.stock,
      o?.soldTotal,
      o?.wear,
      o?.closed,
      o?.upgrade,
      o?.occupants,
      session.cash,
      session.supply,
      session.layoutRevision,
    ].join("|");
  });
  const placed = selectedId ? session.placed.get(selectedId) : null;
  if (!placed) return null;
  const def = buildableDef(placed.catalogId),
    active = operational(placed),
    access = hasPathAccess(placed),
    tracks = connectedTracks(placed);
  const upgrade = upgradeCost(placed),
    repair = repairCost(placed),
    restock = restockQuote(placed);
  const command = (name: string, input: Record<string, unknown> = {}) =>
    commands.run(name, { id: placed.id, ...input });
  const managed = Boolean(def.ride || def.stall);
  const appeal =
    (def.appeal + (def.id === "ride_coaster" ? coasterThrill(tracks) : 0)) *
    (placed.upgrade === "premium"
      ? 1.45
      : placed.upgrade === "efficient"
        ? 0.85
        : 1);
  return (
    <section
      className="park-object-card park-surface"
      aria-label={`${def.label} operations`}
    >
      <button
        className="park-inspector-close"
        aria-label="Close inspector"
        onClick={() => commands.run("build.clear", {})}
      >
        ×
      </button>
      <h2>
        {def.icon} {def.label}
      </h2>
      <p>{def.blurb}</p>
      <strong
        className={
          access && active ? "park-operation-good" : "park-operation-bad"
        }
      >
        {!access && managed
          ? "No entrance-connected path"
          : placed.closed
            ? "Closed · recovering wear"
            : !active
              ? "Broken · repair needed"
              : "Open for visitors"}
      </strong>
      <details className="park-operating" open={!compact}><summary><span>Operating figures · ${objectUpkeep(placed)}/day</span></summary><div className="park-operation-data">
        <Row label="Appeal" value={appeal.toFixed(1)} />
        <Row label="Upkeep / day" value={`$${objectUpkeep(placed)}`} />
        {managed && (
          <>
            <Row
              label="Queue capacity"
              value={`${placed.occupants}/${objectCapacity(placed)}`}
            />
            <Row
              label="Service time"
              value={`${objectServiceSeconds(placed).toFixed(1)}s`}
            />
            <Row
              label="Nearby comfort"
              value={`${Math.round(localComfort(placed) * 100)}%`}
            />
          </>
        )}
        {def.ride && (
          <Row
            label="Wear · breaks at 100%"
            value={`${Math.round(placed.wear ?? 0)}%`}
          />
        )}
        {def.id === "ride_coaster" && (
          <Row label="Connected track" value={String(tracks)} />
        )}
        {def.stall && (
          <>
            <Row
              label="Stock / policy target"
              value={`${placed.stock}/${stockTarget(placed)}`}
            />
            <Row
              label="Sale price / sold"
              value={`$${objectPrice(placed)} / ${placed.soldTotal}`}
            />
          </>
        )}
      </div></details>
      {managed && (
        <div className="park-operation-actions">
          <button onClick={() => command("build.toggle")}>
            {placed.closed ? "Reopen" : "Close · 25% upkeep"}
          </button>
          {def.ride && (
            <button
              disabled={repair <= 0 || session.cash < repair}
              onClick={() => command("build.repair")}
            >
              Repair · ${repair}
            </button>
          )}
          {def.stall && (
            <button
              disabled={restock <= 0 || session.cash < restock}
              onClick={() => command("build.restock")}
            >
              Rush stock · ${restock}
            </button>
          )}
        </div>
      )}
      {managed && !placed.upgrade && (
        <details className="park-upgrade" open>
          <summary>Choose one upgrade · ${upgrade}</summary>
          <button
            disabled={session.cash < upgrade}
            onClick={() => command("build.upgrade", { upgrade: "efficient" })}
          >
            <strong>Efficient</strong>
            <small>−20% upkeep & service time; larger queues; −35% wear; −15% appeal.</small>
          </button>
          <button
            disabled={session.cash < upgrade}
            onClick={() => command("build.upgrade", { upgrade: "premium" })}
          >
            <strong>Premium</strong>
            <small>
              +45% appeal; +50% ride capacity / +25% shop price; smaller shop queues. +50% upkeep,
              +45% wear; slower service.
            </small>
          </button>
        </details>
      )}
      {placed.upgrade && <p>Permanent {placed.upgrade} refit</p>}
      <button
        className="park-demolish"
        onClick={() => command("build.demolish")}
      >
        Demolish · refund $
        {Math.round(
          (def.cost + (placed.upgrade ? upgradeCost(placed) : 0)) * 0.5,
        )}
      </button>
    </section>
  );
}
