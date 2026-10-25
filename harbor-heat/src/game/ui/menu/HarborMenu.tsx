import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { createSaveSlots, type SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { formatSavePlaytime, gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/game/saveSlotIndex";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { useStore } from "@jgengine/react/store";

import { startedStore } from "../../commands";
import { captureHarborThumb, harborProfile } from "../../menuProfile";
import { harborSave, loadHarborSave, saveHarborState } from "../../save";
import { sessionStore } from "../../session";

/** Harbor's dispatch bays; a parcel run is kept in one of them. */
export const HARBOR_BAYS = [
  { id: "coast", label: "The Coast" },
  { id: "docks", label: "The Docks" },
  { id: "uptown", label: "Uptown" },
] as const;

import { harborFocus } from "./menuFocus";
import { LIBRARY_CREDITS } from "../../world/props";

const MENU_TOKENS = {
  "--jg-accent": "#ffb020",
  "--jg-accent-glow": "rgba(255,176,32,0.28)",
  "--jg-accent-soft": "rgba(255,176,32,0.22)",
  "--jg-text": "#fff6e6",
  "--jg-text-dim": "rgba(255,236,205,0.66)",
  "--jg-font-display": "\"Arial Black\", \"Arial Narrow\", Impact, sans-serif",
  "--jg-font-body": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(34px, 5.4vw, 78px)",
  "--jg-menu-card-radius": "2px",
  // Harbor cards carry a name, a playtime line, three chips and two buttons.
  "--jg-menu-card-height": "clamp(272px, 31vh, 320px)",
  // The HUD root is pointer-events-none so the canvas owns the mouse; the menu must take it back.
  pointerEvents: "auto",
} as const;

const harborSlots = createSaveSlots({
  capacity: HARBOR_BAYS.length,
  slots: HARBOR_BAYS.map((bay) => ({ id: bay.id, empty: true, meta: {} })),
});

/** Keep the slot index in step with the dispatch documents. */
export async function refreshHarborSlots(ctx: ReturnType<typeof useGameContext>): Promise<void> {
  await refreshSaveSlots(gameSaveSlotSource(harborSave(ctx)), harborSlots, {
    nameOf: (_slot, document) => {
      const profile = (document.systems.profile ?? {}) as { driver?: string | null };
      return typeof profile.driver === "string" && profile.driver.length > 0 ? profile.driver : "Courier";
    },
    metaOf: (_slot, document) => {
      const run = (document.systems.run ?? {}) as { courierSession?: { closed?: number; session?: number } };
      const profile = (document.systems.profile ?? {}) as { driver?: string | null; thumbnail?: string | null };
      return {
        ...(typeof profile.driver === "string" && profile.driver.length > 0 ? { character: profile.driver } : {}),
        parcels: Math.max(0, run.courierSession?.closed ?? 0),
        runs: Math.max(0, run.courierSession?.session ?? 0),
        playtime: formatSavePlaytime(document.playtime),
        ...(typeof profile.thumbnail === "string" && profile.thumbnail.length > 0 ? { thumbnail: profile.thumbnail } : {}),
      };
    },
  });
}

/** Started flag the shell reveals play chrome with. */
export function useGameStarted(): boolean {
  return useStore(startedStore, (value) => value === true);
}

function NewDispatchPane({ name, onName, onBegin }: { name: string; onName: (next: string) => void; onBegin: () => void }): ReactNode {
  const trimmed = name.trim();
  return (
    <div data-new-dispatch-pane="" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800, letterSpacing: "0.02em" }}>
        Hit the street
      </div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(255,236,205,0.72)", maxWidth: "46ch" }}>
        A courier needs a name on the dispatch board. It goes on every parcel receipt from here.
      </p>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: "var(--jg-type-xs)", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,236,205,0.6)" }}>
          Courier name
        </span>
        <input
          data-new-dispatch-name=""
          value={name}
          maxLength={24}
          placeholder="Name the courier"
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onBegin();
            }
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 2,
            border: "1px solid rgba(255,176,32,0.35)",
            background: "rgba(10,11,7,0.72)",
            color: "#fff6e6",
            fontFamily: "var(--jg-font-display)",
            fontSize: "var(--jg-type-xl)",
            fontWeight: 700,
            outline: "none",
          }}
        />
      </label>
      <button
        type="button"
        data-new-dispatch-start=""
        disabled={trimmed.length === 0}
        onClick={onBegin}
        style={{
          alignSelf: "flex-start",
          padding: "11px 22px",
          borderRadius: 2,
          border: "none",
          background: trimmed.length === 0 ? "rgba(148,163,184,0.24)" : "#ffb020",
          color: "#141609",
          fontFamily: "var(--jg-font-display)",
          fontSize: "var(--jg-type-lg)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: trimmed.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        Take the run
      </button>
    </div>
  );
}

/** Harbor Heat's front end: the coast lives behind it, the dispatch board in front. */
export function HarborMenu(): ReactNode {
  const ctx = useGameContext();
  const { commands } = useGame();
  const session = useStore(sessionStore, (value) => value);
  const started = useGameStarted();
  const settings = useSettings();
  const bays = useSaveSlots(harborSlots);
  const [name, setName] = useState(harborProfile.driver ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = harborSlots.mostRecent();
  const paused = session.paused === true;

  useEffect(() => {
    void refreshHarborSlots(ctx);
  }, [ctx, started]);

  const saveHere = useCallback(async () => {
    setBusy(true);
    try {
      harborProfile.driver = name.trim() === "" ? harborProfile.driver : name.trim();
      await captureHarborThumb();
      await saveHarborState(ctx);
      await refreshHarborSlots(ctx);
      setNotice("Dispatch board updated.");
    } finally {
      setBusy(false);
    }
  }, [ctx, name]);

  const openBay = async (slot: string) => {
    setBusy(true);
    try {
      if (harborSave(ctx).slot() !== slot) await harborSave(ctx).switchSlot(slot, { flush: false });
      const loaded = await loadHarborSave(ctx);
      if (!loaded) setNotice("That bay is empty.");
      commands.run("game.start", {});
    } finally {
      setBusy(false);
    }
  };

  const beginIn = async (slot: string) => {
    setBusy(true);
    try {
      if (harborSave(ctx).slot() !== slot) await harborSave(ctx).switchSlot(slot, { flush: false });
      harborProfile.driver = name.trim() === "" ? "Courier" : name.trim();
      await saveHarborState(ctx);
      await refreshHarborSlots(ctx);
      commands.run("game.start", {});
    } finally {
      setBusy(false);
    }
  };

  if (!started) {
    return (
      <GameMenu
        label="Harbor Heat"
        initialId={harborFocus.id ?? (recent === null ? "new" : "continue")}
        eyebrow="Mainsail dispatch - coastal courier"
        logo={{ text: <span className="hh-wordmark">Harbor<br />Heat</span>, title: "Harbor Heat" }}
        tagline="Golden coast. Hot cargo. One more run before sundown."
        items={[
          { id: "continue", label: "Continue", hint: recent === null ? "No run on the board" : `${recent.name ?? recent.id}`, disabled: recent === null },
          { id: "new", label: "Hit the street", hint: "Take a fresh dispatch" },
          { id: "keeps", label: "Missions & parcels", hint: `${bays.filter((bay) => !bay.empty).length} of ${bays.length} bays kept` },
          { id: "settings", label: "Settings", hint: "Sound, picture, controls" },
          { id: "credits", label: "Credits" },
        ]}
        detail={(id) => {
          if (id === "continue") {
            return <ContinuePane slot={recent} emptyMessage="No dispatch kept yet. Take a run and save at the board." onContinue={(slot) => void openBay(slot.id)} />;
          }
          if (id === "new") {
            return <NewDispatchPane name={name} onName={setName} onBegin={() => void beginIn(bayForNew())} />;
          }
          if (id === "keeps") {
            return (
              <SaveSlotsPane
                model={harborSlots}
                heading="Missions & parcels"
                columns="auto"
                onContinue={(slot: SaveSlotMeta) => void openBay(slot.id)}
                onLoad={(slot: SaveSlotMeta) => void openBay(slot.id)}
                onNew={(slot: SaveSlotMeta) => void beginIn(slot.id)}
                onDelete={(slot: SaveSlotMeta) => {
                  harborSlots.clear(slot.id);
                  void harborSave(ctx).deleteSlot(slot.id).then(() => refreshHarborSlots(ctx));
                }}
              />
            );
          }
          if (id === "settings") return <HarborSettings />;
          if (id === "credits") {
            return (
              <CreditsPane
                heading="Credits"
                sections={[
                  { heading: "Harbor Heat", entries: [{ label: "Mainsail dispatch", detail: "game and art direction" }] },
                  {
                    heading: "Assets",
                    entries: [
                      { label: "ambientCG", detail: "CC0 brick and glass facades, asphalt, concrete, ground" },
                      ...LIBRARY_CREDITS.map((line) => ({ label: line.slice(0, line.indexOf(" by ")), detail: line.slice(line.indexOf(" by ") + 4) })),
                      { label: "KayKit", detail: "CC0 cars, people, aircraft, signs, cargo" },
                    ],
                  },
                  { heading: "Engine", entries: [{ label: "JGengine", detail: "scene, save, menu" }] },
                ]}
                notice="Original Mainsail art. Third-party models and materials are CC0."
              />
            );
          }
          return null;
        }}
        onSelect={(id) => {
          if (id === "continue" && recent !== null) {
            void openBay(recent.id);
            return;
          }
          if (id === "new") {
            document.querySelector<HTMLInputElement>("[data-new-dispatch-name]")?.focus();
            return;
          }
          if (id === "keeps") document.querySelector<HTMLButtonElement>("[data-save-slot-load]")?.focus();
        }}
        footer={<span>Harbor Heat - the dispatch remembers{notice === null ? "" : ` - ${notice}`}{busy ? " - saving" : ""}</span>}
        style={MENU_TOKENS as CSSProperties}
      />
    );
  }

  if (!paused) return null;

  return (
    <GamePauseMenu
      open
      label="Off the clock"
      onResume={() => commands.run("session.pause", { paused: false })}
      eyebrow="Off the clock"
      logo={{ text: <span className="hh-wordmark">Harbor<br />Heat</span>, title: "Harbor Heat" }}
      tagline="The city and the delivery clock are paused. Your story stays right here."
      items={[
        { id: "resume", label: "Back to the coast" },
        { id: "save", label: "Save progress", hint: "Writes this bay where it stands" },
        { id: "settings", label: "Settings & controls" },
      ]}
      detail={(id) =>
        id === "settings" ? (
          <HarborSettings />
        ) : id === "save" ? (
          <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(255,236,205,0.7)" }}>
            {notice ?? "Saving keeps the bay, the parcel and the clock as they stand."}
          </p>
        ) : null
      }
      onSelect={(id) => {
        if (id === "resume") commands.run("session.pause", { paused: false });
        else if (id === "save") void saveHere();
      }}
      footer={<span>{settings.isOpen ? "" : `${bays.filter((bay) => !bay.empty).length} bays kept`}</span>}
      style={MENU_TOKENS as CSSProperties}
    />
  );
}

function bayForNew(): string {
  const empty = harborSlots.list().find((slot) => slot.empty);
  if (empty !== undefined) return empty.id;
  const held = harborSlots.list().sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? HARBOR_BAYS[0].id;
}

/** The shell's settings, drawn inside the menu's pane. */
function HarborSettings(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-harbor-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>Settings</div>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </div>
  );
}






