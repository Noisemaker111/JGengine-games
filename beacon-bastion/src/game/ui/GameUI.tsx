import { SettingsTrigger } from "@jgengine/react";
import { HudCanvas, HudPanel, useHudLayout } from "@jgengine/shell/gameKit";

import { BuildBar } from "./components/BuildBar";
import { EndScreens } from "./components/EndScreens";
import { Hud } from "./components/Hud";
import { TowerPanel } from "./components/TowerPanel";
import { BeaconMenu } from "./menu/BeaconMenu";

/**
 * The field-kit theme comes from `defineGame({ hudTheme })`; notices are the shell's shared feed.
 * Live-play chrome is gated to the play phases, so a title or pause screen owns the frame alone.
 */
export function GameUI() {
  const layout = useHudLayout({ storageKey: "beacon-bastion" });
  return (
    <>
      <HudCanvas layout={layout} showDuring={["playing", "ended"]}>
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
      <BeaconMenu />
    </>
  );
}
