import { RtsHud } from "./components/Hud";
import { useSyncExternalStore } from "react";
import { preferences } from "../preferences";
import { hudStore } from "../hudStore";
import { MatchFrontEnd } from "./MatchFrontEnd";

/** Ember Command HUD: a commander-view command console (framed minimap · commander portrait · command card)
 * plus a resource strip and objective. Unit selection rings and marquee are drawn by the shell. */
export function GameUI() {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.get, preferences.get);
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  return (
    <div className={`ec-root absolute inset-0 z-10 select-none pointer-events-none ${prefs.largeText ? "ec-large" : ""} ${prefs.highContrast ? "ec-contrast" : ""} ${prefs.reducedMotion ? "ec-still" : ""}`}>
      {hud.phase !== "ready" && <RtsHud />}
      <MatchFrontEnd />
    </div>
  );
}
