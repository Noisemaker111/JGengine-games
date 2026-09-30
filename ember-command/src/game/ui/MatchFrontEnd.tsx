import { useEffect, useRef, useSyncExternalStore } from "react";
import { useDomEvent, useGame, type DomEventTarget } from "@jgengine/react/hooks";
import { useMenuRouter } from "@jgengine/react/menuRouter";
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
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.get, preferences.get);
  const { commands } = useGame();
  const router = useMenuRouter<"main" | "settings" | "credits">("main", { escapeToBack: false });
  const panel = useRef<HTMLElement>(null);
  const live = hud.phase === "playing";
  useEffect(() => { if (!live) panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [live, hud.phase, router.current]);
  useDomEvent<KeyboardEvent>(() => window as unknown as DomEventTarget, "keydown", (event) => {
    if (event.code !== "Escape" || event.repeat) return;
    event.preventDefault();
    if (!router.atRoot) { router.back(); return; }
    if (live) {
      if (hud.buildArmed || hud.attackMoveArmed || hud.rallyArmed) commands.run("unit.cancel", {});
      else commands.run("match.pause", {});
    } else if (hud.phase === "paused") commands.run("match.resume", {});
  });
  const run = (command: string) => { router.reset(); commands.run(command, {}); };
  if (live) return <button type="button" className="ec-pause" onClick={() => run("match.pause")} aria-label="Pause battle">Ⅱ <span>Pause</span></button>;
  const ready = hud.phase === "ready", paused = hud.phase === "paused", won = hud.phase === "won";
  return <div className="ec-curtain" onContextMenu={(e) => e.preventDefault()}>
    <section ref={panel} className="ec-front" role="dialog" aria-modal="true" aria-labelledby="ec-front-title" onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const elements = panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, a[href]");
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="ec-seal"><Icon name={ready || paused ? "helm" : won ? "medal" : "skull"} /></div>
      <p className="ec-eyebrow">The Highland Vale · Commander's field desk</p>
      <h1 id="ec-front-title">{router.current === "settings" ? "Field preferences" : router.current === "credits" ? "Credits" : ready ? "Ember Command" : paused ? "Orders on hold" : won ? "The vale is yours" : "The keep has fallen"}</h1>
      {router.current === "settings" ? <>
        <p>Preferences are saved on this device.</p>
        <div className="ec-settings">
          {([ ["largeText", "Larger HUD text", "Enlarge command labels and field reports."], ["highContrast", "High contrast", "Opaque panels and brighter borders."], ["reducedMotion", "Reduce UI motion", "Remove animated menu flourishes."] ] as const).map(([key, label, hint]) =>
            <label key={key}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={prefs[key]} onChange={(e) => preferences.set({ [key]: e.target.checked })} /></label>)}
        </div>
        <button type="button" className="ec-primary" onClick={() => router.back()}>Back to field desk</button>
      </> : router.current === "credits" ? <>
        <div className="ec-credits"><CreditsScreen document={credits} /></div>
        <button type="button" className="ec-primary" onClick={() => router.back()}>Back to field desk</button>
      </> : <>
        <p>{ready ? "Lead Bram's Vanguard through the highlands. Raise an army, hold the war-road and break the Marauder Warcamp." : paused ? "The battlefield is frozen. Review your plan before the next wave." : won ? "Your Vanguard broke the Warcamp. The reinforcements have been silenced." : "The Marauders breached your walls. Gather gold early, build a Barracks and cover the road with a Guard Tower."}</p>
        {ready ? <ol className="ec-briefing">
          <li><strong>Gather</strong><span>Select peasants; right-click gold seams or timber.</span></li>
          <li><strong>Muster</strong><span>Build a Barracks [B], then train troops [2 / 3].</span></li>
          <li><strong>Advance</strong><span>Drag-select troops; [R], then right-click up the road.</span></li>
        </ol> : <div className="ec-results"><span>Battle time<strong>{battleTime(hud.elapsed)}</strong></span><span>Waves faced<strong>{hud.wavesSent}</strong></span><span>Troops standing<strong>{hud.playerUnits}</strong></span></div>}
        <button type="button" className="ec-primary" onClick={() => run(ready ? "match.start" : paused ? "match.resume" : "match.restart")}>{ready ? "Take command" : paused ? "Resume battle" : "Fight another skirmish"}</button>
        <div className="ec-secondary"><button type="button" onClick={() => router.open("settings")}>Settings</button><button type="button" onClick={() => router.open("credits")}>Credits</button>{!ready && <button type="button" onClick={() => run("match.title")}>Return to title</button>}</div>
        <p className="ec-record">Service record · {prefs.wins} victories / {prefs.losses} defeats{prefs.bestVictory ? ` · Best ${battleTime(prefs.bestVictory)}` : ""}</p>
        {ready && <small className="ec-footnote">Single-player skirmish · Mouse & keyboard · Matches restart on reload; preferences and service record persist.</small>}
      </>}
    </section>
  </div>;
}
