import { useGameContext } from "@jgengine/react/provider";
import { RtsHud } from "./components/Hud";
import { useSyncExternalStore } from "react";
import { preferences } from "../preferences";
import { hudStore } from "../hudStore";
import { HudButton } from "@jgengine/react/hudButton";
import { CommandMenu } from "./CommandMenu";

/** Ember Command HUD: a commander-view command console (framed minimap · commander portrait · command card)
 * plus a resource strip and objective. Unit selection rings and marquee are drawn by the shell. */
export function GameUI() {
  const ctx = useGameContext();
  const store = preferences(ctx);
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  const commands = ctx.game.commands;
  return (
    <div className={`ec-root absolute inset-0 z-10 select-none pointer-events-none ${prefs.largeText ? "ec-large" : ""} ${prefs.highContrast ? "ec-contrast" : ""} ${prefs.reducedMotion ? "ec-still" : ""}`}>
      {hud.phase !== "ready" && <RtsHud />}
      {hud.phase === "playing" && (
        <HudButton className="ec-pause" onClick={() => commands.run("match.pause", {})} aria-label="Pause battle">Ⅱ <span>Pause</span></HudButton>
      )}
      <CommandMenu />
    </div>
  );
}
