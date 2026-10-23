import { SettingsTrigger, useCanvasCover } from "@jgengine/react";
import { useGame } from "@jgengine/react/hooks";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useStore } from "@jgengine/react/store";
import { runSessionStore } from "../../run/session";
import type { RunRecords } from "../../run/records";
import type { PartSlotId } from "../../parts/catalog";

export function StartScreen({ onStart, onCredits, onBuy, records }: {
  onStart: () => void;
  onCredits: () => void;
  onBuy: (slot: PartSlotId) => void;
  records: RunRecords;
}) {
  const parkedRun = useStore(runSessionStore, session => session?.snapshot().parkedRun ?? null);
  const career = useStore(runSessionStore, session => session?.snapshot().career ?? null);
  const shift = useStore(runSessionStore, session => session?.snapshot().shift ?? null);
  const { commands } = useGame();
  // The pit plate covers the frame and the buggy is not running yet: nothing behind it can change.
  useCanvasCover(true);
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
    <HudSurface className="df-card df-title-card" elevation="modal">
      <div className="df-eyebrow">PIT RADIO / CHANNEL 06</div>
      <h1>DRIFT<br/><em>FOUNDRY</em></h1>
      <p className="df-intro">One welded buggy. Three yard karts ahead of you. A compactor that never stops.</p>
      <p>Empty slots, plow and springs bolt on automatically. Engine and frame replacements are your choice: hold E as you pass to swap, or keep your build. Truck speed costs steering; EV handling costs speed. Jump striped stacks on teal marks. TALLY wanders, MOSS weaves, HOBBS holds a clean outside line - beat all three to the 470m gate.</p>
      <div className="df-controls-legend"><span><kbd>W</kbd> Throttle</span><span><kbd>A D</kbd> Steer</span><span><kbd>S</kbd> Brake / reverse</span><span><kbd>Space</kbd> Jump</span><span><kbd>X</kbd> Handbrake drift</span><span><kbd>Shift</kbd> Brace plow</span><span><kbd>P</kbd> Pause</span></div>
      <div className="df-records">{records.bestTime === null ? "NO ESCAPE ON RECORD" : `BEST ESCAPE ${records.bestTime.toFixed(1)}s`} <span>{records.escapes} escapes / {records.attempts} finished runs</span></div>
      <p className="df-next-shift" role="status">{shift ? <>THIS RUN · <b>{shift.label}</b> {shift.hint}</> : <>THIS RUN · <b>CLEAN SHIFT</b> Nobody has changed the yard. Escape pays what the line earns.</>}</p>
      {career && <section className="df-garage" aria-label="Yard garage">
        <div className="df-records">YARD CREDITS {career.credits} <span>STANDING {career.standing} / {career.tier}</span></div>
        <p className="df-eyebrow">PIT GARAGE / BUY A LADDER RUNG</p>
        <div className="df-garage-list">{career.garage.map(row => <article key={row.slot}>
          <strong>{row.part?.label ?? row.slot}</strong>
          <small>{row.owned ? "fully built" : row.locked ? `locked / needs ${row.needs} standing` : `${row.price} cr`}</small>
          <HudButton disabled={row.owned || row.locked || row.price === null || row.price > career.credits} onClick={() => onBuy(row.slot)}>
            {row.owned ? "BUILT" : row.locked ? `LOCKED ${row.needs}` : row.price !== null && row.price > career.credits ? `NEED ${row.price - career.credits}` : `BUY ${row.price}`}
          </HudButton>
          <p>{row.part?.blurb ?? "Every rung of this ladder is already bolted on."}</p>
        </article>)}</div>
        {!career.saved && <p className="df-eyebrow">THIS BROWSER COULD NOT SAVE YOUR GARAGE</p>}
      </section>}
      <p>{parkedRun ? `Parked checkpoint: ${Math.floor(parkedRun.position[2])}m / ${parkedRun.runTime.toFixed(1)}s / ${parkedRun.partIds.length} parts. Continue starts stopped with the compactor clock preserved.` : "To keep a run for later, stop on the ground and pause before returning to the pit."}</p>
      <div className="df-actions"><HudButton variant="primary" className="df-primary" cue="confirm" onClick={onStart}>{parkedRun ? "CONTINUE PARKED RUN" : "START ENGINE"} <kbd>Enter</kbd></HudButton>{parkedRun && <HudButton onClick={() => commands.run("restart", {})}>NEW RUN</HudButton>}<SettingsTrigger className="df-button" label="Settings">SETTINGS</SettingsTrigger><HudButton onClick={onCredits}>CREDITS</HudButton></div>
    </HudSurface>
  </div>;
}
