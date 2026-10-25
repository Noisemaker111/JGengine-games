import type { CSSProperties } from "react";
import { useDisplayProfile } from "@jgengine/react";
import { GameCursor } from "@jgengine/react/gameCursor";
import { useMenuNav } from "@jgengine/react/menuNav";
import { CHARACTERS } from "../../characters";
import { ReclaimerPortrait } from "../components/Portrait";
import { ControlKeys } from "./FieldTerminal";
import { Crt, navItem, Plate, SIGNAL, SignalBars, SignalWordmark, Stamp } from "./kit";

/**
 * The title as a jammed broadcast: Scrap Signal's carrier is down, the screen is static and three
 * reclaimer channels flicker on a bank of salvaged monitors. Tuning one in starts the run.
 */
export function BroadcastTitle({ onPick }: { onPick: (characterId: string) => void }) {
  const profile = useDisplayProfile();
  const compact = profile.compact;
  const nav = useMenuNav({ ids: CHARACTERS.map((c) => c.id), columns: compact ? 1 : CHARACTERS.length, initialId: CHARACTERS[0]?.id, onConfirm: onPick });
  return (
    <div className={`ss-broadcast ${compact ? "compact" : ""}`}>
      <i className="ss-static" aria-hidden="true" />
      <i className="ss-roll" aria-hidden="true" />
      <div className="ss-osd top">
        <span><b>CH 04</b> ▸ NO CARRIER</span>
        <span className="ss-osd-live"><i aria-hidden="true" />REC · FERRALON WASTES</span>
      </div>
      <header className="ss-broadcast-head">
        <div className="ss-broadcast-kicker">Reactivate · Reclaim · Rise</div>
        <SignalWordmark />
        <p className="ss-caption">A broken carrier. A desert of stolen machines. Reclaim the copper-ring relay north of the crash site, then follow B0-LT’s campaign across Ferralon.</p>
      </header>
      <div className="ss-tune-label"><span>Tune a reclaimer</span></div>
      <nav className="ss-monitors" aria-label="Choose your reclaimer" {...nav.containerProps}>
        {CHARACTERS.map((character, index) => {
          const tuned = nav.activeId === character.id;
          return (
            <Plate
              key={character.id}
              as="button"
              material="hull"
              tint="#1b2225"
              cut="notch"
              depth={compact ? 10 : 16}
              rim={tuned ? SIGNAL.amber : "#3a3226"}
              rimWidth={tuned ? 3 : 2}
              padding="0"
              className={`ss-monitor ${tuned ? "tuned" : ""}`}
              style={{ "--ss-char": character.color } as CSSProperties}
              {...navItem(nav.itemProps(character.id))}
              onClick={() => { nav.setActive(character.id); onPick(character.id); }}
            >
              <span className="ss-monitor-strip">
                <Stamp tone={tuned ? "amber" : "dim"}>CH {index + 1}</Stamp>
                <SignalBars strength={tuned ? 4 : 1 + (index % 2)} color={tuned ? SIGNAL.amber : SIGNAL.phosphorDim} />
              </span>
              <Crt className="ss-monitor-tube" tint={character.color}>
                <ReclaimerPortrait id={character.id} color={character.color} />
                <i className="ss-tube-snow" aria-hidden="true" />
              </Crt>
              <span className="ss-monitor-text">
                <span className="ss-monitor-name">{character.name}</span>
                <span className="ss-monitor-class">{character.className}</span>
                <span className="ss-monitor-tag">{character.tagline}</span>
                <span className="ss-monitor-branches">
                  {character.branches.map((branch) => <span key={branch.id}>{branch.name}</span>)}
                </span>
              </span>
              <span className="ss-monitor-tune" aria-hidden="true">{tuned ? "▸ Tune in" : "Static"}</span>
            </Plate>
          );
        })}
        <GameCursor variant="brackets" color={SIGNAL.amber} gap={6} thickness={3} />
      </nav>
      <footer className="ss-broadcast-foot">
        <ControlKeys />
        <span className="ss-osd-hint">Arrows or mouse to tune · Enter to lock the channel</span>
      </footer>
    </div>
  );
}
