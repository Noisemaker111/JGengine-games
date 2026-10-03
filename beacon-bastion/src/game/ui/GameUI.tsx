import { SettingsTrigger } from "@jgengine/react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";
import { fieldkitVars } from "@/components/ui/jg-theme";

import { BuildBar } from "./components/BuildBar";
import { EndScreens } from "./components/EndScreens";
import { Hud } from "./components/Hud";
import { TowerPanel } from "./components/TowerPanel";

function GameUIInner() {
  const layout = useHudLayout({ storageKey: "beacon-bastion" });
  return (
    <HudCanvas layout={layout}>
      <HudPanel id="hud" anchor="top-left" inset={{ x: 18, y: 18 }}>
        <Hud />
      </HudPanel>
      <HudPanel id="settings" anchor="top-right" inset={{ x: 18, y: 18 }}>
        <SettingsTrigger />
      </HudPanel>
      <HudPanel id="build-bar" anchor="bottom" inset={{ x: 0, y: 18 }}>
        <BuildBar />
      </HudPanel>
      <HudPanel id="tower" anchor="right" inset={{ x: 18, y: 0 }}>
        <TowerPanel />
      </HudPanel>
      <EndScreens />
    </HudCanvas>
  );
}

export function GameUI() {
  return (
    <div style={{ ...fieldkitVars, display: "contents" }}>
      <GameUIInner />
    </div>
  );
}
