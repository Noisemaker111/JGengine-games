import { useEffect, useRef, useState, type ReactNode } from "react";
import { HudCanvas, HudPanel, useHudLayout, hudTheme, hudThemeVars, useDisplayProfile, usePanels } from "@jgengine/react";
import { useMenuRouter } from "@jgengine/react/menuRouter";
import { CreditsScreen } from "@jgengine/react/creditsScreen";
import { StartScreen, ControlsList } from "@jgengine/react/startScreen";
import { creditsForSourceIds } from "@jgengine/assets/credits";
import { mergeCredits } from "@jgengine/core/game/credits";
import { useGame, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { householdStore } from "../session/store";
import { orbitSession } from "../session/lifecycle";
import { nextBill, RATION_BUNDLE, RELIEF, PANTRY_CAP } from "../sim/economy";
import { keybinds } from "../keybinds";
import { BuildPalette } from "./components/BuildPalette";
import { EventFeed } from "./components/EventFeed";
import { Inspector } from "./components/Inspector";
import { RosterPanel } from "./components/RosterPanel";
import { TopBar } from "./components/TopBar";
import { AlienSwatch, creditsText } from "./components/bits";

const orbitTheme = hudTheme({
  palette: { accent: "#f5a8dc", accentDeep: "#914870", accentGlow: "#e690bf44", health: "#8edaba" },
  surface: { surface: "#342547", surfaceDeep: "#20172d", edge: "#765778", edgeBright: "#f5a8dc", text: "#fff0d5", textDim: "#c9b6ce", backdrop: "#1a1029de" },
  status: { warning: "#ffca81", danger: "#ff969b", success: "#8edaba", friendly: "#8edaba" },
  font: { display: "'Trebuchet MS', sans-serif", body: "'Segoe UI', sans-serif", numeric: "'Segoe UI', sans-serif" },
  frame: { radius: "4px 20px 4px 4px", bg: "#342547", border: "#765778", glow: "0 6px 18px #170d2866" },
});
const credits = mergeCredits({ sections: [{ heading: "Original game art", entries: [{ label: "Odd Orbit", detail: "Original plan-derived household portraits and habitat interface." }] }, { heading: "Engine", entries: [{ label: "JG Engine", detail: "Apache-2.0", href: "https://github.com/Noisemaker111/jgengine" }, { label: "React / Three.js", detail: "MIT" }] }] }, creditsForSourceIds(["quaternius-modular-scifi", "quaternius-stylized-nature", "kaykit-adventurers", "kaykit-furniture", "kaykit-space-base", "ambientcg-metalplates001"]));
const PREF_KEY = "odd-orbit.preferences.v2";
function readPreferences() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { calm:p?.calm === true, contrast:p?.contrast === true }; }
  catch { return { calm:false, contrast:false }; }
}
function OrbitScreen({ title, label, children }: { title:string; label:string; children:ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button:not(:disabled), input")?.focus();
    return () => previous?.focus();
  }, []);
  return <StartScreen className="orbit-veil"><section ref={ref} data-hud-window="orbit-menu" className="orbit-screen" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
    if (["Tab"," ","Enter"].includes(event.key)) event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input, a") ?? []);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><p className="orbit-eyebrow">{label}</p><h1>{title}</h1>{children}</section></StartScreen>;
}

export function GameUI() {
  const layout = useHudLayout({ storageKey:"odd-orbit" });
  const profile = useDisplayProfile();
  const household = useStore(householdStore);
  const session = useStore(orbitSession);
  const { commands } = useGame();
  const objects = useSceneObjects();
  const menu = useMenuRouter<"home" | "settings" | "credits" | "guide" | "confirm">("home", { escapeToBack:false });
  const panels = usePanels([{ id:"build", group:"habitat" }, { id:"ledger", group:"habitat" }]);
  const drawer = panels.isOpen("build") ? "build" : panels.isOpen("ledger") ? "ledger" : null;
  const setDrawer = (id:"build"|"ledger"|null) => { if (id) panels.open(id); else { panels.close("build"); panels.close("ledger"); } };
  const [preferences,setPreferences] = useState(readPreferences);
  const command = (name:string, data:Record<string,unknown> = {}) => commands.run(name,data);
  const openScreen = (id:"settings"|"credits"|"guide") => { command("orbit.pause"); menu.open(id); };
  const resume = () => { menu.reset(); command("orbit.resume"); };
  const newHome = () => { menu.reset(); setDrawer(null); command("orbit.new"); };
  const modal = session.screen !== null || !menu.atRoot;
  const compact = profile.compact;
  const landscape = compact && !profile.portrait;
  const canBuy = household.credits >= RATION_BUNDLE.cost && household.pantry + RATION_BUNDLE.quantity <= PANTRY_CAP;
  const canRelief = household.reliefDay !== household.day && household.pantry < 4 && household.credits < RATION_BUNDLE.cost;
  const bill = nextBill(household,objects);
  const setPreference = (key:"calm"|"contrast",value:boolean) => {
    const next = { ...preferences,[key]:value }; setPreferences(next);
    try { localStorage.setItem(PREF_KEY,JSON.stringify(next)); } catch { /* The session status surfaces storage availability. */ }
  };
  useEffect(() => {
    const onKey = (event:KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      event.preventDefault();
      if (!menu.atRoot) menu.back();
      else if (session.screen === "paused") resume();
      else if (session.screen === null) command("orbit.pause");
    };
    window.addEventListener("keydown",onKey);
    return () => window.removeEventListener("keydown",onKey);
  },[menu.current,drawer,session.screen,commands]);
  const saveMessage = session.saveStatus === "saved" ? "Household saved on this device" : session.saveStatus === "unavailable" ? "Saving unavailable on this device" : session.saveStatus === "damaged" ? "Saved household unreadable; new home replaces it" : "A new household awaits";
  return <HudCanvas layout={layout} className={`orbit-ui ${compact ? "orbit-compact" : ""} ${landscape ? "orbit-landscape" : ""} ${preferences.calm ? "orbit-calm" : ""} ${preferences.contrast ? "orbit-contrast" : ""}`} style={hudThemeVars(orbitTheme)}>
    {!modal && <>
      {!compact && <HudPanel id="brand" anchor="top-left" interactive={false}><div className="orbit-brand"><span aria-hidden="true">◉</span><div><strong>ODD ORBIT</strong><small>Household logbook</small></div></div></HudPanel>}
      {!(landscape && drawer) && <HudPanel id="topbar" anchor={landscape ? "top-left" : "top"} priority="critical"><TopBar/></HudPanel>}
      {!compact && <HudPanel id="menu" anchor="top-right"><button onClick={() => command("orbit.pause")}>Household menu</button></HudPanel>}
      {(!compact || (!household.selectedMemberId && !drawer)) && <HudPanel id="roster" anchor={compact ? "top-left" : "left"} inset={compact ? {x:10,y:126} : undefined} priority="critical"><RosterPanel compact={compact}/></HudPanel>}
      {household.selectedMemberId && !drawer && <HudPanel id="inspector" anchor={compact && !landscape ? "center" : "right"} priority="secondary"><Inspector/></HudPanel>}
      {!compact && !drawer && <HudPanel id="events" anchor="bottom-left" priority="tertiary" interactive={false}><EventFeed/></HudPanel>}
      {drawer && <HudPanel id="drawer" anchor="center" priority="secondary"><section className="orbit-drawer"><header><h2>{drawer === "build" ? "Habitat furnishings" : "Daily balance"}</h2><button aria-label="Close habitat panel" onClick={() => setDrawer(null)}>×</button></header>{drawer === "build" ? <BuildPalette onChoose={() => setDrawer(null)}/> : <><div className="orbit-balance"><span>Earned today <b>{creditsText(household.dayIncome)} credits</b></span><span>Harvested today <b>{household.dayHarvest} rations</b></span><span>Due at midnight <b>{bill} credits</b></span><span>Banked <b>{creditsText(household.credits)} credits</b></span>{household.debt > 0 && <span>Debt carried <b>{creditsText(household.debt)} credits</b></span>}</div><p className="orbit-fine">Yield earns credits in the morning. Bloom grows rations in the afternoon. One console has room for one worker; the planter supports two beings. Buy appliances to add capacity, with higher nightly bills.</p>{household.lastDay && <p className="orbit-day-report">Day {household.lastDay.day+1}: {creditsText(household.lastDay.income)} earned, {household.lastDay.harvest} rations grown, {household.lastDay.bill} billed, {household.lastDay.missed} shifts missed.</p>}<button disabled={!canBuy} onClick={() => command("household.rations")}>Buy {RATION_BUNDLE.quantity} rations · {RATION_BUNDLE.cost} credits</button><p className="orbit-fine">{canBuy ? "Meals consume one ration." : household.pantry + RATION_BUNDLE.quantity > PANTRY_CAP ? "The pantry needs space for six rations." : `Need ${creditsText(RATION_BUNDLE.cost-household.credits)} more credits.`}</p><button disabled={!canRelief} onClick={() => command("household.relief")}>Emergency {RELIEF.quantity} rations · +{RELIEF.debt} debt</button><p className="orbit-fine">{canRelief ? "Once per day. Up to 40 debt is repaid with the next nightly bill." : household.reliefDay === household.day ? "Relief already taken today." : "Emergency relief requires fewer than four rations and fewer than 36 credits."}</p><EventFeed/></>}</section></HudPanel>}
      <HudPanel id="actions" anchor={landscape ? "bottom-left" : "bottom"} priority="critical"><nav className="orbit-actions" aria-label="Habitat tools"><button aria-expanded={drawer === "build"} onClick={() => setDrawer(drawer === "build" ? null : "build")}>Furnish</button><button aria-expanded={drawer === "ledger"} onClick={() => setDrawer(drawer === "ledger" ? null : "ledger")}>Pantry & bills{household.pantry < 4 ? " !" : ""}</button><button onClick={() => openScreen("guide")}>Guide</button>{compact && <button onClick={() => command("orbit.pause")}>Menu</button>}</nav></HudPanel>
      {household.buildTool && <HudPanel id="placement" anchor="bottom" order={1} priority="critical"><div className="orbit-placement">Choose open ground to place your furnishing.<button onClick={() => command("build.cancel")}>Cancel</button></div></HudPanel>}
    </>}
    {modal && <OrbitScreen label={menu.current === "home" ? "Odd Orbit · household logbook" : "Odd Orbit"} title={menu.current === "settings" ? "Habitat preferences" : menu.current === "credits" ? "Credits" : menu.current === "guide" ? "Care for a strange household" : menu.current === "confirm" ? "Begin a fresh household?" : session.screen === "menu" ? "Odd Orbit" : "Take a breath"}>
      {menu.current === "home" && <><div className="orbit-menu-household" aria-label="Household portraits">{household.order.map(id => household.members[id] ? <AlienSwatch key={id} plan={household.members[id]!.bodyPlan} size={64}/> : null)}</div><p>{session.screen === "menu" ? "Give each being a daily rhythm. Balance paid work, shared meals, rest, and relationships to keep this habitat running." : "The household is paused. Needs, bills, and schedules wait until you return."}</p><div className="orbit-menu-actions">{session.screen === "menu" ? <><button className="orbit-primary" disabled={!session.canContinue} onClick={() => {menu.reset();command("orbit.continue");}}>Continue household{!session.canContinue ? " · no save" : ""}</button><button onClick={() => session.canContinue ? menu.open("confirm") : newHome()}>New household</button></> : <><button className="orbit-primary" onClick={resume}>Resume household</button><button onClick={() => menu.open("confirm")}>New household</button></>}<button onClick={() => menu.open("settings")}>Settings</button><button onClick={() => menu.open("guide")}>Field guide</button><button onClick={() => menu.open("credits")}>Credits</button></div><small role="status">{saveMessage}</small></>}
      {menu.current === "settings" && <><label className="orbit-preference"><input type="checkbox" checked={preferences.calm} onChange={e => setPreference("calm",e.target.checked)}/> Reduce interface motion</label><label className="orbit-preference"><input type="checkbox" checked={preferences.contrast} onChange={e => setPreference("contrast",e.target.checked)}/> Higher contrast habitat panels</label><ControlsList bindings={keybinds} controls={[{action:"pauseToggle",label:"Pause time"},{action:"speedCycle",label:"Cycle speed"},{action:"buildCancel",label:"Cancel placement"},{keys:"WASD",label:"Pan camera"},{keys:"Mouse wheel",label:"Zoom camera"}]}/><p>Tap a being to choose its schedule or start a conversation. Tap Furnish to place or sell appliances.</p><button className="orbit-primary" onClick={() => menu.back()}>Back</button></>}
      {menu.current === "guide" && <><ol className="orbit-guide"><li><b>Share the day</b><span>Select a being. Yield works 08–14 for credits; Bloom tends 14–18 for rations. After three completed shifts, a being can work 08–18.</span></li><li><b>Keep a pantry</b><span>Meals consume rations. Buy six for 36 credits, or borrow emergency supplies once daily. The habitat bill arrives at midnight.</span></li><li><b>Make room to recover</b><span>Work raises stress. Burnout stops earnings until Nourish and Rest reach 50 and stress falls below 35. Release directions to let a being care for itself.</span></li><li><b>Build bonds</b><span>Choose a conversation partner. Friends can harvest an extra ration; exhausted partners may dispute. Furnish to add capacity, or sell appliances for half their price.</span></li></ol><button className="orbit-primary" onClick={() => menu.back()}>Back</button></>}
      {menu.current === "credits" && <><CreditsScreen document={credits}/><button className="orbit-primary" onClick={() => menu.back()}>Back</button></>}
      {menu.current === "confirm" && <><p>This replaces the saved household, including its beings, furnishings, credits, and relationships.</p><button className="orbit-primary" onClick={() => menu.back()}>Keep this household</button><button onClick={newHome}>Replace saved household</button></>}
    </OrbitScreen>}
  </HudCanvas>;
}
