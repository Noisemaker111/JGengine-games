import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { HudButton } from "@jgengine/react/hudButton";
import { useGamePhase } from "@jgengine/react/hooks";
import { LoadingScreen } from "@jgengine/react/loadingScreen";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";

import { BEACON_CREDITS } from "../../credits";
import { keep } from "../../keep";
import { keepProfile } from "../../thumbs";
import { beginRun, enterRun, pauseRun, resumeRun, withdrawToTitle } from "../../menu";
import {
  KEEP_LABEL,
  beaconSave,
  beaconSlots,
  firstEmptyKeep,
  keepForNewRun,
  loadSlot,
  prepareKeep,
  refreshBeaconSlots,
  saveToSlot,
} from "../../save";
import { currentWaveNumber, session } from "../../session";
import { TOTAL_WAVES } from "../../waves/manifest";

type Screen = "title" | "pause";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

/** Beacon's field-kit palette, handed to the shared menu as CSS tokens rather than a preset. */
const MENU_TOKENS = {
  "--jg-accent": "#d8c169",
  "--jg-accent-soft": "rgba(216,193,105,0.26)",
  "--jg-text": "#e9ebda",
  "--jg-text-dim": "rgba(214,217,190,0.66)",
  "--jg-font-display": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-font-body": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(34px, 5vw, 72px)",
  "--jg-menu-card-radius": "3px",
} as const;

const TIPS = [
  "Raiders walk the carved road; towers shoot what is in reach.",
  "Waiting sends the next wave with a gold bonus - and a longer road.",
  "Every keep is a separate document: the newest one is what Continue opens.",
  "Pause saves nothing by itself. Withdraw to the title to keep a defense.",
];

function WaveLine() {
  const wave = Math.min(currentWaveNumber(), TOTAL_WAVES);
  const standing = session.creeps.size;
  return (
    <span className="bb-eyebrow">
      Wave {wave} / {TOTAL_WAVES} - {standing} raider{standing === 1 ? "" : "s"} on the road
    </span>
  );
}

/** The New defense pane: who takes the wall, which keep they raise, and the action that starts it. */
function NewKeepPane({
  slot,
  commander,
  onCommanderChange,
  onBegin,
}: {
  slot: string | null;
  commander: string;
  onCommanderChange: (name: string) => void;
  onBegin: () => void;
}): ReactNode {
  const label = slot === null ? "No keep available" : (KEEP_LABEL[slot] ?? slot);
  const held = beaconSlots.list().filter((entry) => !entry.empty).length;
  return (
    <div data-new-keep-pane="" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800, letterSpacing: "0.02em" }}>
        New defense
      </div>
      <p className="bb-note" style={{ margin: 0 }}>
        {held >= beaconSlots.list().length
          ? `Every keep is held. This run replaces the oldest - ${label}.`
          : `This run raises ${label} from an empty road.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span className="bb-eyebrow">Commander</span>
        <input
          data-new-keep-name=""
          value={commander}
          maxLength={24}
          placeholder="Name the commander"
          onChange={(event) => onCommanderChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onBegin();
            }
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 2,
            border: "1px solid #454a35",
            background: "rgba(10,11,7,0.72)",
            color: "#e9ebda",
            fontFamily: "var(--jg-font-display)",
            fontSize: "var(--jg-type-xl)",
            fontWeight: 700,
            letterSpacing: "0.04em",
            outline: "none",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {beaconSlots.list().map((entry) => (
          <span
            key={entry.id}
            data-keep-choice={entry.id}
            data-chosen={entry.id === slot ? "" : undefined}
            style={{
              padding: "4px 10px",
              borderRadius: 2,
              border: entry.id === slot ? "1px solid #d8c169" : "1px solid #454a35",
              background: entry.id === slot ? "rgba(216,193,105,0.16)" : "rgba(10,11,7,0.5)",
              color: entry.empty ? "rgba(230,232,216,0.6)" : "#e6e8d8",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {KEEP_LABEL[entry.id] ?? entry.id}
            {entry.empty ? " - empty" : ""}
          </span>
        ))}
      </div>
      <button
        type="button"
        data-new-keep-start=""
        onClick={onBegin}
        disabled={slot === null}
        style={{
          alignSelf: "flex-start",
          padding: "11px 22px",
          borderRadius: 2,
          border: "none",
          background: slot === null ? "rgba(148,163,184,0.24)" : "#d8c169",
          color: "#141609",
          fontFamily: "var(--jg-font-display)",
          fontSize: "var(--jg-type-lg)",
          fontWeight: 800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: slot === null ? "not-allowed" : "pointer",
          boxShadow: slot === null ? "none" : "0 16px 30px -18px rgba(216,193,105,0.9)",
        }}
      >
        Raise the keep
      </button>
    </div>
  );
}

/** Beacon's front-end: one menu system for the title and the pause, in the keep's own palette. */
export function BeaconMenu() {
  const ctx = useGameContext();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const root: Screen = phase === "paused" ? "pause" : "title";
  const keeps = useSaveSlots(beaconSlots);
  const [screen, setScreen] = useState<Screen>(root);
  const [commander, setCommander] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = beaconSlots.mostRecent();
  const newKeep = keepForNewRun();
  const gold = keep.of(ctx).num("keep.gold");

  useEffect(() => {
    setScreen(root);
    setNotice(null);
    if (phase === "menu") void refreshBeaconSlots(ctx);
  }, [phase, root, ctx]);

  const back = useCallback(() => {
    if (phase === "paused") resumeRun(ctx);
  }, [phase, ctx]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || armed || settings.isOpen) return;
      if (phase === "playing") {
        event.preventDefault();
        event.stopImmediatePropagation();
        pauseRun(ctx);
        return;
      }
      if (phase !== "menu" && phase !== "paused") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      back();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [armed, back, ctx, phase, settings.isOpen]);

  if (phase !== "menu" && phase !== "paused") return null;

  /** Every document read is real work; the loading block holds the screen while it happens. */
  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 320))]);
    } finally {
      setBusy(null);
    }
  };

  const openSlot = (slot: string) =>
    whileLoading("Opening the keep", async () => {
      await loadSlot(ctx, slot);
      enterRun(ctx);
    });

  const saveHere = () =>
    whileLoading("Writing the keep", async () => {
      const slot = beaconSave(ctx).slot();
      await saveToSlot(ctx, slot);
      setNotice(`Kept in ${KEEP_LABEL[slot] ?? slot}`);
    });

  const keepCount = `${keeps.filter((slot) => !slot.empty).length} of ${keeps.length} keeps held`;

  const titleMenu = (
    <GameMenu
      open={screen === "title"}
      label="Beacon Bastion"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow="Field kit - wave defense"
      logo={{ text: <span className="bb-wordmark">Beacon<br />Bastion</span>, title: "Beacon Bastion" }}
      tagline="Raise the keep, light the beacon, and hold the road the raiders carved."
      items={[
        {
          id: "continue",
          label: "Continue",
          hint: recent === null ? "No defense kept yet" : `${recent.name ?? recent.id}`,
          disabled: recent === null,
        },
        {
          id: "new",
          label: "New defense",
          hint: newKeep === null ? "No keep available" : `Raises ${KEEP_LABEL[newKeep] ?? newKeep}`,
          disabled: newKeep === null,
        },
        { id: "keeps", label: "Load & save", hint: keepCount },
        { id: "settings", label: "Settings", hint: "Sound, picture, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <ContinuePane
              slot={recent}
              emptyMessage="No defense kept yet. Raise a keep and withdraw to the title to hold it."
              onContinue={(slot) => void openSlot(slot.id)}
            />
          );
        }
        if (id === "new") {
          return (
            <NewKeepPane
              slot={newKeep}
              commander={commander}
              onCommanderChange={setCommander}
              onBegin={() => {
                if (newKeep === null) return;
                const slot = newKeep;
                void whileLoading("Raising the keep", async () => {
                  keepProfile.commander = commander.trim() === "" ? null : commander.trim();
                  await prepareKeep(ctx, slot);
                  beginRun(ctx);
                });
              }}
            />
          );
        }
        if (id === "keeps") {
          return (
            <SaveSlotsPane
              model={beaconSlots}
              heading="Keeps"
              columns="auto"
              onContinue={(slot: SaveSlotMeta) => void openSlot(slot.id)}
              onLoad={(slot: SaveSlotMeta) => void openSlot(slot.id)}
              onNew={(slot: SaveSlotMeta) => {
                void whileLoading("Raising the keep", async () => {
                  await prepareKeep(ctx, slot.id);
                  beginRun(ctx);
                });
              }}
              onDelete={(slot: SaveSlotMeta) => {
                beaconSlots.clear(slot.id);
                void beaconSave(ctx).deleteSlot(slot.id).then(() => refreshBeaconSlots(ctx));
              }}
            />
          );
        }
        if (id === "settings") return <SettingsPane onBack={back} onCaptureChange={setArmed} />;
        if (id === "credits") return <CreditsPane sections={BEACON_CREDITS.sections} notice={BEACON_CREDITS.notice} />;
        return null;
      }}
      onHighlight={(id) => {
        if (id === "keeps") void refreshBeaconSlots(ctx);
      }}
      onSelect={(id) => {
        if (id === "continue") {
          if (recent === null) return;
          void openSlot(recent.id);
          return;
        }
        if (id === "new") {
          document.querySelector<HTMLInputElement>("[data-new-keep-name]")?.focus();
          return;
        }
        if (id === "keeps") {
          document.querySelector<HTMLButtonElement>("[data-save-slot-load]")?.focus();
          return;
        }
        if (id === "credits") {
          document.querySelector<HTMLElement>("[data-credits-scroller]")?.focus();
        }
      }}
      footer={<span>Beacon Bastion - the keep remembers - {gold} gold</span>}
      style={MENU_TOKENS as CSSProperties}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={screen === "pause"}
      label="Defense paused"
      onBack={back}
      onResume={() => resumeRun(ctx)}
      logo={{ text: <span className="bb-wordmark">Hold.</span>, title: "Hold" }}
      eyebrow={<WaveLine />}
      tagline="The road is stopped with the simulation: raiders wait where they stood, towers hold their cooldown."
      items={[
        { id: "resume", label: "Hold the line" },
        { id: "save", label: `Save to ${KEEP_LABEL[beaconSave(ctx).slot()] ?? beaconSave(ctx).slot()}`, hint: "Writes this keep where it is" },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Save & withdraw to title" }]}
      detail={(id) =>
        id === "settings" ? (
          <SettingsPane onBack={back} onCaptureChange={setArmed} />
        ) : id === "credits" ? (
          <CreditsPane sections={BEACON_CREDITS.sections} notice={BEACON_CREDITS.notice} />
        ) : null
      }
      onSelect={(id) => {
        if (id === "resume" || id === "back") resumeRun(ctx);
        else if (id === "save") void saveHere();
        else if (id === "title") void whileLoading("Writing the keep", () => withdrawToTitle(ctx, beaconSave(ctx).slot()));
      }}
      footer={<span>{notice ?? `${gold} gold`}</span>}
      style={MENU_TOKENS as CSSProperties}
    />
  );

  return (
    <div className="bb-menu">
      {titleMenu}
      {pauseMenu}
      <LoadingScreen open={busy !== null} title={busy ?? "Loading"} tips={TIPS} scrim="blur" className="bb-loading" />
    </div>
  );
}

/** Beacon's settings, composed from the live controller categories inside its own chrome. */
function SettingsPane({ onBack, onCaptureChange }: { onBack: () => void; onCaptureChange: (armed: boolean) => void }) {
  const settings = useSettings();
  const categories = settings.categories;
  const [chosen, setChosen] = useState<string | null>(null);
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId);

  return (
    <div className="bb-settings" data-menu-settings="">
      <header className="bb-settings-head">
        <span className="bb-eyebrow">Field kit / settings</span>
        <h2>Prepare the keep.</h2>
        <p className="bb-note">
          Every row writes straight to the shell's settings store; the controls list rebinds the same keys the HUD reads.
        </p>
      </header>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div className="bb-settings-body">
        {settings.actions.length > 0 && (
          <div className="bb-actions">
            {settings.actions.map((action) => (
              <HudButton key={action.id} onClick={action.run} variant={action.kind === "danger" ? "danger" : "secondary"}>
                {action.label}
              </HudButton>
            ))}
          </div>
        )}
        {active !== undefined && <SettingsSection category={active} onCaptureChange={(action) => onCaptureChange(action !== null)} />}
      </div>
      <footer className="bb-row">
        <HudButton onClick={onBack}>Back</HudButton>
        <span className="bb-note">Click a tab to change category - Tab reaches every row - Esc returns</span>
      </footer>
    </div>
  );
}






