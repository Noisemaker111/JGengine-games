import { RtsHud } from "./components/Hud";

/** Ember Command HUD: a commander-view command console (framed minimap · commander portrait · command card)
 * plus a resource strip and objective. Unit selection rings and marquee are drawn by the shell. */
export function GameUI() {
  return (
    <div className="absolute inset-0 z-10 select-none">
      <RtsHud />
    </div>
  );
}
