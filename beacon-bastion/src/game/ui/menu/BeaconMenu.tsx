import { type ReactNode, useCallback, useEffect, useState } from "react";
import { PauseMenu } from "@jgengine/react";
import { CreditsPanel } from "@jgengine/react/creditsPanel";
import { HudButton } from "@jgengine/react/hudButton";
import { useGamePhase } from "@jgengine/react/hooks";
import { LoadingScreen } from "@jgengine/react/loadingScreen";
import { useMenuRouter } from "@jgengine/react/menuRouter";
import { MenuScreen } from "@jgengine/react/menuScreen";
import { useGameContext } from "@jgengine/react/provider";
import { SaveSlotMenu, relativeSavedAt, useSaveSlots } from "@jgengine/react/saveSlots";
import type { SaveSlotMeta } from "@jgengine/core/game/saveSlots";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { TitleMenu } from "@jgengine/react/titleMenu";

import { BEACON_CREDITS } from "../../credits";
import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { beginRun, continueNewest, enterRun, pauseRun, resumeRun, withdrawToTitle } from "../../menu";
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

type Screen = "title" | "pause" | "keeps" | "settings" | "credits";

/** SaveSlot cards in Beacon's field-kit palette rather than the neutral default. */
const KEEP_THEME = {
  accent: "#d8c169",
  cardBg: "linear-gradient(160deg, rgba(28,32,19,0.94), rgba(10,11,7,0.96))",
  cardBorder: "1px solid #454a35",
  text: "#e6e8d8",
  muted: "#95997f",
  chipBg: "rgba(127,184,74,0.14)",
  fontFamily: "\"Arial Narrow\", \"Roboto Condensed\", \"Segoe UI\", sans-serif",
  radius: "2px",
};

const TIPS = [
  "Raiders walk the carved road; towers shoot what is in reach.",
  "Waiting sends the next wave with a gold bonus - and a longer road.",
  "Every keep is a separate document: the newest one is what Continue opens.",
  "Pause saves nothing by itself. Withdraw to the title to keep a defense.",
];

function Legend() {
  return (
    <div className="bb-legend" aria-hidden="true">
      <span><b>1–3</b> pick tower</span>
      <span><b>Click ring</b> raise tower</span>
      <span><b>Right-click</b> inspect</span>
      <span><b>Space</b> send wave</span>
      <span><b>Esc</b> pause</span>
    </div>
  );
}

function WaveLine() {
  const wave = Math.min(currentWaveNumber(), TOTAL_WAVES);
  const standing = session.creeps.size;
  return (
    <span className="bb-eyebrow">
      Wave {wave} / {TOTAL_WAVES} · {standing} raider{standing === 1 ? "" : "s"} on the road
    </span>
  );
}

/** Beacon's front-end: the keep's own palette over the live arena, every screen from the SDK blocks. */
export function BeaconMenu() {
  const ctx = useGameContext();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const root: Screen = phase === "paused" ? "pause" : "title";
  const router = useMenuRouter<Screen>(root, { escapeToBack: false });
  const keeps = useSaveSlots(beaconSlots);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = beaconSlots.mostRecent();
  const emptyKeep = firstEmptyKeep();
  const newKeep = keepForNewRun();
  const gold = ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY);

  const { reset } = router;
  useEffect(() => {
    reset(root);
    setNotice(null);
    if (phase === "menu") void refreshBeaconSlots(ctx);
  }, [phase, root, reset, ctx]);

  const back = useCallback(() => {
    if (!router.atRoot) {
      router.back();
      return;
    }
    if (phase === "paused") resumeRun(ctx);
  }, [router, phase, ctx]);

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
      // Long enough to read the tip, short enough that a local document never feels slow.
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

  const screens: Record<Screen, ReactNode> = {
    title: (
      <TitleMenu
        eyebrow="Field kit · wave defense"
        title={<span className="bb-wordmark">Beacon<br />Bastion</span>}
        tagline="Raise the keep, light the beacon, and hold the road the raiders carved."
        items={[
          {
            id: "continue",
            label: "Continue",
            hint: recent === null
              ? "No defense kept yet"
              : `${recent.name ?? recent.id} · saved ${recent.savedAt === undefined ? "recently" : relativeSavedAt(recent.savedAt)}`,
            primary: recent !== null,
            disabled: recent === null,
          },
          {
            id: "new",
            label: "New defense",
            hint: newKeep === null
              ? "No keep available"
              : emptyKeep === newKeep
                ? `Raise the first tower in ${KEEP_LABEL[newKeep] ?? newKeep}`
                : `Every keep is held - replaces the oldest (${KEEP_LABEL[newKeep] ?? newKeep})`,
            disabled: newKeep === null,
          },
          { id: "keeps", label: "Load & save", hint: `${keeps.filter((slot) => !slot.empty).length} of ${keeps.length} keeps held` },
          { id: "settings", label: "Settings", hint: "Sound, picture, controls" },
          { id: "credits", label: "Credits" },
        ]}
        onSelect={(id) => {
          if (id === "continue") {
            void whileLoading("Opening the keep", async () => {
              const resumed = await continueNewest(ctx);
              if (!resumed) setNotice("No defense kept yet");
            });
            return;
          }
          if (id === "new") {
            const slot = keepForNewRun();
            if (slot === null) return;
            void whileLoading("Raising the keep", async () => {
              await prepareKeep(ctx, slot);
              beginRun(ctx);
            });
            return;
          }
          router.open(id as Screen);
        }}
        footer={<span>Beacon Bastion · the keep remembers</span>}
        controlHint="Arrows move · Enter select · Esc back"
      >
        <Legend />
      </TitleMenu>
    ),

    keeps: (
      <MenuScreen transition="slide" scrim="dim" label="Keeps" open>
        <div className="bb-column">
          <SaveSlotMenu
            model={beaconSlots}
            title="Keeps"
            theme={KEEP_THEME}
            metaIcons={{ gold: "coin", lives: "heart", wave: "flag" }}
            onContinue={(slot: SaveSlotMeta) => void openSlot(slot.id)}
            onLoad={(slot: SaveSlotMeta) => void openSlot(slot.id)}
            onNew={(slot: SaveSlotMeta) => {
              void whileLoading("Raising the keep", async () => {
                await prepareKeep(ctx, slot.id);
                beginRun(ctx);
              });
            }}
          />
          <div className="bb-row">
            <HudButton onClick={back}>Back</HudButton>
            {notice !== null && <span className="bb-note" role="status">{notice}</span>}
          </div>
        </div>
      </MenuScreen>
    ),

    settings: (
      <MenuScreen transition="slide" scrim="dim" label="Settings" open>
        <SettingsPane onBack={back} onCaptureChange={setArmed} />
      </MenuScreen>
    ),

    credits: <CreditsPanel document={BEACON_CREDITS} onBack={back} title="Beacon Bastion / credits" backLabel="Back to the keep" open />,

    pause: (
      <MenuScreen transition="scale" scrim="dim" label="Defense paused" open>
        <div className="bb-pause">
          <WaveLine />
          <h2 className="bb-pause-title">Hold.</h2>
          <p className="bb-note">
            The road is stopped with the simulation: raiders wait where they stood, towers hold their cooldown.
          </p>
          <PauseMenu
            title="Defense paused"
            resumeLabel="Hold the line"
            onResume={() => resumeRun(ctx)}
            width={320}
            items={[
              { id: "settings", label: "Settings", onSelect: () => router.open("settings") },
              { id: "save", label: `Save to ${KEEP_LABEL[beaconSave(ctx).slot()] ?? beaconSave(ctx).slot()}`, onSelect: () => void saveHere() },
              { id: "credits", label: "Credits", onSelect: () => router.open("credits") },
              {
                id: "title",
                label: "Save & withdraw to title",
                danger: true,
                onSelect: () => void whileLoading("Writing the keep", () => withdrawToTitle(ctx, beaconSave(ctx).slot())),
              },
            ]}
          />
          {notice !== null && <p className="bb-note" role="status">{notice} · {gold} gold</p>}
        </div>
      </MenuScreen>
    ),
  };

  return (
    <div className="bb-menu">
      {screens[router.current]}
      <LoadingScreen
        open={busy !== null}
        title={busy ?? "Loading"}
        tips={TIPS}
        scrim="blur"
        className="bb-loading"
      />
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
    <div className="bb-settings">
      <header className="bb-settings-head">
        <span className="bb-eyebrow">Field kit / settings</span>
        <h2>Prepare the keep.</h2>
        <p className="bb-note">Every row writes straight to the shell's settings store; the controls list rebinds the same keys the HUD reads.</p>
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
        <span className="bb-note">Click a tab to change category · Tab reaches every row · Esc returns</span>
      </footer>
    </div>
  );
}

