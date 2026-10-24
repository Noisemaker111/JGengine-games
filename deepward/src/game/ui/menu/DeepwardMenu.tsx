import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ContinuePane, CreditsPane, SaveSlotsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { useStore } from "@jgengine/react/store";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";

import { DEEPWARD_CREDITS } from "../../credits";
import { loadRecordSlot, beginRecordSlot, openTitle, persistRecord, recordOf, withdrawToTitle, viewStore } from "../../controls";
import { captureRecordThumb, recordLabel, recordSlots, refreshRecordSlots } from "../../menuRecord";

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const menuFocus: { id: string | null } = { id: null };

/** Deepward's print-service palette, handed to the menu as tokens rather than a preset. */
const MENU_TOKENS = {
  "--jg-accent": "#d7b774",
  "--jg-accent-soft": "rgba(215,183,116,0.24)",
  "--jg-accent-glow": "rgba(215,183,116,0.3)",
  "--jg-text": "#ede9d9",
  "--jg-text-dim": "rgba(213,220,205,0.66)",
  "--jg-font-display": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-font-body": "\"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(32px, 5vw, 68px)",
  "--jg-menu-card-radius": "2px",
} as const;

type Screen = "title" | "pause";

/** The record a new dive would replace, so a full profile says which Life it is asking about. */
function replaceable(): string | null {
  const held = recordSlots.list().sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? null;
}

/** The words a dive is described in: where it stands, what it carries, whose Life it is. */
function DiveLine() {
  const view = useStore(viewStore);
  const dive = view.dive;
  if (dive === null) {
    return <span>Halloway / Life {view.home.life} / {view.home.stash.length} banked</span>;
  }
  return <span>Life {view.home.life} / carry {dive.cache.length} / air {Math.ceil(dive.oxygen)}s</span>;
}

/** The New dive pane: a fresh Life starts at the home, ready to walk to the garage. */
function NewDivePane({ slot, onBegin }: { slot: string | null; onBegin: () => void }): ReactNode {
  const occupancy = recordSlots.get(slot ?? "");
  const replacing = occupancy !== null && !occupancy.empty;
  return (
    <div data-new-dive-pane="" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800, letterSpacing: "0.02em" }}>
        New dive
      </div>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: "rgba(213,220,205,0.72)", maxWidth: "46ch" }}>
        A Life starts at the home with the issue sidearm. Walk to the garage, take the rail to Bellwether,
        and come back with the haul before the air runs out.
      </p>
      <p style={{ margin: 0, fontSize: "var(--jg-type-md)", color: replacing ? "#e6b079" : "rgba(213,220,205,0.72)" }}>
        {slot === null
          ? "Every record is held."
          : replacing
            ? `${recordLabel(slot)} is held; a new dive replaces it.`
            : `This writes ${recordLabel(slot)}.`}
      </p>
      <button
        type="button"
        data-new-dive-start=""
        onClick={onBegin}
        disabled={slot === null}
        style={{
          alignSelf: "flex-start",
          padding: "11px 22px",
          borderRadius: 2,
          border: "none",
          background: slot === null ? "rgba(148,163,184,0.24)" : "#d7b774",
          color: "#172529",
          fontFamily: "var(--jg-font-display)",
          fontSize: "var(--jg-type-lg)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: slot === null ? "not-allowed" : "pointer",
        }}
      >
        Take the rail
      </button>
    </div>
  );
}

/**
 * Deepward's front end: the record list lives over the station, with its own words for a dive, a
 * haul, the return and the home. Continue re-reads the saved record it names.
 */
export function DeepwardMenu(): ReactNode {
  const ctx = useGameContext();
  const phase = useOptionalGamePhase();
  const settings = useSettings();
  const view = useStore(viewStore);
  const slots = useSaveSlots(recordSlots);
  const [screen, setScreen] = useState<Screen>(phase === "paused" ? "pause" : "title");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = recordSlots.mostRecent();
  const emptySlot = slots.find((slot) => slot.empty)?.id ?? replaceable();
  const open = recordOf(ctx)?.slot() ?? "marrow";

  useEffect(() => {
    setScreen(phase === "paused" ? "pause" : "title");
    setNotice(null);
    if (phase === "menu") void refreshRecordSlots(ctx);
  }, [phase, ctx]);

  const back = useCallback(() => {
    if (phase === "paused") {
      ctx.game.commands.run(view.mode === "home" || view.mode === "dive" ? "deepward.close" : "deepward.pause", {});
      return;
    }
    openTitle(ctx);
  }, [ctx, phase, view.mode]);

  if (phase !== "menu" && phase !== "paused") return null;

  /** Every record read and write is real work; the label holds the surface while it happens. */
  const whileLoading = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 280))]);
    } finally {
      setBusy(null);
    }
  };

  const openRecord = (slot: string) =>
    whileLoading("Reading the record", async () => {
      await loadRecordSlot(ctx, slot);
      await refreshRecordSlots(ctx);
    });

  const startNew = (slot: string | null) => {
    if (slot === null) return;
    void whileLoading("Printing the record", async () => {
      await beginRecordSlot(ctx, slot, recordSlots.get(slot)?.empty === false);
      await refreshRecordSlots(ctx);
    });
  };

  const saveHere = () =>
    whileLoading("Writing the record", async () => {
      await captureRecordThumb();
      await persistRecord(ctx);
      await refreshRecordSlots(ctx);
      setNotice(`Written to ${recordLabel(open)}`);
    });

  const titleMenu = (
    <GameMenu
      open={screen === "title"}
      label="Deepward"
      initialId={menuFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow="Halloway municipal print service / 06"
      logo={{ text: <span className="dw-wordmark">Deepward<span>/ Marrow</span></span>, title: "Deepward" }}
      tagline="Air is the clock. Bank what you can carry, and take the rail before it runs out."
      items={[
        {
          id: "continue",
          label: "Continue dive",
          hint: recent === null ? "No record on this profile" : (recent.name ?? recordLabel(recent.id)),
          disabled: recent === null,
        },
        {
          id: "new",
          label: "New dive",
          hint: emptySlot === null ? "No record available" : `Writes ${recordLabel(emptySlot)}`,
          disabled: emptySlot === null,
        },
        { id: "records", label: "Dives & hauls", hint: `${slots.filter((slot) => !slot.empty).length} of ${slots.length} records held` },
        { id: "settings", label: "Settings", hint: "Sound, picture, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <ContinuePane
              slot={recent}
              emptyMessage="No dive kept yet. Take the rail, pack a haul and save it from the pause menu."
              onContinue={(slot) => void openRecord(slot.id)}
            />
          );
        }
        if (id === "new") return <NewDivePane slot={emptySlot} onBegin={() => startNew(emptySlot)} />;
        if (id === "records") {
          return (
            <SaveSlotsPane
              model={recordSlots}
              heading="Dives & hauls"
              columns="auto"
              onContinue={(slot: SaveSlotMeta) => void openRecord(slot.id)}
              onLoad={(slot: SaveSlotMeta) => void openRecord(slot.id)}
              onNew={(slot: SaveSlotMeta) => startNew(slot.id)}
              onDelete={(slot: SaveSlotMeta) => {
                void whileLoading("Burning the record", async () => {
                  recordSlots.clear(slot.id);
                  await recordOf(ctx)?.deleteSlot(slot.id);
                  await refreshRecordSlots(ctx);
                });
              }}
            />
          );
        }
        if (id === "settings") return <RecordSettings />;
        if (id === "credits") return <CreditsPane sections={DEEPWARD_CREDITS.sections} notice={DEEPWARD_CREDITS.notice} heading="Deepward" />;
        return null;
      }}
      onHighlight={(id) => {
        if (id === "records") void refreshRecordSlots(ctx);
      }}
      onSelect={(id) => {
        if (id === "continue" && recent !== null) void openRecord(recent.id);
        else if (id === "records") void refreshRecordSlots(ctx);
      }}
      footer={<span>Marrow / {recordLabel(open)} · Life {view.home.life} · {view.home.bank.banked} scrip · {notice ?? "one record per slot"}</span>}
      style={MENU_TOKENS}
    />
  );

  const pauseMenu = (
    <GamePauseMenu
      open={screen === "pause"}
      label={view.dive === null ? "The home is held" : "The dive is held"}
      onBack={back}
      onResume={back}
      logo={{ text: <span className="dw-wordmark">Hold.</span>, title: "Hold" }}
      eyebrow={<DiveLine />}
      tagline="Air and prints are stopped with the simulation: the tank does not count while this is open."
      items={[
        { id: "resume", label: view.dive === null ? "Back to the home" : "Back to the dive" },
        { id: "save", label: `Save to ${recordLabel(open)}`, hint: "Writes this Life and its haul where it stands" },
        { id: "settings", label: "Settings" },
        { id: "credits", label: "Credits" },
      ]}
      secondary={[{ id: "title", label: "Save & return to the home" }]}
      detail={(id) =>
        id === "settings" ? (
          <RecordSettings />
        ) : id === "credits" ? (
          <CreditsPane sections={DEEPWARD_CREDITS.sections} notice={DEEPWARD_CREDITS.notice} heading="Deepward" />
        ) : null
      }
      onSelect={(id) => {
        if (id === "resume") back();
        else if (id === "save") void saveHere();
        else if (id === "title") void whileLoading("Writing the record", () => withdrawToTitle(ctx));
      }}
      footer={<span>{notice ?? `${view.home.bank.banked} scrip banked · Life ${view.home.life}`}</span>}
      style={MENU_TOKENS}
    />
  );

  return (
    <div className="dw-menu">
      {titleMenu}
      {pauseMenu}
      {busy !== null && (
        <div className="dw-menu-busy" role="status" aria-live="polite">
          <span>{busy}</span>
        </div>
      )}
    </div>
  );
}

/** The shell's settings, drawn inside the record pane. */
function RecordSettings(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-deepward-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>Settings</div>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </div>
  );
}
