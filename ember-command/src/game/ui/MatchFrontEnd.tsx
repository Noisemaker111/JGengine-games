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
import { campaignOrdinal, type CampaignReadout } from "../campaign";
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
  const campaign = hud.campaign;
  const failed = campaign?.phase === "failed";
  const cleared = campaign?.phase === "cleared";
  const finished = campaign?.phase === "finished";
  const missionTitle = campaign === null ? null : campaign.title;
  return <div className="ec-curtain" onContextMenu={(e) => e.preventDefault()}>
    <HudSurface ref={panel} elevation="modal" className="ec-front" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="ec-front-title" onKeyDown={(event) => {
      if (["Tab", " ", "Enter"].includes(event.key)) event.stopPropagation();
    }}>
      <div className="ec-seal"><Icon name={ready || paused ? "helm" : won || finished ? "medal" : "skull"} /></div>
      <p className="ec-eyebrow">{campaign === null ? "The Highland Vale · Free skirmish" : `The Highland Vale · Mission ${campaignOrdinal(campaign.index - 1)} of ${campaignOrdinal(campaign.total - 1)}`}</p>
      <h1 id="ec-front-title">{router.current === "settings" ? "Field preferences" : router.current === "credits" ? "Credits" : ready ? (campaign === null ? "Ember Command" : campaign.title) : paused ? "Orders on hold" : won || finished ? "The vale is yours" : "The keep has fallen"}</h1>
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
        {campaign !== null && (ready || paused) ? <MissionCard campaign={campaign} cleared={cleared} failed={failed} /> : null}
        {campaign === null ? <p>{ready ? "Lead Bram's Vanguard through the highlands. Raise an army, hold the war-road and break the Marauder Warcamp." : paused ? "The battlefield is frozen. Review your plan before the next wave." : won ? "Your Vanguard broke the Warcamp. The reinforcements have been silenced." : "The Marauders breached your walls. Gather gold early, build a Barracks and cover the road with a Guard Tower."}</p> : null}
        {campaign !== null && !ready && !paused ? <MissionCard campaign={campaign} cleared={cleared} failed={failed} /> : null}
        {ready && campaign === null ? <ol className="ec-briefing">
          <li><strong>Gather</strong><span>Select peasants; right-click gold seams or timber.</span></li>
          <li><strong>Muster</strong><span>Build a Barracks [B], then train troops [2 / 3].</span></li>
          <li><strong>Advance</strong><span>Drag-select troops; [R], then right-click up the road.</span></li>
        </ol> : null}
        {!ready && !paused ? <div className="ec-results"><span>Battle time<strong>{battleTime(hud.elapsed)}</strong></span><span>Waves faced<strong>{hud.wavesSent}</strong></span><span>Troops standing<strong>{hud.playerUnits}</strong></span></div> : null}
        <HudButton className="ec-primary" onClick={() => run(ready ? "match.start" : paused ? "match.resume" : "match.restart")}>{ready ? (failed ? "Reform and take command" : "Take command") : paused ? "Resume battle" : campaign === null ? "Fight another skirmish" : "Reform and take command"}</HudButton>
        <div className="ec-secondary">
          <HudButton onClick={() => router.open("settings")}>Settings</HudButton>
          <HudButton onClick={() => router.open("credits")}>Credits</HudButton>
          {ready && campaign !== null ? <HudButton onClick={() => run("match.skirmish")}>Free skirmish</HudButton> : null}
          {ready && campaign === null ? <HudButton onClick={() => run("campaign.reset")}>Return to the campaign</HudButton> : null}
          {ready && campaign !== null && campaign.index > 1 ? <HudButton onClick={() => run("campaign.reset")}>Start the campaign over</HudButton> : null}
          {!ready && <HudButton onClick={() => run("match.title")}>Return to title</HudButton>}
        </div>
        <p className="ec-record">Service record · {prefs.wins} victories / {prefs.losses} defeats{prefs.bestVictory ? ` · Best ${battleTime(prefs.bestVictory)}` : ""}</p>
        {ready && <small className="ec-footnote">Single-player · Mouse & keyboard · Campaign progress and stores are saved on this device.</small>}
      </>}
    </HudSurface>
  </div>;
}

/** The field desk's mission card: what is being asked, why it matters, and what is carried in. */
function MissionCard({ campaign, cleared, failed }: { campaign: CampaignReadout; cleared: boolean; failed: boolean }) {
  const stores = campaign.stores.gold + campaign.stores.lumber > 0
    ? `Opening with ${campaign.stores.gold} gold and ${campaign.stores.lumber} lumber from the vale's stores`
    : null;
  return <div className="ec-mission">
    <p className="ec-mission-eyebrow">{failed ? "Mission failed — the vale musters again" : cleared ? "Mission cleared — the vale holds" : campaign.phase === "finished" ? "The campaign is won" : "Next order"}</p>
    <strong className="ec-mission-title">{campaign.title}</strong>
    <p>{failed && campaign.reason !== null ? campaign.reason : campaign.brief}</p>
    <div className="ec-mission-meta">
      <span>{campaign.steps > 0 ? `${campaign.steps} objective${campaign.steps === 1 ? "" : "s"}` : "Field order"}</span>
      {stores !== null ? <span className="ec-mission-stores">{stores}</span> : null}
    </div>
  </div>;
}
