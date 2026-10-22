import { useEffect, useState, type ReactNode } from "react";
import { HudCanvas, HudPanel, useHudLayout, useDisplayProfile, usePanels, useDialogBehavior } from "@jgengine/react";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
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
import { Inspector } from "./components/Inspector";
import { RosterPanel } from "./components/RosterPanel";
import { TopBar } from "./components/TopBar";
import { AlienSwatch, creditsText } from "./components/bits";

const credits = mergeCredits({ sections: [{ heading: "Original game art", entries: [{ label: "Odd Orbit", detail: "Original plan-derived household portraits and habitat interface." }] }, { heading: "Engine", entries: [{ label: "JG Engine", detail: "Apache-2.0", href: "https://github.com/Noisemaker111/jgengine" }, { label: "React / Three.js", detail: "MIT" }] }] }, creditsForSourceIds(["quaternius-modular-scifi", "quaternius-stylized-nature", "kaykit-adventurers", "kaykit-furniture", "kaykit-space-base", "ambientcg-metalplates001"]));
const PREF_KEY = "odd-orbit.preferences.v2";
function readPreferences() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { calm:p?.calm === true, contrast:p?.contrast === true }; }
  catch { return { calm:false, contrast:false }; }
}
function OrbitScreen({ title, label, children }: { title:string; label:string; children:ReactNode }) {
  const ref = useDialogBehavior<HTMLDivElement>({ open: true, focusKey: title });
  return <StartScreen className="orbit-veil"><HudSurface ref={ref} data-hud-window="orbit-menu" className="orbit-screen" elevation="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} onKeyDown={event => {
    if (["Tab"," ","Enter"].includes(event.key)) event.stopPropagation();
  }}><p className="orbit-eyebrow">{label}</p><h1>{title}</h1>{children}</HudSurface></StartScreen>;
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
  return <HudCanvas layout={layout} className={`orbit-ui ${compact ? "orbit-compact" : ""} ${landscape ? "orbit-landscape" : ""} ${preferences.calm ? "orbit-calm" : ""} ${preferences.contrast ? "orbit-contrast" : ""}`}>
    {!modal && <>
      {!compact && <HudPanel id="brand" anchor="top-left" interactive={false}><div className="orbit-brand"><span aria-hidden="true">◉</span><div><strong>ODD ORBIT</strong><small>Household logbook</small></div></div></HudPanel>}
      {!(landscape && drawer) && <HudPanel id="topbar" anchor={landscape ? "top-left" : "top"} priority="critical"><TopBar/></HudPanel>}
      {!compact && <HudPanel id="menu" anchor="top-right"><HudButton onClick={() => command("orbit.pause")}>Household menu</HudButton></HudPanel>}
      {(!compact || (!household.selectedMemberId && !drawer)) && <HudPanel id="roster" anchor={compact ? "top-left" : "left"} inset={compact ? {x:10,y:126} : undefined} compact="chip" chip="Household" priority="critical"><RosterPanel compact={compact}/></HudPanel>}
      {household.selectedMemberId && !drawer && <HudPanel id="inspector" anchor={compact && !landscape ? "center" : "right"} priority="secondary"><Inspector/></HudPanel>}
      {drawer && <HudPanel id="drawer" anchor="center" priority="secondary"><HudSurface className="orbit-drawer" as="section" aria-label={drawer === "build" ? "Habitat furnishings" : "Daily balance"}><header><h2>{drawer === "build" ? "Habitat furnishings" : "Daily balance"}</h2><HudButton aria-label="Close habitat panel" onClick={() => setDrawer(null)}>×</HudButton></header>{drawer === "build" ? <BuildPalette onChoose={() => setDrawer(null)}/> : <><div className="orbit-balance"><span>Earned today <b>{creditsText(household.dayIncome)} credits</b></span><span>Harvested today <b>{household.dayHarvest} rations</b></span><span>Due at midnight <b>{bill} credits</b></span><span>Banked <b>{creditsText(household.credits)} credits</b></span>{household.debt > 0 && <span>Debt carried <b>{creditsText(household.debt)} credits</b></span>}</div><p className="orbit-fine">Yield earns credits in the morning. Bloom grows rations in the afternoon. One console has room for one worker; the planter supports two beings. Buy appliances to add capacity, with higher nightly bills.</p>{household.lastDay && <p className="orbit-day-report">Day {household.lastDay.day+1}: {creditsText(household.lastDay.income)} earned, {household.lastDay.harvest} rations grown, {household.lastDay.bill} billed, {household.lastDay.missed} shifts missed.</p>}<HudButton disabled={!canBuy} onClick={() => command("household.rations")}>Buy {RATION_BUNDLE.quantity} rations · {RATION_BUNDLE.cost} credits</HudButton><p className="orbit-fine">{canBuy ? "Meals consume one ration." : household.pantry + RATION_BUNDLE.quantity > PANTRY_CAP ? "The pantry needs space for six rations." : `Need ${creditsText(RATION_BUNDLE.cost-household.credits)} more credits.`}</p><HudButton disabled={!canRelief} onClick={() => command("household.relief")}>Emergency {RELIEF.quantity} rations · +{RELIEF.debt} debt</HudButton><p className="orbit-fine">{canRelief ? "Once per day. Up to 40 debt is repaid with the next nightly bill." : household.reliefDay === household.day ? "Relief already taken today." : "Emergency relief requires fewer than four rations and fewer than 36 credits."}</p></>}</HudSurface></HudPanel>}
      <HudPanel id="actions" anchor={landscape ? "bottom-left" : "bottom"} priority="critical"><HudSurface className="orbit-actions" as="nav" aria-label="Habitat tools"><HudButton aria-expanded={drawer === "build"} onClick={() => setDrawer(drawer === "build" ? null : "build")}>Furnish</HudButton><HudButton aria-expanded={drawer === "ledger"} onClick={() => setDrawer(drawer === "ledger" ? null : "ledger")}>Pantry & bills{household.pantry < 4 ? " !" : ""}</HudButton><HudButton onClick={() => openScreen("guide")}>Guide</HudButton>{compact && <HudButton onClick={() => command("orbit.pause")}>Menu</HudButton>}</HudSurface></HudPanel>
      {household.buildTool && <HudPanel id="placement" anchor="bottom" order={1} priority="critical"><HudSurface className="orbit-placement">Choose open ground to place your furnishing.<HudButton onClick={() => command("build.cancel")}>Cancel</HudButton></HudSurface></HudPanel>}
    </>}
    {modal && <OrbitScreen label={menu.current === "home" ? "Odd Orbit · household logbook" : "Odd Orbit"} title={menu.current === "settings" ? "Habitat preferences" : menu.current === "credits" ? "Credits" : menu.current === "guide" ? "Care for a strange household" : menu.current === "confirm" ? "Begin a fresh household?" : session.screen === "menu" ? "Odd Orbit" : "Take a breath"}>
      {menu.current === "home" && <><div className="orbit-menu-household" aria-label="Household portraits">{household.order.map(id => household.members[id] ? <AlienSwatch key={id} plan={household.members[id]!.bodyPlan} size={64}/> : null)}</div><p>{session.screen === "menu" ? "Give each being a daily rhythm. Balance paid work, shared meals, rest, and relationships to keep this habitat running." : "The household is paused. Needs, bills, and schedules wait until you return."}</p><div className="orbit-menu-actions">{session.screen === "menu" ? <><HudButton variant="primary" className="orbit-primary" disabled={!session.canContinue} onClick={() => {menu.reset();command("orbit.continue");}}>Continue household{!session.canContinue ? " · no save" : ""}</HudButton><HudButton onClick={() => session.canContinue ? menu.open("confirm") : newHome()}>New household</HudButton></> : <><HudButton variant="primary" className="orbit-primary" onClick={resume}>Resume household</HudButton><HudButton onClick={() => menu.open("confirm")}>New household</HudButton></>}<HudButton onClick={() => menu.open("settings")}>Settings</HudButton><HudButton onClick={() => menu.open("guide")}>Field guide</HudButton><HudButton onClick={() => menu.open("credits")}>Credits</HudButton></div><small role="status">{saveMessage}</small></>}
      {menu.current === "settings" && <><label className="orbit-preference"><input type="checkbox" checked={preferences.calm} onChange={e => setPreference("calm",e.target.checked)}/> Reduce interface motion</label><label className="orbit-preference"><input type="checkbox" checked={preferences.contrast} onChange={e => setPreference("contrast",e.target.checked)}/> Higher contrast habitat panels</label><ControlsList bindings={keybinds} controls={[{action:"pauseToggle",label:"Pause time"},{action:"speedCycle",label:"Cycle speed"},{action:"buildCancel",label:"Cancel placement"},{keys:"WASD",label:"Pan camera"},{keys:"Mouse wheel",label:"Zoom camera"}]}/><p>Tap a being to choose its schedule or start a conversation. Tap Furnish to place or sell appliances.</p><HudButton variant="primary" className="orbit-primary" onClick={() => menu.back()}>Back</HudButton></>}
      {menu.current === "guide" && <><ol className="orbit-guide"><li><b>Share the day</b><span>Select a being. Yield works 08–14 for credits; Bloom tends 14–18 for rations. After three completed shifts, a being can work 08–18.</span></li><li><b>Keep a pantry</b><span>Meals consume rations. Buy six for 36 credits, or borrow emergency supplies once daily. The habitat bill arrives at midnight.</span></li><li><b>Make room to recover</b><span>Work raises stress. Burnout stops earnings until Nourish and Rest reach 50 and stress falls below 35. Release directions to let a being care for itself.</span></li><li><b>Build bonds</b><span>Choose a conversation partner. Friends tending together harvest an extra ration and 12 credits; exhausted partners may dispute. Furnish to add capacity, or sell appliances for half their price.</span></li></ol><HudButton variant="primary" className="orbit-primary" onClick={() => menu.back()}>Back</HudButton></>}
      {menu.current === "credits" && <><CreditsScreen document={credits}/><HudButton variant="primary" className="orbit-primary" onClick={() => menu.back()}>Back</HudButton></>}
      {menu.current === "confirm" && <><p>This replaces the saved household, including its beings, furnishings, credits, and relationships.</p><HudButton variant="primary" className="orbit-primary" onClick={() => menu.back()}>Keep this household</HudButton><HudButton onClick={newHome}>Replace saved household</HudButton></>}
    </OrbitScreen>}
  </HudCanvas>;
}
