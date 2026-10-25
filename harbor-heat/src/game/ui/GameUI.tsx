import { useEffect } from "react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";
import { ITEM_LABELS } from "../content";
import { sessionStore } from "../session";
import { CityMinimap } from "./components/CityMinimap";
import { Counters } from "./components/Counters";
import { Hotbar } from "./components/Hotbar";
import { Objective } from "./components/Objective";
import { PhoneButton, PhonePanel } from "./components/PhonePanel";
import { PauseButton, SessionUI } from "./components/SessionUI";
import { Speedo } from "./components/Speedo";
import { StatusPanel } from "./components/StatusPanel";
import { WantedStars } from "./components/WantedStars";
import { HarborMenu, useGameStarted } from "./menu/HarborMenu";

/** Pickups speak through the kit's toasts, like every other notice. */
function useLootNotices() {
  const ctx = useGameContext();
  useEffect(() => ctx.game.events.on("loot.granted", ({ userId, drops }) => {
    if (userId !== ctx.player.userId) return;
    for (const drop of drops) ctx.game.notices.push({ text: `+ ${drop.item === undefined ? `$${drop.count}` : (ITEM_LABELS[drop.item] ?? drop.item)}`, tone: "success" });
  }), [ctx]);
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "harbor-heat" });
  const started = useGameStarted();
  const paused = useStore(sessionStore, (session) => session.paused);
  useLootNotices();
  return (
    <>
      <HarborMenu />
      <SessionUI />
      {started && !paused ? (
        <HudCanvas layout={layout} className="z-20">
          <HudPanel id="objective" anchor="top-left" compact="keep"><Objective /></HudPanel>
          <HudPanel id="pause" anchor="top-right" order={-1} compact="keep"><div style={{ display: "flex", gap: 10 }}><PhoneButton /><PauseButton /></div></HudPanel>
          <HudPanel id="status" anchor="top-right" compact="keep" interactive={false}><StatusPanel /></HudPanel>
          <HudPanel id="wanted" anchor="top" compact="keep" interactive={false}><WantedStars /></HudPanel>
          <HudPanel id="minimap" anchor="bottom-left" compact="keep" interactive={false}><CityMinimap /></HudPanel>
          <HudPanel id="hotbar" anchor="bottom" compact="keep"><Hotbar /></HudPanel>
          <HudPanel id="speedo" anchor="bottom-right" compact="keep" interactive={false}><Speedo /></HudPanel>
          <HudPanel id="counter" anchor="center" compact="keep"><div style={{ display: "grid", gap: 16, justifyItems: "center" }}><Counters /><PhonePanel /></div></HudPanel>
        </HudCanvas>
      ) : null}
    </>
  );
}
