import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { SettingsTrigger } from "@jgengine/react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGameClock, useGameStore } from "@jgengine/react/hooks";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useGame } from "@jgengine/react/hooks";

import { captureParkThumb, parkProfile } from "../../parkProfile";
import { parkSlots, refreshParkSlot } from "../../parkSlot";
import { SCENARIOS } from "../../scenarios";
import { session } from "../../session";

const PARK_TOKENS = {
  "--jg-accent": "#ffd166",
  "--jg-accent-glow": "rgba(255,209,102,0.3)",
  "--jg-accent-soft": "rgba(255,209,102,0.22)",
  "--jg-text": "#fffaf0",
  "--jg-text-dim": "rgba(255,244,214,0.68)",
  "--jg-font-display": "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
  "--jg-font-body": "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(32px, 5vw, 70px)",
  "--jg-menu-card-radius": "10px",
} as const;

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const parkFocus: { id: string | null } = { id: null };

const parkStarted = () => session.started;

export interface ParkMenuProps {
  settings: boolean;
  onCloseSettings: () => void;
  reducedMotion: boolean;
  onReducedMotion: (next: boolean) => void;
  contrast: boolean;
  onContrast: (next: boolean) => void;
}

/** Brightway Park's front end: the park behind, the gate board in front. */
export function ParkMenu({ settings, onCloseSettings, reducedMotion, onReducedMotion, contrast, onContrast }: ParkMenuProps): ReactNode {
  const { commands } = useGame();
  const clock = useGameClock();
  useGameStore(() => [session.started, session.day, session.hasSave, session.saveStatus, session.gameOver, session.won, session.winDismissed, session.cash].join("|"));
  const slots = useSaveSlots(parkSlots);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState(parkProfile.name ?? "");
  const recent = slots.find((slot) => !slot.empty) ?? null;

  useEffect(() => {
    refreshParkSlot();
  }, []);

  if (settings) return null;

  if (parkStarted()) {
    if (!clock.paused) return null;
    return (
      <GamePauseMenu
        open
        label="The midway can wait"
        onResume={() => commands.run("pauseToggle", {})}
        eyebrow="The midway can wait"
        logo={{ text: <span>Brightway<br />Park</span>, title: "Brightway Park" }}
        tagline="Your visitors and finances are paused. Resume to keep the park moving."
        items={[
          { id: "resume", label: "Resume the park" },
          { id: "save", label: "Save the park", hint: session.saveStatus },
          { id: "settings", label: "Park settings" },
        ]}
        detail={(id) =>
          id === "settings" ? (
            <ParkSettings reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} contrast={contrast} onContrast={onContrast} />
          ) : id === "save" ? (
            <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(255,244,214,0.72)" }}>
              {notice ?? "Saving keeps the day, the guests and the books as they stand."}
            </p>
          ) : null
        }
        onSelect={(id) => {
          if (id === "resume") commands.run("pauseToggle", {});
          else if (id === "save") {
            void captureParkThumb().then(() => {
              commands.run("park.save", {});
              refreshParkSlot();
              setNotice("The park is on the board.");
            });
          }
        }}
        footer={<span>Brightway Park - day {session.day}</span>}
        style={PARK_TOKENS as CSSProperties}
      />
    );
  }

  if (session.gameOver || (session.won && !session.winDismissed)) return null;

  return (
    <GameMenu
      label="Brightway Park"
      initialId={parkFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow="Seaside fair - build the midway"
      logo={{ text: <span>Brightway<br />Park</span>, title: "Brightway Park" }}
      tagline="Turn a quiet coastal fair into a blue ribbon park."
      items={[
        { id: "continue", label: "Continue", hint: recent === null ? "No park on the board" : `${recent.name ?? "Brightway Park"} - day ${String(recent.meta.day ?? session.day)}`, disabled: recent === null },
        { id: "new", label: "New day", hint: "Open a fresh park or pick a scenario" },
        { id: "saves", label: "Park saves", hint: recent === null ? "Nothing saved yet" : `Day ${String(recent.meta.day ?? 1)} on the board` },
        { id: "settings", label: "Settings", hint: "Motion, contrast, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <ContinuePane
              slot={recent}
              now={() => Date.now()}
              emptyMessage="No park saved yet. Open one and the day starts from the gate."
              onContinue={() => commands.run("park.start", {})}
            />
          );
        }
        if (id === "new") return <NewDayPane name={name} onName={setName} onOpen={() => commands.run("park.start", {})} onFresh={() => commands.run("park.new", {})} hasSave={recent !== null} onScenario={(scenarioId) => {
          commands.run("park.scenario", { id: scenarioId });
          commands.run("park.start", {});
        }} />;
        if (id === "saves") {
          return (
            <SaveSlotsPane
              model={parkSlots}
              heading="Park saves"
              columns={1}
              onContinue={() => commands.run("park.start", {})}
              onLoad={() => commands.run("park.start", {})}
            />
          );
        }
        if (id === "settings") return <ParkSettings reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} contrast={contrast} onContrast={onContrast} />;
        if (id === "credits") {
          return (
            <CreditsPane
              heading="Credits"
              sections={[
                { heading: "Brightway Park", entries: [{ label: "The seaside fair", detail: "game and art direction" }] },
                { heading: "Assets", entries: [{ label: "KayKit, Quaternius, ambientCG", detail: "CC0 art" }] },
                { heading: "Engine", entries: [{ label: "JGengine", detail: "scene, save, menu" }] },
              ]}
              notice="Original Brightway art. Third-party packs are CC0."
            />
          );
        }
        return null;
      }}
      onSelect={(id) => {
        if (id === "continue") {
          if (recent === null) return;
          commands.run("park.start", {});
          return;
        }
        if (id === "new") {
          document.querySelector<HTMLInputElement>("[data-new-day-name]")?.focus();
          return;
        }
        if (id === "saves") document.querySelector<HTMLButtonElement>("[data-save-slot-load]")?.focus();
      }}
      footer={<span>Brightway Park - day {session.day}{notice === null ? "" : ` - ${notice}`}</span>}
      style={PARK_TOKENS as CSSProperties}
    />
  );
}

/** The gate board's New day pane: the park's own scenarios, and a fresh park. */
function NewDayPane({
  name,
  onName,
  onOpen,
  onFresh,
  hasSave,
  onScenario,
}: {
  name: string;
  onName: (next: string) => void;
  onOpen: () => void;
  onFresh: () => void;
  hasSave: boolean;
  onScenario: (id: string) => void;
}): ReactNode {
  return (
    <div data-new-day-pane="" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>New day</div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: "var(--jg-type-xs)", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,244,214,0.62)" }}>
          Park name
        </span>
        <input
          data-new-day-name=""
          value={name}
          maxLength={28}
          placeholder="Name the park"
          onChange={(event) => {
            onName(event.target.value);
            parkProfile.name = event.target.value.trim() === "" ? null : event.target.value.trim();
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,209,102,0.4)",
            background: "rgba(12,16,22,0.72)",
            color: "#fffaf0",
            fontFamily: "var(--jg-font-display)",
            fontSize: "var(--jg-type-xl)",
            fontWeight: 700,
            outline: "none",
          }}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            data-park-scenario={scenario.id}
            onClick={() => onScenario(scenario.id)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              maxWidth: 260,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,209,102,0.28)",
              background: "rgba(12,16,22,0.62)",
              color: "#fffaf0",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "var(--jg-font-body)",
            }}
          >
            <strong style={{ fontSize: "var(--jg-type-md)" }}>{scenario.title}</strong>
            <span style={{ fontSize: "var(--jg-type-xs)", color: "rgba(255,244,214,0.68)" }}>{scenario.goal}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          data-new-day-open=""
          onClick={onOpen}
          style={{
            padding: "11px 20px",
            borderRadius: 8,
            border: "none",
            background: "#ffd166",
            color: "#1a1508",
            fontFamily: "var(--jg-font-display)",
            fontSize: "var(--jg-type-lg)",
            fontWeight: 800,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Open the park
        </button>
        {hasSave ? (
          <button
            type="button"
            data-new-day-fresh=""
            onClick={onFresh}
            style={{
              padding: "11px 20px",
              borderRadius: 8,
              border: "1px solid rgba(255,209,102,0.4)",
              background: "transparent",
              color: "#fffaf0",
              fontSize: "var(--jg-type-md)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Start fresh - archive this save
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Brightway's own settings: motion, contrast, and the shell's panel behind a button. */
function ParkSettings({ reducedMotion, onReducedMotion, contrast, onContrast }: Omit<ParkMenuProps, "settings" | "onCloseSettings">): ReactNode {
  return (
    <div data-park-settings-pane="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>Park settings</div>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: 460 }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <strong style={{ fontSize: "var(--jg-type-md)" }}>Reduce motion</strong>
          <small style={{ fontSize: "var(--jg-type-xs)", color: "rgba(255,244,214,0.62)" }}>Still ride mechanisms and gentle UI transitions.</small>
        </span>
        <input type="checkbox" data-park-reduced-motion="" checked={reducedMotion} onChange={(event) => onReducedMotion(event.target.checked)} />
      </label>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: 460 }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <strong style={{ fontSize: "var(--jg-type-md)" }}>Stronger HUD contrast</strong>
          <small style={{ fontSize: "var(--jg-type-xs)", color: "rgba(255,244,214,0.62)" }}>Solid panels for clear labels over the park.</small>
        </span>
        <input type="checkbox" data-park-contrast="" checked={contrast} onChange={(event) => onContrast(event.target.checked)} />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: "var(--jg-type-sm)", color: "rgba(255,244,214,0.7)" }}>Rendering, sound & input</span>
        <SettingsTrigger />
      </div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-xs)", color: "rgba(255,244,214,0.6)" }}>{session.saveStatus}. Saves stay in this browser.</p>
    </div>
  );
}


