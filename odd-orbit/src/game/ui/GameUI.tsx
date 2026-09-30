import { useEffect, useState } from "react";
import { useGame, useGameClock, useGamePhase, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { householdStore } from "../session/store";
import { FURNITURE_BY_ID } from "../objects/catalog";
import { ORBIT_COMFORT, ORBIT_INCOME } from "../sim/challenge";
import { DAY_LENGTH } from "../../world";
import { BuildPalette } from "./components/BuildPalette";
import { EventFeed } from "./components/EventFeed";
import { Inspector } from "./components/Inspector";
import { RosterPanel } from "./components/RosterPanel";
import { TopBar } from "./components/TopBar";

function readPreferences() {
  try { return JSON.parse(localStorage.getItem("odd-orbit.preferences.v1") ?? "{}") as { calm?: boolean; contrast?: boolean }; } catch { return {}; }
}
export function GameUI() {
  const household = useStore(householdStore);
  const { commands } = useGame();
  const clock = useGameClock();
  const { setPhase } = useGamePhase();
  const objects = useSceneObjects();
  const [drawer, setDrawer] = useState<"build" | "manage" | null>(null);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [preferences, setPreferences] = useState(readPreferences);
  const orbit = household.orbit;
  const welcome = orbit?.phase === "welcome";
  const ended = orbit?.phase === "won" || orbit?.phase === "recovery";
  const paused = clock.paused && !welcome && !ended;
  const modalOpen = welcome || paused || ended || settings || help;
  useEffect(() => {
    if (!modalOpen) return;
    const modal = document.querySelector<HTMLElement>(".oo-modal");
    const prior = document.activeElement as HTMLElement | null;
    modal?.querySelector<HTMLElement>("button, input")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.code === "Space" && paused && !settings && !help) return;
      if (["Space", "KeyT", "Escape", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].includes(event.code)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
      if (event.key !== "Tab" || !modal) return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>("button, input"));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); prior?.focus(); };
  }, [modalOpen, paused, settings, help]);
  useEffect(() => { setPhase(welcome ? "menu" : ended ? "ended" : clock.paused ? "paused" : "playing"); }, [welcome, ended, clock.paused, setPhase]);
  useEffect(() => {
    const save = () => { if (!welcome && !household.saveMessage?.startsWith("Could not restore")) commands.run("household.save", {}); };
    const hidden = () => { if (document.visibilityState === "hidden") { save(); if (!clock.paused) commands.run("pauseToggle", {}); } };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("pagehide", save); document.removeEventListener("visibilitychange", hidden); };
  }, [commands, welcome, clock.paused, household.saveMessage]);
  useEffect(() => { try { localStorage.setItem("odd-orbit.preferences.v1", JSON.stringify(preferences)); } catch {} }, [preferences]);
  const run = (name: string) => { commands.run(name, {}); };
  return <div className={`oo-ui ${preferences.calm ? "oo-calm" : ""} ${preferences.contrast ? "oo-contrast" : ""}`}>
    <header className="oo-header"><div className="oo-brand"><span className="oo-mark">◌</span><div><strong>ODD ORBIT</strong><small>A home for unusual lives</small></div></div><TopBar /><div className="oo-tools"><button onClick={() => {if (!clock.paused) run("pauseToggle");setHelp(true);}}>Guide</button><button onClick={() => {if (!clock.paused) run("pauseToggle");setSettings(true);}}>Settings</button></div></header>
    {!welcome && <>
      <aside className="oo-roster"><RosterPanel /></aside><aside className="oo-inspector"><Inspector /></aside><div className="oo-events" aria-live="polite"><EventFeed /></div>
      <footer className="oo-footer"><div className="oo-mission"><span className="oo-eyebrow">{orbit?.phase === "sandbox" ? "Open habitat" : "First orbit · settlement charter"}</span>{orbit?.phase !== "sandbox" ? <><div className="oo-goals"><span className={orbit?.built ? "complete" : ""}>✦ Furnish {Math.min(1,orbit?.built ?? 0)}/1</span><span className={(orbit?.earned ?? 0)>=ORBIT_INCOME ? "complete" : ""}>↗ Earn {Math.min(ORBIT_INCOME,Math.floor(orbit?.earned ?? 0))}/{ORBIT_INCOME}</span><span className={(orbit?.comfort ?? 0)>=ORBIT_COMFORT ? "complete" : ""}>♡ Comfort {Math.min(ORBIT_COMFORT,Math.floor(orbit?.comfort ?? 0))}/{ORBIT_COMFORT}s</span></div><progress aria-label="Orbit elapsed" max={DAY_LENGTH} value={orbit?.elapsed ?? 0} /><small>{Math.max(0,Math.ceil(DAY_LENGTH-(orbit?.elapsed ?? 0)))} seconds left · all four Content, every need above 30</small></> : <small>Care for your household, grow bonds and build at your own pace.</small>}</div><div className="oo-tools"><button aria-expanded={drawer === "build"} onClick={() => setDrawer(drawer === "build" ? null : "build")}>✦ Furnish</button><button aria-expanded={drawer === "manage"} onClick={() => setDrawer(drawer === "manage" ? null : "manage")}>Manage</button><button onClick={() => run("household.save")}>Save</button></div></footer>
      {household.buildTool && <div className="oo-placement">Place {FURNITURE_BY_ID[household.buildTool]?.name} · click open ground <button onClick={() => run("build.cancel")}>Cancel</button></div>}
      {drawer && <section className="oo-drawer"><div className="oo-drawer-title"><strong>{drawer === "build" ? "Make room for life" : "Habitat furnishings"}</strong><button aria-label="Close furnishings" onClick={() => setDrawer(null)}>✕</button></div>{drawer === "build" ? <BuildPalette /> : <div className="oo-object-list">{objects.filter(o => FURNITURE_BY_ID[o.catalogId]).map(o => <div key={o.instanceId}><span>{FURNITURE_BY_ID[o.catalogId]!.name}<small>({Math.round(o.position[0])}, {Math.round(o.position[2])})</small></span><button onClick={() => commands.run("object.sell", { id: o.instanceId })}>Sell · {Math.round(FURNITURE_BY_ID[o.catalogId]!.cost/2)}</button></div>)}</div>}</section>}
    </>}
    {modalOpen && <div className="oo-veil"><section className="oo-modal" role="dialog" aria-modal="true" aria-labelledby="orbit-title">
      <span className="oo-eyebrow">{settings ? "Habitat preferences" : help ? "Field guide" : welcome ? "Settlement 04 · moon garden" : ended ? "Settlement report" : "Household paused"}</span>
      <h1 id="orbit-title">{settings ? "Find your comfort." : help ? "Small acts. Strange lives." : welcome ? "Somewhere odd. Somewhere home." : orbit?.phase === "won" ? "Your orbit is thriving." : ended ? "A home takes practice." : "Take a breath."}</h1>
      <p>{settings ? "Preferences stay on this device. Your household remains paused while you choose." : help ? "Select a being from the household. Use its care buttons, or click an appliance in the habitat. Free beings also care for themselves." : welcome ? "Four signal-singing moon slugs have arrived. Turn this outpost into a home before its first orbit ends." : orbit?.phase === "won" ? "You furnished the habitat, earned 420 credits and kept all four beings comfortable. The settlement charter is yours." : ended ? "The charter needs a little more care. Try another orbit with your current beings, credits and furnishings, or settle in without a deadline." : "Time and needs are frozen. Resume when you're ready."}</p>
      {(welcome || help) && <div className="oo-guide"><div><b>01 · Make a home</b><span>Furnish → choose an appliance → click clear ground. Place one new furnishing.</span></div><div><b>02 · Share the work</b><span>Select a being → Work. Shifts earn 14 credits per second; tired workers stop to recover.</span></div><div><b>03 · Keep everyone content</b><span>Nourish, Rest, Bond and Play. Hold all four Content and every need above 30 for 12 seconds.</span></div><small>Space pause · T speed · 1–6 build · Esc cancel · WASD pan · wheel zoom · Q/E rotate</small></div>}
      {settings && <div className="oo-preferences"><label><input type="checkbox" checked={!!preferences.calm} onChange={e => setPreferences({...preferences,calm:e.target.checked})} />Calm interface · reduce HUD motion</label><label><input type="checkbox" checked={!!preferences.contrast} onChange={e => setPreferences({...preferences,contrast:e.target.checked})} />High contrast panels</label><p>Camera edge scrolling is off. Pan with WASD or drag; zoom with the wheel.</p></div>}
      <div className="oo-modal-actions">{welcome ? <><button className="oo-primary" onClick={() => run("orbit.begin")}>Begin first orbit</button><button onClick={() => run("orbit.sandbox")}>Open habitat · no deadline</button></> : ended ? <><button className="oo-primary" onClick={() => run("orbit.sandbox")}>Keep living here</button><button onClick={() => run("orbit.begin")}>Try another orbit</button></> : settings || help ? <button className="oo-primary" onClick={() => {setSettings(false);setHelp(false);}}>Back</button> : <><button className="oo-primary" onClick={() => run("pauseToggle")}>Resume household</button><button onClick={() => run("household.save")}>Save household</button></>}</div>
      {!welcome && <small className="oo-save-status" role="status">{household.saveMessage ?? "Save keeps beings, needs, bonds, furnishings, credits and orbit progress on this device."}</small>}
    </section></div>}
  </div>;
}
