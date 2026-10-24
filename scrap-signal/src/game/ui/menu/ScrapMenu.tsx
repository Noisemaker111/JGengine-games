import { type CSSProperties, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ContinuePane, CreditsPane } from "@jgengine/react/gameMenuSaves";
import { GameMenu, GamePauseMenu } from "@jgengine/react/gameMenu";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/react/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { useStore } from "@jgengine/react/store";

import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";

import { CHARACTERS } from "../../characters";
import { scrapProfile } from "../../scrapProfile";
import { SCRAP_SLOTS, refreshScrapSlots, scrapSlots } from "../../scrapSlots";
import { characterIdStore, menuRunStartedStore } from "../../stores";
import { CharacterCard } from "../components/Talents";

const SCRAP_TOKENS = {
  "--jg-accent": "#fbbf24",
  "--jg-accent-glow": "rgba(251,191,36,0.3)",
  "--jg-accent-soft": "rgba(251,191,36,0.22)",
  "--jg-text": "#f5f5f4",
  "--jg-text-dim": "rgba(231,229,228,0.66)",
  "--jg-font-display": "\"Arial Black\", \"Arial Narrow\", Impact, sans-serif",
  "--jg-font-body": "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  "--jg-menu-logo-size": "clamp(34px, 5.2vw, 76px)",
  "--jg-menu-card-radius": "2px",
} as const;

/** Capture-only focus request: a shot declares which verb it wants highlighted. */
export const scrapFocus: { id: string | null } = { id: null };

/**
 * Holds the phase at `menu` until a run is started in this page. It reads the phase store, not the
 * simulation clock, so a paused or restored world cannot let the front end slip away.
 */
export function MenuGuard(): null {
  const ctx = useGameContext();
  const phase = useSyncExternalStore(ctx.subscribe, () => gamePhase(ctx), () => gamePhase(ctx));
  const held = useRef(false);
  useEffect(() => {
    if (held.current || menuRunStartedStore.read(ctx).started) return;
    if (phase !== "playing") return;
    held.current = true;
    setGamePhase(ctx, "menu");
    ctx.time.pause();
  }, [ctx, phase]);
  return null;
}

/** Scrap Signal's front end: the carrier's roster over the wastes, the relay board in front. */
export function ScrapMenu(): ReactNode {
  const ctx = useGameContext();

  const { commands } = useGame();
  const phase = useSyncExternalStore(ctx.subscribe, () => gamePhase(ctx), () => gamePhase(ctx));
  const settings = useSettings();
  const character = useStore(characterIdStore);
  const slots = useSaveSlots(scrapSlots);
  const [name, setName] = useState(scrapProfile.name ?? "");
  const [slotId, setSlotId] = useState<string>(SCRAP_SLOTS[0].id);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = slots.find((slot) => !slot.empty) ?? null;
  const paused = phase === "paused";
  // Pause is Operations' own in-game overlay; this menu is the front end only.

  // Refresh the kept-run index when the menu appears, not on every render: the refresh writes the
  // index, the index notifies the pane, and an effect keyed on the context identity would loop.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  useEffect(() => {
    void refreshScrapSlots(ctxRef.current);
  }, [phase]);

  // The boot menu owns the menu phase; a restored reclaimer waits behind it until Continue.
  if (phase !== "menu" || paused) return null;
  if (settings.isOpen) return null;

  return (
    <GameMenu
      label="Scrap Signal"
      data-scrap-phase={phase}
      initialId={scrapFocus.id ?? (recent === null ? "new" : "continue")}
      eyebrow="Ferralon - reactivate, reclaim, rise"
      logo={{ text: <span>Scrap<br />Signal</span>, title: "Scrap Signal" }}
      tagline="A broken carrier. A desert of stolen machines. Reclaim the relay."
      items={[
        { id: "continue", label: "Continue", hint: recent === null ? "No signal kept yet" : `${recent.name ?? "Reclaimer"} - ${String(recent.meta.playtime ?? "")}`, disabled: recent === null },
        { id: "new", label: "New run", hint: "Pick a reclaimer and open the wastes" },
        { id: "settings", label: "Settings", hint: "Sound, picture, controls" },
        { id: "credits", label: "Credits" },
      ]}
      detail={(id) => {
        if (id === "continue") {
          return (
            <ContinuePane
              slot={recent}
              emptyMessage="No run kept yet. Pick a reclaimer and the relay board draws a line."
              onContinue={(slot) => commands.run("run.continue", { slot: slot.id })}
            />
          );
        }
        if (id === "new") {
          return (
            <NewRunPane
              name={name}
              onName={(next) => {
                setName(next);
                scrapProfile.name = next.trim() === "" ? null : next.trim();
              }}
              slotId={slotId}
              onSlot={setSlotId}
              onPick={(characterId) => {
                scrapProfile.name = name.trim() === "" ? null : name.trim();
                commands.run("character.pick", { characterId });
              }}
            />
          );
        }
        if (id === "settings") return <ScrapSettings />;
        if (id === "credits") {
          return (
            <CreditsPane
              heading="Credits"
              sections={[
                { heading: "Scrap Signal", entries: [{ label: "Ferralon and the carrier", detail: "game and art direction" }] },
                { heading: "Assets", entries: [{ label: "KayKit, Quaternius, ambientCG", detail: "CC0 art" }] },
                { heading: "Engine", entries: [{ label: "JGengine", detail: "scene, save, menu" }] },
              ]}
              notice="Original Scrap Signal art. Third-party packs are CC0."
            />
          );
        }
        return null;
      }}
      onSelect={(id) => {
        if (id === "continue") {
          if (recent === null) return;
          commands.run("run.continue", { slot: recent.id });
          return;
        }
        if (id === "new") {
          document.querySelector<HTMLButtonElement>("[data-scrap-character]")?.focus();
        }
      }}
      footer={<span>Scrap Signal - {slots.filter((slot) => !slot.empty).length} runs kept</span>}
      style={SCRAP_TOKENS as CSSProperties}
    />
  );
}

/** The New run pane: call sign, the run's bay, and the roster. */
function NewRunPane({
  name,
  onName,
  slotId,
  onSlot,
  onPick,
}: {
  name: string;
  onName: (next: string) => void;
  slotId: string;
  onSlot: (id: string) => void;
  onPick: (characterId: string) => void;
}): ReactNode {
  return (
    <div data-new-run-pane="" style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>New run</div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
        <span style={{ fontSize: "var(--jg-type-xs)", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(231,229,228,0.6)" }}>
          Call sign
        </span>
        <input
          data-new-run-name=""
          value={name}
          maxLength={24}
          placeholder="Name the reclaimer"
          onChange={(event) => onName(event.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 2,
            border: "1px solid rgba(251,191,36,0.35)",
            background: "rgba(12,10,8,0.72)",
            color: "#f5f5f4",
            fontFamily: "var(--jg-font-display)",
            fontSize: "var(--jg-type-xl)",
            fontWeight: 700,
            outline: "none",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SCRAP_SLOTS.map((slot) => (
          <button
            key={slot.id}
            type="button"
            data-scrap-slot={slot.id}
            aria-pressed={slot.id === slotId}
            onClick={() => onSlot(slot.id)}
            style={{
              padding: "4px 10px",
              borderRadius: 2,
              border: slot.id === slotId ? "1px solid #fbbf24" : "1px solid rgba(120,113,108,0.5)",
              background: slot.id === slotId ? "rgba(251,191,36,0.14)" : "rgba(12,10,8,0.5)",
              color: "#f5f5f4",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {slot.label}
          </button>
        ))}
      </div>
      <div data-scrap-roster="" style={{ display: "flex", gap: 10, flexWrap: "wrap", overflowY: "auto", scrollbarGutter: "stable", minHeight: 0 }}>
        {CHARACTERS.map((character) => (
          <div key={character.id} data-scrap-character={character.id}>
            <CharacterCard character={character} onPick={() => onPick(character.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The shell's settings, drawn inside the menu's pane. */
function ScrapSettings(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const categories = settings.categories;
  const activeId = chosen !== null && categories.some((category) => category.id === chosen) ? chosen : (categories[0]?.id ?? "");
  const active = categories.find((category) => category.id === activeId) ?? null;
  return (
    <div data-scrap-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
      <div style={{ fontFamily: "var(--jg-font-display)", fontSize: "var(--jg-type-xxl)", fontWeight: 800 }}>Settings</div>
      <SettingsTabs categories={categories} activeId={activeId} onSelect={setChosen} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {active === null ? null : <SettingsSection category={active} heading={false} />}
      </div>
    </div>
  );
}














