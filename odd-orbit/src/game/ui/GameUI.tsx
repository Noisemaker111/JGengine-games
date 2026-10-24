import { useEffect, useState, type ReactNode } from "react";
import { HudCanvas, HudPanel, useHudLayout, useDisplayProfile, usePanels } from "@jgengine/react";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import { useGame, useSceneObjects } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { householdStore } from "../session/store";
import { orbitSession } from "../session/lifecycle";
import { nextBill, RATION_BUNDLE, RELIEF, PANTRY_CAP } from "../sim/economy";
import { BuildPalette } from "./components/BuildPalette";
import { Inspector } from "./components/Inspector";
import { RosterPanel } from "./components/RosterPanel";
import { TopBar } from "./components/TopBar";
import { creditsText } from "./components/bits";
import { OrbitMenu, type OrbitPreferences } from "./menu/OrbitMenu";

const PREF_KEY = "odd-orbit.preferences.v2";

function readPreferences(): OrbitPreferences {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { calm: p?.calm === true, contrast: p?.contrast === true }; }
  catch { return { calm: false, contrast: false }; }
}

export function GameUI() {
  const layout = useHudLayout({ storageKey: "odd-orbit" });
  const profile = useDisplayProfile();
  const household = useStore(householdStore);
  const session = useStore(orbitSession);
  const { commands } = useGame();
  const objects = useSceneObjects();
  const panels = usePanels([{ id: "build", group: "habitat" }, { id: "ledger", group: "habitat" }]);
  const drawer = panels.isOpen("build") ? "build" : panels.isOpen("ledger") ? "ledger" : null;
  const setDrawer = (id: "build" | "ledger" | null) => { if (id) panels.open(id); else { panels.close("build"); panels.close("ledger"); } };
  const [preferences, setPreferences] = useState(readPreferences);
  const command = (name: string, data: Record<string, unknown> = {}) => commands.run(name, data);
  const modal = session.screen !== null;
  const compact = profile.compact;
  const landscape = compact && !profile.portrait;
  const canBuy = household.credits >= RATION_BUNDLE.cost && household.pantry + RATION_BUNDLE.quantity <= PANTRY_CAP;
  const canRelief = household.reliefDay !== household.day && household.pantry < 4 && household.credits < RATION_BUNDLE.cost;
  const bill = nextBill(household, objects);
  const setPreference = (key: keyof OrbitPreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* The session status surfaces storage availability. */ }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented) return;
      if (session.screen !== null) return;
      event.preventDefault();
      command("orbit.pause");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.screen, commands]);
  return <>
    <HudCanvas layout={layout} className={`orbit-ui ${compact ? "orbit-compact" : ""} ${landscape ? "orbit-landscape" : ""} ${preferences.calm ? "orbit-calm" : ""} ${preferences.contrast ? "orbit-contrast" : ""}`}>
      {!modal && <>
        {!compact && <HudPanel id="brand" anchor="top-left" interactive={false}><div className="orbit-brand"><span aria-hidden="true">?</span><div><strong>ODD ORBIT</strong><small>Household logbook</small></div></div></HudPanel>}
        {!(landscape && drawer) && <HudPanel id="topbar" anchor={landscape ? "top-left" : "top"} priority="critical"><TopBar /></HudPanel>}
        {!compact && <HudPanel id="menu" anchor="top-right"><HudButton onClick={() => command("orbit.pause")}>Household menu</HudButton></HudPanel>}
        {(!compact || (!household.selectedMemberId && !drawer)) && <HudPanel id="roster" anchor={compact ? "top-left" : "left"} inset={compact ? { x: 10, y: 126 } : undefined} compact="chip" chip="Household" priority="critical"><RosterPanel compact={compact} /></HudPanel>}
        {household.selectedMemberId && !drawer && <HudPanel id="inspector" anchor={compact && !landscape ? "center" : "right"} priority="secondary"><Inspector /></HudPanel>}
        {drawer && <HudPanel id="drawer" anchor="center" priority="secondary"><HudSurface className="orbit-drawer" as="section" aria-label={drawer === "build" ? "Habitat furnishings" : "Daily balance"}><header><h2>{drawer === "build" ? "Habitat furnishings" : "Daily balance"}</h2><HudButton aria-label="Close habitat panel" onClick={() => setDrawer(null)}>x</HudButton></header>{drawer === "build" ? <BuildPalette onChoose={() => setDrawer(null)} /> : <><div className="orbit-balance"><span>Earned today <b>{creditsText(household.dayIncome)} credits</b></span><span>Harvested today <b>{household.dayHarvest} rations</b></span><span>Due at midnight <b>{bill} credits</b></span><span>Banked <b>{creditsText(household.credits)} credits</b></span>{household.debt > 0 && <span>Debt carried <b>{creditsText(household.debt)} credits</b></span>}</div><p className="orbit-fine">Yield earns credits in the morning. Bloom grows rations in the afternoon. One console has room for one worker; the planter supports two beings. Buy appliances to add capacity, with higher nightly bills.</p>{household.lastDay && <p className="orbit-day-report">Day {household.lastDay.day + 1}: {creditsText(household.lastDay.income)} earned, {household.lastDay.harvest} rations grown, {household.lastDay.bill} billed, {household.lastDay.missed} shifts missed.</p>}<HudButton disabled={!canBuy} onClick={() => command("household.rations")}>Buy {RATION_BUNDLE.quantity} rations - {RATION_BUNDLE.cost} credits</HudButton><p className="orbit-fine">{canBuy ? "Meals consume one ration." : household.pantry + RATION_BUNDLE.quantity > PANTRY_CAP ? "The pantry needs space for six rations." : `Need ${creditsText(RATION_BUNDLE.cost - household.credits)} more credits.`}</p><HudButton disabled={!canRelief} onClick={() => command("household.relief")}>Emergency {RELIEF.quantity} rations - +{RELIEF.debt} debt</HudButton><p className="orbit-fine">{canRelief ? "Once per day. Up to 40 debt is repaid with the next nightly bill." : household.reliefDay === household.day ? "Relief already taken today." : "Emergency relief requires fewer than four rations and fewer than 36 credits."}</p></>}</HudSurface></HudPanel>}
        <HudPanel id="actions" anchor={landscape ? "bottom-left" : "bottom"} priority="critical"><HudSurface className="orbit-actions" as="nav" aria-label="Habitat tools"><HudButton aria-expanded={drawer === "build"} onClick={() => setDrawer(drawer === "build" ? null : "build")}>Furnish</HudButton><HudButton aria-expanded={drawer === "ledger"} onClick={() => setDrawer(drawer === "ledger" ? null : "ledger")}>Pantry & bills{household.pantry < 4 ? " !" : ""}</HudButton><HudButton onClick={() => command("orbit.pause")}>Menu</HudButton></HudSurface></HudPanel>
        {household.buildTool && <HudPanel id="placement" anchor="bottom" order={1} priority="critical"><HudSurface className="orbit-placement">Choose open ground to place your furnishing.<HudButton onClick={() => command("build.cancel")}>Cancel</HudButton></HudSurface></HudPanel>}
      </>}
    </HudCanvas>
    {modal && <OrbitMenu preferences={preferences} onPreference={setPreference} />}
  </>;
}
