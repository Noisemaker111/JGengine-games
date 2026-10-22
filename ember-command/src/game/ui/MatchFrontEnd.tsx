import { useGameContext } from "@jgengine/react/provider";
import { useSyncExternalStore } from "react";
import { useDialogBehavior } from "@jgengine/react";
import { useDomEvent, useGame, type DomEventTarget } from "@jgengine/react/hooks";
import { useMenuRouter } from "@jgengine/react/menuRouter";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";
import { hudStore } from "../hudStore";
import { preferences } from "../preferences";
import { Icon } from "./icons";

const credits = mergeCredits({ title: "The makers of the vale", sections: [
  { heading: "Ember Command", entries: [
    { label: "Original miniatures & art direction", detail: "Bastions, warriors, pennants and resource props authored for this game." },
    { label: "JGengine", detail: "Published engine packages", href: "https://jgengine.com" },
  ] },
  { heading: "Icons", entries: [{ label: "game-icons.net contributors", detail: "CC BY 3.0; individual credits in iconData.ts", href: "https://game-icons.net" }] },
  { heading: "Earlier contributions", entries: [{ label: "KayKit & Quaternius", detail: "Original catalog credits retained. This edition uses original miniature meshes." }] },
] }, creditsForSourceIds(["kaykit-adventurers", "kaykit-city-builder", "quaternius-stylized-nature", "kaykit-dungeon"]));

export function battleTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function MatchFrontEnd() {
  const hud = useSyncExternalStore(hudStore.subscribe, hudStore.get, hudStore.get);
  const store = preferences(useGameContext());
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.get);
  const { commands } = useGame();
  const router = useMenuRouter<"main" | "settings" | "credits">("main", { escapeToBack: false });
  const live = hud.phase === "playing";
  const panel = useDialogBehavior<HTMLDivElement>({ open: !live, focusKey: `${hud.phase}:${router.current}` });
  useDomEvent<KeyboardEvent>(() => window as unknown as DomEventTarget, "keydown", (event) => {
    if (event.defaultPrevented || event.code !== "Escape" || event.repeat) return;
    event.preventDefault();
    if (!router.atRoot) { router.back(); return; }
    if (live) {
      if (hud.buildArmed || hud.attackMoveArmed || hud.rallyArmed) commands.run("unit.cancel", {});
      else commands.run("match.pause", {});
    } else if (hud.phase === "paused") commands.run("match.resume", {});
  });
  const run = (command: string) => { router.reset(); commands.run(command, {}); };
  if (live) return <HudButton className="ec-pause" onClick={() => run("match.pause")} aria-label="Pause battle">Ⅱ <span>Pause</span></HudButton>;
  const ready = hud.phase === "ready", paused = hud.phase === "paused", won = hud.phase === "won";
  return <div className="ec-curtain" onContextMenu={(e) => e.preventDefault()}>
    <HudSurface ref={panel} elevation="modal" className="ec-front" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="ec-front-title" onKeyDown={(event) => {
      if (["Tab", " ", "Enter"].includes(event.key)) event.stopPropagation();
    }}>
      <div className="ec-seal"><Icon name={ready || paused ? "helm" : won ? "medal" : "skull"} /></div>
      <p className="ec-eyebrow">The Highland Vale · Commander's field desk</p>
      <h1 id="ec-front-title">{router.current === "settings" ? "Field preferences" : router.current === "credits" ? "Credits" : ready ? "Ember Command" : paused ? "Orders on hold" : won ? "The vale is yours" : "The keep has fallen"}</h1>
      {router.current === "settings" ? <>
        <p>Preferences are saved on this device.</p>
        <div className="ec-settings">
          {([ ["largeText", "Larger HUD text", "Enlarge command labels and field reports."], ["highContrast", "High contrast", "Opaque panels and brighter borders."], ["reducedMotion", "Reduce UI motion", "Remove animated menu flourishes."] ] as const).map(([key, label, hint]) =>
            <label key={key}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={prefs[key]} onChange={(e) => store.set({ [key]: e.target.checked })} /></label>)}
        </div>
        <HudButton className="ec-primary" onClick={() => router.back()}>Back to field desk</HudButton>
      </> : router.current === "credits" ? <>
        <div className="ec-credits"><CreditsScreen document={credits} /></div>
        <HudButton className="ec-primary" onClick={() => router.back()}>Back to field desk</HudButton>
      </> : <>
        <p>{ready ? "Lead Bram's Vanguard through the highlands. Raise an army, hold the war-road and break the Marauder Warcamp." : paused ? "The battlefield is frozen. Review your plan before the next wave." : won ? "Your Vanguard broke the Warcamp. The reinforcements have been silenced." : "The Marauders breached your walls. Gather gold early, build a Barracks and cover the road with a Guard Tower."}</p>
        {ready ? <ol className="ec-briefing">
          <li><strong>Gather</strong><span>Select peasants; right-click gold seams or timber.</span></li>
          <li><strong>Muster</strong><span>Build a Barracks [B], then train troops [2 / 3].</span></li>
          <li><strong>Advance</strong><span>Drag-select troops; [R], then right-click up the road.</span></li>
        </ol> : <div className="ec-results"><span>Battle time<strong>{battleTime(hud.elapsed)}</strong></span><span>Waves faced<strong>{hud.wavesSent}</strong></span><span>Troops standing<strong>{hud.playerUnits}</strong></span></div>}
        <HudButton className="ec-primary" onClick={() => run(ready ? "match.start" : paused ? "match.resume" : "match.restart")}>{ready ? "Take command" : paused ? "Resume battle" : "Fight another skirmish"}</HudButton>
        <div className="ec-secondary"><HudButton onClick={() => router.open("settings")}>Settings</HudButton><HudButton onClick={() => router.open("credits")}>Credits</HudButton>{!ready && <HudButton onClick={() => run("match.title")}>Return to title</HudButton>}</div>
        <p className="ec-record">Service record · {prefs.wins} victories / {prefs.losses} defeats{prefs.bestVictory ? ` · Best ${battleTime(prefs.bestVictory)}` : ""}</p>
        {ready && <small className="ec-footnote">Single-player skirmish · Mouse & keyboard · Matches restart on reload; preferences and service record persist.</small>}
      </>}
    </HudSurface>
  </div>;
}
