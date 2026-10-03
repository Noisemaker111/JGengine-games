import { HudCanvas, HudPanel, useHudLayout, usePanels } from "@jgengine/react";
import { useGame, useGameStore, usePlayer } from "@jgengine/react/hooks";
import { useKeyedStore } from "@jgengine/react/store";
import { useEffect, type CSSProperties } from "react";
import { useHudViewport } from "@jgengine/react/hudViewport";

import { bankStore, cinematicStore, classStore, dialogueStore, mailOpenStore, panelStore, shopStore } from "../session/stores";
import { ActionBar, CastBar, XpBar } from "./components/ActionBar";
import { ChatLog } from "./components/ChatLog";
import { AuctionPanel } from "./components/Auction";
import { ClassSelect } from "./components/ClassSelect";
import { DialoguePanel } from "./components/Dialogue";
import { BankPanel } from "./components/Bank";
import { CraftingPanel, FishingOverlay } from "./components/Crafting";
import { Minimap } from "./components/Minimap";
import { BagsPanel, CharacterPanel, LockpickPanel, QuestLogPanel, VendorPanel } from "./components/Panels";
import { SpellbookPanel } from "./components/Spellbook";
import { SwingTimer } from "./components/SwingTimer";
import { TalentPanel } from "./components/Talents";
import {
  DeathOverlay,
  KillLootToasts,
  LevelUpOverlay,
  QuestTracker,
  ZoneLabel,
} from "./components/Overlays";
import { ArenaPanel, FiestaBanner, FiestaHud } from "./components/Arena";
import { DelveHud, MailPanel, ValeCupHud, YumiHud } from "./components/ContentPanels";
import { FieldMenu, FieldWindows, FIELD_WINDOWS } from "./components/FieldMenu";
import { PlayerFrame, TargetFrame } from "./components/UnitFrames";

function SkipIntro() {
  const { commands } = useGame();
  const { userId } = usePlayer();
  const active = useKeyedStore(cinematicStore, userId);
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") commands.run("cinematic.skip", {});
    };
    window.addEventListener("keydown", onKey);
    const timeout = window.setTimeout(() => commands.run("cinematic.skip", {}), 9000);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timeout);
    };
  }, [active, commands]);
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={() => commands.run("cinematic.skip", {})}
      className="lantern-panel pointer-events-auto absolute bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-md px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#c8a838] transition hover:border-[#ffd100] hover:text-[#ffd100]"
      style={{ fontFamily: "var(--lantern-font-display)" }}
    >
      Skip Intro (Esc)
    </button>
  );
}

const SURFACE_WINDOW = [{ id: "surfaces", title: "Field window" }] as const;
const UI_WINDOWS = [...FIELD_WINDOWS, ...SURFACE_WINDOW];
const PANEL_CLOSE: Record<string, string> = { bags: "openBags", character: "openCharacter", quests: "openQuestLog", spellbook: "openSpellbook", talents: "openTalents", crafting: "craft.open", arena: "openArena" };

export function GameUI() {
  const { commands } = useGame();
  const uiScale = useHudViewport()?.userScale ?? 1;
  const viewportStyle = { "--lantern-hud-width": `calc(100vw / ${uiScale})`, "--lantern-hud-height": `calc(100dvh / ${uiScale})` } as CSSProperties;
  const { userId } = usePlayer();
  const layout = useHudLayout({ storageKey: "lantern-reach-hud" });
  const classId = useKeyedStore(classStore, userId);
  const panel = useKeyedStore(panelStore, userId);
  const shopOpen = useKeyedStore(shopStore, userId, (id) => id !== null);
  const dialogueOpen = useKeyedStore(dialogueStore, userId, (id) => id !== null);
  const bankOpen = useKeyedStore(bankStore, userId);
  const mailOpen = useKeyedStore(mailOpenStore, userId);
  const lockpickOpen = useGameStore((ctx) => ctx.game.store.get(`lockpick:${userId}`) !== undefined);
  const auctionOpen = useGameStore((ctx) => ctx.game.store.get(`auction:${userId}`) === true);
  const surfaceOpen = panel !== null || shopOpen || dialogueOpen || bankOpen || mailOpen || lockpickOpen || auctionOpen;
  const surfaces = usePanels(UI_WINDOWS, { onClose: (id) => {
    if (id !== "surfaces") return;
    if (panel !== null && PANEL_CLOSE[panel] !== undefined) commands.run(PANEL_CLOSE[panel]!, {});
    if (dialogueOpen) commands.run("dialogue.close", {});
    if (shopOpen) commands.run("shop.close", {});
    if (bankOpen) commands.run("bank.close", {});
    if (mailOpen) commands.run("mail.close", {});
    if (lockpickOpen) commands.run("lockpick.close", {});
    if (auctionOpen) commands.run("auction.close", {});
  } });
  useEffect(() => {
    if (surfaceOpen && !surfaces.isOpen("surfaces")) surfaces.open("surfaces");
    if (!surfaceOpen && surfaces.isOpen("surfaces")) surfaces.close("surfaces");
  }, [surfaceOpen, surfaces]);
  if (classId === null) return <ClassSelect />;
  return (
    <>
      <HudCanvas layout={layout} className="lantern-hud" style={viewportStyle}>
        <HudPanel id="player" anchor="top-left" priority="critical" inset={{ x: 18, y: 18 }}><PlayerFrame /></HudPanel>
        <HudPanel id="target" anchor="top-left" priority="critical" inset={{ x: 18, y: 18 }}>
          <TargetFrame />
        </HudPanel>
        <HudPanel id="zone" anchor="top" inset={{ x: 0, y: 12 }}>
          <ZoneLabel />
        </HudPanel>
        <HudPanel id="fiesta-banner" anchor="top" inset={{ x: 0, y: 56 }}>
          <FiestaBanner />
        </HudPanel>
        <HudPanel id="tools" anchor="top-right" priority="secondary" inset={{ x: 18, y: 18 }}><FieldMenu manager={surfaces} /></HudPanel>
        <HudPanel id="minimap" className="lantern-map-hud" anchor="top-right" mobileBehavior="hidden" inset={{ x: 14, y: 60 }}>
          <Minimap />
        </HudPanel>
        <HudPanel id="quests" className="lantern-objectives" anchor="top-right" priority="secondary" inset={{ x: 14, y: 60 }}>
          <QuestTracker />
        </HudPanel>
        <HudPanel id="content-hud" anchor="top-right" inset={{ x: 16, y: 180 }}>
          <div className="flex flex-col gap-2">
            <DelveHud />
            <ValeCupHud />
            <YumiHud />
            <FiestaHud />
          </div>
        </HudPanel>
        <HudPanel id="chat" anchor="bottom-left" priority="tertiary" className="lantern-chat-anchor" inset={{ x: 18, y: 18 }}>
          <ChatLog />
        </HudPanel>
        <HudPanel id="feed" anchor="bottom-left" mobileBehavior="transient" inset={{ x: 18, y: 18 }}>
          <KillLootToasts />
        </HudPanel>
        <HudPanel id="bottom-bar" anchor="bottom" priority="critical" className="lantern-action-anchor" inset={{ x: 0, y: 14 }}>
          <div className="lantern-combat-rail flex flex-col items-center gap-1.5">
            <CastBar />
            <SwingTimer />
            <ActionBar />
            <XpBar />
          </div>
        </HudPanel>
      <FieldWindows manager={surfaces} />
      {(panel === "bags" ||
        panel === "character" ||
        panel === "quests" ||
        panel === "spellbook" ||
        panel === "talents" ||
        panel === "crafting" ||
        panel === "arena" ||
        shopOpen ||
        dialogueOpen ||
        bankOpen ||
        mailOpen ||
        lockpickOpen ||
        auctionOpen) && (
        <div className="lantern-window-layer pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-4">
          {dialogueOpen && <DialoguePanel />}
          {shopOpen && <VendorPanel />}
          {bankOpen && <BankPanel />}
          {mailOpen && <MailPanel />}
          {lockpickOpen && <LockpickPanel />}
          {auctionOpen && <AuctionPanel />}
          {panel === "bags" && <BagsPanel />}
          {panel === "character" && <CharacterPanel />}
          {panel === "quests" && <QuestLogPanel />}
          {panel === "spellbook" && <SpellbookPanel />}
          {panel === "talents" && <TalentPanel />}
          {panel === "crafting" && <CraftingPanel />}
          {panel === "arena" && <ArenaPanel />}
        </div>
      )}
      <SkipIntro />
      <FishingOverlay />
      <LevelUpOverlay />
      <DeathOverlay />
      </HudCanvas>
    </>
  );
}
