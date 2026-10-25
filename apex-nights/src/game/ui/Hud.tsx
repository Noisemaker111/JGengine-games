import type { CSSProperties, ReactNode } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { KitBanner, KitResultScreen } from "@jgengine/react/kitFlow";
import { KitButton, KitMeter, KitPanel } from "@jgengine/react/uiKitRoot";

import { idea } from "../idea";
import { raceView } from "../race";

const same = <T,>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
const useRace = () => useGameStore(raceView, same);
const corner = (place: CSSProperties): CSSProperties => ({ position: "absolute", pointerEvents: "none", ...place });
const ordinal = (place: number) => `${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

function Wallet(): ReactNode {
  const race = useRace();
  return (
    <div style={corner({ right: 20, top: 20 })}>
      <KitPanel variant="strip">
        <span style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <span data-cash="" style={{ fontSize: "var(--jg-type-xl, 22px)", fontWeight: 800 }}>
            {race.cash} <span style={{ fontSize: 12, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em" }}>{idea.currency.label}</span>
          </span>
          <span style={{ fontSize: 12, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.08em" }}>{race.wins} wins</span>
        </span>
      </KitPanel>
    </div>
  );
}

/** Between races: the next race on the left, the car's upgrades on the right. */
function Garage(): ReactNode {
  const ctx = useGameContext();
  const race = useRace();
  if (race.phase !== "garage") return null;
  return (
    <>
      <div style={corner({ left: 24, bottom: 24, width: 360, pointerEvents: "auto" })}>
        <KitPanel variant="card" eyebrow={`Race ${race.nextIndex + 1} of ${idea.races.length}`} title={race.next.title}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span>
              <strong>{idea.guide.name}:</strong> {race.allDone ? "Every race on the board is won. Race them again for money." : race.next.pitch}
            </span>
            <span style={{ opacity: 0.8 }}>
              {race.next.laps} laps - {race.next.rivals} rivals - pays {race.next.pay} {idea.currency.label.toLowerCase()} for a win
            </span>
            <KitButton variant="primary" glyph="Enter" onClick={() => ctx.game.commands.run("race", {})}>
              Start race
            </KitButton>
          </div>
        </KitPanel>
      </div>
      <div style={corner({ right: 24, bottom: 24, width: 340, pointerEvents: "auto" })}>
        <KitPanel variant="card" eyebrow="Garage" title="Tune the car">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {race.upgrades.map((upgrade, index) => {
              const maxed = upgrade.stage > upgrade.levels;
              return (
                <div key={upgrade.id} data-upgrade={upgrade.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                  <KitMeter label={`${upgrade.label} - stage ${upgrade.stage}`} value={upgrade.stage - 1} max={upgrade.levels} variant="segments" segments={upgrade.levels} tone="accent" />
                  <KitButton size="sm" variant={maxed || race.cash < upgrade.price ? "ghost" : "secondary"} glyph={String(index + 1)} onClick={() => ctx.game.commands.run(`buy${index + 1}`, {})}>
                    {maxed ? "Maxed" : `${upgrade.price}`}
                  </KitButton>
                </div>
              );
            })}
          </div>
        </KitPanel>
      </div>
    </>
  );
}

/** While racing: place and lap top left, speed and nitro bottom right, the count in the middle. */
function Dash(): ReactNode {
  const race = useRace();
  if (race.phase === "garage") return null;
  return (
    <>
      <div style={corner({ left: 20, top: 20 })}>
        <KitPanel variant="hud" eyebrow={race.result?.title ?? race.next.title}>
          <div style={{ display: "flex", gap: 22, alignItems: "baseline" }}>
            <span data-position="" style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>
              {ordinal(race.position)}
              <span style={{ fontSize: 14, opacity: 0.7 }}> / {race.field}</span>
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span data-lap="" style={{ fontWeight: 800 }}>
                Lap {race.lap} / {race.laps}
              </span>
              <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{clock(race.time)}</span>
              {race.assist ? <span style={{ opacity: 0.6, fontSize: 11 }}>ASSIST</span> : null}
            </span>
          </div>
        </KitPanel>
      </div>
      <div style={corner({ right: 24, bottom: 24, width: 220 })}>
        <KitPanel variant="hud">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
            <span data-speed="" style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
              {race.speed}
              <span style={{ fontSize: 14, opacity: 0.7 }}> km/h</span>
            </span>
            <KitMeter label="Nitro" value={Math.round(race.nitro * 100)} max={100} tone={race.nitro > 0.25 ? "accent" : "warn"} />
          </div>
        </KitPanel>
      </div>
      <div style={corner({ left: "50%", top: "30%", transform: "translateX(-50%)" })}>
        <KitBanner cue={race.phase === "countdown" ? race.countdown : race.phase === "racing" ? "go" : null} title={race.phase === "countdown" ? String(race.countdown) : "Go!"} tone="accent" />
      </div>
    </>
  );
}

function Result(): ReactNode {
  const ctx = useGameContext();
  const race = useRace();
  const result = race.result;
  return (
    <KitResultScreen
      open={race.phase === "finished" && result !== null}
      tone={result !== null && result.place <= 3 ? "good" : "bad"}
      eyebrow={result?.title ?? ""}
      title={result === null ? "" : result.place === 1 ? "You won!" : result.place <= 3 ? `${ordinal(result.place)} place` : `${ordinal(result.place)} - off the podium`}
      summary={result === null ? "" : result.pay > 0 ? `+${result.pay} ${idea.currency.label.toLowerCase()} for the garage.` : "Top three get paid. Tune the car and try again."}
      stats={result === null ? [] : [
        { label: "Place", value: ordinal(result.place) },
        { label: "Time", value: clock(result.time) },
        { label: "Paid", value: result.pay },
      ]}
      actions={[{ id: "garage", label: "Back to the garage", primary: true }]}
      onAction={() => ctx.game.commands.run("garage", {})}
    />
  );
}

export function Hud(): ReactNode {
  return (
    <>
      <Wallet />
      <Garage />
      <Dash />
      <Result />
    </>
  );
}
