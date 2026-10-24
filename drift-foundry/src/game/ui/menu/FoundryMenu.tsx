import { type ReactNode, useEffect, useState } from "react";
import { ContinuePane, CreditsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGameContext } from "@jgengine/react/provider";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";

import { FOUNDRY_CREDITS } from "../../credits";
import { foundrySlots, refreshFoundrySlots, saveParkedRunHere } from "../../menuSave";
import type { RunSession, SessionSnapshot } from "../../run/session";
import type { GarageRow } from "../../career";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

/** The yard's pit-radio palette, handed to the shared menu as CSS tokens rather than a preset. */
const MENU_TOKENS = {
  "--jg-accent": "#edc565",
  "--jg-accent-soft": "rgba(237,197,101,0.24)",
  "--jg-accent-glow": "rgba(237,197,101,0.3)",
  "--jg-text": "#f4ecd8",
  "--jg-text-dim": "rgba(214,196,160,0.68)",
  "--jg-font-display": "\"Arial Black\", \"Arial Narrow\", Impact, sans-serif",
  "--jg-font-body": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(30px, 4.6vw, 66px)",
  "--jg-menu-card-radius": "2px",
} as const;

function metres(z: number): string {
  return `${Math.max(0, Math.floor(z))} m`;
}

/** The pit's New run pane: what the corridor asks before the engine turns over. */
function NewRunPane({ shift, best }: { shift: SessionSnapshot["shift"]; best: number | null }): ReactNode {
  return (
    <div data-new-run-pane="" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>New run</div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(214,196,160,0.8)", maxWidth: "46ch" }}>
        One welded buggy, twelve pieces of salvage, and a compactor that never stops. Bolt on what you drive over; hold E to swap an engine or frame. Three yard karts start ahead of you.
      </p>
      <p data-new-run-shift="" style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(237,197,101,0.92)" }}>
        {shift === null ? "CLEAN SHIFT - nobody has changed the yard. Escape pays what the line earns." : `THIS RUN - ${shift.label}. ${shift.hint}`}
      </p>
      <p style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(214,196,160,0.66)" }}>
        {best === null ? "No escape on record yet. The 470 m gate is the only income worth planning around." : `Best escape ${best.toFixed(1)} s.`}
      </p>
    </div>
  );
}

/** The garage: one ladder rung per slot, priced in the credits the last escapes banked. */
function GaragePane({ rows, credits, onBuy }: { rows: readonly GarageRow[]; credits: number; onBuy: (slot: GarageRow["slot"]) => void }): ReactNode {
  return (
    <div data-garage-pane="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>Pit garage</div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(214,196,160,0.72)" }}>{credits} cr banked. Buy the next rung of a slot's ladder; it bolts on for every run after this one.</p>
      {rows.map((row) => (
        <div key={row.slot} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(237,197,101,0.24)", padding: "8px 10px" }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: "var(--jg-type-md)" }}>{row.part?.label ?? row.slot}</strong>
            <small style={{ color: "rgba(214,196,160,0.64)" }}>{row.owned ? "fully built" : row.locked ? `locked / needs ${row.needs} standing` : `${row.price} cr`}</small>
          </div>
          <button
            type="button"
            data-garage-buy={row.slot}
            disabled={row.owned || row.locked || row.price === null || row.price > credits}
            onClick={() => onBuy(row.slot)}
            style={{ padding: "7px 14px", borderRadius: 2, border: "none", background: row.owned || row.locked || row.price === null || row.price > credits ? "rgba(148,163,184,0.24)" : "#edc565", color: "#182d32", fontFamily: "var(--jg-font-display)", fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer" }}
          >
            {row.owned ? "BUILT" : row.locked ? `LOCKED ${row.needs}` : row.price !== null && row.price > credits ? `NEED ${row.price - credits}` : `BUY ${row.price}`}
          </button>
        </div>
      ))}
    </div>
  );
}

/** The corridor's records, in the pit's words. */
function RecordsPane({ snapshot }: { snapshot: SessionSnapshot }): ReactNode {
  const records = snapshot.records;
  return (
    <div data-records-pane="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>Corridor records</div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[
          ["Best escape", records.bestTime === null ? "no escape yet" : `${records.bestTime.toFixed(1)} s`],
          ["Escapes", `${records.escapes}`],
          ["Runs finished", `${records.attempts}`],
          ["Farthest", metres(records.farthest)],
        ].map(([label, value]) => (
          <li key={label} style={{ border: "1px solid rgba(237,197,101,0.3)", padding: "6px 10px", fontSize: "var(--jg-type-sm)" }}>{label} <strong style={{ marginLeft: 6 }}>{value}</strong></li>
        ))}
      </ul>
      <p style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(214,196,160,0.68)" }}>
        {snapshot.runsPlayed} runs settled in this career. Every settled run draws the next shift; the pit shows what the next engine start opens with.
      </p>
    </div>
  );
}

/** Preferences and the shell's own settings, in the same pane. */
function PitSettings(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-pit-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 900 }}>Pit settings</div>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </div>
  );
}

/**
 * Drift Foundry's front end: the shared game menu over the yard, in its own words - the pit, the
 * corridor, the build. Continue resumes the parked run with its parts and the credits it carries.
 */
export function FoundryMenu({ snapshot, session, publish }: { snapshot: SessionSnapshot; session: RunSession; publish: () => void }): ReactNode {
  const ctx = useGameContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = foundrySlots.mostRecent();
  const parked = snapshot.parkedRun;
  const title = snapshot.phase === "start";
  const paused = snapshot.phase === "running" && snapshot.paused;

  useEffect(() => { refreshFoundrySlots(); }, [title, paused]);

  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 260))]);
    } finally {
      setBusy(null);
    }
  };

  const startRun = () => {
    session.start();
    publish();
  };

  const newRun = () => {
    session.restart();
    publish();
  };

  const resume = () => {
    session.togglePause();
    publish();
  };

  const parkHere = () =>
    whileLoading("Parking the run", async () => {
      const parkedNow = await saveParkedRunHere(ctx);
      publish();
      setNotice(parkedNow ? `Parked at ${metres(parked?.position[2] ?? 0)}` : "Stop on the ground first: a moving buggy cannot be parked");
    });

  const backToPit = () =>
    whileLoading("Parking the run", async () => {
      await saveParkedRunHere(ctx);
      session.returnToTitle();
      publish();
    });

  const buy = (slot: GarageRow["slot"]) => {
    const result = session.buyPart(slot);
    publish();
    if (!result.ok) setNotice(result.reason ?? "The yard refused that part");
  };

  const continueLine = parked === null
    ? "No run is parked at the pit. The next engine start is a fresh corridor."
    : `${metres(parked.position[2])} in with ${parked.partIds.length} of 4 parts bolted on and ${parked.runTime.toFixed(1)} s on the clock. The bank holds ${snapshot.career.credits} cr.`;

  const titleMenu = (
    <GameMenu
      open={title}
      label="Drift Foundry"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow="ROW SIX / SALVAGE SPECIAL"
      logo={{ text: <span className="df-wordmark">DRIFT<br />FOUNDRY</span>, title: "Drift Foundry" }}
      tagline="One welded buggy. Three yard karts ahead of you. A compactor that never stops."
      items={[
        { id: "continue", label: "Continue run", hint: parked === null ? "No parked run at the pit" : `${metres(parked.position[2])} / ${parked.runTime.toFixed(1)} s / ${parked.partIds.length} parts`, disabled: parked === null },
        { id: "new", label: "New run", hint: snapshot.shift === null ? "CLEAN SHIFT - the yard is unchanged" : `THIS RUN - ${snapshot.shift.label}` },
        { id: "garage", label: "Pit garage", hint: `${snapshot.career.credits} cr / standing ${snapshot.career.standing}` },
        { id: "records", label: "Corridor records", hint: snapshot.records.bestTime === null ? "No escape on record" : `Best ${snapshot.records.bestTime.toFixed(1)} s` },
        { id: "settings", label: "Settings", hint: "Picture, sound, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
              <ContinuePane
                slot={recent}
                emptyMessage="No run parked yet. Stop the buggy on the ground, pause and park it before you leave the corridor."
                onContinue={() => startRun()}
              />
              <p data-continue-run="" style={{ margin: 0, fontSize: "var(--jg-type-sm)", color: "rgba(214,196,160,0.72)" }}>{continueLine}</p>
            </div>
          );
        }
        if (id === "new") return <NewRunPane shift={snapshot.shift} best={snapshot.records.bestTime} />;
        if (id === "garage") return <GaragePane rows={snapshot.career.garage} credits={snapshot.career.credits} onBuy={buy} />;
        if (id === "records") return <RecordsPane snapshot={snapshot} />;
        if (id === "settings") return <PitSettings />;
        if (id === "credits") return <CreditsPane sections={FOUNDRY_CREDITS.sections} notice={FOUNDRY_CREDITS.notice} heading="Credits" />;
        return null;
      }}
      onSelect={(id) => {
        if (id === "continue") startRun();
        else if (id === "new") newRun();
      }}
      footer={<span>{notice ?? `${snapshot.records.escapes} escapes / ${snapshot.records.attempts} runs - ${snapshot.career.credits} cr banked`}</span>}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={paused}
      label="The run is held"
      onBack={resume}
      onResume={resume}
      logo={{ text: <span className="df-wordmark">PIT<br />STOP.</span>, title: "The run is held" }}
      eyebrow={`${snapshot.zone.label} / ${metres(snapshot.pose.position[2])} / ${snapshot.runTime.toFixed(1)} s`}
      tagline="The buggy and the compactor are stopped with the simulation: the crusher does not close while this is open."
      items={[
        { id: "resume", label: "Back to the run", hint: snapshot.parkedRun === null ? "The buggy is still moving: stop on the ground to park it" : `Parked at ${metres(snapshot.parkedRun.position[2])}` },
        { id: "save", label: "Park the run", hint: "Writes the build, the clock and the salvage it carries" },
        { id: "garage", label: "Pit garage", hint: `${snapshot.career.credits} cr banked` },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Park & back to the pit" }]}
      detail={(id) =>
        id === "garage" ? <GaragePane rows={snapshot.career.garage} credits={snapshot.career.credits} onBuy={buy} />
          : id === "settings" ? <PitSettings />
            : id === "credits" ? <CreditsPane sections={FOUNDRY_CREDITS.sections} notice={FOUNDRY_CREDITS.notice} heading="Credits" />
              : null
      }
      onSelect={(id) => {
        if (id === "resume") resume();
        else if (id === "save") void parkHere();
        else if (id === "title") void backToPit();
      }}
      footer={<span>{notice ?? `${snapshot.salvageAtRisk} cr at risk - ${snapshot.career.credits} cr banked`}</span>}
      style={MENU_TOKENS}
    />
  );

  return (
    <div className="df-menu">
      {titleMenu}
      {pauseMenu}
      {busy !== null && <div className="df-menu-busy" role="status" aria-live="polite"><span>{busy}</span></div>}
    </div>
  );
}
