import { SettingsTrigger } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { runSessionStore } from "../../run/session";
import type { RunRecords } from "../../run/records";

export function StartScreen({ onStart, onCredits, records }: { onStart: () => void; onCredits: () => void; records: RunRecords }) {
  const parkedRun = useStore(runSessionStore, session => session?.snapshot().parkedRun ?? null);
  const { commands } = useGame();
  return <div className="df-overlay df-title">
    <div className="df-title-art" aria-hidden="true">
      <svg viewBox="0 0 600 300"><path d="M0 243L600 182M0 275L600 214" stroke="#edc565" strokeWidth="3" opacity=".25"/>
        <path d="M80 205L155 110L260 72L402 90L470 178L485 215L195 250Z" fill="#182d32" stroke="#758d96" strokeWidth="5"/>
        <path d="M155 110L175 194L324 174L260 72M260 72L328 80L379 159M175 194L379 159" fill="none" stroke="#edc565" strokeWidth="7"/>
        <path d="M176 199L381 159L451 181L308 224L196 238Z" fill="#cc5936"/>
        <path d="M325 173L350 181L400 169L378 162" fill="#edc565"/>
        <path d="M210 193L255 184L267 210L220 220Z" fill="#f1dfbf"/>
        <text x="225" y="210" fill="#182d32" fontSize="24" fontWeight="900">06</text>
        <ellipse cx="160" cy="230" rx="35" ry="45" fill="#161c20" stroke="#758d96" strokeWidth="7"/>
        <ellipse cx="427" cy="193" rx="31" ry="40" fill="#161c20" stroke="#758d96" strokeWidth="7"/>
        <ellipse cx="160" cy="230" rx="15" ry="22" fill="#edc565"/><ellipse cx="427" cy="193" rx="12" ry="18" fill="#edc565"/>
        <path d="M166 109L153 22L218 34L160 60" fill="#edc565" stroke="#758d96" strokeWidth="3"/>
      </svg>
      <span>ROW SIX / SALVAGE SPECIAL</span>
    </div>
    <section className="df-card df-title-card">
      <div className="df-eyebrow">PIT RADIO / CHANNEL 06</div>
      <h1>DRIFT<br/><em>FOUNDRY</em></h1>
      <p className="df-intro">One welded buggy. Three salvage yards. A compactor that never stops.</p>
      <p>Drive through salvage stations to bolt on upgrades. Collect the plow and springs, then jump the striped stacks on the teal launch marks. Escape through the gate at 470m. Use Keep Engine / X to retain the fast truck motor or accept the EV for sharper turns.</p>
      <div className="df-controls-legend"><span><kbd>W ↑</kbd> Throttle</span><span><kbd>A D</kbd> Steer</span><span><kbd>S ↓</kbd> Brake / reverse</span><span><kbd>Space</kbd> Jump</span><span><kbd>Shift</kbd> Brace plow</span><span><kbd>P</kbd> Pause</span></div>
      <div className="df-records">{records.bestTime === null ? "NO ESCAPE ON RECORD" : `BEST ESCAPE ${records.bestTime.toFixed(1)}s`} <span>{records.escapes} escapes · {records.attempts} finished runs</span></div>
      <p>{parkedRun ? `Parked checkpoint: ${Math.floor(parkedRun.position[2])}m · ${parkedRun.runTime.toFixed(1)}s · ${parkedRun.partIds.length} parts. Continue starts stopped with the compactor clock preserved.` : "To keep a run for later, stop on the ground and pause before returning to the pit."}</p>
      <div className="df-actions"><button className="df-primary" onClick={onStart}>{parkedRun ? "CONTINUE PARKED RUN" : "START ENGINE"} <kbd>Enter</kbd></button>{parkedRun && <button onClick={() => commands.run("restart", {})}>NEW RUN</button>}<SettingsTrigger className="df-button" label="Settings">SETTINGS</SettingsTrigger><button onClick={onCredits}>CREDITS</button></div>
    </section>
  </div>;
}
