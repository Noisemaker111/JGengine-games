import type { SessionSnapshot } from "../../run/session";
import { PART_SLOTS } from "../../parts/catalog";
import { PartIcon } from "./PartIcon";

export function RunResults({ snapshot, onRestart, onTitle }: { snapshot: SessionSnapshot; onRestart: () => void; onTitle: () => void }) {
  const outcome = snapshot.outcome;
  if (!outcome) return null;
  const won = outcome.kind === "won";
  return <div className="df-overlay"><section className="df-card df-results" role="dialog" aria-label={won ? "Escape results" : "Crushed results"}>
    <div className="df-eyebrow">{won ? "PIT RADIO / SIGNAL RECEIVED" : "PIT RADIO / SIGNAL LOST"}</div>
    <h1>{won ? "OUT OF" : "ROW SIX"}<br/><em>{won ? "THE YARD" : "CAUGHT YOU"}</em></h1>
    <p>{won ? "The salvage special lives to race another shift." : `Caught in ${outcome.zoneLabel.toLowerCase()}. Watch the next barrier cue and jump on the teal marks.`}</p>
    <div className="df-result-grid"><div><b>{outcome.time.toFixed(1)}s</b><span>RUN TIME</span></div><div><b>{won ? "470" : Math.floor(snapshot.pose.position[2])}m</b><span>DISTANCE</span></div><div><b>{snapshot.clearedGateIds.size}/8</b><span>BARRIERS CLEARED</span></div><div><b>{outcome.armorSaves}</b><span>ARMOR SAVES</span></div></div>
    <div className="df-result-build">{PART_SLOTS.map(slot => <span key={slot}><PartIcon partId={snapshot.installed[slot]?.id ?? null}/>{snapshot.installed[slot]?.label ?? "Empty slot"}</span>)}</div>
    {won && snapshot.personalBest !== "unchanged" && <p className="df-eyebrow">{snapshot.personalBest === "first" ? "FIRST ESCAPE ON RECORD" : snapshot.personalBest === "improved" ? "NEW PERSONAL BEST" : "PERSONAL BEST MATCHED"}</p>}
    <p className="df-save-status" role="status">{snapshot.recordsSaved ? `RECORD SAVED · ${snapshot.records.escapes} escapes · best ${snapshot.records.bestTime?.toFixed(1) ?? "—"}s` : "Record could not be saved in this browser. This result remains available until reload."}</p>
    <div className="df-actions"><button className="df-primary" onClick={onRestart}>RUN IT AGAIN <kbd>R</kbd></button><button onClick={onTitle}>BACK TO PIT</button></div>
  </section></div>;
}
