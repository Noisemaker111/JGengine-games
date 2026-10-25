import { type CSSProperties, useRef, useState } from "react";
import { useRegisterLayoutRegion } from "@jgengine/react/gameViewport";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { usePanels } from "@jgengine/react/panels";
import { KitButton } from "@jgengine/react/uiKitRoot";

import { BuildBar } from "./components/BuildBar";
import { CameraPad } from "./components/CameraPad";
import { Inspector } from "./components/Inspector";
import { ParkBooks, ParkGoal, ParkStatus } from "./components/ParkDashboard";
import { ParkFlow, resultOpen } from "./components/ParkFlow";
import { ParkMenu } from "./menu/ParkMenu";
import { PARK_PANELS } from "./panels";
import { session } from "../session";

const MOTION_KEY = "brightway-park.reduced-motion";
function savedMotion(): boolean { try { return localStorage.getItem(MOTION_KEY) === "true"; } catch { return false; } }

export function GameUI() {
  const { commands } = useGame(); const clock = useGameClock();
  const started = useGameStore(() => session.started);
  const inspecting = useGameStore((ctx) => session.selectedObject !== null || ctx.scene.entity.selection.list().length > 0);
  useGameStore(() => [session.gameOver, session.won, session.winDismissed, session.scenario?.result ?? ""].join("|"));
  const [reducedMotion, setReducedMotion] = useState(savedMotion);
  // Toasts step clear of the status column: on phones it spans the top, so they land below it, under the pause rows too.
  const left = useRef<HTMLDivElement>(null);
  useRegisterLayoutRegion({ id: "brightway.status", kind: "hud", collisionPolicy: "allow" }, left, started);
  // While the pause board or a result screen is up it owns the keys, so the palette hotkeys stand down.
  const panels = usePanels(PARK_PANELS, { hotkeys: started && !clock.paused && !resultOpen() });
  const onReducedMotion = (next: boolean) => {
    setReducedMotion(next);
    try { localStorage.setItem(MOTION_KEY, String(next)); } catch { /* Preferences remain usable for this session. */ }
    commands.run("park.motion", { reduced: next });
  };
  return (
    <div className="bw-hud" style={reducedMotion ? ({ "--kit-motion": "0.01" } as CSSProperties) : undefined}>
      {started && <>
        <div className="bw-left" ref={left}><ParkStatus /><ParkGoal /></div>
        <nav className="bw-time" aria-label="Simulation controls">
          <KitButton size="sm" pressed={clock.paused} aria-label="Pause park" onClick={() => commands.run("pauseToggle", {})}>Ⅱ</KitButton>
          {clock.speeds.map((s) => <KitButton key={s} size="sm" pressed={!clock.paused && clock.speed === s} onClick={() => commands.run("park.speed", { speed: s })}>{s}×</KitButton>)}
          <KitButton size="sm" variant="ghost" pressed={panels.isOpen("build")} icon="🏗" onClick={() => panels.toggle("build")}><span className="bw-wide">Build</span></KitButton>
          <KitButton size="sm" variant="ghost" pressed={panels.isOpen("books")} icon="📒" onClick={() => panels.toggle("books")}><span className="bw-wide">Books</span></KitButton>
        </nav>
        <div className="bw-side">{inspecting ? <Inspector /> : panels.isOpen("books") ? <ParkBooks onClose={() => panels.close("books")} /> : null}</div>
        <div className="bw-bottom">{!clock.paused && <CameraPad />}{panels.isOpen("build") && <BuildBar onClose={() => panels.close("build")} />}</div>
      </>}
      <ParkMenu reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} />
      <ParkFlow />
    </div>
  );
}
